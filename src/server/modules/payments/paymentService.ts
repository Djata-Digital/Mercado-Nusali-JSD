import { getDb } from '../../../db/index.js';
import { users, sellers, payments, paymentAttempts, orders, escrowAccounts, escrowTransactions, orderStatusHistory, notifications, shipments, wallets, walletTransactions, ledgerEntries, ledgerAccounts, disputes, proofOfDelivery, auditLogs, purchaseGroups, platformSettings, paymentAllocations } from '../../../db/schema.js';
import { syncOrderFulfillmentStatus } from '../orders/orderService.js';
import { eq, and, ne, sql, inArray, desc } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser, broadcastAdminEvent } from '../../infra/websocket.js';
import { AsaasPaymentProvider } from './providers/asaasPaymentProvider.js';
import { FinancialLedgerService } from '../ledger/financialLedgerService.js';
import { assertNoBlockingChargebackForPayment } from './chargebackService.js';

export interface InitiatePaymentDTO {
  orderId: string;
  buyerId: string;
  amount?: number;
  currency?: string;
  method: string;
  provider?: string;
  idempotencyKey?: string;
}

export interface InitiatePurchaseGroupPaymentDTO {
  purchaseGroupId: string;
  buyerId: string;
  method: string;
  provider?: string;
}

export interface ConfirmOrderPaymentOptions {
  provider?: string;
  transactionRef?: string;
  performedBy?: string;
}

/**
 * Erro financeiro explícito — lançado quando o pedido não tem os snapshots
 * financeiros necessários para liberar o escrow com segurança. Nunca inventamos
 * um valor nem caímos de volta para escrow.amount bruto (Fase 6, correção do
 * achado CRÍTICO B). Pedidos legado/fixture sem esse snapshot precisam de
 * tratamento manual separado — esta função não tenta adivinhar por eles.
 */
export class MissingFinancialSnapshotError extends Error {
  constructor(orderId: string, detail: string) {
    super(`MISSING_FINANCIAL_SNAPSHOT: pedido ${orderId} não pode liberar escrow — ${detail}. escrow.amount bruto nunca é usado como fallback.`);
    this.name = 'MissingFinancialSnapshotError';
  }
}

/**
 * Fonte de verdade do valor a creditar ao vendedor na liberação do escrow:
 * SEMPRE orders.sellerNetAmount — o snapshot financeiro gravado no momento da
 * criação do pedido (orderService.ts). Nunca o valor bruto do escrow (que inclui
 * frete e a comissão da Nusali) e nunca recalculado com a regra de comissão
 * vigente no momento do release — a regra pode ter mudado desde a criação do
 * pedido; usar o snapshot preserva exatamente o que foi cobrado do comprador
 * naquele momento (Fase 6, correção do achado CRÍTICO B).
 */
export function calculateSellerReleaseAmount(order: { id: string; sellerNetAmount: string | number | null | undefined }): number {
  if (order.sellerNetAmount === null || order.sellerNetAmount === undefined) {
    throw new MissingFinancialSnapshotError(order.id, 'orders.sellerNetAmount ausente');
  }
  const amount = Number(order.sellerNetAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new MissingFinancialSnapshotError(order.id, `orders.sellerNetAmount inválido (${order.sellerNetAmount})`);
  }
  return amount;
}

export class PaymentService {
  /**
   * Initiates a payment for an order.
   *
   * SECURITY (Fase 4A hardening): the amount and currency actually charged/recorded are
   * ALWAYS derived from the real `orders` row in Postgres — never from the client-supplied
   * `data.amount`/`data.currency`. If the client sends an explicit value that diverges from
   * the order, the request is rejected (not silently corrected), so a stale/buggy frontend
   * surfaces as an error instead of a hidden amount mismatch. Ownership (order.buyerId ===
   * data.buyerId), payment eligibility (not already paid, not cancelled) and idempotency
   * across concurrent initiations for the same order are enforced here, before any gateway
   * call, via a Postgres advisory lock scoped to the order id for the duration of this
   * transaction.
   */
  // `executor` opcional: mesmo padrão de testabilidade já usado em
  // orderService/payoutService/refundService — permite testar contra um
  // Postgres Docker isolado sem depender do pool singleton getDb() (SSL
  // fixo, incompatível com Docker). Em produção, executor é sempre
  // undefined e o comportamento é idêntico ao anterior.
  static async initiatePayment(data: InitiatePaymentDTO, executor?: any) {
    const db = executor ?? getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    if (!data.orderId || !String(data.orderId).trim()) {
      const err: any = new Error('ORDER_ID_REQUIRED: O identificador do pedido é obrigatório para iniciar um pagamento.');
      err.code = 'ORDER_ID_REQUIRED';
      err.status = 400;
      throw err;
    }
    if (!data.buyerId) {
      const err: any = new Error('UNAUTHORIZED: Comprador não identificado.');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }

    return await db.transaction(async (tx) => {
      // Serialize concurrent initiate-payment calls for the SAME order. The lock is held for
      // the whole transaction (including the external gateway call below) and released
      // automatically on commit/rollback, so a second concurrent call for the same orderId
      // blocks here until the first one has fully created (or reused) its payment record.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.orderId}))`);

      const [order] = await tx.select().from(orders).where(eq(orders.id, data.orderId)).limit(1);
      if (!order) {
        const err: any = new Error(`Pedido "${data.orderId}" não foi encontrado.`);
        err.code = 'ORDER_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (order.buyerId !== data.buyerId) {
        const err: any = new Error('Você não tem permissão para iniciar pagamento para este pedido.');
        err.code = 'FORBIDDEN_ORDER_ACCESS';
        err.status = 403;
        throw err;
      }

      // Fase C3 — guard essencial: um child order de purchase_group NUNCA
      // pode receber uma cobrança legacy própria (isso criaria uma segunda
      // cobrança real desconectada do pagamento único do group, exatamente
      // o que a arquitetura de purchase_group existe para evitar). O
      // pagamento desse order pertence exclusivamente ao fluxo de group
      // payment (POST /payments/purchase-groups/:purchaseGroupId/initiate).
      if (order.purchaseGroupId) {
        const err: any = new Error('ORDER_BELONGS_TO_PURCHASE_GROUP: Este pedido faz parte de uma compra multi-vendedor — o pagamento deve ser iniciado para o purchase_group, não para o pedido individual.');
        err.code = 'ORDER_BELONGS_TO_PURCHASE_GROUP';
        err.status = 409;
        throw err;
      }

      if (order.paymentStatus === 'paid') {
        const err: any = new Error('ORDER_ALREADY_PAID: Este pedido já foi pago.');
        err.code = 'ORDER_ALREADY_PAID';
        err.status = 409;
        throw err;
      }

      if (order.status === 'cancelled') {
        const err: any = new Error('ORDER_NOT_PAYABLE: Este pedido foi cancelado e não pode mais ser pago.');
        err.code = 'ORDER_NOT_PAYABLE';
        err.status = 409;
        throw err;
      }

      // Source of truth: the real order row. Client-supplied amount/currency are only used
      // to DETECT a mismatch, never to decide what gets charged/recorded.
      const realAmount = Number(order.totalAmount);
      const realCurrency = String(order.currency).toUpperCase();

      if (data.amount !== undefined && data.amount !== null) {
        const clientAmount = Number(data.amount);
        if (isNaN(clientAmount) || Math.abs(clientAmount - realAmount) > 0.01) {
          const err: any = new Error(`PAYMENT_AMOUNT_MISMATCH: O valor informado (${data.amount}) diverge do total real do pedido (${realAmount}).`);
          err.code = 'PAYMENT_AMOUNT_MISMATCH';
          err.status = 400;
          throw err;
        }
      }
      if (data.currency && String(data.currency).trim().toUpperCase() !== realCurrency) {
        const err: any = new Error(`PAYMENT_CURRENCY_MISMATCH: A moeda informada (${data.currency}) diverge da moeda real do pedido (${realCurrency}).`);
        err.code = 'PAYMENT_CURRENCY_MISMATCH';
        err.status = 400;
        throw err;
      }

      const provider = data.provider || (data.method === 'pix' ? 'pix_engine' : data.method.includes('orange') ? 'orange_money' : 'nusali_pay');

      if (provider === 'asaas') {
        const asaasProvider = new AsaasPaymentProvider();
        const gatewayRes = await asaasProvider.initiatePayment({
          orderId: order.id,
          amount: realAmount,
          currency: realCurrency,
          customerName: '',
          customerEmail: '',
          paymentMethod: data.method,
          metadata: {
            buyerId: data.buyerId,
            idempotencyKey: data.idempotencyKey,
          },
        });

        return {
          paymentId: gatewayRes.rawResponse?.paymentId || gatewayRes.transactionRef,
          provider: 'asaas',
          providerPaymentId: gatewayRes.transactionRef,
          method: data.method,
          status: 'pending',
          amount: gatewayRes.rawResponse?.amount,
          currency: gatewayRes.rawResponse?.currency,
          pix: {
            encodedImage: gatewayRes.qrCodeUrl,
            payload: gatewayRes.pixCopiaECola,
            expirationDate: gatewayRes.rawResponse?.expirationDate,
          },
          qrCode: gatewayRes.pixCopiaECola,
          qrCodeBase64: gatewayRes.qrCodeUrl,
        };
      }

      // Non-Asaas (simulated/local) providers — idempotency by explicit key first.
      if (data.idempotencyKey) {
        const existing = await tx.select().from(payments).where(eq(payments.idempotencyKey, data.idempotencyKey)).limit(1);
        if (existing.length > 0) {
          logger.info({ key: data.idempotencyKey }, 'Returning idempotent existing payment');
          return existing[0];
        }
      }

      // Reuse an already-pending payment for this order+provider instead of creating a duplicate.
      const existingPending = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.provider, provider), eq(payments.status, 'pending')))
        .limit(1);
      if (existingPending.length > 0) {
        logger.info({ orderId: order.id, provider }, 'Returning existing pending local payment (idempotent)');
        return existingPending[0];
      }

      // Correção crítica (PAYMENT_CURRENCY_MISMATCH): PIX é um método
      // brasileiro (formato EMV/BR Code, liquidação no SPB) — mesma regra
      // que já existe para o provider Asaas (ASAAS_CURRENCY_NOT_SUPPORTED),
      // aplicada também aqui no motor de PIX local/genérico, para nenhum
      // caminho gerar um "PIX" fictício para pedido em XOF/GMD/qualquer
      // moeda que não seja BRL.
      if (data.method === 'pix' && realCurrency !== 'BRL') {
        const err: any = new Error(`PAYMENT_METHOD_NOT_AVAILABLE_FOR_CURRENCY: PIX está disponível apenas para pedidos em Reais (BRL). Este pedido está em ${realCurrency}.`);
        err.code = 'PAYMENT_METHOD_NOT_AVAILABLE_FOR_CURRENCY';
        err.status = 400;
        throw err;
      }

      const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      let qrCode: string | undefined;
      if (data.method === 'pix') {
        qrCode = `00020101021226830014BR.GOV.BCB.PIX2561pix.mercadonusali.com/qr/v2/${paymentId}520400005303986540${realAmount.toFixed(2)}5802BR5914MERCADO NUSALI6006BISSAU62070503***6304`;
      }

