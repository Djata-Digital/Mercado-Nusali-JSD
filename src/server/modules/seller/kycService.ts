/**
 * Onboarding/KYC do vendedor no servidor: o que está GUARDADO (documentos, tipo de conta, NIF) e a avaliação dos requisitos.
 * As regras (o que cada tipo de conta e país exige) vivem em utils/sellerKycRules — as mesmas da tela.
 *
 * O tipo de conta (pessoa física / empresa) é guardado em seller_profiles.settings_json.kyc.accountType (JSONB que já existe; sem
 * migração). Cadastros antigos não têm o tipo guardado: o tipo é inferido pela presença do registro empresarial.
 */
import { eq } from 'drizzle-orm';
import { auditLogs, sellerDocuments, sellerKyc, sellerProfiles, sellers, users } from '../../../db/schema.js';
import {
  KYC_ACCOUNT_LABEL, normalizeKycAccountType, validateKycForApproval,
  type KycAccountType, type KycIssue,
} from '../../../utils/sellerKycRules.js';
import { defaultSellerTypeFor, documentsNeededAfter, sellerTypeToAccountType, type IdentityChange } from '../../../utils/sellerAccountRules.js';

export const IDENTITY_DOC_TYPES = ['identity_document', 'identity_card'];

/**
 * Reverificação pendente: dados de identidade (documento fiscal, titular, país, classe do tipo de vendedor) mudaram DEPOIS da aprovação
 * do KYC. Fica em seller_profiles.settings_json.kycReverification (sem migração). Enquanto `required`, a aprovação do administrador é
 * bloqueada e o envio do KYC exige documentos NOVOS (`needs`); o reenvio marca `required: false` e mantém o registro das mudanças.
 */
export interface StoredReverification {
  required?: boolean;
  at?: string;
  changes?: Array<{ field: string; label: string; from?: string; to?: string }>;
  needs?: Array<'identityDocument' | 'proofOfAddress'>;
  previousStatus?: string;
  resubmittedAt?: string;
}

export interface StoredKycContext {
  kyc: any | null;
  docs: any[];
  settingsKyc: { accountType?: string; birthDate?: string };
  reverification?: StoredReverification | null;
}

const reverificationFrom = (settings: Record<string, any>): StoredReverification | null =>
  (settings.kycReverification && typeof settings.kycReverification === 'object' ? settings.kycReverification : null) as StoredReverification | null;

export async function loadStoredKyc(db: any, sellerId: string): Promise<StoredKycContext> {
  const [kycRows, docs, profileRows] = await Promise.all([
    db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, sellerId)).limit(1),
    db.select().from(sellerDocuments).where(eq(sellerDocuments.sellerId, sellerId)),
    db.select({ settingsJson: sellerProfiles.settingsJson }).from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1),
  ]);
  const settings = (profileRows[0]?.settingsJson as Record<string, any> | null) || {};
  return { kyc: kycRows[0] ?? null, docs, settingsKyc: (settings.kyc && typeof settings.kyc === 'object' ? settings.kyc : {}) as StoredKycContext['settingsKyc'], reverification: reverificationFrom(settings) };
}

const hasDoc = (docs: any[], types: string[]) => docs.some((d) => types.includes(d.documentType) && !!d.fileUrl);

/** O que já está guardado (colunas do KYC ou linhas em seller_documents). */
export function storedDocumentFlags(ctx: StoredKycContext) {
  return {
    hasIdentityDocument: !!ctx.kyc?.documentFrontUrl || hasDoc(ctx.docs, IDENTITY_DOC_TYPES),
    hasProofOfAddress: !!ctx.kyc?.proofOfAddressUrl || hasDoc(ctx.docs, ['proof_of_address']),
    hasSelfie: !!ctx.kyc?.selfieUrl || hasDoc(ctx.docs, ['selfie']),
    hasBusinessLicense: hasDoc(ctx.docs, ['business_license']),
  };
}

/** Tipo guardado; sem ele (cadastro antigo), 'empresa' só se houver registro empresarial anexado; senão desconhecido (null). */
export function resolveStoredAccountType(ctx: StoredKycContext): KycAccountType | null {
  return normalizeKycAccountType(ctx.settingsKyc.accountType) ?? (storedDocumentFlags(ctx).hasBusinessLicense ? 'empresa' : null);
}

export function accountTypeLabel(t: KycAccountType | null): string {
  return t ? KYC_ACCOUNT_LABEL[t] : 'Não informado (cadastro anterior)';
}

