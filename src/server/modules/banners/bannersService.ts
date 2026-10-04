import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { auditLogs, banners, countries } from '../../../db/schema.js';
import { isOwnedPublicObjectUrl } from '../../infra/storage.js';
import {
  BANNER_BG_STYLES,
  BANNER_STATUSES,
  BANNER_TEXT_LIMITS,
  isBannerBgStyle,
  normalizeCountryCode,
  validateBannerCta,
  type BannerBgStyle,
  type BannerStatus,
} from '../../../utils/bannerRules.js';
import { BANNER_OBJECT_KEY_PATTERN } from './bannerImage.js';

type Db = NonNullable<ReturnType<typeof getDb>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type BannerRow = typeof banners.$inferSelect;

export class BannerHttpError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string>) {
    super(message);
    this.name = 'BannerHttpError';
  }
}

/** Quem executou a ação (vem sempre do JWT verificado por requireAuth, nunca do corpo da requisição). */
export interface BannerActor {
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  countryCode: string | null;
}

export function requireBannerDb(): Db {
  const db = getDb();
  if (!db) throw new BannerHttpError(503, 'DATABASE_UNAVAILABLE', 'Banco de dados indisponível no momento.');
  return db;
}

// ---------------------------------------------------------------------------
// Validação / normalização
// ---------------------------------------------------------------------------

/** Campos editáveis. Qualquer outra chave do corpo (id, status, createdBy, URLs de imagem...) é ignorada. */
const EDITABLE = [
  'title', 'subtitle', 'tagText', 'badgeText', 'ctaLabel', 'ctaType', 'ctaTarget',
  'desktopImageKey', 'mobileImageKey', 'bgStyle', 'sortOrder', 'startsAt', 'endsAt', 'countryCode',
] as const;
type EditableKey = (typeof EDITABLE)[number];
type RawInput = Partial<Record<EditableKey | 'status', unknown>>;

