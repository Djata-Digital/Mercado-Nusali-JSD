import { PaymentProvider, PaymentGatewayRequest, PaymentGatewayResponse, RefundGatewayRequest, RefundGatewayOutcome } from '../paymentProvider.js';
import { AsaasClient } from '../clients/asaasClient.js';
import { validateAsaasConfig } from '../config/asaasConfig.js';
import { logger } from '../../../infra/logger.js';
import { getDb } from '../../../../db/index.js';
import { orders, users, userProfiles, payments, paymentAttempts, paymentCustomers } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import {
  AsaasRefund,
  AsaasRefundListResponse,
  AsaasRefundRequest,
  findRefundByCorrelation,
  sanitizeAsaasRefund,
} from '../types/asaasRefund.js';

/**
 * Guard NOSSO (não documentado pelo Asaas — a auditoria C5.2-D.1 confirmou
 * que a doc não define nenhum máximo de páginas/itens para este endpoint)
 * contra paginação infinita/corrompida em `listAllRefunds`. O número de
 * refunds por cobrança deve ser sempre pequeno (poucos itens por child
 * order/surplus) — este limite só existe para nunca deixar o processo preso
 * num loop caso a API retorne `hasMore=true` indefinidamente.
 */
const ASAAS_REFUND_LIST_SAFETY_MAX_PAGES = 20;
export function normalizeAsaasBrazilianMobilePhone(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = String(phone).replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    digits = digits.substring(2);
  }

  if (digits.length === 10 || digits.length === 11) {
    return digits;
  }

  return null;
}

export function isValidCpf(cpf: string): boolean {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (sum % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  return true;
}

export function isValidCnpj(cnpj: string): boolean {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  let size = cnpj.length - 2;
  let numbers = cnpj.substring(0, size);
  const digits = cnpj.substring(size);
  let sum = 0;
  let pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(0))) return false;
  size = size + 1;
  numbers = cnpj.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += parseInt(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(digits.charAt(1))) return false;
  return true;
}

export class AsaasPaymentProvider implements PaymentProvider {
  readonly name = 'asaas';

  /**
   * Idempotent lookup or creation of Asaas Customer.
   * Maps buyer details safely (CPF/CNPJ if valid Brazilian document, foreignCustomer=true if foreign).
   *
   * `orderDocumentFallback` (correção crítica — CPF não chega ao Asaas): a
   * fonte autoritativa do documento é sempre o perfil (userProfiles.taxId —
   * OrderService já sincroniza esse campo a partir do checkout quando o
   * perfil ainda está vazio). Este parâmetro é só uma segunda camada de
   * defesa para pedidos criados antes dessa sincronização existir, ou caso
   * ela falhe por algum motivo: nunca sobrescreve um taxId de perfil já
   * presente, só é usado quando o perfil realmente não tem nada.
   */
  async getOrCreateCustomer(userId: string, orderDocumentFallback?: string | null): Promise<string> {
    const db = getDb();
    if (!db) throw new Error('DATABASE_NOT_AVAILABLE: Banco de dados indisponível.');

    // 1. Load User & Profile first to prepare Customer payload (for both creation and sync)
    const userRecord = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
    if (!userRecord) {
      const err: any = new Error(`Usuário ${userId} não foi encontrado.`);
      err.code = 'USER_NOT_FOUND';
      throw err;
    }

    const fullName = userRecord.fullName?.trim();
    if (!fullName) {
      const err: any = new Error('Nome do comprador é obrigatório para cadastrar no Asaas.');
      err.code = 'ASAAS_CUSTOMER_NAME_REQUIRED';
      err.status = 400;
      throw err;
    }

    const profileRecord = (await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1))[0];
    const rawTaxId = profileRecord?.taxId || (userRecord as any).taxId || orderDocumentFallback || '';
    const cleanTaxId = String(rawTaxId).replace(/\D/g, '');

    const userCountry = (userRecord.countryCode || 'GW').toUpperCase();
    const isBrazilian = userCountry === 'BR';

    // Normalize phone ONLY for Brazilian users and ONLY if valid
    const normalizedMobilePhone = isBrazilian ? normalizeAsaasBrazilianMobilePhone(userRecord.phone) : null;

    // Build customer payload conditionally (only include keys that have valid values)
    const customerPayload: any = {
      name: fullName,
      externalReference: userId,
    };

    if (userRecord.email && userRecord.email.trim()) {
      customerPayload.email = userRecord.email.trim();
    }

    // mobilePhone is strictly optional - include ONLY if valid (non-null)
    if (normalizedMobilePhone) {
      customerPayload.mobilePhone = normalizedMobilePhone;
    }

    if (isBrazilian) {
      const isCpfValid = cleanTaxId.length === 11 && isValidCpf(cleanTaxId);
      const isCnpjValid = cleanTaxId.length === 14 && isValidCnpj(cleanTaxId);

      if (isCpfValid || isCnpjValid) {
        customerPayload.cpfCnpj = cleanTaxId;
      } else {
        const err: any = new Error('CPF ou CNPJ válido é obrigatório para cadastrar comprador brasileiro no Asaas.');
        err.code = 'ASAAS_BRAZILIAN_TAX_ID_REQUIRED';
        err.status = 400;
        throw err;
      }
    } else {
      customerPayload.foreignCustomer = true;
      // Note: mobilePhone is completely omitted for non-BR customers in initial integration
    }