/** Monta o contexto guardado a partir de linhas já carregadas. */
export function storedContextFrom(kyc: any | null, docs: any[], settingsJson: unknown): StoredKycContext {
  const settings = (settingsJson as Record<string, any> | null) || {};
  return { kyc, docs, settingsKyc: (settings.kyc && typeof settings.kyc === 'object' ? settings.kyc : {}) as StoredKycContext['settingsKyc'], reverification: reverificationFrom(settings) };
}

/** Guarda tipo de conta e data de nascimento no JSONB de configurações, preservando as demais chaves. */
export async function saveKycProfileMeta(tx: any, sellerId: string, meta: { accountType: KycAccountType; birthDate: string }) {
  const [existing] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1);
  const prev = ((existing?.settingsJson as Record<string, any>) || {});
  const merged: Record<string, any> = { ...prev, kyc: { accountType: meta.accountType, birthDate: meta.birthDate } };
  // reenvio do KYC: a reverificação pendente passa a "reenviada" (o registro das mudanças continua guardado)
  if (prev.kycReverification && typeof prev.kycReverification === 'object' && prev.kycReverification.required) {
    merged.kycReverification = { ...prev.kycReverification, required: false, resubmittedAt: new Date().toISOString() };
  }
  // o tipo de conta do KYC manda: o tipo de vendedor da conta não pode ficar em outra classe (pessoa física x empresa)
  const acc = prev.account && typeof prev.account === 'object' ? prev.account : null;
  if (acc?.sellerType && sellerTypeToAccountType(acc.sellerType) !== meta.accountType) {
    merged.account = { ...acc, sellerType: defaultSellerTypeFor(meta.accountType) };
  }
  if (existing) {
    await tx.update(sellerProfiles).set({ settingsJson: merged, updatedAt: new Date() }).where(eq(sellerProfiles.sellerId, sellerId));
  } else {
    await tx.insert(sellerProfiles).values({ id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, sellerId, settingsJson: merged });
  }
}

/** Requisitos para APROVAR, avaliados sobre o que está guardado no banco (nunca sobre o que a tela diz). Vazio = pode aprovar. */
export async function assessKycForApproval(db: any, sellerId: string): Promise<{ issues: KycIssue[]; accountType: KycAccountType | null; country: string }> {
  const [sellerRow] = await db.select().from(sellers).where(eq(sellers.id, sellerId)).limit(1);
  const ctx = await loadStoredKyc(db, sellerId);
  return assessKycFromData(sellerRow, ctx);
}

/** Mesma avaliação sobre dados já carregados (a fila do admin avalia todas as linhas sem uma consulta por vendedor). */
export function assessKycFromData(sellerRow: any, ctx: StoredKycContext): { issues: KycIssue[]; accountType: KycAccountType | null; country: string } {
  const flags = storedDocumentFlags(ctx);
  const country = sellerRow?.countryCode || 'GW';
  const issues = validateKycForApproval(
    {
      accountType: ctx.settingsKyc.accountType,
      legalName: ctx.kyc?.legalName,
      documentNumber: ctx.kyc?.documentNumber,
      taxId: sellerRow?.taxId,
      phone: sellerRow?.phone,
      ...flags,
    },
    country,
  );
  if (!ctx.kyc) issues.unshift({ field: 'identityDocument', label: 'Envio de KYC', message: 'O vendedor ainda não enviou documentos para verificação.', step: 'identity' });
  if (ctx.reverification?.required) {
    const what = (ctx.reverification.changes ?? []).map((c) => c.label).filter(Boolean).join(', ') || 'dados de identidade';
    issues.unshift({ field: 'identityDocument', label: 'Reverificação de identidade', message: `Dados de identidade alterados depois da verificação (${what}). O vendedor precisa reenviar o KYC antes de uma nova aprovação.`, step: 'identity' });
  }
  return { issues, accountType: resolveStoredAccountType(ctx), country };
}

// ---------------------------------------------------------------- reverificação de identidade (regra única, usada por TODOS os caminhos)

/** KYC aprovado? ('verified' e 'approved' são o mesmo estado; é a regra de resolveSeller e dos demais caminhos). */
export function kycStatusIsApproved(rawStatus: unknown): boolean {
  return rawStatus === 'verified' || rawStatus === 'approved';
}

/**
 * Vendedor desta conta com KYC APROVADO (mesma leitura do status de resolveSeller: seller_kyc.status, senão users.kyc_status).
 * Devolve null para quem não é vendedor ou não está aprovado — compradores comuns nunca passam por reverificação.
 */