      await tx.insert(payments).values({
        id: paymentId,
        orderId: order.id,
        // Fase C3 — declarado explicitamente (nunca via DEFAULT/$defaultFn):
        // este é o único pagamento financeiro deste order legado.
        settlementRole: 'primary',
        buyerId: data.buyerId,
        amount: String(realAmount),
        currency: realCurrency,
        provider,
        method: data.method,
        status: 'pending',
        idempotencyKey: data.idempotencyKey,
        qrCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}`,
        paymentId,
        provider,
        status: 'initiated',
        createdAt: new Date(),
      });

      logger.info({ paymentId, orderId: order.id, amount: realAmount, method: data.method }, 'Payment initiated');

      return {
        id: paymentId,
        orderId: order.id,
        amount: realAmount,
        currency: realCurrency,
        method: data.method,
        status: 'pending',
        qrCode,
      };
    });
  }

  /**
   * Fase C3.1 — reconstrução da fronteira transacional de
   * initiatePurchaseGroupPayment. A C3 mantinha o
   * pg_advisory_xact_lock(hashtext(purchaseGroupId)) preso durante toda a
   * chamada HTTP ao Asaas (auditoria confirmada no relatório desta fase —
   * ver "ordem antiga" no relatório). Isso nunca deveria ser a arquitetura
   * final: um provider lento/instável prendia o lock (e uma conexão
   * Postgres ociosa) pelo tempo inteiro da chamada de rede, bloqueando
   * qualquer segunda tentativa concorrente para o MESMO group.
   *
   * Desenho novo, em 3 fases nitidamente separadas:
   *
   *   FASE LOCAL 1 (curta, `db.transaction`, lock preso só aqui): valida
   *   flag/group/buyer/children/reconciliação (tudo leitura, barato) e
   *   RESERVA atomicamente uma única tentativa local — OU reaproveita uma
   *   já reservada/em andamento (se encontrar, retorna sem nunca chegar na
   *   fase externa). COMMIT libera o lock imediatamente.
   *
   *   FASE EXTERNA (sem transação/lock do Postgres aberta): chamada HTTP
   *   real ao Asaas, usando o localPaymentId/idempotencyKey já decididos na
   *   fase 1. Só executa quando uma reserva NOVA foi de fato criada.
   *
   *   FASE LOCAL 2 (curta, dentro de AsaasPaymentProvider, sem advisory
   *   lock): persiste o resultado (sucesso/falha definitiva/ambíguo) na
   *   MESMA linha reservada. Não precisa de lock porque só o processo que
   *   fez a reserva na fase 1 chega até aqui para aquele localPaymentId —
   *   qualquer concorrente (T2) já teria encontrado a reserva e retornado
   *   na fase 1, sem nunca escrever nessa linha.
   */
  static async initiatePurchaseGroupPayment(data: InitiatePurchaseGroupPaymentDTO, executor?: any) {
    const db = executor ?? getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    if (!data.purchaseGroupId || !String(data.purchaseGroupId).trim()) {
      const err: any = new Error('PURCHASE_GROUP_ID_REQUIRED: O identificador do purchase_group é obrigatório para iniciar um pagamento.');
      err.code = 'PURCHASE_GROUP_ID_REQUIRED';
      err.status = 400;
      throw err;
    }
    if (!data.buyerId) {
      const err: any = new Error('UNAUTHORIZED: Comprador não identificado.');
      err.code = 'UNAUTHORIZED';
      err.status = 401;
      throw err;
    }

    // ==========================================================================
    // FASE LOCAL 1 — transação curta: lock + validação + reserva atômica.
    // NENHUMA chamada de rede acontece dentro desta função.
    // ==========================================================================
    const reservation = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${data.purchaseGroupId}))`);

      // Feature flag fail-closed — MESMO padrão exato de orderService.ts
      // (Fase B) e escrowAutoReleaseService.ts (autoReleaseEnabled).
      const flagRows = await tx
        .select({ valueJson: platformSettings.valueJson })
        .from(platformSettings)
        .where(eq(platformSettings.key, 'multiSellerCheckoutEnabled'))
        .limit(1);
      const multiSellerCheckoutEnabled = flagRows.length > 0 && flagRows[0].valueJson === true;
      if (!multiSellerCheckoutEnabled) {
        const err: any = new Error('MULTI_SELLER_CHECKOUT_DISABLED: O checkout multi-vendedor ainda não está habilitado nesta plataforma.');
        err.code = 'MULTI_SELLER_CHECKOUT_DISABLED';
        err.status = 403;
        throw err;
      }

      const [group] = await tx.select().from(purchaseGroups).where(eq(purchaseGroups.id, data.purchaseGroupId)).limit(1);
      if (!group) {
        const err: any = new Error(`Compra "${data.purchaseGroupId}" não foi encontrada.`);
        err.code = 'PURCHASE_GROUP_NOT_FOUND';
        err.status = 404;
        throw err;
      }

      if (group.buyerId !== data.buyerId) {
        const err: any = new Error('Você não tem permissão para iniciar pagamento para esta compra.');
        err.code = 'FORBIDDEN_PURCHASE_GROUP_ACCESS';
        err.status = 403;
        throw err;
      }

      if (group.status !== 'pending_payment') {
        const err: any = new Error(`PURCHASE_GROUP_NOT_PAYABLE: Esta compra está em status "${group.status}" e não pode receber uma nova cobrança.`);
        err.code = 'PURCHASE_GROUP_NOT_PAYABLE';
        err.status = 409;
        throw err;
      }

      const children = await tx.select().from(orders).where(eq(orders.purchaseGroupId, group.id));
      if (children.length === 0) {
        const err: any = new Error('PURCHASE_GROUP_EMPTY: Esta compra não possui nenhum pedido associado.');
        err.code = 'PURCHASE_GROUP_EMPTY';
        err.status = 409;
        throw err;
      }

      const unpayableChild = children.find((c) => c.paymentStatus !== 'pending' || c.status === 'cancelled');
      if (unpayableChild) {
        const err: any = new Error(`PURCHASE_GROUP_NOT_PAYABLE: O pedido "${unpayableChild.id}" desta compra não está mais em estado pagável (status="${unpayableChild.status}", paymentStatus="${unpayableChild.paymentStatus}").`);
        err.code = 'PURCHASE_GROUP_NOT_PAYABLE';
        err.status = 409;
        throw err;
      }

      // Reconciliação financeira — FAIL CLOSED, sempre ANTES de reservar
      // qualquer tentativa (e portanto sempre antes de qualquer chamada ao
      // provider, que só acontece depois desta transação commitar).
      const groupCurrency = String(group.currency).toUpperCase();
      const currencyMismatch = children.some((c) => String(c.currency).toUpperCase() !== groupCurrency);
      if (currencyMismatch) {
        const err: any = new Error('PURCHASE_GROUP_INCONSISTENT: A moeda de um ou mais pedidos desta compra diverge da moeda do grupo.');
        err.code = 'PURCHASE_GROUP_INCONSISTENT';
        err.status = 409;
        throw err;
      }

      const childrenSum = children.reduce((sum, c) => sum + Number(c.totalAmount), 0);
      const groupTotal = Number(group.totalAmount);
      if (!Number.isFinite(childrenSum) || !Number.isFinite(groupTotal) || Math.abs(childrenSum - groupTotal) > 0.01) {
        const err: any = new Error(`PURCHASE_GROUP_INCONSISTENT: A soma dos pedidos (${childrenSum}) diverge do total da compra (${groupTotal}).`);
        err.code = 'PURCHASE_GROUP_INCONSISTENT';
        err.status = 409;
        throw err;
      }

      // Fonte de verdade do valor/moeda: SEMPRE purchase_groups, nunca o
      // cliente (o DTO nem aceita amount/currency — ver paymentRoutes.ts).
      const realAmount = groupTotal;
      const realCurrency = groupCurrency;
      const provider = data.provider || (data.method === 'pix' ? 'asaas' : 'nusali_pay');

      if (provider === 'asaas' && realCurrency !== 'BRL') {
        const err: any = new Error(`Asaas PIX suporta apenas compras na moeda BRL. Esta compra está em ${realCurrency}.`);
        err.code = 'ASAAS_CURRENCY_NOT_SUPPORTED';
        err.status = 400;
        throw err;
      }
      if (data.method === 'pix' && realCurrency !== 'BRL') {
        const err: any = new Error(`PAYMENT_METHOD_NOT_AVAILABLE_FOR_CURRENCY: PIX está disponível apenas para pedidos em Reais (BRL). Esta compra está em ${realCurrency}.`);
        err.code = 'PAYMENT_METHOD_NOT_AVAILABLE_FOR_CURRENCY';
        err.status = 400;
        throw err;
      }

      // Reaproveita uma tentativa já reservada/em andamento para este group —
      // cobre T2 concorrente (T1 ainda no provider) E retry sequencial
      // legítimo. NUNCA chega a chamar o provider quando cai aqui.
      const [existing] = await tx
        .select()
        .from(payments)
        .where(and(
          eq(payments.purchaseGroupId, group.id),
          eq(payments.provider, provider),
          eq(payments.status, 'pending'),
          eq(payments.settlementRole, 'candidate')
        ))
        .limit(1);
      if (existing) {
        return { reused: true as const, payment: existing };
      }