interface NormalizedFields {
  title: string;
  subtitle: string | null;
  tagText: string | null;
  badgeText: string | null;
  ctaLabel: string | null;
  ctaType: 'internal' | 'external' | null;
  ctaTarget: string | null;
  desktopImageUrl: string | null;
  desktopImageKey: string | null;
  mobileImageUrl: string | null;
  mobileImageKey: string | null;
  bgStyle: BannerBgStyle;
  sortOrder: number;
  startsAt: Date | null;
  endsAt: Date | null;
  countryCode: string | null;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;

function rowToInput(row: BannerRow): RawInput {
  return {
    title: row.title, subtitle: row.subtitle, tagText: row.tagText, badgeText: row.badgeText,
    ctaLabel: row.ctaLabel, ctaType: row.ctaType, ctaTarget: row.ctaTarget,
    desktopImageKey: row.desktopImageKey, mobileImageKey: row.mobileImageKey,
    bgStyle: row.bgStyle, sortOrder: row.sortOrder,
    startsAt: row.startsAt, endsAt: row.endsAt, countryCode: row.countryCode,
  };
}

function publicStorageBase(): string {
  return (process.env.STORAGE_PUBLIC_URL?.trim() || '').replace(/\/+$/, '');
}

/**
 * Normaliza e valida o conjunto COMPLETO de campos (já mesclado com o banner atual no PATCH).
 * Lança BannerHttpError(400, VALIDATION_ERROR) com o erro de cada campo.
 */
async function normalizeFields(tx: Tx, input: RawInput, current?: BannerRow): Promise<NormalizedFields> {
  const errors: Record<string, string> = {};
  const fail = (field: string, message: string) => { if (!errors[field]) errors[field] = message; };

  const optText = (field: 'subtitle' | 'tagText' | 'badgeText', max: number, label: string): string | null => {
    const v = input[field];
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') { fail(field, `${label} inválido.`); return null; }
    const t = v.trim();
    if (!t) return null;
    if (t.length > max) fail(field, `${label} deve ter no máximo ${max} caracteres.`);
    if (CONTROL_CHARS.test(t)) fail(field, `${label} contém caracteres inválidos.`);
    return t;
  };

  // título
  let title = '';
  if (typeof input.title !== 'string' || !input.title.trim()) fail('title', 'Informe o título do banner.');
  else {
    title = input.title.trim();
    if (title.length > BANNER_TEXT_LIMITS.title) fail('title', `Título deve ter no máximo ${BANNER_TEXT_LIMITS.title} caracteres.`);
    if (CONTROL_CHARS.test(title)) fail('title', 'Título contém caracteres inválidos.');
  }
  const subtitle = optText('subtitle', BANNER_TEXT_LIMITS.subtitle, 'Subtítulo');
  const tagText = optText('tagText', BANNER_TEXT_LIMITS.tagText, 'Etiqueta');
  const badgeText = optText('badgeText', BANNER_TEXT_LIMITS.badgeText, 'Selo');

  // CTA: ou completo (texto + tipo + destino) ou ausente por inteiro
  const rawLabel = typeof input.ctaLabel === 'string' ? input.ctaLabel.trim() : '';
  const rawType = input.ctaType === undefined || input.ctaType === null || input.ctaType === '' ? null : input.ctaType;
  const rawTarget = typeof input.ctaTarget === 'string' ? input.ctaTarget.trim() : '';
  if (input.ctaLabel !== undefined && input.ctaLabel !== null && typeof input.ctaLabel !== 'string') fail('ctaLabel', 'Texto do botão inválido.');
  let ctaLabel: string | null = null; let ctaType: 'internal' | 'external' | null = null; let ctaTarget: string | null = null;
  if (rawLabel || rawType || rawTarget) {
    if (!rawLabel) fail('ctaLabel', 'Informe o texto do botão.');
    else if (rawLabel.length > BANNER_TEXT_LIMITS.ctaLabel) fail('ctaLabel', `Texto do botão deve ter no máximo ${BANNER_TEXT_LIMITS.ctaLabel} caracteres.`);
    else if (CONTROL_CHARS.test(rawLabel)) fail('ctaLabel', 'Texto do botão contém caracteres inválidos.');
    const cta = validateBannerCta(rawType, rawTarget);
    if (rawType !== 'internal' && rawType !== 'external') fail('ctaType', 'Escolha o tipo de destino (interno ou externo).');
    else if (cta.ok === false) fail('ctaTarget', cta.message);
    else { ctaType = rawType; ctaTarget = cta.value; }
    ctaLabel = rawLabel || null;
  }

  // estilo e ordem
  let bgStyle: BannerBgStyle = 'blue';
  if (input.bgStyle !== undefined && input.bgStyle !== null) {
    if (isBannerBgStyle(input.bgStyle)) bgStyle = input.bgStyle;
    else fail('bgStyle', `Estilo inválido (use ${BANNER_BG_STYLES.join(', ')}).`);
  }
  let sortOrder = 0;
  if (input.sortOrder !== undefined && input.sortOrder !== null) {
    if (typeof input.sortOrder === 'number' && Number.isInteger(input.sortOrder) && input.sortOrder >= 0 && input.sortOrder <= 100000) sortOrder = input.sortOrder;
    else fail('sortOrder', 'Ordem deve ser um inteiro entre 0 e 100000.');
  }

  // período
  const parseDate = (field: 'startsAt' | 'endsAt', label: string): Date | null => {
    const v = input[field];
    if (v === undefined || v === null || v === '') return null;
    const d = v instanceof Date ? v : typeof v === 'string' ? new Date(v) : null;
    if (!d || Number.isNaN(d.getTime())) { fail(field, `${label} inválido (use data/hora ISO).`); return null; }
    return d;
  };
  const startsAt = parseDate('startsAt', 'Início');
  const endsAt = parseDate('endsAt', 'Fim');
  if (startsAt && endsAt && !(startsAt.getTime() < endsAt.getTime())) fail('endsAt', 'O fim deve ser depois do início.');

  // país (NULL = global)
  let countryCode: string | null = null;
  if (input.countryCode !== undefined && input.countryCode !== null && input.countryCode !== '') {
    const cc = normalizeCountryCode(input.countryCode);
    if (!cc) fail('countryCode', 'País inválido (use o código de 2 letras, ex.: GW).');
    else {
      const found = await tx.select({ code: countries.code }).from(countries).where(eq(countries.code, cc)).limit(1);
      if (!found.length) fail('countryCode', `País "${cc}" não cadastrado.`);
      else countryCode = cc;
    }
  }

  // imagens: o cliente só envia a CHAVE devolvida pelo upload; a URL é sempre derivada no servidor
  const resolveImage = (field: 'desktopImageKey' | 'mobileImageKey', curKey: string | null, curUrl: string | null) => {
    const v = input[field];
    if (v === undefined) return { key: curKey, url: curUrl };
    if (v === null || v === '') return { key: null, url: null };
    if (typeof v !== 'string' || !BANNER_OBJECT_KEY_PATTERN.test(v)) {
      fail(field, 'Imagem inválida: envie a imagem pelo upload do painel.');
      return { key: null, url: null };
    }
    if (v === curKey && curUrl) return { key: curKey, url: curUrl };
    const base = publicStorageBase();
    const url = base ? `${base}/${v}` : '';
    if (!url || !isOwnedPublicObjectUrl(url, 'banners')) {
      fail(field, 'Armazenamento de imagens não está configurado.');
      return { key: null, url: null };
    }
    return { key: v, url };
  };
  const desktop = resolveImage('desktopImageKey', current?.desktopImageKey ?? null, current?.desktopImageUrl ?? null);
  const mobile = resolveImage('mobileImageKey', current?.mobileImageKey ?? null, current?.mobileImageUrl ?? null);

  if (Object.keys(errors).length) {
    throw new BannerHttpError(400, 'VALIDATION_ERROR', Object.values(errors)[0], errors);
  }
  return {
    title, subtitle, tagText, badgeText, ctaLabel, ctaType, ctaTarget,
    desktopImageUrl: desktop.url, desktopImageKey: desktop.key, mobileImageUrl: mobile.url, mobileImageKey: mobile.key,
    bgStyle, sortOrder, startsAt, endsAt, countryCode,
  };
}

function mergeInput(raw: RawInput, base: RawInput): RawInput {
  const merged: RawInput = { ...base };
  for (const k of EDITABLE) if (raw[k] !== undefined) merged[k] = raw[k];
  return merged;
}

// ---------------------------------------------------------------------------
// Auditoria (mesma tabela/colunas do padrão do projeto; gravada NA MESMA transação da mudança)
// ---------------------------------------------------------------------------

async function auditTx(tx: Tx, actor: BannerActor, action: string, resourceId: string | null, details: unknown) {
  await tx.insert(auditLogs).values({
    id: `audit_${Date.now()}_${randomBytes(3).toString('hex')}`,
    actorUserId: actor.userId,
    action,
    resource: 'banner',
    resourceId,
    detailsJson: details as any,
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    countryCode: actor.countryCode,
    createdAt: new Date(),
  });
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);

function diffFields(before: BannerRow, after: NormalizedFields): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const keys: (keyof NormalizedFields)[] = [
    'title', 'subtitle', 'tagText', 'badgeText', 'ctaLabel', 'ctaType', 'ctaTarget',
    'desktopImageKey', 'mobileImageKey', 'bgStyle', 'sortOrder', 'startsAt', 'endsAt', 'countryCode',
  ];
  for (const k of keys) {
    const a = iso((before as any)[k]); const b = iso((after as any)[k]);
    if (a !== b) changes[k] = { from: a, to: b };
  }
  return changes;
}