export async function loadApprovedSellerIdentity(db: any, userId: string) {
  const [seller] = await db.select().from(sellers).where(eq(sellers.userId, userId)).limit(1);
  if (!seller) return null;
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const kycCtx = await loadStoredKyc(db, seller.id);
  const raw = kycCtx.kyc?.status || user?.kycStatus || 'pending';
  if (!kycStatusIsApproved(raw)) return null;
  return { seller, user, kycCtx };
}

/** Corpo da resposta 409 que pede confirmação explícita antes de mandar o KYC para reverificação (igual em todos os caminhos). */
export function reverificationRequiredPayload(changes: IdentityChange[]) {
  const what = changes.map((c) => c.label).join(', ');
  const message = `Alterar ${what} exige uma nova verificação (KYC) da sua conta. Se continuar, o status volta para análise e você precisará reenviar os documentos; novos dados nunca são aprovados automaticamente.`;
  return { success: false, message, error: { code: 'KYC_REVERIFICATION_REQUIRED', message, changes, details: [] as unknown[] } };
}

export interface ReverificationActor { userId?: string | null; ip?: string | null; userAgent?: string | null; countryCode?: string | null }

/**
 * Manda o KYC aprovado de volta para análise (dentro da transação de quem chama): o status vira "pending" (seller_kyc e users), a revisão
 * anterior e os documentos antigos ficam preservados, a trilha de auditoria registra o que mudou e a aprovação do administrador fica
 * bloqueada até o vendedor reenviar o KYC com documentos NOVOS. Preserva as demais chaves do JSONB do perfil.
 */
export async function applyKycReverification(
  tx: any,
  args: { sellerId: string; userId: string; kycCtx: StoredKycContext; changes: IdentityChange[]; actor: ReverificationActor; source: string },
): Promise<boolean> {
  const { sellerId, userId, kycCtx, changes, actor, source } = args;
  // dois pedidos simultâneos: quem chega depois (KYC já em análise) não repete a reverificação nem a auditoria
  const [kycNow] = await tx.select({ status: sellerKyc.status }).from(sellerKyc).where(eq(sellerKyc.sellerId, sellerId)).limit(1).for('update');
  const [userNow] = await tx.select({ kycStatus: users.kycStatus }).from(users).where(eq(users.id, userId)).limit(1).for('update');
  if (!kycStatusIsApproved(kycNow?.status || userNow?.kycStatus)) return false;
  const [row] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1).for('update');
  const settings = (row?.settingsJson && typeof row.settingsJson === 'object' ? row.settingsJson : {}) as Record<string, any>;
  const merged = {
    ...settings,
    kycReverification: {
      required: true,
      at: new Date().toISOString(),
      changes,
      needs: documentsNeededAfter(changes),
      previousStatus: 'verified',
      previousReviewedAt: kycCtx.kyc?.reviewedAt ? new Date(kycCtx.kyc.reviewedAt).toISOString() : null,
    },
  };
  if (row) {
    await tx.update(sellerProfiles).set({ settingsJson: merged, updatedAt: new Date() }).where(eq(sellerProfiles.sellerId, sellerId));
  } else {
    await tx.insert(sellerProfiles).values({ id: `prof_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, sellerId, settingsJson: merged });
  }
  if (kycCtx.kyc?.id) await tx.update(sellerKyc).set({ status: 'pending' }).where(eq(sellerKyc.id, kycCtx.kyc.id));
  await tx.update(users).set({ kycStatus: 'pending', updatedAt: new Date() }).where(eq(users.id, userId));
  await tx.insert(auditLogs).values({
    id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    actorUserId: actor.userId || null,
    action: 'seller.kyc.reverification_required',
    resource: 'seller_kyc',
    resourceId: kycCtx.kyc?.id || sellerId,
    detailsJson: {
      sellerId,
      source,
      changes,
      previousStatus: 'verified',
      previousReviewedAt: kycCtx.kyc?.reviewedAt ?? null,
      previousReviewerId: kycCtx.kyc?.reviewerId ?? null,
      previousDocuments: kycCtx.docs.map((d: any) => ({ type: d.documentType, objectKey: d.objectKey ?? null, fileUrl: d.fileUrl ?? null })),
    },
    ipAddress: actor.ip || null,
    userAgent: actor.userAgent || null,
    countryCode: actor.countryCode || null,
    createdAt: new Date(),
  });
  return true;
}