      // Reserva atômica de UMA NOVA tentativa local. Nasce SEM
      // transactionRef (o provider ainda nem foi chamado) — payments.status
      // continua 'pending' tanto para "reservado, provider em andamento"
      // quanto para "provider confirmou, aguardando pagamento do
      // comprador"; a distinção entre os dois sub-estados é
      // transactionRef IS NULL vs IS NOT NULL (nenhuma coluna nova).
      //
      // idempotencyKey é gerada AQUI, pelo backend, a partir do
      // localPaymentId — nunca aceita do cliente (Fase C3.1, seção 7): o
      // endpoint novo não tem mais nenhum campo de idempotência financeira
      // no body (ver paymentRoutes.ts, DTO strict).
      const localPaymentId = `pay_group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const idempotencyKey = provider === 'asaas'
        ? `asaas_pix_group:${group.id}:${localPaymentId}`
        : `local_pix_group:${group.id}:${localPaymentId}`;

      // Caminho local/simulado: não há chamada externa real, então não há
      // "lock preso durante I/O" a evitar — completa-se por inteiro aqui
      // dentro, na mesma transação curta (paridade com o branch não-Asaas
      // de initiatePayment).
      let localQrCode: string | undefined;
      if (provider !== 'asaas' && data.method === 'pix') {
        localQrCode = `00020101021226830014BR.GOV.BCB.PIX2561pix.mercadonusali.com/qr/v2/${localPaymentId}520400005303986540${realAmount.toFixed(2)}5802BR5914MERCADO NUSALI6006BISSAU62070503***6304`;
      }

      await tx.insert(payments).values({
        id: localPaymentId,
        orderId: null,
        purchaseGroupId: group.id,
        settlementRole: 'candidate',
        buyerId: data.buyerId,
        amount: String(realAmount),
        currency: realCurrency,
        provider,
        method: data.method,
        status: 'pending',
        idempotencyKey,
        transactionRef: null,
        qrCode: localQrCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        paymentId: localPaymentId,
        provider,
        // 'reserved' (novo valor, sem alteração de schema — payment_attempts
        // .status é varchar livre, sem CHECK): reserva local feita, provider
        // ainda não chamado (ou, para o caminho local/simulado, já finalizado
        // — ver abaixo, promovido para 'initiated' nesse caso).
        status: provider === 'asaas' ? 'reserved' : 'initiated',
        createdAt: new Date(),
      });

      logger.info({ localPaymentId, purchaseGroupId: group.id, provider, amount: realAmount }, provider === 'asaas' ? 'Purchase-group payment reserved (fase local 1) — chamada ao Asaas ainda pendente' : 'Purchase-group payment initiated (local/simulado)');

      return {
        reused: false as const,
        localPaymentId,
        idempotencyKey,
        provider,
        realAmount,
        realCurrency,
        qrCode: localQrCode,
      };
    });

    // Reaproveitou uma reserva existente -> NUNCA chama o provider de novo.
    // Monta a resposta a partir do estado ATUAL da linha (pode já ter
    // transactionRef/QR se a fase externa da tentativa original já terminou,
    // ou pode ainda estar "processing" se T1 ainda está no provider).
    if (reservation.reused) {
      const row = reservation.payment;
      const stillWaitingProvider = row.provider === 'asaas' && !row.transactionRef;

      // Mesmo padrão de recuperação de QR do legacy — mas agora FORA de
      // qualquer transação/lock: só dispara quando o provider já confirmou
      // a cobrança (transactionRef existe) mas o QR ainda não chegou.
      if (row.provider === 'asaas' && row.transactionRef && (!row.qrCode || !row.qrCodeBase64)) {
        const asaasProvider = new AsaasPaymentProvider();
        await asaasProvider.retryFetchPurchaseGroupQrCode(row.id, row.transactionRef);
        const [refreshed] = await (executor ?? getDb()).select().from(payments).where(eq(payments.id, row.id)).limit(1);
        if (refreshed) Object.assign(row, refreshed);
      }

      logger.info({ purchaseGroupId: data.purchaseGroupId, paymentId: row.id, stillWaitingProvider }, 'Returning existing pending/candidate purchase-group payment (idempotent, sem nova chamada ao provider)');

      return {
        id: row.id,
        purchaseGroupId: row.purchaseGroupId,
        provider: row.provider,
        providerPaymentId: row.transactionRef || undefined,
        method: data.method,
        status: row.status,
        processing: stillWaitingProvider,
        amount: Number(row.amount),
        currency: row.currency,
        pix: stillWaitingProvider ? undefined : { encodedImage: row.qrCodeBase64 || undefined, payload: row.qrCode || undefined },
        qrCode: row.qrCode || undefined,
        qrCodeBase64: row.qrCodeBase64 || undefined,
      };
    }

    // Caminho local/simulado já terminou por inteiro na fase 1 (sem I/O
    // externo real) — nada mais a fazer.
    if (reservation.provider !== 'asaas') {
      return {
        id: reservation.localPaymentId,
        purchaseGroupId: data.purchaseGroupId,
        amount: reservation.realAmount,
        currency: reservation.realCurrency,
        method: data.method,
        status: 'pending',
        qrCode: reservation.qrCode,
      };
    }

    // ==========================================================================
    // FASE EXTERNA — SEM transação/lock do Postgres aberta. Só chega aqui
    // quando uma reserva NOVA foi criada na fase 1 (nunca em retry/duplo
    // clique, que já retornaram acima).
    // ==========================================================================
    const asaasProvider = new AsaasPaymentProvider();
    const outcome = await asaasProvider.initiatePurchaseGroupPayment({
      localPaymentId: reservation.localPaymentId,
      purchaseGroupId: data.purchaseGroupId,
      buyerId: data.buyerId,
      amount: reservation.realAmount,
      currency: reservation.realCurrency,
      idempotencyKey: reservation.idempotencyKey,
    });

    if (outcome.outcome === 'definitive_failure') {
      // P1 permanece na tabela (payments.status='failed', auditável,
      // NUNCA apagada) — uma NOVA chamada a este endpoint criará uma NOVA
      // reserva (novo localPaymentId, nova idempotencyKey) na próxima vez,
      // pois esta linha deixa de casar com o filtro status='pending' da
      // fase 1. Erro real propagado para o chamador (rota HTTP).
      throw outcome.error;
    }

    if (outcome.outcome === 'ambiguous') {
      // Timeout/erro de rede: NÃO sabemos se o Asaas criou a cobrança.
      // payments.status PERMANECE 'pending' (nunca 'failed') — uma nova
      // chamada a este endpoint vai encontrar esta MESMA linha reservada
      // (transactionRef ainda NULL) e retornar "processing", nunca criar
      // uma segunda cobrança às cegas. Resolver isso de verdade exige
      // reconciliação com o Asaas (checkPaymentStatus/consulta por
      // externalReference) — NÃO IMPLEMENTADO (AsaasPaymentProvider
      // .checkPaymentStatus continua NOT_IMPLEMENTED) — documentado como
      // risco residual explícito no relatório desta fase, não escondido.
      logger.warn({ purchaseGroupId: data.purchaseGroupId, localPaymentId: reservation.localPaymentId }, 'PURCHASE_GROUP_PAYMENT_AMBIGUOUS_TIMEOUT — requer reconciliação manual, nenhuma segunda cobrança criada');
      return {
        id: reservation.localPaymentId,
        purchaseGroupId: data.purchaseGroupId,
        provider: 'asaas',
        method: data.method,
        status: 'pending',
        processing: true,
        amount: reservation.realAmount,
        currency: reservation.realCurrency,
      };
    }

    // succeeded
    return {
      id: reservation.localPaymentId,
      purchaseGroupId: data.purchaseGroupId,
      provider: 'asaas',
      providerPaymentId: outcome.transactionRef,
      method: data.method,
      status: 'pending',
      amount: reservation.realAmount,
      currency: reservation.realCurrency,
      pix: {
        encodedImage: outcome.qrCodeUrl,
        payload: outcome.pixCopiaECola,
        expirationDate: outcome.rawResponse?.expirationDate,
      },
      qrCode: outcome.pixCopiaECola,
      qrCodeBase64: outcome.qrCodeUrl,
    };
  }

  /**
   * Fase C4.1 — extraído de confirmOrderPayment (fluxo legacy, 1 order = 1
   * payment) para ser a ÚNICA fonte de verdade sobre "o que acontece com UM
   * order quando o pagamento que o financia é confirmado": order vira
   * paid/held, escrow é criado/atualizado, HOLD é lançado, histórico e
   * notificações são disparados. Usado tanto pelo legacy quanto pelo novo
   * fluxo de confirmação de group payment (confirmPurchaseGroupPayment,
   * abaixo) — 1 payment primary financiando N child orders chama esta
   * função uma vez por child, cada um com seu próprio ord/escrow/HOLD.
   *
   * NÃO decide SE o pagamento deve ser confirmado (isso é responsabilidade
   * do chamador, que já validou tudo sob lock antes de chegar aqui) — só
   * EXECUTA os efeitos. amount do escrow/HOLD é SEMPRE `ord.totalAmount`
   * (valor bruto do order, igual ao legacy — nunca sellerNetAmount, que só
   * é usado depois, na liberação).
   *
   * `tx` precisa ser a MESMA transação do chamador (nunca abre a sua
   * própria) — é assim que confirmOrderPayment/confirmPurchaseGroupPayment
   * mantêm tudo atômico (Nenhum child order pago sem escrow, nenhuma
   * escrita parcial sobrevive a um rollback).
   */
  private static async holdEscrowForConfirmedOrder(
    tx: any,
    ord: typeof orders.$inferSelect,
    opts: { provider: string; transactionRef: string; performedBy: string | null; paymentId: string }
  ): Promise<{ newOrderStatus: string }> {
    const { provider, transactionRef, performedBy, paymentId } = opts;

    // 4. Update Order Record
    const newOrderStatus = ord.status === 'pending_payment' ? 'processing' : ord.status;
    await tx
      .update(orders)
      .set({
        paymentStatus: 'paid',
        escrowStatus: 'held',
        status: newOrderStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, ord.id));
    logger.info({ orderId: ord.id, status: newOrderStatus }, 'ORDER_PAYMENT_CONFIRMED');

    // 5. Escrow Account & Ledger
    const existingEscrow = await tx
      .select()
      .from(escrowAccounts)
      .where(eq(escrowAccounts.orderId, ord.id))
      .limit(1);

    let escrowAccountId: string;
    if (existingEscrow.length > 0) {
      escrowAccountId = existingEscrow[0].id;
      await tx
        .update(escrowAccounts)
        .set({
          status: 'held',
          updatedAt: new Date(),
        })
        .where(eq(escrowAccounts.id, escrowAccountId));
    } else {
      escrowAccountId = `esc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      await tx.insert(escrowAccounts).values({
        id: escrowAccountId,
        orderId: ord.id,
        buyerId: ord.buyerId,
        sellerId: ord.sellerId,
        amount: ord.totalAmount,
        currency: ord.currency,
        status: 'held',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    await tx.insert(escrowTransactions).values({
      id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      escrowAccountId,
      type: 'HOLD',
      amount: ord.totalAmount,
      currency: ord.currency,
      reason: provider === 'DEV_SIMULATOR'
        ? 'Pagamento simulado em ambiente de desenvolvimento. Saldo retido em garantia Escrow.'
        : 'Pagamento confirmado via gateway. Saldo retido em garantia Escrow.',
      performedBy,
      reference: transactionRef,
      createdAt: new Date(),
    });
    logger.info({ orderId: ord.id, escrowAccountId, amount: Number(ord.totalAmount), currency: ord.currency }, 'ESCROW_CREATED');
    // O valor líquido do vendedor (sellerNetAmount) e a comissão já foram
    // calculados e persistidos na própria order no momento da criação do
    // pedido (orderService.ts) — o escrow acima é o que torna essa venda
    // "real" financeiramente (dinheiro de fato retido em garantia). Não há
    // uma segunda tabela de "lançamento financeiro do vendedor" nesta
    // arquitetura: o par (orders.sellerNetAmount, escrow_accounts held)
    // JÁ É o lançamento — /seller/wallet e /admin/finance/overview leem
    // exatamente esses dados. Log só para observabilidade do fluxo.
    logger.info({ orderId: ord.id, sellerId: ord.sellerId, sellerNetAmount: ord.sellerNetAmount, currency: ord.currency }, 'SELLER_FINANCIAL_ENTRY_CREATED');

    // Audit Log (orderStatusHistory)
    await tx.insert(orderStatusHistory).values({
      id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      orderId: ord.id,
      previousStatus: ord.status,
      newStatus: newOrderStatus,
      reason: provider === 'DEV_SIMULATOR'
        ? 'PAYMENT_CONFIRMED: Pagamento aprovado via Simulador de Desenvolvimento.'
        : 'PAYMENT_CONFIRMED: Pagamento confirmado via gateway/webhook.',
      changedBy: performedBy,
      createdAt: new Date(),
    });

    // 6. Sync Order Fulfillment Status
    await syncOrderFulfillmentStatus(ord.id, tx);

    // 7. Notifications & WebSocket
    await tx.insert(notifications).values({
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      userId: ord.buyerId,
      title: 'Pagamento Aprovado com Sucesso!',
      message: `O pagamento do seu pedido foi confirmado.`,
      type: 'payment',
      link: `/buyer/orders/${ord.id}`,
      isRead: false,
      createdAt: new Date(),
    });

    broadcastToUser(ord.buyerId, {
      type: 'PAYMENT_CONFIRMED',
      paymentId,
      orderId: ord.id,
      amount: Number(ord.totalAmount),
    });

    broadcastAdminEvent({
      type: 'PAYMENT_RECEIVED',
      paymentId,
      orderId: ord.id,
      amount: Number(ord.totalAmount),
    });

    // Correção crítica (fluxo pós-pagamento): o pedido pago já ficava
    // corretamente visível para o vendedor via GET /seller/orders (a query
    // nunca filtrava por status) — o problema é que NENHUM evento avisava
    // o vendedor de que isso aconteceu. O comprador recebia notificação +
    // broadcast em tempo real; o vendedor não recebia nada, então só via a
    // venda depois de recarregar o painel por conta própria, sem saber que
    // precisava. Mesma tabela/mecanismo já usado para o comprador, nunca
    // um pedido/cópia nova.
    const sellerRow = ord.sellerId ? (await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, ord.sellerId)).limit(1))[0] : null;
    if (sellerRow?.userId) {
      await tx.insert(notifications).values({
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        userId: sellerRow.userId,
        title: 'Novo pedido pago!',
        message: `O pagamento do pedido ${ord.orderNumber} foi confirmado. Prepare o produto para envio.`,
        type: 'order',
        link: `/seller/orders`,
        isRead: false,
        createdAt: new Date(),
      });

      broadcastToUser(sellerRow.userId, {
        type: 'ORDER_PAID',
        orderId: ord.id,
        orderNumber: ord.orderNumber,
        amount: Number(ord.sellerNetAmount ?? ord.totalAmount),
        currency: ord.currency,
      });

      logger.info({ orderId: ord.id, sellerId: ord.sellerId }, 'ORDER_VISIBLE_TO_SELLER');
    } else {
      logger.warn({ orderId: ord.id, sellerId: ord.sellerId }, 'ORDER_VISIBLE_TO_SELLER falhou — não foi possível resolver o usuário do vendedor (não bloqueia o pagamento)');
    }

