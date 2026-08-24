import { PaymentProvider, PaymentGatewayRequest, PaymentGatewayResponse } from '../paymentProvider.js';
import { AsaasClient } from '../clients/asaasClient.js';
import { validateAsaasConfig } from '../config/asaasConfig.js';
import { logger } from '../../../infra/logger.js';
import { getDb } from '../../../../db/index.js';
import { orders, users, userProfiles, payments, paymentAttempts, paymentCustomers } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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
   */
  async getOrCreateCustomer(userId: string): Promise<string> {
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
    const rawTaxId = profileRecord?.taxId || (userRecord as any).taxId || '';
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
    const providerCustomerId = await this.getOrCreateCustomer(order.buyerId);

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

  async checkPaymentStatus(transactionRef: string): Promise<PaymentGatewayResponse> {
    validateAsaasConfig();
    logger.info({ transactionRef }, '[AsaasPaymentProvider] Status check requested');
    throw new Error('NOT_IMPLEMENTED: A verificação de status Asaas será ativada nas próximas etapas.');
  }

  async refundPayment(transactionRef: string, amount?: number): Promise<PaymentGatewayResponse> {
    validateAsaasConfig();
    logger.info({ transactionRef, amount }, '[AsaasPaymentProvider] Refund requested');
    throw new Error('NOT_IMPLEMENTED: O estorno de pagamentos Asaas será ativado nas próximas etapas.');
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