// ---------------------------------------------------------------------------
// Serialização
// ---------------------------------------------------------------------------

export type BannerState = 'draft' | 'inactive' | 'scheduled' | 'live' | 'expired';

export function bannerState(row: Pick<BannerRow, 'status' | 'startsAt' | 'endsAt'>, now = new Date()): BannerState {
  if (row.status === 'draft') return 'draft';
  if (row.status === 'inactive') return 'inactive';
  if (row.startsAt && row.startsAt.getTime() > now.getTime()) return 'scheduled';
  if (row.endsAt && row.endsAt.getTime() <= now.getTime()) return 'expired';
  return 'live';
}

export function toAdminBanner(row: BannerRow, now = new Date()) {
  return {
    id: row.id, title: row.title, subtitle: row.subtitle, tagText: row.tagText, badgeText: row.badgeText,
    ctaLabel: row.ctaLabel, ctaType: row.ctaType, ctaTarget: row.ctaTarget,
    desktopImageUrl: row.desktopImageUrl, desktopImageKey: row.desktopImageKey,
    mobileImageUrl: row.mobileImageUrl, mobileImageKey: row.mobileImageKey,
    bgStyle: row.bgStyle, sortOrder: row.sortOrder, status: row.status as BannerStatus,
    startsAt: row.startsAt, endsAt: row.endsAt, countryCode: row.countryCode, isGlobal: row.countryCode === null,
    state: bannerState(row, now),
    createdBy: row.createdBy, updatedBy: row.updatedBy, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}

/** Somente campos públicos: nunca created_by/updated_by, chaves de objeto, status, datas internas ou ordem. */
export function toPublicBanner(row: BannerRow) {
  const hasCta = row.ctaLabel && row.ctaType && row.ctaTarget;
  return {
    id: row.id, title: row.title, subtitle: row.subtitle, tagText: row.tagText, badgeText: row.badgeText,
    ctaLabel: hasCta ? row.ctaLabel : null, ctaType: hasCta ? row.ctaType : null, ctaTarget: hasCta ? row.ctaTarget : null,
    desktopImageUrl: row.desktopImageUrl, mobileImageUrl: row.mobileImageUrl, bgStyle: row.bgStyle,
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function listActivePublicBanners(country: unknown, now = new Date()) {
  const db = requireBannerDb();
  const cc = normalizeCountryCode(country);
  const rows = await db.select().from(banners).where(and(
    eq(banners.status, 'active'),
    isNull(banners.deletedAt),
    or(isNull(banners.startsAt), lte(banners.startsAt, now)),
    or(isNull(banners.endsAt), gt(banners.endsAt, now)),
    cc ? or(isNull(banners.countryCode), eq(banners.countryCode, cc)) : isNull(banners.countryCode),
  )).orderBy(asc(banners.sortOrder), asc(banners.createdAt), asc(banners.id));
  return rows.map(toPublicBanner);
}

export async function listAdminBanners(filters: { status?: unknown; country?: unknown } = {}, now = new Date()) {
  const db = requireBannerDb();
  const conds = [isNull(banners.deletedAt)];
  if (typeof filters.status === 'string' && filters.status) {
    if (!(BANNER_STATUSES as readonly string[]).includes(filters.status)) throw new BannerHttpError(400, 'VALIDATION_ERROR', 'Status inválido.');
    conds.push(eq(banners.status, filters.status));
  }
  if (typeof filters.country === 'string' && filters.country) {
    if (filters.country.toLowerCase() === 'global') conds.push(isNull(banners.countryCode));
    else {
      const cc = normalizeCountryCode(filters.country);
      if (!cc) throw new BannerHttpError(400, 'VALIDATION_ERROR', 'País inválido.');
      conds.push(eq(banners.countryCode, cc));
    }
  }
  const rows = await db.select().from(banners).where(and(...conds)).orderBy(asc(banners.sortOrder), desc(banners.createdAt), asc(banners.id));
  return rows.map((r) => toAdminBanner(r, now));
}

export async function getAdminBanner(id: string, now = new Date()) {
  const db = requireBannerDb();
  const [row] = await db.select().from(banners).where(and(eq(banners.id, id), isNull(banners.deletedAt))).limit(1);
  if (!row) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
  return toAdminBanner(row, now);
}

// ---------------------------------------------------------------------------
// Escrita (cada operação = 1 transação com a auditoria dentro)
// ---------------------------------------------------------------------------

async function nextSortOrder(tx: Tx): Promise<number> {
  const [r] = await tx.select({ m: sql<number>`COALESCE(MAX(${banners.sortOrder}), 0)::int` }).from(banners).where(isNull(banners.deletedAt));
  return (r?.m ?? 0) + 10;
}

function assertBody(body: unknown): RawInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BannerHttpError(400, 'VALIDATION_ERROR', 'Corpo da requisição inválido.');
  return body as RawInput;
}

export async function createBanner(actor: BannerActor, body: unknown) {
  const db = requireBannerDb();
  const raw = assertBody(body);
  let status: BannerStatus = 'draft';
  if (raw.status !== undefined && raw.status !== null) {
    if (typeof raw.status === 'string' && (BANNER_STATUSES as readonly string[]).includes(raw.status)) status = raw.status as BannerStatus;
    else throw new BannerHttpError(400, 'VALIDATION_ERROR', 'Status inválido.', { status: 'Status inválido.' });
  }
  return db.transaction(async (tx) => {
    const fields = await normalizeFields(tx, mergeInput(raw, {}));
    const sortOrder = raw.sortOrder === undefined || raw.sortOrder === null ? await nextSortOrder(tx) : fields.sortOrder;
    const now = new Date();
    const [row] = await tx.insert(banners).values({
      id: `banner_${randomUUID()}`, ...fields, sortOrder, status,
      createdBy: actor.userId, updatedBy: actor.userId, createdAt: now, updatedAt: now,
    }).returning();
    await auditTx(tx, actor, 'banner.created', row.id, { title: row.title, status: row.status, countryCode: row.countryCode, sortOrder: row.sortOrder });
    return toAdminBanner(row);
  });
}

export async function updateBanner(actor: BannerActor, id: string, body: unknown) {
  const db = requireBannerDb();
  const raw = assertBody(body);
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(banners).where(and(eq(banners.id, id), isNull(banners.deletedAt))).for('update').limit(1);
    if (!row) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
    const fields = await normalizeFields(tx, mergeInput(raw, rowToInput(row)), row);
    const changes = diffFields(row, fields);
    if (!Object.keys(changes).length) return toAdminBanner(row);
    const [updated] = await tx.update(banners).set({ ...fields, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(banners.id, id)).returning();
    await auditTx(tx, actor, 'banner.updated', id, { changes });
    return toAdminBanner(updated);
  });
}

export async function setBannerStatus(actor: BannerActor, id: string, body: unknown) {
  const db = requireBannerDb();
  const raw = assertBody(body);
  if (raw.status !== 'active' && raw.status !== 'inactive') {
    throw new BannerHttpError(400, 'VALIDATION_ERROR', 'Status deve ser "active" ou "inactive".', { status: 'Status deve ser "active" ou "inactive".' });
  }
  const next = raw.status;
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(banners).where(and(eq(banners.id, id), isNull(banners.deletedAt))).for('update').limit(1);
    if (!row) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
    if (row.status === next) return toAdminBanner(row);
    const [updated] = await tx.update(banners).set({ status: next, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(banners.id, id)).returning();
    await auditTx(tx, actor, next === 'active' ? 'banner.activated' : 'banner.deactivated', id, { from: row.status, to: next, title: row.title });
    return toAdminBanner(updated);
  });
}

