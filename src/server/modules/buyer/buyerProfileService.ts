/**
 * Fase "Desbloqueio do lançamento" — BLOCKER_LAUNCH corrigido: não existia
 * caminho real para o comprador cadastrar seu CPF/taxId, mas
 * asaasPaymentProvider.ts exige userProfiles.taxId para qualquer PIX de
 * comprador brasileiro. userProfiles.taxId é genérico (CPF, NIF, BI, CNPJ
 * conforme o país) — só exigimos o formato/checksum de CPF/CNPJ quando o
 * país efetivo do usuário é BR (mesma regra que o Asaas já aplica); para os
 * demais países aceitamos o documento como o usuário informou, sem inventar
 * validação de formato que não pedimos.
 */
import { getDb } from '../../../db/index.js';
import { userProfiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { isValidCpf, isValidCnpj } from '../payments/providers/asaasPaymentProvider.js';

export class BuyerProfileValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'BuyerProfileValidationError';
    this.code = code;
    this.status = status;
  }
}

export interface UpdateBuyerTaxIdInput {
  userId: string;
  taxId: string;
  effectiveCountryCode: string;
}

/**
 * Nunca aceita userId arbitrário: o chamador (rota) deve sempre passar
 * exclusivamente req.user.id (a identidade autenticada), nunca um valor do
 * corpo da requisição.
 */
export async function updateBuyerTaxId(input: UpdateBuyerTaxIdInput, executor?: any) {
  const db = executor ?? getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  const effectiveCountry = (input.effectiveCountryCode || '').toUpperCase();
  let cleanTaxId = String(input.taxId || '').trim();

  if (effectiveCountry === 'BR') {
    const digitsOnly = cleanTaxId.replace(/\D/g, '');
    const isCpf = digitsOnly.length === 11 && isValidCpf(digitsOnly);
    const isCnpj = digitsOnly.length === 14 && isValidCnpj(digitsOnly);
    if (!isCpf && !isCnpj) {
      throw new BuyerProfileValidationError('INVALID_TAX_ID', 'CPF ou CNPJ inválido. Verifique o número informado.');
    }
    cleanTaxId = digitsOnly;
  } else if (!cleanTaxId) {
    throw new BuyerProfileValidationError('INVALID_TAX_ID', 'Documento inválido.');
  }

  const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, input.userId)).limit(1);
  if (existingProfile.length > 0) {
    await db.update(userProfiles).set({ taxId: cleanTaxId, updatedAt: new Date() }).where(eq(userProfiles.userId, input.userId));
  } else {
    await db.insert(userProfiles).values({
      id: `prof_${input.userId}`,
      userId: input.userId,
      taxId: cleanTaxId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { userId: input.userId, taxId: cleanTaxId };
}
