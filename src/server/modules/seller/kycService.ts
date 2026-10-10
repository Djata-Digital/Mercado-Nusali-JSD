/**
 * Onboarding/KYC do vendedor no servidor: o que está GUARDADO (documentos, tipo de conta, NIF) e a avaliação dos requisitos.
 * As regras (o que cada tipo de conta e país exige) vivem em utils/sellerKycRules — as mesmas da tela.
 *
 * O tipo de conta (pessoa física / empresa) é guardado em seller_profiles.settings_json.kyc.accountType (JSONB que já existe; sem
 * migração). Cadastros antigos não têm o tipo guardado: o tipo é inferido pela presença do registro empresarial.
 */
import { eq } from 'drizzle-orm';
import { sellerDocuments, sellerKyc, sellerProfiles, sellers } from '../../../db/schema.js';
import {
  KYC_ACCOUNT_LABEL, normalizeKycAccountType, validateKycForApproval,
  type KycAccountType, type KycIssue,
} from '../../../utils/sellerKycRules.js';

export const IDENTITY_DOC_TYPES = ['identity_document', 'identity_card'];

export interface StoredKycContext {
  kyc: any | null;
  docs: any[];
  settingsKyc: { accountType?: string; birthDate?: string };
}

export async function loadStoredKyc(db: any, sellerId: string): Promise<StoredKycContext> {
  const [kycRows, docs, profileRows] = await Promise.all([
    db.select().from(sellerKyc).where(eq(sellerKyc.sellerId, sellerId)).limit(1),
    db.select().from(sellerDocuments).where(eq(sellerDocuments.sellerId, sellerId)),
    db.select({ settingsJson: sellerProfiles.settingsJson }).from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1),
  ]);
  const settings = (profileRows[0]?.settingsJson as Record<string, any> | null) || {};
  return { kyc: kycRows[0] ?? null, docs, settingsKyc: (settings.kyc && typeof settings.kyc === 'object' ? settings.kyc : {}) as StoredKycContext['settingsKyc'] };
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
  return { kyc, docs, settingsKyc: (settings.kyc && typeof settings.kyc === 'object' ? settings.kyc : {}) as StoredKycContext['settingsKyc'] };
}

/** Guarda tipo de conta e data de nascimento no JSONB de configurações, preservando as demais chaves. */
export async function saveKycProfileMeta(tx: any, sellerId: string, meta: { accountType: KycAccountType; birthDate: string }) {
  const [existing] = await tx.select().from(sellerProfiles).where(eq(sellerProfiles.sellerId, sellerId)).limit(1);
  const merged = { ...((existing?.settingsJson as Record<string, any>) || {}), kyc: { accountType: meta.accountType, birthDate: meta.birthDate } };
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
  return { issues, accountType: resolveStoredAccountType(ctx), country };
}