    // 2. Check existing local link & synchronize if found
    const existingLink = await db
      .select()
      .from(paymentCustomers)
      .where(and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.provider, 'asaas')))
      .limit(1);

    if (existingLink.length > 0) {
      const existingCustomerId = existingLink[0].providerCustomerId;

      // Confirm customer exists in Asaas first
      try {
        await AsaasClient.request<any>(`/customers/${existingCustomerId}`, { method: 'GET' });
      } catch (getErr: any) {
        logger.error(`[AsaasCustomerSync] Customer ${existingCustomerId} não encontrado no Asaas: ${getErr.message}`);
        const err: any = new Error(`Customer ${existingCustomerId} não encontrado no Asaas: ${getErr.message}`);
        err.code = getErr.code || 'ASAAS_CUSTOMER_NOT_FOUND';
        err.status = getErr.status || 404;
        throw err;
      }

      // Synchronize existing Customer in Asaas via POST /customers/{id}
      try {
        await AsaasClient.request<any>(`/customers/${existingCustomerId}`, {
          method: 'POST',
          data: customerPayload,
        });
        logger.info(`[AsaasCustomerSync] Customer ${existingCustomerId} no Asaas sincronizado com sucesso para usuário ${userId}.`);
      } catch (syncErr: any) {
        logger.error(`[AsaasCustomerSync] Erro na sincronização do Customer ${existingCustomerId}: ${syncErr.message}`);
        // DO NOT SWALLOW SYNC ERRORS! Propagate error so charge creation fails if customer sync fails.
        const err: any = new Error(`Falha ao sincronizar cadastro do Customer no Asaas: ${syncErr.message}`);
        err.code = syncErr.code || 'ASAAS_CUSTOMER_SYNC_VALIDATION_ERROR';
        err.status = syncErr.status || 400;
        throw err;
      }

      return existingCustomerId;
    }

    // 3. Create new Customer in Asaas: POST /customers
    const asaasCustomer = await AsaasClient.request<any>('/customers', {
      method: 'POST',
      data: customerPayload,
    });

    const providerCustomerId = asaasCustomer?.id;
    if (!providerCustomerId) {
      throw new Error('Falha ao obter ID do Customer retornado pelo Asaas.');
    }

    // 4. Persist Local Link
    try {
      await db.insert(paymentCustomers).values({
        id: `pc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        userId: userId,
        provider: 'asaas',
        providerCustomerId: providerCustomerId,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (err: any) {
      // In case of concurrent request race condition, query again
      const fallbackLink = await db
        .select()
        .from(paymentCustomers)
        .where(and(eq(paymentCustomers.userId, userId), eq(paymentCustomers.provider, 'asaas')))
        .limit(1);

      if (fallbackLink.length > 0) {
        return fallbackLink[0].providerCustomerId;
      }
      throw err;
    }

    logger.info({ userId, providerCustomerId }, '[AsaasPaymentProvider] Customer Asaas vinculado com sucesso');
    return providerCustomerId;
  }

  /**
   * Initiates a real Asaas PIX Charge.
   * Validates order, ownership, currency (must be BRL), creates charge & fetches PIX QR Code.
   */
  async initiatePayment(req: PaymentGatewayRequest): Promise<PaymentGatewayResponse> {
    validateAsaasConfig();

    const db = getDb();
    if (!db) throw new Error('DATABASE_NOT_AVAILABLE: Banco de dados indisponível.');

    // 1. Fetch Order from DB
    const orderList = await db.select().from(orders).where(eq(orders.id, req.orderId)).limit(1);
    if (orderList.length === 0) {
      const err: any = new Error(`Pedido ${req.orderId} não foi encontrado.`);
      err.code = 'ORDER_NOT_FOUND';
      err.status = 404;
      throw err;
    }

    const order = orderList[0];

    // 2. Validate Ownership if buyerId is passed in metadata
    if (req.metadata?.buyerId && order.buyerId !== req.metadata.buyerId) {
      const err: any = new Error('Você só pode iniciar pagamento para um pedido próprio.');
      err.code = 'FORBIDDEN_ORDER_ACCESS';
      err.status = 403;
      throw err;
    }

    // 3. Currency Rule: Asaas PIX only supports BRL
    if (order.currency.toUpperCase() !== 'BRL') {
      const err: any = new Error(`Asaas PIX suporta apenas pedidos na moeda BRL. O pedido atual está em ${order.currency}.`);
      err.code = 'ASAAS_CURRENCY_NOT_SUPPORTED';
      err.status = 400;
      throw err;
    }

    // 4. Amount Source of Truth: Order Total Amount from DB
    const realAmount = Number(order.totalAmount);
    if (isNaN(realAmount) || realAmount <= 0) {
      const err: any = new Error('Valor total do pedido é inválido.');
      err.code = 'INVALID_ORDER_AMOUNT';
      err.status = 400;
      throw err;
    }

    // 5. Get or Create Asaas Customer
    // orderDocumentFallback: documento digitado no checkout desta compra
    // (orders.shipping_address_json.cpfOrTaxId) — usado só se o perfil do
    // comprador ainda não tiver um taxId registrado (ver getOrCreateCustomer).
    const orderDocumentFallback = (order.shippingAddressJson as any)?.cpfOrTaxId || null;
    const providerCustomerId = await this.getOrCreateCustomer(order.buyerId, orderDocumentFallback);

    // 6. Idempotency Check: Existing pending Asaas payment for this order
    const existingPayments = await db
      .select()
      .from(payments)
      .where(and(eq(payments.orderId, order.id), eq(payments.provider, 'asaas'), eq(payments.status, 'pending')))
      .limit(1);

    if (existingPayments.length > 0) {
      const existing = existingPayments[0];

      // If QR code was missing in initial creation, attempt to fetch it now without creating a duplicate charge
      if ((!existing.qrCode || !existing.qrCodeBase64) && existing.transactionRef) {
        try {
          const retryPixRes = await AsaasClient.request<any>(`/payments/${existing.transactionRef}/pixQrCode`, { method: 'GET' });
          const newCopiaECola = retryPixRes?.payload || undefined;
          const newQrCodeBase64 = retryPixRes?.encodedImage ? `data:image/png;base64,${retryPixRes.encodedImage}` : undefined;

          if (newCopiaECola || newQrCodeBase64) {
            existing.qrCode = newCopiaECola || existing.qrCode;
            existing.qrCodeBase64 = newQrCodeBase64 || existing.qrCodeBase64;

            await db
              .update(payments)
              .set({
                qrCode: existing.qrCode,
                qrCodeBase64: existing.qrCodeBase64,
                updatedAt: new Date(),
              })
              .where(eq(payments.id, existing.id));

            logger.info({ paymentId: existing.id }, '[AsaasPaymentProvider] QR Code recuperado com sucesso em tentativa subsequente (idempotência)');
          }
        } catch (retryErr: any) {
          logger.warn({ paymentId: existing.id, error: retryErr.message }, '[AsaasPaymentProvider] Tentativa de re-buscar QR Code PIX pendente falhou');
        }
      }

      logger.info({ orderId: order.id, paymentId: existing.id }, '[AsaasPaymentProvider] Retornando pagamento Asaas pendente existente (idempotência)');
      return {
        success: true,
        transactionRef: existing.transactionRef || existing.id,
        status: 'PENDING',
        qrCodeUrl: existing.qrCodeBase64 || undefined,
        pixCopiaECola: existing.qrCode || undefined,
        rawResponse: {
          paymentId: existing.id,
          providerPaymentId: existing.transactionRef,
          amount: realAmount,
          currency: order.currency,
          expirationDate: existing.expiresAt ? existing.expiresAt.toISOString() : undefined,
        },
      };
    }

    // 7. Calculate Due Date (1 day expiration for PIX)
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + 1);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    // 8. Create Charge on Asaas: POST /payments
    const chargePayload = {
      customer: providerCustomerId,
      billingType: 'PIX',
      value: realAmount,
      dueDate: dueDateStr,
      description: `Pedido Mercado Nusali #${order.orderNumber || order.id}`,
      externalReference: order.id,
    };

    const chargeRes = await AsaasClient.request<any>('/payments', {
      method: 'POST',
      data: chargePayload,
    });

    const asaasPaymentId = chargeRes?.id;
    if (!asaasPaymentId) {
      throw new Error('Falha ao criar cobrança PIX no Asaas: ID de cobrança não retornado.');
    }

    // 9. Fetch PIX QR Code from Asaas: GET /payments/{paymentId}/pixQrCode
    let copiaECola: string | undefined;
    let qrCodeBase64: string | undefined;
    let pixRes: any = null;

    try {
      pixRes = await AsaasClient.request<any>(`/payments/${asaasPaymentId}/pixQrCode`, {
        method: 'GET',
      });
      copiaECola = pixRes?.payload || undefined;
      qrCodeBase64 = pixRes?.encodedImage ? `data:image/png;base64,${pixRes.encodedImage}` : undefined;
    } catch (pixErr: any) {
      logger.warn({ asaasPaymentId, message: pixErr.message }, '[AsaasPaymentProvider] QR Code PIX pendente de ativação de chave no Asaas Sandbox');
    }

    // 10. Persist Payment & Payment Attempt locally
    const localPaymentId = `pay_asaas_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    await db.insert(payments).values({
      id: localPaymentId,
      orderId: order.id,
      // Fase C3 — declarado explicitamente: este método (initiatePayment)
      // é exclusivamente o fluxo legado por order (guard em
      // PaymentService.initiatePayment rejeita antes de chegar aqui um
      // order com purchaseGroupId preenchido) — é sempre o único pagamento
      // financeiro deste order.
      settlementRole: 'primary',
      buyerId: order.buyerId,
      amount: String(realAmount),
      currency: order.currency,
      provider: 'asaas',
      method: 'pix',
      status: 'pending',
      transactionRef: asaasPaymentId,
      idempotencyKey: req.metadata?.idempotencyKey || `asaas_pix_${order.id}`,
      qrCode: copiaECola,
      qrCodeBase64: qrCodeBase64,
      expiresAt: dueDateObj,
      rawResponseJson: {
        providerPaymentId: asaasPaymentId,
        providerStatus: chargeRes?.status,
        billingType: chargeRes?.billingType,
        externalReference: chargeRes?.externalReference,
        dueDate: chargeRes?.dueDate,
        value: chargeRes?.value,
        expirationDate: pixRes?.expirationDate || dueDateStr,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(paymentAttempts).values({
      id: `att_asaas_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      paymentId: localPaymentId,
      attemptNumber: 1,
      provider: 'asaas',
      status: 'created',
      rawPayloadJson: { asaasPaymentId, status: chargeRes.status },
      createdAt: new Date(),
    });

    logger.info({ orderId: order.id, localPaymentId, asaasPaymentId, amount: realAmount }, '[AsaasPaymentProvider] Cobrança PIX criada com sucesso');

    return {
      success: true,
      transactionRef: asaasPaymentId,
      status: 'PENDING',
      qrCodeUrl: qrCodeBase64,
      pixCopiaECola: copiaECola,
      rawResponse: {
        paymentId: localPaymentId,
        providerPaymentId: asaasPaymentId,
        amount: realAmount,
        currency: order.currency,
        expirationDate: pixRes?.expirationDate || dueDateStr,
      },
    };
  }

  /**
   * Fase C3.1 — SOMENTE a fase externa + fase local 2 da iniciação de group
   * payment. A reserva local (fase local 1: lock, validação, existe-pending?,
   * INSERT da linha 'candidate' com transactionRef=NULL) já aconteceu em
   * PaymentService.initiatePurchaseGroupPayment ANTES desta chamada, dentro
   * de uma transação curta já commitada — este método NUNCA mais decide "se"
   * uma tentativa deve ser criada, só EXECUTA a tentativa já decidida
   * (localPaymentId/idempotencyKey vêm prontos do chamador) e persiste o
   * resultado. Não há transação Postgres nem advisory lock abertos durante
   * nada disto — cada `await db.xxx` aqui é sua própria operação autônoma
   * numa conexão do pool (getDb()), exatamente como o resto deste arquivo.
   *
   * Retorno é um resultado discriminado (nunca lança para os casos
   * previstos de falha do provider) para que o chamador decida o
   * comportamento HTTP correto:
   *   'succeeded'          -> cobrança criada, QR pronto (ou best-effort).
   *   'definitive_failure' -> Asaas respondeu recusando (sync, com corpo de
   *                           resposta) — sabemos que NENHUMA cobrança foi
   *                           criada. payments.status vira 'failed'.
   *   'ambiguous'          -> erro de rede/timeout (ASAAS_NETWORK_ERROR) —
   *                           NÃO sabemos se o Asaas chegou a criar a
   *                           cobrança antes da nossa conexão cair.
   *                           payments.status permanece 'pending' de
   *                           propósito (nunca 'failed') — só
   *                           payment_attempts.status registra a ambiguidade
   *                           ('ambiguous_timeout'). Resolver isso de
   *                           verdade exigiria consultar o Asaas por
   *                           externalReference/idempotencyKey — mecanismo
   *                           NÃO implementado (checkPaymentStatus continua
   *                           NOT_IMPLEMENTED) -> risco residual documentado
   *                           no relatório, não escondido.
   */
  async initiatePurchaseGroupPayment(req: {
    localPaymentId: string;
    purchaseGroupId: string;
    buyerId: string;
    amount: number;
    currency: string;
    idempotencyKey: string;
  }): Promise<
    | { outcome: 'succeeded'; transactionRef: string; qrCodeUrl?: string; pixCopiaECola?: string; rawResponse: any }
    | { outcome: 'definitive_failure'; error: any }
    | { outcome: 'ambiguous'; error: any }
  > {
    validateAsaasConfig();

    const db = getDb();
    if (!db) throw new Error('DATABASE_NOT_AVAILABLE: Banco de dados indisponível.');

    const realAmount = Number(req.amount);
    if (req.currency.toUpperCase() !== 'BRL' || isNaN(realAmount) || realAmount <= 0) {
      // Defesa em profundidade — já validado pelo chamador antes da reserva
      // local; se chegar aqui inconsistente é bug do chamador, não do
      // provider externo, então é sempre definitivo (nenhuma tentativa HTTP
      // foi feita).
      const err: any = new Error('Parâmetros inválidos para cobrança de purchase_group (moeda/valor).');
      err.code = 'INVALID_PURCHASE_GROUP_AMOUNT';
      err.status = 400;
      await this.markPurchaseGroupAttemptTerminal(req.localPaymentId, 'failed', err.message);
      return { outcome: 'definitive_failure', error: err };
    }

    // 1. Get or Create Asaas Customer — QUALQUER erro aqui é definitivo:
    // nenhuma cobrança foi sequer tentada ainda (a criação de customer é uma
    // etapa separada e anterior à criação da cobrança em si).
    let providerCustomerId: string;
    try {
      let orderDocumentFallback: string | null = null;
      try {
        const [firstChild] = await db
          .select({ shippingAddressJson: orders.shippingAddressJson })
          .from(orders)
          .where(eq(orders.purchaseGroupId, req.purchaseGroupId))
          .limit(1);
        orderDocumentFallback = (firstChild?.shippingAddressJson as any)?.cpfOrTaxId || null;
      } catch {
        orderDocumentFallback = null;
      }
      providerCustomerId = await this.getOrCreateCustomer(req.buyerId, orderDocumentFallback);
    } catch (err: any) {
      await this.markPurchaseGroupAttemptTerminal(req.localPaymentId, 'failed', err.message);
      return { outcome: 'definitive_failure', error: err };
    }

    // 2. Calculate Due Date (1 day expiration for PIX — mesma regra de initiatePayment)
    const dueDateObj = new Date();
    dueDateObj.setDate(dueDateObj.getDate() + 1);
    const dueDateStr = dueDateObj.toISOString().split('T')[0];

    // 3. Create Charge on Asaas: POST /payments — externalReference é o
    // purchaseGroupId, NUNCA um child order. idempotencyKey (backend-only,
    // já decidida na reserva local) NUNCA é enviada ao Asaas — é só a chave
    // LOCAL de auditoria/lookup em payments.idempotencyKey (mesmo padrão já
    // usado pelo fluxo legado: o Asaas em si não recebe um header de
    // idempotência hoje). Isso é seguro porque esta chamada só acontece
    // UMA VEZ por localPaymentId — nenhum concorrente chega até aqui para a
    // MESMA tentativa (a fase local 1 já garantiu isso).
    const chargePayload = {
      customer: providerCustomerId,
      billingType: 'PIX',
      value: realAmount,
      dueDate: dueDateStr,
      description: `Compra Mercado Nusali (grupo #${req.purchaseGroupId})`,
      externalReference: req.purchaseGroupId,
    };

    let chargeRes: any;
    try {
      chargeRes = await AsaasClient.request<any>('/payments', { method: 'POST', data: chargePayload });
    } catch (err: any) {
      if (err.code === 'ASAAS_NETWORK_ERROR') {
        // Timeout/erro de conexão — POST pode ou não ter chegado ao Asaas.
        await this.markPurchaseGroupAttemptTerminal(req.localPaymentId, 'ambiguous_timeout', err.message);
        return { outcome: 'ambiguous', error: err };
      }
      // Resposta HTTP definitiva de erro (validação/auth/rate-limit/5xx) —
      // o Asaas respondeu de forma síncrona recusando a requisição.
      await this.markPurchaseGroupAttemptTerminal(req.localPaymentId, 'failed', err.message);
      return { outcome: 'definitive_failure', error: err };
    }

    const asaasPaymentId = chargeRes?.id;
    if (!asaasPaymentId) {
      const err: any = new Error('Falha ao criar cobrança PIX no Asaas para o purchase_group: ID de cobrança não retornado.');
      await this.markPurchaseGroupAttemptTerminal(req.localPaymentId, 'failed', err.message);
      return { outcome: 'definitive_failure', error: err };
    }

    // 4. Fetch PIX QR Code — best-effort, nunca falha a cobrança já criada
    // (mesma tolerância do fluxo legado).
    let copiaECola: string | undefined;
    let qrCodeBase64: string | undefined;
    let pixRes: any = null;
    try {
      pixRes = await AsaasClient.request<any>(`/payments/${asaasPaymentId}/pixQrCode`, { method: 'GET' });
      copiaECola = pixRes?.payload || undefined;
      qrCodeBase64 = pixRes?.encodedImage ? `data:image/png;base64,${pixRes.encodedImage}` : undefined;
    } catch (pixErr: any) {
      logger.warn({ asaasPaymentId, message: pixErr.message }, '[AsaasPaymentProvider] QR Code PIX (group) pendente de ativação de chave no Asaas Sandbox');
    }

    // ==========================================================================
    // FASE LOCAL 2 — update curto, SEM advisory lock: só esta chamada escreve
    // nesta linha específica (reservada exclusivamente para esta tentativa).
    // ==========================================================================
    await db.update(payments).set({
      transactionRef: asaasPaymentId,
      qrCode: copiaECola,
      qrCodeBase64: qrCodeBase64,
      expiresAt: dueDateObj,
      rawResponseJson: {
        providerPaymentId: asaasPaymentId,
        providerStatus: chargeRes?.status,
        billingType: chargeRes?.billingType,
        externalReference: chargeRes?.externalReference,
        dueDate: chargeRes?.dueDate,
        value: chargeRes?.value,
        expirationDate: pixRes?.expirationDate || dueDateStr,
      },
      updatedAt: new Date(),
    }).where(eq(payments.id, req.localPaymentId));

    await db.update(paymentAttempts).set({
      status: 'succeeded',
      rawPayloadJson: { asaasPaymentId, status: chargeRes.status },
    }).where(and(eq(paymentAttempts.paymentId, req.localPaymentId), eq(paymentAttempts.status, 'reserved')));

    logger.info({ purchaseGroupId: req.purchaseGroupId, localPaymentId: req.localPaymentId, asaasPaymentId, amount: realAmount }, '[AsaasPaymentProvider] Cobrança PIX do purchase_group criada com sucesso (fase local 2)');

    return {
      outcome: 'succeeded',
      transactionRef: asaasPaymentId,
      qrCodeUrl: qrCodeBase64,
      pixCopiaECola: copiaECola,
      rawResponse: {
        paymentId: req.localPaymentId,
        providerPaymentId: asaasPaymentId,
        amount: realAmount,
        currency: req.currency,
        expirationDate: pixRes?.expirationDate || dueDateStr,
      },
    };
  }

  /**
   * Persiste o resultado terminal de uma tentativa de group payment que NÃO
   * teve sucesso. 'failed' (definitivo): payments.status vira 'failed' — a
   * PRÓXIMA iniciação para o mesmo group não vai mais encontrar esta linha
   * no filtro status='pending' da fase local 1, e portanto poderá reservar
   * uma tentativa NOVA (P2) legitimamente. 'ambiguous_timeout': payments
   * .status PERMANECE 'pending' de propósito — nunca inventamos que um
   * timeout significa "falhou", porque a cobrança pode ter sido criada do
   * lado do Asaas; só payment_attempts.status registra a ambiguidade, e a
   * PRÓPRIA linha 'pending' (transactionRef ainda NULL) passa a ser
   * reaproveitada em qualquer nova chamada, nunca duplicada.
   */
  private async markPurchaseGroupAttemptTerminal(localPaymentId: string, kind: 'failed' | 'ambiguous_timeout', errorMessage: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      if (kind === 'failed') {
        await db.update(payments).set({ status: 'failed', updatedAt: new Date() }).where(eq(payments.id, localPaymentId));
      }
      await db.update(paymentAttempts).set({ status: kind, errorMessage }).where(and(eq(paymentAttempts.paymentId, localPaymentId), eq(paymentAttempts.status, 'reserved')));
    } catch (persistErr: any) {
      logger.error({ localPaymentId, kind, persistErr: persistErr.message }, '[AsaasPaymentProvider] Falha ao persistir estado terminal da tentativa de group payment');
    }
  }

  /**
   * Fase C3.1 — mesma recuperação de QR do legacy, mas extraída como método
   * próprio para ser chamada FORA de qualquer transação/lock (pelo
   * PaymentService, quando reaproveita uma reserva existente cujo provider
   * já confirmou a cobrança mas o QR ainda não chegou). Nunca lança — é
   * best-effort, exatamente como já era.
   */
  async retryFetchPurchaseGroupQrCode(paymentId: string, transactionRef: string): Promise<void> {
    const db = getDb();
    if (!db) return;
    try {
      const [current] = await db.select({ qrCode: payments.qrCode, qrCodeBase64: payments.qrCodeBase64 }).from(payments).where(eq(payments.id, paymentId)).limit(1);
      const retryPixRes = await AsaasClient.request<any>(`/payments/${transactionRef}/pixQrCode`, { method: 'GET' });
      const newCopiaECola = retryPixRes?.payload || undefined;
      const newQrCodeBase64 = retryPixRes?.encodedImage ? `data:image/png;base64,${retryPixRes.encodedImage}` : undefined;
      // Nunca sobrescreve um valor já existente com undefined — mesmo
      // fallback do legacy (existing.qrCode = novo || existing.qrCode).
      const finalQrCode = newCopiaECola || current?.qrCode || undefined;
      const finalQrCodeBase64 = newQrCodeBase64 || current?.qrCodeBase64 || undefined;
      if (newCopiaECola || newQrCodeBase64) {
        await db.update(payments).set({
          qrCode: finalQrCode,
          qrCodeBase64: finalQrCodeBase64,
          updatedAt: new Date(),
        }).where(eq(payments.id, paymentId));
        logger.info({ paymentId }, '[AsaasPaymentProvider] QR Code (group) recuperado com sucesso em tentativa subsequente (idempotência)');
      }
    } catch (retryErr: any) {
      logger.warn({ paymentId, error: retryErr.message }, '[AsaasPaymentProvider] Tentativa de re-buscar QR Code PIX pendente (group) falhou');
    }
  }

  async checkPaymentStatus(transactionRef: string): Promise<PaymentGatewayResponse> {
    validateAsaasConfig();
    logger.info({ transactionRef }, '[AsaasPaymentProvider] Status check requested');
    throw new Error('NOT_IMPLEMENTED: A verificação de status Asaas será ativada nas próximas etapas.');
  }

  /**
   * Fase C5.2-D.3 — client ISOLADO de refund Asaas (POST + correlação da
   * resposta). NÃO chama nenhuma finalização local, NÃO grava nada no banco,
   * NÃO decide status local ('processed'/'failed'/etc.) — só traduz a
   * resposta HTTP do Asaas num resultado discriminado para D.4/D.5
   * orquestrarem. auditoria C5.2-D.1 confirmada em cada decisão abaixo:
   *
   *  - value SEMPRE enviado explicitamente (nunca confiar em "refund
   *    integral por omissão" — nosso backend é a autoridade do amount);
   *  - splitRefunds NUNCA enviado (marketplace não usa Asaas Split);
   *  - a resposta 200 é o PAYMENT OBJETO inteiro, nunca um "refund" isolado
   *    — o item correlato é buscado dentro de `refunds[]` por `description`,
   *    NUNCA por posição (`refunds[refunds.length-1]` está EXPLICITAMENTE
   *    proibido pelo pedido — dois refunds parciais no mesmo payment tornam
   *    posição um critério inseguro);
   *  - zero retry: `AsaasClient.request` (auditado nesta fase) não possui
   *    NENHUM retry automático — POST timeout nunca é reenviado por este
   *    método, current call sempre = 1 chamada HTTP;
   *  - Fase C5.2-D.3.2 (hardening pós-auditoria D.3.1) — classificação final
   *    de um POST FINANCEIRO: `DEFINITIVE_FAILURE` só quando temos evidência
   *    de rejeição ANTES de qualquer processamento (400/401/403/404/422, e
   *    409 embora não documentado para este endpoint — preservado pelo
   *    comportamento atual, sem inventar semântica nova). Timeout/erro de
   *    rede, 429 (rate limit — a doc nunca provou que implica "nada foi
   *    criado") e QUALQUER 5xx (pode ter sido processado antes de uma falha
   *    de proxy/gateway/resposta) viram `AMBIGUOUS_EXTERNAL_RESULT` — nunca
   *    permitem ao caller assumir que é seguro reenviar a POST; D.4/D.5
   *    deverão reconciliar via GET + correlationKey.
   */
  async refundPayment(req: RefundGatewayRequest): Promise<RefundGatewayOutcome> {
    const transactionRef = typeof req?.transactionRef === 'string' ? req.transactionRef.trim() : '';
    const correlationKey = typeof req?.correlationKey === 'string' ? req.correlationKey.trim() : '';
    const amount = Number(req?.amount);

    // Fail-fast LOCAL — zero chamada HTTP para entrada inválida (seção 4 do pedido).
    if (!transactionRef) {
      const err: any = new Error('ASAAS_REFUND_INVALID_REQUEST: transactionRef (id da cobrança no Asaas) é obrigatório.');
      err.code = 'ASAAS_REFUND_INVALID_REQUEST';
      throw err;
    }
    if (!(amount > 0)) {
      const err: any = new Error('ASAAS_REFUND_INVALID_REQUEST: amount deve ser um número positivo.');
      err.code = 'ASAAS_REFUND_INVALID_REQUEST';
      throw err;
    }
    if (!correlationKey) {
      const err: any = new Error('ASAAS_REFUND_INVALID_REQUEST: correlationKey é obrigatória — é a única identidade externa do refund (Asaas não emite id de refund para Pix).');
      err.code = 'ASAAS_REFUND_INVALID_REQUEST';
      throw err;
    }

    validateAsaasConfig();

    const body: AsaasRefundRequest = { value: amount, description: correlationKey };

    logger.info({ transactionRef, correlationKey, amount }, '[AsaasPaymentProvider] Refund POST submitted');

    let paymentRes: any;
    try {
      paymentRes = await AsaasClient.request<any>(`/payments/${transactionRef}/refund`, { method: 'POST', data: body });
    } catch (err: any) {
      const httpStatus = typeof err.status === 'number' ? err.status : 0;

      // Fase C5.2-D.3.2 — hardening: para um POST FINANCEIRO, "não sabemos
      // se o refund foi criado" é o critério que decide AMBIGUOUS, nunca a
      // conveniência de já existir um `errorCode` genérico no AsaasClient.
      // Auditoria D.3.1 (seção 3) confirmou o risco: `ASAAS_PROVIDER_UNAVAILABLE`
      // é usado pelo AsaasClient tanto para 5xx quanto para 404/409 (nenhum
      // branch dedicado) — por isso a decisão AQUI usa o `httpStatus` bruto
      // para 5xx, nunca o `code`, e só usa `code` para os dois casos em que
      // ele É inequívoco (`ASAAS_NETWORK_ERROR`, `ASAAS_RATE_LIMITED`).
      // `if (code === ASAAS_PROVIDER_UNAVAILABLE) ambiguous` classificaria um
      // 404 real (payment inexistente — genuinamente definitivo) como
      // ambíguo por engano; por isso NUNCA usamos esse code como gatilho.
      const isAmbiguous =
        err.code === 'ASAAS_NETWORK_ERROR' || // timeout / ECONNRESET / DNS — nunca sabemos se chegou ao Asaas.
        err.code === 'ASAAS_RATE_LIMITED' ||  // 429 — a doc auditada (D.1) NUNCA provou que rate-limit implica "refund não criado"; não dependemos dessa inferência para dinheiro.
        (httpStatus >= 500 && httpStatus <= 599); // 5xx — pode ter sido processado antes de uma falha de proxy/gateway/resposta.

      if (isAmbiguous) {
        // NUNCA sabemos se a Asaas processou antes da resposta ambígua.
        // Nenhum retry é feito aqui (nem pelo AsaasClient, nem por este
        // método) — D.4/D.5 deverão reconciliar via GET + correlationKey,
        // nunca reenviar esta POST cegamente.
        return {
          outcome: 'AMBIGUOUS_EXTERNAL_RESULT',
          code: err.code || 'ASAAS_PROVIDER_UNAVAILABLE',
          message: err.message,
          correlationKey,
          transactionRef,
        };
      }

      // Resposta HTTP definitiva de erro (400/401/403/404/422 — e 409,
      // embora NÃO documentado pela auditoria D.1 para este endpoint
      // especificamente; preservado como definitivo pelo comportamento
      // atual do AsaasClient, sem inventar semântica financeira nova para
      // ele). err.message já vem sanitizado pelo AsaasClient (nunca contém
      // headers/access_token).
      return {
        outcome: 'DEFINITIVE_FAILURE',
        httpStatus,
        code: err.code || 'ASAAS_PROVIDER_UNAVAILABLE',
        message: err.message,
        correlationKey,
        transactionRef,
      };
    }

    // Resposta 200 — payment object inteiro; refunds pode ser null (nenhum
    // estorno ainda refletido) mesmo com 200 (auditoria D.1, seção 3).
    const refundsRaw: any[] | null = Array.isArray(paymentRes?.refunds) ? paymentRes.refunds : null;
    const sanitizedRefunds: AsaasRefund[] | null = refundsRaw ? refundsRaw.map(sanitizeAsaasRefund) : null;

    const correlation = findRefundByCorrelation(sanitizedRefunds, correlationKey, amount);

    if (correlation.status === 'NOT_FOUND') {
      logger.warn({ transactionRef, correlationKey }, '[AsaasPaymentProvider] Refund POST 200 mas ZERO refunds correlacionados por description — fail closed');
      return {
        outcome: 'RESPONSE_CORRELATION_FAILURE',
        reason: 'ZERO_MATCHES',
        correlationKey,
        transactionRef,
        evidence: null,
      };
    }
    if (correlation.status === 'AMBIGUOUS') {
      logger.warn({ transactionRef, correlationKey, matchCount: correlation.matches.length }, '[AsaasPaymentProvider] Refund POST 200 com MÚLTIPLOS refunds correlacionados por description — fail closed (correlação ambígua)');
      return {
        outcome: 'RESPONSE_CORRELATION_FAILURE',
        reason: 'MULTIPLE_MATCHES',
        correlationKey,
        transactionRef,
        evidence: correlation.matches,
      };
    }
    if (correlation.status === 'AMOUNT_MISMATCH') {
      logger.warn({ transactionRef, correlationKey, expected: amount, got: correlation.refund.value }, '[AsaasPaymentProvider] Refund POST 200 com description correlacionada mas value divergente — fail closed');
      return {
        outcome: 'RESPONSE_CORRELATION_FAILURE',
        reason: 'AMOUNT_MISMATCH',
        correlationKey,
        transactionRef,
        evidence: correlation.refund,
      };
    }

    // FOUND — retorna o status BRUTO do provider, nunca reescrito (PENDING
    // permanece PENDING; DONE e CANCELLED são igualmente só "evidência
    // entregue ao caller", nunca finalização — D.3 não chama nada disso).
    logger.info({ transactionRef, correlationKey, providerStatus: correlation.refund.status }, '[AsaasPaymentProvider] Refund correlacionado com sucesso via description');
    return {
      outcome: 'SUBMITTED',
      providerStatus: correlation.refund.status,
      correlationKey,
      transactionRef,
      rawEvidence: correlation.refund,
    };
  }

  /**
   * Fase C5.2-D.3 — GET /v3/payments/{id}/refunds com paginação segura
   * (offset/hasMore, auditoria D.1 seção 4/9). Usado SÓ para
   * recovery/reconciliação (D.4/D.5) — nunca polling agressivo, e este
   * método em si não decide nada, só devolve a lista sanitizada e completa.
   * Não força um `limit` — deixa o default da própria Asaas (confirmado
   * =10 no exemplo oficial) e só ajusta `offset`; nenhum máximo de página é
   * inventado (a doc auditada não documentou um teto para este endpoint).
   */
  async listAllRefunds(transactionRef: string): Promise<AsaasRefund[]> {
    const ref = typeof transactionRef === 'string' ? transactionRef.trim() : '';
    if (!ref) {
      const err: any = new Error('ASAAS_REFUND_INVALID_REQUEST: transactionRef (id da cobrança no Asaas) é obrigatório.');
      err.code = 'ASAAS_REFUND_INVALID_REQUEST';
      throw err;
    }
    validateAsaasConfig();

    const all: AsaasRefund[] = [];
    let offset = 0;
    let page = 0;

    while (true) {
      page++;
      if (page > ASAAS_REFUND_LIST_SAFETY_MAX_PAGES) {
        const err: any = new Error(`ASAAS_REFUND_PAGINATION_GUARD: mais de ${ASAAS_REFUND_LIST_SAFETY_MAX_PAGES} páginas de refunds para "${ref}" — abortado para evitar loop infinito/corrompido (limite próprio, não documentado pelo Asaas).`);
        err.code = 'ASAAS_REFUND_PAGINATION_GUARD';
        throw err;
      }

      const res = await AsaasClient.request<AsaasRefundListResponse>(`/payments/${ref}/refunds`, {
        method: 'GET',
        params: offset > 0 ? { offset: String(offset) } : undefined,
      });

      const pageData = Array.isArray(res?.data) ? res.data.map(sanitizeAsaasRefund) : [];
      all.push(...pageData);

      // Guard extra: para mesmo se hasMore=true mas a página veio vazia
      // (resposta corrompida/inconsistente) — nunca gira em vazio.
      if (!res?.hasMore || pageData.length === 0) break;
      offset += pageData.length;
    }

    return all;
  }

  /**
   * Helper method for connectivity check against official Asaas Sandbox endpoint.
   * Performs a safe GET request to /myAccount/status/ without creating customers or charges.
   */
  async testConnection(): Promise<{ success: boolean; generalStatus: string | null; commercialInfoStatus: string | null; documentationStatus: string | null }> {
    validateAsaasConfig();

    const res = await AsaasClient.request<any>('/myAccount/status/', { method: 'GET' });

    return {
      success: true,
      generalStatus: res?.general ?? res?.status ?? null,
      commercialInfoStatus: res?.commercialInfo ?? null,
      documentationStatus: res?.documentation ?? null,
    };
  }
}