    return { newOrderStatus };
  }

  /**
   * Central single source of truth for confirming an order payment.
   * Atomically updates order, payment, escrow, and audit history.
   * Fully idempotent: returns current state if payment is already confirmed.
   * Does NOT alter physical stock or stock reservations.
   */
  static async confirmOrderPayment(orderId: string, options?: ConfirmOrderPaymentOptions) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const result = await db.transaction(async (tx) => {
      // Correção (auditoria de concorrência pré-Fase B multi-vendedor):
      // MESMO pg_advisory_xact_lock(hashtext(orderId)) já usado por
      // initiatePayment/releaseEscrowForOrder/createBuyerDispute/
      // finalizeDelivery — adquirido como a PRIMEIRÍSSIMA operação, antes de
      // qualquer leitura de `orders`. Sem isso, duas confirmações
      // concorrentes para o mesmo pedido (ex.: retry com outro provider +
      // webhook atrasado do primeiro) podiam ambas ler paymentStatus!=='paid'
      // antes de qualquer uma commitar, e a segunda a executar sobrescrevia
      // payments.transactionRef/provider e duplicava o INSERT de
      // escrow_transactions HOLD (nunca duplicava saldo/wallet, protegidos
      // por outras camadas, mas corrompia metadados). Com o lock, a segunda
      // chamada só prossegue depois do commit da primeira e relê o estado já
      // 'paid' — cai no early-return idempotente abaixo sem tocar em nada.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);

      // 1. Fetch Order (agora sempre relido DEPOIS do lock acima — nenhuma
      // leitura de `orders` acontece antes dele nesta função)
      const ordRows = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (ordRows.length === 0) {
        throw new Error(`ORDER_NOT_FOUND: Pedido com ID "${orderId}" não foi encontrado.`);
      }

      const ord = ordRows[0];

      // Fase C3 — guard essencial (mesmo raciocínio de initiatePayment): um
      // child order de purchase_group nunca pode ser confirmado
      // individualmente pelo caminho legado — sua confirmação real
      // pertence ao (futuro) fluxo de confirmação de group payment, que
      // ainda decidirá a eleição candidate->primary e a criação de
      // allocations/escrow por child order (Fase C4, não implementada
      // aqui). Confirmar aqui duplicaria/corromperia esse fluxo.
      if (ord.purchaseGroupId) {
        const err: any = new Error('ORDER_BELONGS_TO_PURCHASE_GROUP: Este pedido faz parte de uma compra multi-vendedor — a confirmação de pagamento pertence ao fluxo de purchase_group, não ao pedido individual.');
        err.code = 'ORDER_BELONGS_TO_PURCHASE_GROUP';
        err.status = 409;
        throw err;
      }

      // Requirement 6: Strict seller verification (no dummy seller_default)
      if (!ord.sellerId) {
        throw new Error(`ORDER_SELLER_NOT_FOUND: O pedido "${ord.id}" não possui um vendedor associado para a retenção de escrow.`);
      }

      // 2. Idempotency Check: Return early if already paid
      if (ord.paymentStatus === 'paid') {
        logger.info({ orderId }, 'Payment already confirmed for order (idempotent call)');
        return {
          success: true,
          message: 'Pagamento já confirmado anteriormente.',
          data: {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            paymentStatus: 'paid',
            escrowStatus: ord.escrowStatus,
            status: ord.status,
          },
        };
      }

      const provider = options?.provider || 'DEV_SIMULATOR';
      const transactionRef = options?.transactionRef || `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      
      let performedBy: string | null = options?.performedBy || ord.buyerId;
      if (performedBy) {
        const uCheck = await tx.select().from(users).where(eq(users.id, performedBy)).limit(1);
        if (uCheck.length === 0) {
          performedBy = ord.buyerId;
        }
      }

      // 3. Payment Record Update / Insert
      const existingPayments = await tx
        .select()
        .from(payments)
        .where(eq(payments.orderId, ord.id))
        .limit(1);

      let paymentId: string;
      if (existingPayments.length > 0) {
        const pay = existingPayments[0];
        paymentId = pay.id;
        await tx
          .update(payments)
          .set({
            status: 'paid',
            provider: pay.provider || provider,
            transactionRef,
            paidAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(payments.id, pay.id));
      } else {
        paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.insert(payments).values({
          id: paymentId,
          orderId: ord.id,
          // Fase C3 — declarado explicitamente: confirmOrderPayment legado só
          // roda para orders sem purchaseGroupId (guard logo acima, no início
          // desta função), então este é sempre o único pagamento financeiro
          // do order.
          settlementRole: 'primary',
          buyerId: ord.buyerId,
          amount: ord.totalAmount,
          currency: ord.currency,
          provider,
          method: ord.paymentMethod || 'DEV_SIMULATOR',
          status: 'paid',
          transactionRef,
          paidAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      logger.info({ orderId: ord.id, paymentId, provider }, 'PAYMENT_MARKED_PAID');

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        paymentId,
        provider,
        status: 'succeeded',
        errorMessage: null,
        rawPayloadJson: { simulatedInDev: provider === 'DEV_SIMULATOR', confirmedAt: new Date().toISOString() },
        createdAt: new Date(),
      });

      // 4-8. Update Order Record, Escrow Account & Ledger, Audit Log, Sync
      // Fulfillment, Notifications & WebSocket — Fase C4.1: extraído para
      // holdEscrowForConfirmedOrder (ver definição estática abaixo desta
      // função) para ser reaproveitado, BYTE A BYTE, pelo fluxo novo de
      // group payment (1 payment primary financiando N child orders) — a
      // instrução desta fase foi explícita: "não reinventar cálculo",
      // "usar exatamente as regras financeiras já validadas no fluxo
      // legacy". Nenhuma linha de comportamento mudou aqui: é o mesmo
      // código, só movido para uma função compartilhada.
      const { newOrderStatus } = await PaymentService.holdEscrowForConfirmedOrder(tx, ord, {
        provider,
        transactionRef,
        performedBy,
        paymentId,
      });

      logger.info({ orderId: ord.id, provider }, 'Order payment confirmed atomically and escrow held');

      return {
        success: true,
        message: 'Pagamento confirmado e escrow ativo com sucesso!',
        data: {
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          paymentStatus: 'paid',
          escrowStatus: 'held',
          status: newOrderStatus,
        },
      };
    });

    // ------------------------------------------------------------------------
    // SHADOW LEDGER (Fase 5A) — roda DEPOIS que o fluxo legado acima já commitou.
    // Nunca pode afetar o resultado real: qualquer falha aqui é só logada. O
    // FinancialLedgerService é idempotente e reconhece pedidos anteriores ao
    // cutoff (LEGACY_ORDER) e snapshots ausentes (MISSING_SNAPSHOT) sem lançar.
    // ------------------------------------------------------------------------
    try {
      const shadow = await FinancialLedgerService.recordPaymentReceived({
        orderId,
        performedBy: options?.performedBy ?? null,
        source: options?.provider || 'DEV_SIMULATOR',
      });
      if (shadow.skipped) {
        logger.info({ orderId, reason: shadow.reason, detail: shadow.detail }, '[ShadowLedger] recordPaymentReceived pulado (esperado para pedidos legados/sem snapshot)');
      } else {
        logger.info({ orderId, transactionId: shadow.transactionId }, '[ShadowLedger] recordPaymentReceived postado');
      }
    } catch (shadowErr: any) {
      logger.error({ orderId, error: shadowErr?.message }, '[ShadowLedger] recordPaymentReceived falhou — fluxo real não afetado');
    }

    // ------------------------------------------------------------------------
    // FULFILLMENT PÓS-PAGAMENTO (Fase 1 operacional — etiqueta bloqueada):
    // roda DEPOIS que a transação financeira acima já commitou. Uma falha
    // aqui NUNCA reverte nem invalida pagamento/escrow, que já estão
    // persistidos e corretos neste ponto — só é logada. Import dinâmico de
    // propósito: evita import circular no topo do arquivo (shipmentService.ts
    // já importa PaymentService para releaseEscrowForOrder); o import()
    // só resolve em runtime, quando ambos os módulos já terminaram de
    // carregar, então o ciclo nunca é um problema real.
    try {
      const { ShipmentService } = await import('../logistics/shipmentService.js');
      const fulfillmentResult = await ShipmentService.ensureFulfillmentCreated(orderId, options?.performedBy);
      if (fulfillmentResult.failed.length > 0) {
        logger.warn({ orderId, failed: fulfillmentResult.failed }, '[Fulfillment] ensureFulfillmentCreated terminou com pendências — recuperável em nova execução');
      }
    } catch (fulfillmentErr: any) {
      logger.error({ orderId, error: fulfillmentErr?.message }, '[Fulfillment] ensureFulfillmentCreated falhou — pagamento/escrow não afetados');
    }

    return result;
  }

  /**
   * Fase C4.1 — confirmação atômica de UM payment de purchase_group.
   *
   * Diferente de confirmOrderPayment (1 payment financia 1 order), aqui 1
   * payment (depois de eleito PRIMARY) financia N child orders do mesmo
   * group — a eleição, as N allocations e os N escrow/HOLD nascem juntos,
   * na MESMA transação: nenhum child order pode ficar pago sem allocation
   * ou sem escrow por falha parcial (rollback automático do Postgres).
   *
   * `paymentId` é sempre resolvido pelo CHAMADOR (asaasWebhookService, por
   * transactionRef direto OU por reconciliação via externalReference — ver
   * AsaasWebhookService.locateOrReconcilePurchaseGroupPayment) — esta
   * função nunca decide "qual" payment, só o que fazer com um payment já
   * identificado como pertencente a um purchase_group.
   *
   * Idempotente: se este payment específico já é 'primary'+'paid' OU já é
   * 'surplus'+'paid', retorna o estado atual sem repetir nenhuma escrita —
   * mesmo padrão de confirmOrderPayment, necessário para que um retry de
   * webhook (evento não marcado 'processed' por falha anterior) seja seguro.
   */
  static async confirmPurchaseGroupPayment(
    purchaseGroupId: string,
    paymentId: string | null,
    options: { provider: string; transactionRef: string; receivedValue: number; performedBy?: string | null }
  ) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const result = await db.transaction(async (tx) => {
      // ==========================================================================
      // LOCK COORDENADOR — SEMPRE o group primeiro. Locks individuais por
      // child order (se precisarem) são adquiridos DEPOIS, em ordem
      // determinística (orderId ascendente) — nunca o inverso. Isso evita
      // deadlock com confirmOrderPayment/releaseEscrowForOrder/disputa/AUTO,
      // que só travam hashtext(orderId) e NUNCA hashtext(purchaseGroupId) —
      // não há ciclo possível porque nenhum outro fluxo espera o lock do
      // group para depois pedir um lock de order.
      // ==========================================================================
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${purchaseGroupId}))`);

      const [group] = await tx.select().from(purchaseGroups).where(eq(purchaseGroups.id, purchaseGroupId)).limit(1);
      if (!group) {
        const err: any = new Error(`PURCHASE_GROUP_NOT_FOUND: Compra "${purchaseGroupId}" não encontrada durante confirmação de pagamento.`);
        err.code = 'PURCHASE_GROUP_NOT_FOUND';
        throw err;
      }

      let payment: typeof payments.$inferSelect;
      if (paymentId) {
        // Localizado diretamente pelo chamador (achou por transactionRef).
        const [found] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
        if (!found) {
          const err: any = new Error(`PAYMENT_NOT_FOUND: Payment "${paymentId}" não encontrado durante confirmação de group payment.`);
          err.code = 'PAYMENT_NOT_FOUND';
          throw err;
        }
        payment = found;
      } else {
        // ==========================================================================
        // RECONCILIAÇÃO — seção 3/4. Caso crítico da C3.1: um payment local
        // pode ter ficado com transactionRef=NULL (ASAAS_NETWORK_ERROR
        // durante a criação da cobrança) e só agora, com o webhook real
        // chegando, sabemos qual transactionRef ele deveria ter. Vínculo só
        // acontece com correspondência INEQUÍVOCA — sob o MESMO lock do
        // group, dentro da MESMA transação de confirmação.
        // ==========================================================================
        const candidates = await tx
          .select()
          .from(payments)
          .where(and(
            eq(payments.purchaseGroupId, group.id),
            eq(payments.provider, options.provider),
            eq(payments.status, 'pending'),
            eq(payments.settlementRole, 'candidate'),
            sql`${payments.transactionRef} IS NULL`
          ));

        if (candidates.length !== 1) {
          // Zero -> nenhuma tentativa local reconciliável (seção 16). Mais
          // de 1 -> ambíguo, nunca escolher "o mais recente"/arbitrário
          // (seção 4). Os dois casos são FAIL CLOSED da mesma forma.
          const err: any = new Error(`PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE: encontrados ${candidates.length} candidates pending com transactionRef=NULL para o group "${purchaseGroupId}" (esperado exatamente 1).`);
          err.code = 'PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE';
          throw err;
        }

        const candidate = candidates[0];
        const candidateAmountOk = Math.abs(Number(candidate.amount) - options.receivedValue) <= 0.01;
        const candidateCurrencyOk = String(candidate.currency).toUpperCase() === String(group.currency).toUpperCase();
        if (!candidateAmountOk || !candidateCurrencyOk) {
          const err: any = new Error(`PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE: candidate encontrado mas valor/moeda divergem (candidate.amount=${candidate.amount}, recebido=${options.receivedValue}, candidate.currency=${candidate.currency}, group.currency=${group.currency}).`);
          err.code = 'PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE';
          throw err;
        }

        const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.paymentId, candidate.id)).orderBy(desc(paymentAttempts.createdAt)).limit(1);
        const attemptOk = attempt && (attempt.status === 'reserved' || attempt.status === 'ambiguous_timeout');
        if (!attemptOk) {
          const err: any = new Error(`PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE: payment_attempts do candidate "${candidate.id}" não indica reserved/ambiguous_timeout (status="${attempt?.status}").`);
          err.code = 'PURCHASE_GROUP_PAYMENT_NO_RECONCILIABLE_CANDIDATE';
          throw err;
        }

        // Vínculo — dentro desta mesma transação de confirmação.
        await tx.update(payments).set({ transactionRef: options.transactionRef, updatedAt: new Date() }).where(eq(payments.id, candidate.id));
        logger.info({ purchaseGroupId, paymentId: candidate.id, transactionRef: options.transactionRef }, 'PURCHASE_GROUP_PAYMENT_RECONCILED — candidate local vinculado ao providerPaymentId via externalReference (transactionRef era NULL)');
        payment = { ...candidate, transactionRef: options.transactionRef };
      }

      // Idempotência — mesmo padrão de confirmOrderPayment: retry de webhook
      // (evento reprocessado por não ter sido marcado 'processed' antes)
      // nunca repete nenhuma escrita se este payment específico já chegou a
      // um estado terminal.
      if (payment.settlementRole === 'primary' && payment.status === 'paid') {
        logger.info({ purchaseGroupId, paymentId: payment.id }, 'Purchase-group payment already confirmed as primary (idempotent call)');
        return { success: true, message: 'Pagamento já confirmado como primary anteriormente.', settlementRole: 'primary', alreadyProcessed: true };
      }
      if (payment.settlementRole === 'surplus' && payment.status === 'paid') {
        logger.info({ purchaseGroupId, paymentId: payment.id }, 'Purchase-group payment already resolved as surplus (idempotent call)');
        return { success: true, message: 'Pagamento já registrado como surplus anteriormente.', settlementRole: 'surplus', alreadyProcessed: true };
      }

      // ==========================================================================
      // VALIDAÇÕES — seção 9. FAIL CLOSED antes de qualquer escrita.
      // ==========================================================================
      if (payment.purchaseGroupId !== group.id || payment.orderId !== null) {
        const err: any = new Error('PURCHASE_GROUP_PAYMENT_OWNER_MISMATCH: payment não pertence exclusivamente a este purchase_group (owner CHECK violado ou payment/group divergentes).');
        err.code = 'PURCHASE_GROUP_PAYMENT_OWNER_MISMATCH';
        throw err;
      }
      if (payment.settlementRole !== 'candidate') {
        const err: any = new Error(`PURCHASE_GROUP_PAYMENT_INVALID_ROLE: payment "${payment.id}" está com settlementRole="${payment.settlementRole}", esperado "candidate".`);
        err.code = 'PURCHASE_GROUP_PAYMENT_INVALID_ROLE';
        throw err;
      }
      if (payment.provider !== options.provider) {
        const err: any = new Error(`PURCHASE_GROUP_PAYMENT_PROVIDER_MISMATCH: payment.provider="${payment.provider}" !== "${options.provider}".`);
        err.code = 'PURCHASE_GROUP_PAYMENT_PROVIDER_MISMATCH';
        throw err;
      }
      const groupCurrency = String(group.currency).toUpperCase();
      if (String(payment.currency).toUpperCase() !== groupCurrency) {
        const err: any = new Error(`PURCHASE_GROUP_PAYMENT_CURRENCY_MISMATCH: payment.currency="${payment.currency}" !== group.currency="${group.currency}".`);
        err.code = 'PURCHASE_GROUP_PAYMENT_CURRENCY_MISMATCH';
        throw err;
      }

      // Comparação monetária: MESMA estratégia já usada em todo o resto do
      // sistema (initiatePayment, initiatePurchaseGroupPayment, webhook
      // legacy PAYMENT_RECEIVED) — tolerância de 0.01, nunca `!==` estrito
      // em float, nunca uma biblioteca decimal nova introduzida aqui.
      const moneyMismatch = (a: number, b: number) => !Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > 0.01;

      const paymentAmount = Number(payment.amount);
      const groupTotal = Number(group.totalAmount);
      if (moneyMismatch(options.receivedValue, paymentAmount) || moneyMismatch(paymentAmount, groupTotal)) {
        const err: any = new Error(`PURCHASE_GROUP_PAYMENT_AMOUNT_MISMATCH: recebido=${options.receivedValue}, payment.amount=${paymentAmount}, group.totalAmount=${groupTotal} — devem ser iguais (tolerância 0.01).`);
        err.code = 'PURCHASE_GROUP_PAYMENT_AMOUNT_MISMATCH';
        throw err;
      }

      // ==========================================================================
      // ELEIÇÃO — seção 7/8. Sob o lock do group, releitura definitiva de
      // "existe primary?" — ANTES de qualquer validação de children, porque
      // CASO B (surplus) nunca toca child orders: um child já 'paid' pelo
      // primary que já venceu é o estado ESPERADO para o caminho surplus,
      // nunca uma inconsistência (achado corrigido em teste: validar
      // children antes de checar existingPrimary rejeitava incorretamente
      // P1 chegando depois de P2 já ter pago os children). A barreira final
      // contra dois primary é a UNIQUE parcial
      // payments_purchase_group_primary_uq, mas o advisory lock já deveria
      // ter serializado isso: nenhuma segunda transação chega aqui enquanto
      // a primeira ainda não commitou.
      // ==========================================================================
      const [existingPrimary] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.purchaseGroupId, group.id), eq(payments.settlementRole, 'primary')))
        .limit(1);

      let performedBy: string | null = options.performedBy || group.buyerId;
      if (performedBy) {
        const uCheck = await tx.select().from(users).where(eq(users.id, performedBy)).limit(1);
        if (uCheck.length === 0) performedBy = group.buyerId;
      }

      if (existingPrimary && existingPrimary.id !== payment.id) {
        // CASO B — outra cobrança já venceu. Esta é dinheiro real recebido,
        // mas excedente: NUNCA financia nada, NUNCA toca child orders. Preserva
        // transactionRef/valor/provider inalterados — só muda role+status,
        // para reconciliação/refund futuro (fora de escopo aqui).
        await tx.update(payments).set({
          settlementRole: 'surplus',
          status: 'paid',
          paidAt: new Date(),
          transactionRef: options.transactionRef,
          updatedAt: new Date(),
        }).where(eq(payments.id, payment.id));

        await tx.insert(paymentAttempts).values({
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          paymentId: payment.id,
          provider: options.provider,
          status: 'succeeded',
          rawPayloadJson: { note: 'surplus — outra cobrança já era primary para este purchase_group', primaryPaymentId: existingPrimary.id },
          createdAt: new Date(),
        });

        logger.warn({ purchaseGroupId, paymentId: payment.id, primaryPaymentId: existingPrimary.id }, 'PURCHASE_GROUP_PAYMENT_SURPLUS — cobrança real recebida além do primary já eleito; nenhuma allocation/escrow criada, requer reconciliação/refund futuro');

        return { success: true, message: 'Pagamento excedente (surplus) registrado — outra cobrança já financia esta compra.', settlementRole: 'surplus', alreadyProcessed: false };
      }

      // CASO A — ninguém venceu ainda (ou, por alguma repetição, o próprio
      // payment já era o candidate correto): ESTA cobrança financia o group.
      // Validação de children só acontece aqui (nunca no CASO B acima),
      // porque só agora sabemos que allocation/escrow serão de fato criados.
      const children = await tx.select().from(orders).where(eq(orders.purchaseGroupId, group.id));
      if (children.length === 0) {
        const err: any = new Error('PURCHASE_GROUP_EMPTY: compra sem nenhum pedido associado no momento da confirmação.');
        err.code = 'PURCHASE_GROUP_EMPTY';
        throw err;
      }
      const badChild = children.find((c) => c.purchaseGroupId !== group.id || c.status === 'cancelled' || c.paymentStatus === 'refunded' || !c.sellerId);
      if (badChild) {
        const err: any = new Error(`PURCHASE_GROUP_NOT_PAYABLE: pedido "${badChild.id}" não está em estado válido para confirmação (status="${badChild.status}", paymentStatus="${badChild.paymentStatus}", sellerId="${badChild.sellerId}").`);
        err.code = 'PURCHASE_GROUP_NOT_PAYABLE';
        throw err;
      }
      // Nenhum primary existe ainda (CASO B já teria retornado acima) — um
      // child já 'paid' aqui é sempre uma divergência real, nunca esperada.
      const unexpectedlyPaidChild = children.find((c) => c.paymentStatus === 'paid');
      if (unexpectedlyPaidChild) {
        const err: any = new Error(`PURCHASE_GROUP_INCONSISTENT: pedido "${unexpectedlyPaidChild.id}" já está paymentStatus=paid antes desta confirmação (estado inesperado).`);
        err.code = 'PURCHASE_GROUP_INCONSISTENT';
        throw err;
      }

      const childrenSum = children.reduce((sum, c) => sum + Number(c.totalAmount), 0);
      if (moneyMismatch(childrenSum, groupTotal)) {
        const err: any = new Error(`PURCHASE_GROUP_INCONSISTENT: SUM(children.totalAmount)=${childrenSum} !== group.totalAmount=${groupTotal}.`);
        err.code = 'PURCHASE_GROUP_INCONSISTENT';
        throw err;
      }
      const currencyMismatch = children.some((c) => String(c.currency).toUpperCase() !== groupCurrency);
      if (currencyMismatch) {
        const err: any = new Error('PURCHASE_GROUP_INCONSISTENT: moeda de um ou mais child orders diverge da moeda do group.');
        err.code = 'PURCHASE_GROUP_INCONSISTENT';
        throw err;
      }

      // Locks individuais por child order, em ordem determinística — ver
      // nota no topo desta função sobre por que isso nunca gera deadlock.
      const sortedChildIds = [...children].map((c) => c.id).sort();
      for (const childId of sortedChildIds) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${childId}))`);
      }
      // Tentativa protegida por SAVEPOINT (tx.transaction aninhado) contra a
      // corrida residual que o advisory lock já deveria ter impedido —
      // seção 8: nunca deixar estado indefinido se a UNIQUE parcial disparar.
      try {
        await tx.transaction(async (tx2: any) => {
          await tx2.update(payments).set({
            settlementRole: 'primary',
            status: 'paid',
            paidAt: new Date(),
            transactionRef: options.transactionRef,
            updatedAt: new Date(),
          }).where(eq(payments.id, payment.id));
        });
      } catch (raceErr: any) {
        // A UNIQUE parcial (payments_purchase_group_primary_uq) rejeitou a
        // promoção — outra transação venceu entre a releitura acima e este
        // UPDATE. Relê sob o MESMO lock (ainda preso) para confirmar
        // inequivocamente antes de tratar como surplus — nunca assume, prova.
        const [primaryAfterRace] = await tx
          .select()
          .from(payments)
          .where(and(eq(payments.purchaseGroupId, group.id), eq(payments.settlementRole, 'primary')))
          .limit(1);
        if (!primaryAfterRace || primaryAfterRace.id === payment.id) {
          // Não há prova inequívoca de outro vencedor — não inventa um
          // desfecho: propaga o erro original para retry seguro do webhook.
          throw raceErr;
        }
        await tx.update(payments).set({
          settlementRole: 'surplus',
          status: 'paid',
          paidAt: new Date(),
          transactionRef: options.transactionRef,
          updatedAt: new Date(),
        }).where(eq(payments.id, payment.id));
        logger.warn({ purchaseGroupId, paymentId: payment.id, primaryPaymentId: primaryAfterRace.id }, 'PURCHASE_GROUP_PAYMENT_SURPLUS (via corrida na UNIQUE constraint, provado sob lock antes de decidir)');
        return { success: true, message: 'Pagamento excedente (surplus) registrado após corrida na eleição primary.', settlementRole: 'surplus', alreadyProcessed: false };
      }

      await tx.insert(paymentAttempts).values({
        id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        paymentId: payment.id,
        provider: options.provider,
        status: 'succeeded',
        rawPayloadJson: { note: 'promovido a primary — financia o purchase_group', purchaseGroupId: group.id },
        createdAt: new Date(),
      });
      logger.info({ purchaseGroupId, paymentId: payment.id }, 'PURCHASE_GROUP_PAYMENT_PROMOTED_TO_PRIMARY');

      // ==========================================================================
      // ALLOCATIONS + ESCROW/HOLD POR CHILD — seção 10/11. Mesma função
      // usada pelo legacy (holdEscrowForConfirmedOrder) — "não reinventar
      // cálculo": amount do escrow é SEMPRE child.totalAmount (bruto),
      // exatamente como confirmOrderPayment.
      // ==========================================================================
      let allocatedSum = 0;
      for (const child of children) {
        const allocationId = `alloc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await tx.insert(paymentAllocations).values({
          id: allocationId,
          paymentId: payment.id,
          orderId: child.id,
          purchaseGroupId: group.id,
          amount: child.totalAmount,
          currency: group.currency,
          status: 'active',
          refundedAmount: '0.00',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        allocatedSum += Number(child.totalAmount);

        await PaymentService.holdEscrowForConfirmedOrder(tx, child, {
          provider: options.provider,
          transactionRef: options.transactionRef,
          performedBy,
          paymentId: payment.id,
        });
      }

      // Prova interna (seção 10) — belt-and-suspenders: se isto não bater,
      // é um bug real e deve abortar a transação inteira (rollback), nunca
      // deixar um group "paid" com allocations que não reconciliam.
      if (moneyMismatch(allocatedSum, Number(payment.amount)) || moneyMismatch(allocatedSum, groupTotal)) {
        throw new Error(`PURCHASE_GROUP_ALLOCATION_RECONCILIATION_FAILED: SUM(allocations)=${allocatedSum} !== payment.amount=${payment.amount} / group.totalAmount=${groupTotal}.`);
      }

      // ==========================================================================
      // GRUPO PAGO — seção 17. Só acontece se TUDO acima já foi escrito com
      // sucesso nesta mesma transação; qualquer erro anterior faz rollback
      // completo e o group permanece pending_payment.
      // ==========================================================================
      await tx.update(purchaseGroups).set({ status: 'paid', updatedAt: new Date() }).where(eq(purchaseGroups.id, group.id));

      logger.info({ purchaseGroupId, paymentId: payment.id, childCount: children.length, allocatedSum }, 'PURCHASE_GROUP_PAYMENT_CONFIRMED — allocations e escrow/HOLD criados para todos os child orders');

      return { success: true, message: 'Pagamento de purchase_group confirmado com sucesso — escrow ativo para todos os pedidos.', settlementRole: 'primary', alreadyProcessed: false, childCount: children.length };
    });

    return result;
  }

  /**
   * Confirms payment via payment ID (calls confirmOrderPayment).
   */
  static async confirmPayment(paymentId: string, transactionRef?: string) {
    const db = getDb();
    if (!db) return { success: true };

    const payRes = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (payRes.length === 0) throw new Error('Pagamento não encontrado.');

    const payment = payRes[0];
    return await this.confirmOrderPayment(payment.orderId, { transactionRef });
  }

  /**
   * Fase C5.1 — resolve o payment que efetivamente financiou UM order,
   * suportando os dois regimes sem misturá-los:
   *
   *   LEGACY (order.purchaseGroupId == NULL): payments WHERE orderId=order.id
   *   AND status='paid' — mesma query/mesma mensagem de erro de sempre
   *   (byte-equivalente ao comportamento pré-C5.1).
   *
   *   GROUP (order.purchaseGroupId != NULL): NUNCA "qualquer payment do
   *   group", NUNCA o primeiro por createdAt, NUNCA um payment surplus. O
   *   vínculo financeiro child->primary é SEMPRE a payment_allocation ACTIVE
   *   deste order — dela obtemos paymentId, e exigimos que esse payment
   *   pertença exclusivamente a este group (owner CHECK), seja 'primary' e
   *   esteja 'paid'. Qualquer divergência é FAIL CLOSED, zero efeito
   *   financeiro (usado por releaseEscrowForOrder antes de qualquer escrita).
   *
   * Usada nos caminhos de release (Fase C5.1) e, a partir da Fase C5.2-C,
   * também por refundService.ts (processRefund) para resolver o funding
   * payment de um child order antes de um refund — MESMA lógica, sem
   * duplicar cálculo. Por isso não é mais `private`: refundService.ts é um
   * módulo separado e precisa poder chamá-la. Nenhuma linha de
   * comportamento mudou — só a visibilidade.
   */
  static async resolveFundingPaymentForOrder(
    tx: any,
    order: typeof orders.$inferSelect
  ): Promise<{ payment: typeof payments.$inferSelect; mode: 'legacy' | 'purchase_group'; allocation?: typeof paymentAllocations.$inferSelect }> {
    if (!order.purchaseGroupId) {
      // Fase "Proteção pós-entrega", item 6 da auditoria original — mantido
      // byte a byte: orders.paymentStatus é só um espelho, a fonte real é
      // payments.status; exigir 'paid' de fato fecha o gap dos webhooks
      // PAYMENT_OVERDUE/PAYMENT_DELETED sem inventar nenhum estado novo.
      const [payment] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, 'paid')))
        .limit(1);
      if (!payment) {
        throw new Error(
          `PAYMENT_NOT_ELIGIBLE_FOR_RELEASE: Nenhum pagamento com status "paid" encontrado para o pedido ${order.id} — liberação recusada.`
        );
      }
      return { payment, mode: 'legacy' };
    }

    // GROUP — seção 2/4: a allocation é o ÚNICO vínculo financeiro aceito.
    const activeAllocations = await tx
      .select()
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.orderId, order.id), eq(paymentAllocations.status, 'active')));

    if (activeAllocations.length === 0) {
      throw new Error(
        `PAYMENT_NOT_ELIGIBLE_FOR_RELEASE: Nenhuma payment_allocation ativa encontrada para o pedido ${order.id} (purchase_group ${order.purchaseGroupId}) — liberação recusada.`
      );
    }
    if (activeAllocations.length > 1) {
      // payment_allocations_order_active_uq (índice único parcial) já
      // deveria impedir isso estruturalmente — defesa em profundidade, nunca
      // escolhe uma arbitrariamente.
      throw new Error(
        `PURCHASE_GROUP_ALLOCATION_AMBIGUOUS: Mais de uma payment_allocation ativa encontrada para o pedido ${order.id} — estado inconsistente, liberação recusada.`
      );
    }
    const allocation = activeAllocations[0];

    if (allocation.purchaseGroupId !== order.purchaseGroupId) {
      throw new Error(
        `PURCHASE_GROUP_ALLOCATION_MISMATCH: allocation "${allocation.id}" tem purchaseGroupId="${allocation.purchaseGroupId}", esperado "${order.purchaseGroupId}" — liberação recusada.`
      );
    }
    // allocation.amount deve ser o valor financeiro do child (order.totalAmount
    // BRUTO — nunca sellerNetAmount aqui; ver seção 5) — comparação com a
    // mesma tolerância já usada em todo o resto do sistema.
    if (Math.abs(Number(allocation.amount) - Number(order.totalAmount)) > 0.01) {
      throw new Error(
        `PURCHASE_GROUP_ALLOCATION_AMOUNT_MISMATCH: allocation "${allocation.id}" tem amount=${allocation.amount}, esperado order.totalAmount=${order.totalAmount} — liberação recusada.`
      );
    }
    if (String(allocation.currency).toUpperCase() !== String(order.currency).toUpperCase()) {
      throw new Error(
        `PURCHASE_GROUP_ALLOCATION_CURRENCY_MISMATCH: allocation "${allocation.id}" tem currency="${allocation.currency}", esperado order.currency="${order.currency}" — liberação recusada.`
      );
    }

    const [payment] = await tx.select().from(payments).where(eq(payments.id, allocation.paymentId)).limit(1);
    if (!payment) {
      throw new Error(
        `PAYMENT_NOT_ELIGIBLE_FOR_RELEASE: allocation "${allocation.id}" referencia payment "${allocation.paymentId}" inexistente — liberação recusada.`
      );
    }
    if (payment.purchaseGroupId !== order.purchaseGroupId || payment.orderId !== null) {
      throw new Error(
        `PURCHASE_GROUP_PAYMENT_OWNER_MISMATCH: payment "${payment.id}" não pertence exclusivamente ao purchase_group "${order.purchaseGroupId}" — liberação recusada.`
      );
    }
    if (payment.settlementRole !== 'primary') {
      // NUNCA um surplus financia release — mesmo que esteja 'paid' (dinheiro
      // real recebido, mas excedente, ver Fase C4.1).
      throw new Error(
        `PURCHASE_GROUP_PAYMENT_NOT_PRIMARY: payment "${payment.id}" tem settlementRole="${payment.settlementRole}" (esperado "primary") — liberação recusada.`
      );
    }
    if (payment.status !== 'paid') {
      throw new Error(
        `PAYMENT_NOT_ELIGIBLE_FOR_RELEASE: payment primary "${payment.id}" está com status="${payment.status}" (esperado "paid") — liberação recusada.`
      );
    }

    return { payment, mode: 'purchase_group', allocation };
  }

  /**
   * Central atomic & idempotent escrow release service.
   * Releases escrow funds upon buyer confirmation or admin release.
   */
  static async releaseEscrowForOrder(orderId: string, options?: { performedBy?: string; reason?: string }, executor?: any) {
    const runInTx = async (tx: any) => {
      // Fase "Proteção pós-entrega" (correção do GAP CRÍTICO da auditoria): serializa
      // qualquer operação crítica sobre este orderId (release e abertura de disputa
      // concorrente) usando o MESMO advisory lock já usado por initiatePayment.
      // Garante que "disputa aberta com sucesso" e "release concluído" nunca produzam
      // um estado contraditório — ver createBuyerDispute, que agora adquire o mesmo
      // lock antes de decidir se pode inserir a disputa.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);

      const ordRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (ordRows.length === 0) throw new Error('Pedido não encontrado.');
      const ord = ordRows[0];

      // Idempotency: Return early if escrow is already released
      if (ord.escrowStatus === 'released') {
        logger.info({ orderId }, 'Escrow already released for order (idempotent call)');
        return {
          success: true,
          message: 'Garantia Escrow já liberada anteriormente.',
          alreadyReleased: true,
          data: {
            orderId: ord.id,
            orderNumber: ord.orderNumber,
            escrowStatus: 'released',
            status: 'delivered',
            alreadyReleased: true,
          },
        };
      }

      // Fase "Proteção pós-entrega": uma disputa aberta ou em mediação bloqueia
      // QUALQUER liberação de escrow, não importa quem chama releaseEscrowForOrder
      // (confirmação do comprador, liberação manual do admin, ou o futuro
      // auto-release). Verificação DIRETA na tabela disputes — nunca dependemos de
      // escrow_accounts.status='disputed' porque createBuyerDispute não marca esse
      // status hoje (auditado; não alterado nesta fase para não quebrar
      // processRefund/resolveDispute, que não suportam esse valor de status).
      const activeDisputes = await tx
        .select({ id: disputes.id, status: disputes.status })
        .from(disputes)
        .where(and(eq(disputes.orderId, orderId), inArray(disputes.status, ['open', 'in_mediation'])))
        .limit(1);
      if (activeDisputes.length > 0) {
        throw new Error(
          `ESCROW_BLOCKED_BY_ACTIVE_DISPUTE: Existe uma disputa em aberto (status "${activeDisputes[0].status}") para o pedido ${orderId} — a liberação do escrow está bloqueada até a disputa ser resolvida.`
        );
      }

      // Validate payment status
      if (ord.paymentStatus !== 'paid') {
        throw new Error('PAYMENT_NOT_CONFIRMED: O pagamento do pedido ainda não foi confirmado.');
      }

      // Fase "Proteção pós-entrega", item 6 da auditoria original: orders
      // .paymentStatus é só um espelho — a fonte real é payments.status (via
      // o payment que de fato financiou este order). Fase C5.1: essa
      // resolução agora suporta os dois regimes (legacy por payments.orderId,
      // group por payment_allocations -> payment primary) sem misturá-los —
      // ver resolveFundingPaymentForOrder. Lança (fail closed) se não achar
      // um funding payment elegível; nunca inventa nenhum estado novo.
      const { payment: fundingPayment } = await PaymentService.resolveFundingPaymentForOrder(tx, ord);

      // Fase C5.3-C2 — VETO DE RELEASE: se o funding payment (legacy OU
      // PRIMARY do group — nunca surplus/candidate, já garantido acima por
      // resolveFundingPaymentForOrder) possui um chargeback local em estado
      // bloqueante (active/lost/manual_review — ver
      // BLOCKING_CHARGEBACK_LOCAL_STATUSES em chargebackService.ts), a
      // liberação é recusada ANTES de qualquer leitura/escrita de
      // escrow/wallet. Adquire o MESMO lock de autoridade
      // (pg_advisory_xact_lock(hashtext(fundingPayment.id))) que
      // `observeChargeback` adquire antes de gravar — é isso que torna a
      // corrida release×chargeback determinística (nunca um TOCTOU), sem
      // inverter a ordem global de locks já estabelecida (GROUP → ORDER):
      // este lock de PAYMENT só é adquirido AQUI, depois do ORDER lock já
      // detido no topo desta função, nunca antes. Para um child de group,
      // fundingPayment.id é sempre o PRIMARY — logo um chargeback no
      // PRIMARY bloqueia TODOS os children (item 4 do pedido), nunca só o
      // child individual. ZERO mutação de wallet/escrow/allocation/order é
      // feita por este bloco — só o lançamento (ou não) do erro.
      await assertNoBlockingChargebackForPayment(tx, fundingPayment.id);

      // Multi-Shipment Validation: ALL non-cancelled shipments must be DELIVERED
      const nonCancelledShipments = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.orderId, orderId), ne(shipments.status, 'CANCELLED')));

      if (nonCancelledShipments.length > 0) {
        const undelivered = nonCancelledShipments.filter(s => (s.status || '').toUpperCase() !== 'DELIVERED');
        if (undelivered.length > 0) {
          throw new Error(
            `ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois nem todos os pacotes do pedido foram entregues.`
          );
        }
      }

      // Check escrow account
      const escRows = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)).limit(1);
      if (escRows.length === 0) {
        throw new Error('Conta Escrow não encontrada para este pedido.');
      }
      const esc = escRows[0];

      // Fase "Refund/disputa/chargeback", item 3: um refund processado antes do
      // release marca a escrow como 'refunded' — isso tem que impedir qualquer
      // release futuro, mesmo que o chamador não tenha visto o refund a tempo
      // (concorrência: releaseEscrowForOrder também trava a linha da escrow
      // mais abaixo, mas essa checagem de status já barra o caso comum antes
      // de qualquer escrita).
      if (esc.status === 'refunded' || esc.status === 'disputed') {
        throw new Error(`ESCROW_ALREADY_REVERSED: escrow do pedido ${ord.id} está em status "${esc.status}" — não pode mais ser liberada.`);
      }

      // Moeda do escrow tem que bater com a moeda do pedido — nunca creditar uma
      // wallet com um valor rotulado numa moeda diferente da que a conta
      // realmente representa (Fase 6, correção do achado CRÍTICO C). Na criação
      // do escrow (HOLD) as duas sempre vêm de ord.currency, então isto é uma
      // guarda defensiva contra corrupção de dado futura, não um caminho normal.
      if (esc.currency !== ord.currency) {
        throw new Error(
          `ESCROW_CURRENCY_MISMATCH: escrow do pedido ${ord.id} está em ${esc.currency}, mas o pedido está em ${ord.currency}. Release recusado, nenhum crédito realizado.`
        );
      }
      const releaseCurrency = esc.currency;

      let performedBy: string | null = options?.performedBy || ord.buyerId;
      if (performedBy) {
        const uCheck = await tx.select().from(users).where(eq(users.id, performedBy)).limit(1);
        if (uCheck.length === 0) performedBy = ord.buyerId;
      }

      // 1. Resolve seller user ID
      let sellerUserId: string | null = null;
      const targetSellerId = esc.sellerId || ord.sellerId;
      if (targetSellerId) {
        const selChk = await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, targetSellerId)).limit(1);
        if (selChk.length > 0 && selChk[0].userId) {
          sellerUserId = selChk[0].userId;
        } else {
          const userChk = await tx.select({ id: users.id }).from(users).where(eq(users.id, targetSellerId)).limit(1);
          if (userChk.length > 0) {
            sellerUserId = userChk[0].id;
          }
        }
      }

      // 2. Locate or create Seller Wallet (por usuário + moeda) & Credit Balance (Idempotent)
      // releaseAmount = orders.sellerNetAmount, nunca escrow.amount bruto — o bruto inclui
      // frete e a comissão da Nusali, que não pertencem à wallet do vendedor (Fase 6,
      // achados CRÍTICO B e itens 2/3 — frete e comissão nunca são creditados ao seller).
      // Lança MissingFinancialSnapshotError antes de qualquer escrita se o snapshot
      // obrigatório estiver ausente/inválido — nenhuma wallet é tocada nesse caso.
      const releaseAmount = calculateSellerReleaseAmount(ord);
      if (sellerUserId && releaseAmount > 0) {
        // Uma wallet por usuário POR MOEDA (Fase 6, achado CRÍTICO C) — nunca soma valores
        // de moedas diferentes no mesmo saldo numérico.
        let walletRows = await tx
          .select()
          .from(wallets)
          .where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, releaseCurrency)))
          .limit(1);
        let sellerWallet = walletRows[0];
        if (!sellerWallet) {
          // Race-safe wallet auto-provisioning: ON CONFLICT DO NOTHING no par (userId,
          // currency), depois re-seleciona a linha que realmente venceu, em vez de arriscar
          // erro de insert duplicado se uma liberação/payout concorrente para a mesma
          // wallet-nova rodar ao mesmo tempo.
          const wId = `wlt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          await tx
            .insert(wallets)
            .values({
              id: wId,
              userId: sellerUserId,
              balance: '0.00',
              cashbackBalance: '0.00',
              pendingBalance: '0.00',
              currency: releaseCurrency,
              status: 'active',
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .onConflictDoNothing({ target: [wallets.userId, wallets.currency] });
          const createdW = await tx
            .select()
            .from(wallets)
            .where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, releaseCurrency)))
            .limit(1);
          sellerWallet = createdW[0];
        }

        const idempotencyKey = `escrow_release:${ord.id}`;
        const existingWtx = await tx
          .select()
          .from(walletTransactions)
          .where(eq(walletTransactions.idempotencyKey, idempotencyKey))
          .limit(1);

        if (existingWtx.length === 0) {
          // Lock the wallet row for the rest of this transaction so a concurrent release/payout
          // for the same wallet cannot read the same stale balance.
          const lockedRows = await tx.select().from(wallets).where(eq(wallets.id, sellerWallet.id)).for('update');
          const lockedWallet = lockedRows[0] || sellerWallet;
          const currentBalance = Number(lockedWallet.balance || 0);
          const newBalance = currentBalance + releaseAmount;

          await tx
            .update(wallets)
            .set({
              balance: String(newBalance.toFixed(2)),
              updatedAt: new Date(),
            })
            .where(eq(wallets.id, sellerWallet.id));

          try {
            await tx.insert(walletTransactions).values({
              id: `wtx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
              walletId: sellerWallet.id,
              type: 'escrow_release',
              amount: String(releaseAmount.toFixed(2)),
              currency: releaseCurrency,
              title: `Venda liberada - Pedido #${ord.orderNumber || ord.id}`,
              referenceId: ord.id,
              referenceType: 'order',
              status: 'completed',
              balanceAfter: String(newBalance.toFixed(2)),
              idempotencyKey,
              createdAt: new Date(),
            });
          } catch (wtxErr: any) {
            // Corrida: duas liberações concorrentes passaram pelo SELECT acima antes de
            // qualquer uma commitar. O índice único de idempotencyKey (Postgres) rejeita a
            // segunda — deixamos a transação inteira dar rollback (nenhum crédito parcial
            // fica de pé) e o erro sobe como está; não tentamos "engolir" silenciosamente
            // aqui porque o saldo já foi somado localmente em memória (newBalance) e não é
            // seguro assumir qual das duas deveria "vencer" sem reprocessar do zero.
            throw wtxErr;
          }
        }
      }

      // 3. Update Escrow Account — compare-and-set (defesa em profundidade, além
      // do advisory lock): auditoria de concorrência encontrou que este UPDATE
      // era "cego" (só filtrava por id, nunca pelo status atual), então um
      // processRefund concorrente que tivesse escrito 'refunded' um instante
      // antes seria silenciosamente sobrescrito de volta para 'released'. Com
      // o WHERE abaixo, o UPDATE só afeta a linha se ela ainda estiver
      // 'held'/'eligible' no exato momento da escrita — se 0 linhas forem
      // afetadas, alguma outra transação já mudou o estado (mesmo que
      // improvável agora que processRefund/createBuyerDispute/admin-freeze
      // também usam o mesmo advisory lock), e nós paramos e relemos o estado
      // real em vez de assumir sucesso.
      const releaseUpdateResult = await tx
        .update(escrowAccounts)
        .set({
          status: 'released',
          releasedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(escrowAccounts.id, esc.id), inArray(escrowAccounts.status, ['held', 'eligible'])))
        .returning({ id: escrowAccounts.id });

      if (releaseUpdateResult.length === 0) {
        const [reReadEsc] = await tx.select({ status: escrowAccounts.status }).from(escrowAccounts).where(eq(escrowAccounts.id, esc.id)).limit(1);
        throw new Error(
          `ESCROW_STATE_CHANGED_CONCURRENTLY: O estado do escrow do pedido ${orderId} mudou para "${reReadEsc?.status}" durante o processamento — liberação abortada com segurança, nenhuma alteração aplicada.`
        );
      }

      // 4. Update Order
      await tx
        .update(orders)
        .set({
          escrowStatus: 'released',
          status: 'delivered',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, ord.id));

      // 5. Escrow Transaction Ledger
      // Fix (diagnóstico "RELEASE_SELLER gravando bruto em vez de líquido"):
      // amount tem que representar o que de fato SAIU do escrow rumo ao
      // vendedor — releaseAmount (= orders.sellerNetAmount), a MESMA
      // variável já usada acima para o crédito na wallet — nunca
      // esc.amount (o bruto retido; isso já é fielmente registrado pelo
      // HOLD, que continua inalterado). Mesma convenção que REFUND_BUYER já
      // segue em refundService.ts (valor real do evento, nunca uma cópia
      // estática de escrow_accounts.amount).
      await tx.insert(escrowTransactions).values({
        id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        escrowAccountId: esc.id,
        type: 'RELEASE_SELLER',
        amount: String(releaseAmount.toFixed(2)),
        currency: esc.currency,
        reason: options?.reason || 'ESCROW_RELEASED: Entrega confirmada pelo comprador. Saldo liberado ao vendedor.',
        performedBy,
        reference: `rel_${ord.id}`,
        createdAt: new Date(),
      });

      // 6. Audit Log
      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        orderId: ord.id,
        previousStatus: ord.status,
        newStatus: 'delivered',
        reason: options?.reason || 'ESCROW_RELEASED: Entrega confirmada e saldo liberado.',
        changedBy: performedBy,
        createdAt: new Date(),
      });

      // 7. Notifications
      if (sellerUserId) {
        await tx.insert(notifications).values({
          id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          userId: sellerUserId,
          title: 'Saldo Escrow Liberado!',
          message: `O comprador confirmou o recebimento do pedido #${ord.orderNumber || ord.id}. O valor de ${esc.currency || ord.currency} ${releaseAmount.toFixed(2)} foi creditado na sua carteira.`,
          type: 'escrow',
          link: `/seller/wallet`,
          isRead: false,
          createdAt: new Date(),
        });
      }

      logger.info({ orderId: ord.id }, 'Escrow released successfully for order');

      return {
        success: true,
        message: 'Garantia Escrow liberada com sucesso!',
        data: {
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          escrowStatus: 'released',
          status: 'delivered',
        },
        // Uso interno só para o diagnóstico de comparação com o ledger shadow logo abaixo
        // (Fase 6, item 9) — não faz parte do contrato público da função.
        _releasedAmount: releaseAmount,
      };
    };

    const result = executor
      ? await runInTx(executor)
      : await (async () => {
          const db = getDb();
          if (!db) throw new Error('Banco de dados indisponível.');
          return await db.transaction(runInTx);
        })();

    // ------------------------------------------------------------------------
    // SHADOW LEDGER (Fase 5A) — roda DEPOIS que o fluxo legado acima já commitou,
    // nunca afeta o resultado real. Ver nota equivalente em confirmOrderPayment.
    //
    // Fase 6, item 9: além de postar, comparamos o valor realmente liberado ao
    // vendedor no fluxo legado (orders.sellerNetAmount) contra o SELLER_PAYABLE
    // do ledger shadow para o mesmo pedido — os dois já leem do mesmo snapshot
    // (orders.sellerNetAmount), então um mismatch aqui indicaria um bug real em
    // um dos dois caminhos, nunca um comportamento esperado. Só loga um
    // diagnóstico; nunca bloqueia nem reverte o fluxo real, que já commitou.
    // ------------------------------------------------------------------------
    try {
      const shadow = await FinancialLedgerService.recordDeliveryConfirmed({
        orderId,
        performedBy: options?.performedBy ?? null,
        source: 'payment_service',
      });
      if (shadow.skipped) {
        logger.info({ orderId, reason: shadow.reason, detail: shadow.detail }, '[ShadowLedger] recordDeliveryConfirmed pulado (esperado para pedidos legados/sem snapshot)');
      } else {
        logger.info({ orderId, transactionId: shadow.transactionId }, '[ShadowLedger] recordDeliveryConfirmed postado');

        const releasedAmount = (result as any)?._releasedAmount;
        if (shadow.transactionId && typeof releasedAmount === 'number') {
          const db = getDb();
          if (db) {
            const sellerPayableRows = await db
              .select({ amount: ledgerEntries.amount })
              .from(ledgerEntries)
              .innerJoin(ledgerAccounts, eq(ledgerEntries.accountId, ledgerAccounts.id))
              .where(and(eq(ledgerEntries.transactionId, shadow.transactionId), eq(ledgerAccounts.code, 'SELLER_PAYABLE')));
            const shadowAmount = sellerPayableRows.reduce((sum, r) => sum + Number(r.amount), 0);
            if (Math.abs(shadowAmount - releasedAmount) > 0.005) {
              logger.warn(
                { orderId, releasedAmount, shadowAmount, transactionId: shadow.transactionId },
                '[ShadowLedger] MISMATCH: valor liberado no fluxo real diverge do SELLER_PAYABLE do ledger shadow — investigar (não deveria acontecer, os dois leem sellerNetAmount)'
              );
            } else {
              logger.info({ orderId, releasedAmount, shadowAmount }, '[ShadowLedger] valor liberado bate com SELLER_PAYABLE do ledger shadow');
            }
          }
        }
      }
    } catch (shadowErr: any) {
      logger.error({ orderId, error: shadowErr?.message }, '[ShadowLedger] recordDeliveryConfirmed falhou — fluxo real não afetado');
    }

    if (result && typeof result === 'object' && '_releasedAmount' in result) {
      delete (result as any)._releasedAmount;
    }
    return result;
  }

  /**
   * Fase "Janela de proteção pós-entrega" — orquestração central de finalização
   * de entrega, usada tanto pela confirmação manual do comprador (BUYER, via
   * ShipmentService.confirmDeliveryByBuyer) quanto pelo futuro auto-release
   * (AUTO — ainda NÃO acionado por nenhum cron/endpoint nesta fase, só
   * implementado e testado isoladamente).
   *
   * NUNCA duplica a lógica financeira de releaseEscrowForOrder — só decide
   * QUANDO é permitido chamá-la e grava a prova de entrega correspondente
   * (proof_of_delivery) na MESMA transação. Se releaseEscrowForOrder lançar
   * (disputa ativa, payment não elegível, escrow já revertido, etc.), a
   * transação inteira sofre rollback — nunca sobra um BUYER_CONFIRMATION/
   * AUTO_CONFIRMATION "órfão" sem o release correspondente ter de fato
   * acontecido.
   *
   * Concorrência (correção do achado real "AUTO_CONFIRMATION duplicada" da
   * auditoria de atomicidade): esta função adquire o MESMO
   * pg_advisory_xact_lock(hashtext(orderId)) que releaseEscrowForOrder usa —
   * mas como a PRIMEIRA operação de runInTx, antes de qualquer leitura
   * (order, shipments, releaseEligibleAt, prova operacional) e antes do
   * INSERT de proof_of_delivery. Isso fecha a janela que antes permitia duas
   * execuções concorrentes (AUTO x AUTO, ou BUYER x AUTO) inserirem a mesma
   * prova duas vezes antes de qualquer lock existir. Quando
   * releaseEscrowForOrder é chamado mais abaixo (mesmo `tx`), ele readquire o
   * MESMO lock — reentrante e seguro por design do Postgres (uma transação
   * que já detém um advisory lock nunca bloqueia a si mesma pedindo o mesmo
   * lock de novo), então não há necessidade de nenhuma flag
   * "lockAlreadyHeld" nem de duas variantes da função.
   */
  static async finalizeDelivery(
    orderId: string,
    options: { source: 'BUYER' | 'AUTO'; performedBy?: string; buyerDisplayName?: string },
    executor?: any
  ) {
    const runInTx = async (tx: any) => {
      // Auditoria de concorrência (correção do ACHADO REAL "AUTO_CONFIRMATION
      // duplicada"): o MESMO pg_advisory_xact_lock(hashtext(orderId)) que
      // releaseEscrowForOrder usa é adquirido AQUI, como a primeiríssima
      // operação — ANTES de qualquer leitura (order, shipments,
      // releaseEligibleAt, prova operacional) e ANTES do INSERT de
      // proof_of_delivery (BUYER_CONFIRMATION/AUTO_CONFIRMATION). Isso fecha a
      // janela que permitia duas execuções concorrentes (AUTO x AUTO, ou
      // BUYER x AUTO) inserirem a mesma prova duas vezes antes de qualquer
      // lock real existir.
      //
      // Quando releaseEscrowForOrder for chamado mais abaixo (mesmo `tx`), ele
      // readquire o MESMO lock — reentrante e seguro por design do Postgres
      // (pg_advisory_xact_lock: uma transação que já detém um lock nunca
      // bloqueia a si mesma pedindo o mesmo lock de novo; o contador interno
      // só é liberado no COMMIT/ROLLBACK). Não há necessidade de nenhuma flag
      // "lockAlreadyHeld" nem de duas variantes da função — a reentrância do
      // Postgres já resolve isso com zero complexidade adicional.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`);

      const ordRows = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (ordRows.length === 0) {
        throw new Error('ORDER_NOT_FOUND: Pedido não encontrado.');
      }
      const ord = ordRows[0];

      // Entrega completa: MESMA regra já usada por confirmDeliveryByBuyer/
      // releaseEscrowForOrder (todos os shipments não-cancelados DELIVERED) —
      // única implementação, reutilizada, nunca duplicada.
      const nonCancelledShipments = await tx
        .select()
        .from(shipments)
        .where(and(eq(shipments.orderId, orderId), ne(shipments.status, 'CANCELLED')));

      if (nonCancelledShipments.length === 0) {
        throw new Error('ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois o pedido não possui envios registrados.');
      }
      const undelivered = nonCancelledShipments.filter((s: any) => (s.status || '').toUpperCase() !== 'DELIVERED');
      if (undelivered.length > 0) {
        throw new Error('ORDER_NOT_FULLY_DELIVERED: Não é possível confirmar o recebimento pois nem todos os pacotes do pedido foram entregues.');
      }

      const proofType = options.source === 'BUYER' ? 'BUYER_CONFIRMATION' : 'AUTO_CONFIRMATION';
      let receivedByLabel: string;

      if (options.source === 'AUTO') {
        // AUTO exige releaseEligibleAt NOT NULL e <= NOW() — NULL nunca é
        // interpretado como "já venceu" (histórico/fluxo incompleto = NUNCA
        // elegível, ver auditoria da fase anterior).
        const escRows = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, orderId)).limit(1);
        if (escRows.length === 0) {
          throw new Error('ESCROW_NOT_FOUND: Conta escrow não encontrada para este pedido.');
        }
        const esc = escRows[0];
        if (!esc.releaseEligibleAt) {
          throw new Error(
            `AUTO_RELEASE_NOT_ELIGIBLE: releaseEligibleAt não definido para o pedido ${orderId} — não está inscrito no auto-release (histórico ou fluxo incompleto). NULL nunca significa "já venceu".`
          );
        }
        if (new Date(esc.releaseEligibleAt).getTime() > Date.now()) {
          throw new Error(
            `AUTO_RELEASE_WINDOW_NOT_EXPIRED: A janela de proteção do comprador para o pedido ${orderId} ainda não expirou (releaseEligibleAt=${new Date(esc.releaseEligibleAt).toISOString()}).`
          );
        }

        // Prova operacional obrigatória para TODOS os shipments não-cancelados —
        // status DELIVERED sozinho NUNCA é suficiente para AUTO.
        for (const shp of nonCancelledShipments) {
          const proof = await tx
            .select({ id: proofOfDelivery.id })
            .from(proofOfDelivery)
            .where(and(eq(proofOfDelivery.shipmentId, shp.id), eq(proofOfDelivery.proofType, 'OPERATOR_CONFIRMATION')))
            .limit(1);
          if (proof.length === 0) {
            throw new Error(
              `AUTO_RELEASE_MISSING_OPERATIONAL_PROOF: Envio ${shp.id} do pedido ${orderId} não possui prova operacional de entrega (proof_of_delivery OPERATOR_CONFIRMATION) — auto-release recusado.`
            );
          }
        }
        receivedByLabel = 'Confirmação automática do sistema (prazo de proteção do comprador expirado)';
      } else {
        // BUYER: não exige prazo expirado, só entrega completa (já checado acima)
        // e nome real do comprador (auditado: a própria confirmação autenticada do
        // comprador já é evidência suficiente — não exige OPERATOR_CONFIRMATION
        // adicional, comportamento manual pré-existente preservado).
        if (!options.buyerDisplayName || !options.buyerDisplayName.trim()) {
          throw new Error(
            'BUYER_NAME_REQUIRED_FOR_DELIVERY_CONFIRMATION: Para confirmar o recebimento, é necessário ter o seu nome completo cadastrado no perfil.'
          );
        }
        receivedByLabel = options.buyerDisplayName.trim();
      }

      // Prova de entrega idempotente (um registro por shipment por proofType) —
      // gravada ANTES do release, na MESMA transação: se releaseEscrowForOrder
      // lançar logo abaixo, este insert é desfeito junto (rollback), nunca fica
      // uma confirmação "falsa" sem o release ter realmente acontecido.
      for (const shp of nonCancelledShipments) {
        const existingProof = await tx
          .select({ id: proofOfDelivery.id })
          .from(proofOfDelivery)
          .where(and(eq(proofOfDelivery.shipmentId, shp.id), eq(proofOfDelivery.proofType, proofType)))
          .limit(1);
        if (existingProof.length === 0) {
          await tx.insert(proofOfDelivery).values({
            id: `pod_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            shipmentId: shp.id,
            receivedBy: receivedByLabel,
            deliveredAt: shp.deliveredAt || new Date(),
            proofType,
            notes: options.source === 'BUYER'
              ? 'Recebimento confirmado pelo comprador.'
              : 'Recebimento confirmado automaticamente pelo sistema após expiração do prazo de proteção, sem confirmação manual nem disputa.',
            createdAt: new Date(),
          });
        }
      }

      // A liberação financeira é SEMPRE feita por releaseEscrowForOrder — nunca
      // reimplementada aqui. Ela já protege (disputa open/in_mediation, payment
      // elegível, escrow.status, idempotência via unique constraint) — nenhuma
      // dessas proteções é duplicada nesta função.
      const escrowResult: any = await this.releaseEscrowForOrder(
        orderId,
        {
          performedBy: options.performedBy || ord.buyerId,
          reason: options.source === 'BUYER'
            ? 'ENTREGA_CONFIRMADA_PELO_COMPRADOR: O comprador confirmou o recebimento de todos os pacotes.'
            : 'AUTO_CONFIRMADO_PRAZO_EXPIRADO: Prazo de proteção do comprador expirado sem confirmação manual nem disputa — confirmação automática.',
        },
        tx
      );

      await tx.insert(auditLogs).values({
        id: `aud_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        actorUserId: options.performedBy || null,
        action: options.source === 'BUYER' ? 'BUYER_CONFIRMED_DELIVERY' : 'AUTO_CONFIRMED_DELIVERY',
        resource: 'orders',
        resourceId: orderId,
        detailsJson: { orderId, source: options.source },
        createdAt: new Date(),
      });

      return {
        success: true,
        message: options.source === 'BUYER'
          ? 'Recebimento de todos os pacotes confirmado com sucesso! O pagamento foi liberado ao vendedor.'
          : 'Confirmação automática processada com sucesso — pagamento liberado ao vendedor.',
        data: escrowResult.data,
      };
    };

    if (executor) return runInTx(executor);
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');
    return db.transaction(runInTx);
  }
}