export async function duplicateBanner(actor: BannerActor, id: string) {
  const db = requireBannerDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(banners).where(and(eq(banners.id, id), isNull(banners.deletedAt))).limit(1);
    if (!row) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
    const suffix = ' (cópia)';
    const title = `${row.title.slice(0, BANNER_TEXT_LIMITS.title - suffix.length)}${suffix}`;
    const now = new Date();
    const [copy] = await tx.insert(banners).values({
      id: `banner_${randomUUID()}`, title, subtitle: row.subtitle, tagText: row.tagText, badgeText: row.badgeText,
      ctaLabel: row.ctaLabel, ctaType: row.ctaType, ctaTarget: row.ctaTarget,
      // As imagens são referenciadas (o mesmo objeto no R2); o R2 nunca apaga objetos automaticamente.
      desktopImageUrl: row.desktopImageUrl, desktopImageKey: row.desktopImageKey,
      mobileImageUrl: row.mobileImageUrl, mobileImageKey: row.mobileImageKey,
      bgStyle: row.bgStyle, sortOrder: await nextSortOrder(tx), status: 'draft',
      startsAt: row.startsAt, endsAt: row.endsAt, countryCode: row.countryCode,
      createdBy: actor.userId, updatedBy: actor.userId, createdAt: now, updatedAt: now,
    }).returning();
    await auditTx(tx, actor, 'banner.duplicated', copy.id, { sourceId: id, title: copy.title });
    return toAdminBanner(copy);
  });
}

export async function reorderBanners(actor: BannerActor, body: unknown) {
  const db = requireBannerDb();
  const raw = assertBody(body) as { ids?: unknown };
  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string') || new Set(ids).size !== ids.length) {
    throw new BannerHttpError(400, 'VALIDATION_ERROR', 'Informe "ids" como lista de ids de banner sem repetições.');
  }
  return db.transaction(async (tx) => {
    const current = await tx.select({ id: banners.id, sortOrder: banners.sortOrder }).from(banners)
      .where(isNull(banners.deletedAt)).orderBy(asc(banners.sortOrder), desc(banners.createdAt), asc(banners.id)).for('update');
    const currentIds = current.map((r) => r.id);
    const same = currentIds.length === ids.length && currentIds.every((i) => (ids as string[]).includes(i));
    if (!same) throw new BannerHttpError(409, 'ORDER_OUT_OF_DATE', 'A lista de banners mudou. Recarregue a página e tente de novo.');
    const now = new Date();
    for (let i = 0; i < ids.length; i++) {
      await tx.update(banners).set({ sortOrder: (i + 1) * 10, updatedBy: actor.userId, updatedAt: now }).where(eq(banners.id, ids[i] as string));
    }
    await auditTx(tx, actor, 'banner.reordered', null, { before: currentIds, after: ids });
    const rows = await tx.select().from(banners).where(and(isNull(banners.deletedAt), inArray(banners.id, ids as string[]))).orderBy(asc(banners.sortOrder), asc(banners.id));
    return rows.map((r) => toAdminBanner(r));
  });
}

/** Exclusão lógica. Também força status=inactive (nunca aparece, mesmo que um filtro seja esquecido). NÃO apaga objetos do R2. */
export async function softDeleteBanner(actor: BannerActor, id: string) {
  const db = requireBannerDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(banners).where(and(eq(banners.id, id), isNull(banners.deletedAt))).for('update').limit(1);
    if (!row) throw new BannerHttpError(404, 'BANNER_NOT_FOUND', 'Banner não encontrado.');
    const now = new Date();
    await tx.update(banners).set({ deletedAt: now, status: 'inactive', updatedBy: actor.userId, updatedAt: now }).where(eq(banners.id, id));
    await auditTx(tx, actor, 'banner.deleted', id, { title: row.title, previousStatus: row.status });
    return { id };
  });
}

/** Auditoria do upload (sem transação de banner: o objeto só passa a ser usado quando um banner o referencia, e isso é auditado). */
export async function auditBannerImageUpload(actor: BannerActor, details: Record<string, unknown>) {
  const db = requireBannerDb();
  await db.transaction((tx) => auditTx(tx, actor, 'banner.image_uploaded', null, details));
}
