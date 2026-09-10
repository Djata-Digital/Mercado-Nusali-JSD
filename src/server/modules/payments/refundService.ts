/**
 * Fase "Refund/disputa/chargeback" — fecha o caminho inverso do dinheiro.
 *
 * Auditoria (item 1 do pedido) confirmou que, antes desta fase, NENHUM código
 * escrevia na tabela `refunds`, a resolução de disputa (`/admin/disputes/:id/
 * resolve`) só mudava `disputes.status` sem mover dinheiro nenhum, e o webhook
 * Asaas `PAYMENT_REFUNDED` só atualizava `payments.status='refunded'` — em
 * nenhum dos três casos o vendedor era debitado nem o escrow era realmente
 * revertido. `processRefund()` é a única função que move dinheiro de volta;
 * dispute resolution e o webhook chamam ela, nunca duplicam a lógica.
 *
 * Regra central: toda reversão é idempotente (idempotencyKey obrigatória,
 * fornecida pelo chamador — nunca derivada de um ID recém-criado), sempre na
 * moeda do pedido (nunca escolhida por quem chama), e nunca inventa um valor
 * quando falta snapshot financeiro.
 */
import { getDb } from '../../../db/index.js';
import { orders, payments, escrowAccounts, escrowTransactions, users, sellers, wallets, walletTransactions, refunds, disputes, disputeMessages, paymentAllocations, purchaseGroups } from '../../../db/schema.js';
import { eq, and, sql, inArray, isNull, isNotNull } from 'drizzle-orm';
import { PaymentService } from './paymentService.js';
import { PaymentProvider, RefundGatewayOutcome } from './paymentProvider.js';
import { AsaasPaymentProvider } from './providers/asaasPaymentProvider.js';
import { AsaasRefund, findRefundByCorrelation, ASAAS_AMOUNT_TOLERANCE } from './types/asaasRefund.js';
import { logger } from '../../infra/logger.js';

export class RefundValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = 'RefundValidationError';
    this.code = code;
    this.status = status;
  }
}

// ============================================================================
// Fase C5.2-D.5, seção 1/3 — HELPERS DE EFEITOS ECONÔMICOS, extraídos
// byte-a-byte do corpo original de processRefund/processSurplusRefund (Fase
// C5.2-C), SEM NENHUMA mudança de comportamento. `processRefund`/
// `processSurplusRefund` abaixo agora apenas chamam estes helpers — o resto
// de cada função (locks, idempotency lookup, validações pré-refund,
// resolução de payment/allocation, e o INSERT final da refund row) continua
// exatamente onde estava, porque isso é "criação da refund row" (legacy),
// nunca reutilizável pelo novo fluxo D.4/D.5 (que faz UPDATE numa row já
// existente, nunca INSERT).
//
// Por que estes dois helpers e não um único genérico: a única coisa
// realmente compartilhável entre "refund de child order" e "refund de
// surplus" é a ESCRITA financeira em si — as validações estruturais que a
// antecedem (owner, settlementRole, allocation) já divergem completamente
// entre os dois casos e continuam vivendo em cada chamador (processRefund/
// processSurplusRefund/finalizeReservedOrderRefund/
// finalizeReservedSurplusRefund), nunca duplicadas.
// ============================================================================

export interface OrderRefundFinancialEffectsInput {
  order: typeof orders.$inferSelect;
  /** Payment financiador — legacy (orderId preenchido) ou PRIMARY do group (groupAllocation != null). */
  payment: typeof payments.$inferSelect;
  /** null para legacy; a allocation ACTIVE do child para group. */
  groupAllocation: typeof paymentAllocations.$inferSelect | null;
  amount: number;
  reason?: string | null;
  performedBy?: string | null;
  /** Id da refund row (já existente, para o novo fluxo; recém-gerado, para o legacy) — usado como referenceId da wallet_transaction. */
  refundId: string;
  /** idempotencyKey do refund local — reaproveitada como idempotencyKey da wallet_transaction (mesmo padrão já existente). */
  walletTxIdempotencyKey: string;
}

/**
 * Efeitos econômicos de UM refund de order/child — EXATAMENTE o bloco
 * original de `processRefund` (escrow held/eligible vs released, wallet
 * debit proporcional, e — quando `groupAllocation` não é null — o agregado
 * allocation/PRIMARY/purchase_group). NUNCA grava a própria refund row —
 * isso é responsabilidade exclusiva de quem chama (INSERT no legacy, UPDATE
 * no fluxo D.4/D.5).
 */
export async function applyOrderRefundFinancialEffects(
  tx: any,
  input: OrderRefundFinancialEffectsInput
): Promise<{ sellerDebitAmount: number | null; currency: string }> {
  const { order, payment, groupAllocation, amount, reason, performedBy, refundId, walletTxIdempotencyKey } = input;

  // Lock na conta de escrow ANTES de qualquer decisão — impede que um release
  // concorrente e este refund decidam com base no mesmo status "velho".
  const escrowRows = await tx.select().from(escrowAccounts).where(eq(escrowAccounts.orderId, order.id)).for('update').limit(1);
  if (escrowRows.length === 0) {
    throw new RefundValidationError('ESCROW_NOT_FOUND', `Conta escrow não encontrada para o pedido ${order.id}.`, 404);
  }
  const escrow = escrowRows[0];

  if (escrow.status === 'refunded') {
    throw new RefundValidationError('ESCROW_ALREADY_REFUNDED', `Escrow do pedido ${order.id} já foi revertido anteriormente.`, 409);
  }

  // A moeda é SEMPRE a do pedido — nunca escolhida por quem chama.
  const currency = order.currency;
  if (payment.currency !== currency || escrow.currency !== currency) {
    throw new RefundValidationError(
      'CURRENCY_MISMATCH',
      `Moedas divergentes entre order (${currency}), payment (${payment.currency}) e escrow (${escrow.currency}) — refund recusado.`,
      409
    );
  }

  const isFullRefund = Math.abs(amount - Number(order.totalAmount)) < 0.005;
  let sellerDebitAmount: number | null = null;

  if (escrow.status === 'held' || escrow.status === 'eligible') {
    // Seller nunca recebeu — nada a debitar. Só reverte o escrow e o pedido.
    await tx.update(escrowAccounts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(escrowAccounts.id, escrow.id));
    await tx.insert(escrowTransactions).values({
      id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      escrowAccountId: escrow.id, type: 'REFUND_BUYER', amount: String(amount.toFixed(2)), currency,
      reason: reason || 'Refund antes da liberação do escrow — vendedor não chegou a receber.',
      performedBy: performedBy ?? null, reference: `refund_${order.id}`, createdAt: new Date(),
    });
    await tx.update(orders).set({
      escrowStatus: 'refunded',
      status: isFullRefund ? 'refunded' : order.status,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    // Para child de purchase_group, o PRIMARY financia outros siblings —
    // NUNCA marcado 'refunded' aqui. Isso é decidido depois, pelo agregado
    // SUM(allocations.refundedAmount) (ver bloco abaixo).
    if (isFullRefund && !groupAllocation) {
      await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
    }
  } else if (escrow.status === 'released') {
    // Seller já recebeu sellerNetAmount — precisa devolver a fração
    // proporcional, SEMPRE a partir do snapshot gravado no pedido, nunca
    // recalculado com a regra de comissão atual.
    if (order.sellerNetAmount === null || order.sellerNetAmount === undefined) {
      throw new RefundValidationError('MISSING_FINANCIAL_SNAPSHOT', `Pedido ${order.id} não tem orders.sellerNetAmount gravado — refund pós-release recusado (não inventamos o valor).`, 422);
    }
    const totalAmount = Number(order.totalAmount);
    const sellerNetAmount = Number(order.sellerNetAmount);
    const refundRatio = totalAmount > 0 ? Math.min(amount / totalAmount, 1) : 0;
    sellerDebitAmount = Math.round(sellerNetAmount * refundRatio * 100) / 100;

    let sellerUserId: string | null = null;
    const targetSellerId = escrow.sellerId || order.sellerId;
    if (targetSellerId) {
      const selChk = await tx.select({ userId: sellers.userId }).from(sellers).where(eq(sellers.id, targetSellerId)).limit(1);
      if (selChk.length > 0 && selChk[0].userId) sellerUserId = selChk[0].userId;
      else {
        const userChk = await tx.select({ id: users.id }).from(users).where(eq(users.id, targetSellerId)).limit(1);
        if (userChk.length > 0) sellerUserId = userChk[0].id;
      }
    }

    if (sellerDebitAmount > 0) {
      if (!sellerUserId) {
        throw new RefundValidationError('SELLER_NOT_RESOLVED', `Não foi possível identificar o usuário do vendedor do pedido ${order.id} para debitar o refund.`, 500);
      }
      const walletRows = await tx.select().from(wallets).where(and(eq(wallets.userId, sellerUserId), eq(wallets.currency, currency))).for('update').limit(1);
      if (walletRows.length === 0) {
        throw new RefundValidationError('SELLER_WALLET_NOT_FOUND', `Vendedor não possui wallet em ${currency} para debitar o refund do pedido ${order.id}.`, 500);
      }
      const sellerWallet = walletRows[0];
      const currentBalance = Number(sellerWallet.balance || 0);
      // Deliberadamente permitido ficar negativo — é a dívida/receivable do
      // vendedor, nunca um prejuízo silenciosamente absorvido pela Nusali.
      const newBalance = currentBalance - sellerDebitAmount;

      await tx.update(wallets).set({ balance: String(newBalance.toFixed(2)), updatedAt: new Date() }).where(eq(wallets.id, sellerWallet.id));

      await tx.insert(walletTransactions).values({
        id: `wtx_refund_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        walletId: sellerWallet.id, type: 'refund', amount: String((-sellerDebitAmount).toFixed(2)), currency,
        title: `Estorno por refund do pedido #${order.orderNumber || order.id}`,
        referenceId: refundId, referenceType: 'order', status: 'completed',
        balanceAfter: String(newBalance.toFixed(2)), idempotencyKey: walletTxIdempotencyKey, createdAt: new Date(),
      });
    }

    await tx.update(escrowAccounts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(escrowAccounts.id, escrow.id));
    await tx.insert(escrowTransactions).values({
      id: `etx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      escrowAccountId: escrow.id, type: 'REFUND_BUYER', amount: String(amount.toFixed(2)), currency,
      reason: reason || 'Refund após liberação do escrow — valor proporcional debitado do vendedor.',
      performedBy: performedBy ?? null, reference: `refund_${order.id}`, createdAt: new Date(),
    });
    await tx.update(orders).set({
      escrowStatus: 'refunded',
      status: isFullRefund ? 'refunded' : order.status,
      updatedAt: new Date(),
    }).where(eq(orders.id, order.id));
    if (isFullRefund && !groupAllocation) {
      await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
    }
  } else {
    // 'disputed' ou qualquer outro estado não coberto — não inventamos comportamento.
    throw new RefundValidationError('ESCROW_STATE_NOT_SUPPORTED', `Escrow do pedido ${order.id} está em estado "${escrow.status}" — refund não implementado para este estado.`, 409);
  }

  // ==========================================================================
  // AGREGADO DO PRIMARY / PURCHASE_GROUP. Só executa para child de
  // purchase_group (groupAllocation != null). Atômico com tudo acima: se
  // algo falhar depois disto, a transação inteira desfaz junto (allocation
  // nunca fica 'refunded' sozinha).
  // ==========================================================================
  if (groupAllocation) {
    await tx.update(paymentAllocations).set({
      refundedAmount: groupAllocation.amount,
      status: 'refunded',
      updatedAt: new Date(),
    }).where(eq(paymentAllocations.id, groupAllocation.id));

    // SUM sobre TODAS as allocations deste PRIMARY (não só as do group — são
    // a mesma coisa por construção, já que payment.purchaseGroupId já foi
    // validado por resolveFundingPaymentForOrder, mas somamos por paymentId
    // para nunca depender de purchaseGroup.status como fonte).
    const siblingAllocations = await tx.select().from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id));
    const sumRefunded = siblingAllocations.reduce((sum: number, a: any) => sum + Number(a.refundedAmount), 0);
    const paymentAmount = Number(payment.amount);

    if (sumRefunded - paymentAmount > 0.005) {
      // Invariante violada — nunca deveria acontecer (cada allocation já é
      // limitada por CHECK refundedAmount<=amount, e cada child só pode ser
      // refunded uma vez). Aborta a transação inteira em vez de gravar um
      // estado financeiro impossível.
      throw new Error(`PURCHASE_GROUP_REFUND_INVARIANT_VIOLATION: SUM(allocations.refundedAmount)=${sumRefunded} excede payment.amount=${paymentAmount} para o payment "${payment.id}".`);
    }

    // payment.status só vira 'refunded' quando TODOS os siblings já foram
    // refunded (soma bate com o total do primary) — nunca por causa de UM
    // child só, que é exatamente o que financia os outros.
    if (Math.abs(sumRefunded - paymentAmount) <= 0.005) {
      await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
    }

    // purchase_groups.status — SEMPRE derivado do agregado, nunca fonte de
    // verdade financeira: 0 refunded -> paid; parcial -> partially_refunded;
    // total -> refunded.
    let newGroupStatus: string;
    if (sumRefunded <= 0.005) newGroupStatus = 'paid';
    else if (paymentAmount - sumRefunded > 0.005) newGroupStatus = 'partially_refunded';
    else newGroupStatus = 'refunded';
    await tx.update(purchaseGroups).set({ status: newGroupStatus, updatedAt: new Date() }).where(eq(purchaseGroups.id, order.purchaseGroupId!));
  }

  return { sellerDebitAmount, currency };
}

/**
 * Efeitos econômicos de UM refund de payment SURPLUS — EXATAMENTE a única
 * escrita financeira original de `processSurplusRefund` (o payment vira
 * 'refunded', nada mais é tocado). Extraído como função própria por
 * simetria/nomeação explícita (pedido D.5, seção 3), embora seja uma única
 * linha — nunca "conveniência" de agrupar, é literalmente tudo que existe.
 */
export async function applySurplusRefundFinancialEffects(tx: any, payment: typeof payments.$inferSelect): Promise<void> {
  await tx.update(payments).set({ status: 'refunded', updatedAt: new Date() }).where(eq(payments.id, payment.id));
}

export interface ProcessRefundInput {
  orderId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  performedBy?: string | null;
}

/**
 * Reversão financeira de um pedido — cobre os dois casos do pedido (itens 3/4):
 *
 *  - escrow ainda HELD (seller nunca recebeu): marca escrow como 'refunded',
 *    impede release futuro (checado em paymentService.ts releaseEscrowForOrder),
 *    NÃO toca a wallet do seller.
 *
 *  - escrow já 'released' (seller já recebeu sellerNetAmount): debita da wallet
 *    do seller (mesma moeda do pedido) a fração proporcional de sellerNetAmount
 *    correspondente ao valor refundado — SEMPRE proporcional ao snapshot
 *    original (orders.sellerNetAmount/totalAmount), nunca recalculado com a
 *    regra de comissão atual. Frete/subsídio nunca entram nesse débito porque
 *    sellerNetAmount já é só a parte do produto (mesma exclusão já garantida na
 *    liberação do escrow). Se o saldo disponível não for suficiente, a wallet
 *    fica negativa DE PROPÓSITO — isso é a dívida/receivable do vendedor, nunca
 *    um prejuízo silenciosamente absorvido pela Nusali. `requestSellerPayout()`
 *    já rejeita qualquer novo saque enquanto o saldo disponível for insuficiente
 *    (inclusive negativo) — nenhum código novo foi necessário para "bloquear
 *    payout com dívida", é consequência direta da checagem que já existia.
 *
 * O que esta função explicitamente NÃO faz (fora do escopo desta fase):
 *  - não chama nenhuma API externa de gateway de pagamento para devolver o
 *    dinheiro ao comprador de verdade — isso é responsabilidade do provedor
 *    (Asaas etc.), fora do controle deste sistema; aqui só reconciliamos o
 *    estado interno (escrow/wallet/order) quando alguém (admin ou webhook) nos
 *    diz que um refund aconteceu ou deve acontecer;
 *  - não reverte comissão da Nusali como um valor de wallet real, porque a
 *    comissão nunca foi de fato creditada em nenhuma wallet real (achado já
 *    documentado na Fase "Escrow release") — não há saldo real para reverter;
 *    fica só como diagnóstico no ledger shadow (item 14 do pedido).
 */
export async function processRefund(input: ProcessRefundInput, executor?: any) {
  const runInTx = async (tx: any) => {
    // Fase C5.2-C — LOCK ORDER para child order de purchase_group: mesma
    // convenção já estabelecida na C4.1/C5.1 (group lock SEMPRE primeiro,
    // depois o order lock — nunca invertida, para nunca colidir em deadlock
    // com confirmPurchaseGroupPayment). purchaseGroupId é imutável depois da
    // criação do order (nunca reatribuído por nenhum código existente), então
    // esta leitura "peek" ANTES de qualquer lock é segura — só decide QUAL
    // lock adicional pegar, nunca decide nada financeiro.
    const [orderPeek] = await tx.select({ purchaseGroupId: orders.purchaseGroupId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (orderPeek?.purchaseGroupId) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderPeek.purchaseGroupId}))`);
    }

    // Auditoria de concorrência (correção do ACHADO CRÍTICO REAL "RELEASE x
    // REFUND"): processRefund usava SOMENTE `SELECT escrow_accounts ... FOR
    // UPDATE` para se proteger — um mecanismo de lock INDEPENDENTE do
    // pg_advisory_xact_lock(hashtext(orderId)) que releaseEscrowForOrder já
    // usava. Provado deterministicamente que os dois nunca se bloqueiam entre
    // si. Agora processRefund adquire o MESMO advisory lock, ANTES de decidir
    // qualquer coisa sobre o estado do escrow — release e refund do MESMO
    // pedido ficam serializados um atrás do outro, nunca mais concorrentes de
    // verdade. O `SELECT ... FOR UPDATE` abaixo é mantido como segunda camada
    // de proteção (defesa em profundidade), nunca removido. Legacy continua
    // usando EXATAMENTE esta mesma ordem (nenhum group lock é pego quando
    // orderPeek.purchaseGroupId é NULL) — comportamento 100% preservado.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`);

    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new RefundValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um retry/webhook duplicado não reverta o dinheiro duas vezes.');
    }

    // Idempotência primeiro: se já processamos este refund, devolve o estado
    // existente sem tocar em nenhum saldo de novo.
    const existing = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) {
      const r = existing[0];
      return {
        id: r.id, orderId: r.orderId, amount: Number(r.amount), currency: r.currency,
        status: r.status, sellerDebitAmount: r.sellerDebitAmount !== null ? Number(r.sellerDebitAmount) : null,
        alreadyProcessed: true,
      };
    }

    if (!input.amount || input.amount <= 0) {
      throw new RefundValidationError('INVALID_AMOUNT', 'Informe um valor de refund válido.');
    }

    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (orderRows.length === 0) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${input.orderId} não encontrado.`, 404);
    }
    const order = orderRows[0];

    if (input.amount > Number(order.totalAmount) + 0.005) {
      throw new RefundValidationError('REFUND_EXCEEDS_ORDER_TOTAL', `Valor do refund (${input.amount}) excede o total do pedido (${order.totalAmount}).`);
    }

    // Fase C5.2-C — BRANCH LEGACY vs GROUP CHILD. Legacy: query original,
    // inalterada. Group: reaproveita PaymentService.resolveFundingPaymentForOrder
    // (mesma função/mesmos checks já validados na C5.1 para release) — nunca
    // "qualquer payment do group", nunca surplus, nunca o primeiro por
    // createdAt. A allocation ACTIVE do child é o único vínculo aceito.
    let payment: typeof payments.$inferSelect;
    let groupAllocation: typeof paymentAllocations.$inferSelect | null = null;

    if (!order.purchaseGroupId) {
      const paymentRows = await tx.select().from(payments).where(eq(payments.orderId, order.id)).limit(1);
      if (paymentRows.length === 0) {
        throw new RefundValidationError('PAYMENT_NOT_FOUND', `Nenhum pagamento encontrado para o pedido ${order.id}.`, 404);
      }
      payment = paymentRows[0];
    } else {
      // resolveFundingPaymentForOrder já lança (fail closed) se: não houver
      // allocation ACTIVE (cobre tanto "nunca existiu" quanto "já foi
      // refunded por uma tentativa anterior com OUTRA idempotencyKey" —
      // seção 19: o refund anterior já teria deixado a allocation como
      // 'refunded', então esta query nunca a encontra de novo), se houver
      // mais de uma, se o payment não for primary/paid, ou se qualquer campo
      // de reconciliação divergir. Mensagens de erro ainda falam em
      // "liberação" (a função nasceu para release, C5.1) — funcionalmente
      // corretas para refund também, mas a redação é imprecisa neste
      // contexto (achado cosmético, não funcional, reportado como P2).
      const resolved = await PaymentService.resolveFundingPaymentForOrder(tx, order);
      payment = resolved.payment;
      groupAllocation = resolved.allocation!;

      // Fase C5.2-C, seção 3: SOMENTE refund TOTAL do child nesta fase.
      if (Math.abs(input.amount - Number(groupAllocation.amount)) > 0.005) {
        throw new RefundValidationError(
          'PURCHASE_GROUP_PARTIAL_REFUND_NOT_SUPPORTED',
          `Refund parcial de child order de purchase_group ainda não é suportado — valor solicitado (${input.amount}) precisa ser exatamente o total da allocation (${groupAllocation.amount}).`,
          400
        );
      }
      // Defensivo — já implícito por status='active' no resolver (uma
      // allocation 'active' nesta fase sempre tem refundedAmount=0, pois só
      // existe o caminho de refund total; nenhuma escrita parcial é criada
      // em nenhum lugar do sistema ainda).
      if (Number(groupAllocation.refundedAmount) !== 0 || groupAllocation.status !== 'active') {
        throw new RefundValidationError(
          'PURCHASE_GROUP_ALLOCATION_ALREADY_REFUNDED',
          `Allocation "${groupAllocation.id}" do pedido ${order.id} já foi refunded anteriormente.`,
          409
        );
      }
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Fase C5.2-D.5 — os efeitos econômicos (lock+validação de escrow,
    // branch held/eligible vs released, agregado allocation/PRIMARY/group)
    // agora vivem em `applyOrderRefundFinancialEffects`, extraído
    // byte-a-byte do que estava aqui — MESMO comportamento, MESMA ordem de
    // operações, MESMAS mensagens de erro. A única coisa que este chamador
    // (legacy) ainda faz sozinho é o INSERT da refund row logo abaixo — o
    // novo fluxo D.4/D.5 usa exatamente o mesmo helper, mas faz UPDATE numa
    // row já existente (nunca um segundo INSERT).
    const { sellerDebitAmount, currency } = await applyOrderRefundFinancialEffects(tx, {
      order, payment, groupAllocation,
      amount: input.amount, reason: input.reason, performedBy: input.performedBy,
      refundId, walletTxIdempotencyKey: idempotencyKey,
    });

    await tx.insert(refunds).values({
      id: refundId,
      paymentId: payment.id,
      orderId: order.id,
      purchaseGroupId: null,
      amount: String(input.amount.toFixed(2)),
      currency,
      reason: input.reason || null,
      status: 'processed',
      approvedBy: input.performedBy ?? null,
      sellerDebitAmount: sellerDebitAmount !== null ? String(sellerDebitAmount.toFixed(2)) : null,
      idempotencyKey,
      createdAt: new Date(),
    });

    return {
      id: refundId, orderId: order.id, amount: input.amount, currency,
      status: 'processed', sellerDebitAmount, alreadyProcessed: false,
    };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export interface ProcessSurplusRefundInput {
  paymentId: string;
  reason: string;
  idempotencyKey: string;
  performedBy?: string | null;
}

/**
 * Fase C5.2-C, seção 20 — refund LOCAL (sem chamada externa ao Asaas) de um
 * payment SURPLUS: dinheiro real recebido que nunca financiou nenhum child
 * order/allocation/escrow deste purchase_group (outra cobrança já era
 * primary quando este pagamento foi confirmado — ver Fase C4.1). Por isso
 * este fluxo é estruturalmente mais simples que processRefund: NUNCA toca
 * orders/escrow/wallet/payment_allocations, e NUNCA muda
 * purchase_groups.status (o group deriva seu status do PRIMARY, nunca do
 * surplus — seção 12/22).
 *
 * Path completamente separado de processRefund (não reaproveita a mesma
 * função) porque o input é fundamentalmente diferente: não existe orderId
 * nenhum para um surplus — só paymentId.
 */
export async function processSurplusRefund(input: ProcessSurplusRefundInput, executor?: any) {
  const runInTx = async (tx: any) => {
    // Peek do purchaseGroupId (imutável por payment) só para decidir o lock —
    // mesma razão de segurança do peek em processRefund.
    const [paymentPeek] = await tx.select({ purchaseGroupId: payments.purchaseGroupId }).from(payments).where(eq(payments.id, input.paymentId)).limit(1);
    if (!paymentPeek) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Payment "${input.paymentId}" não encontrado.`, 404);
    }
    if (!paymentPeek.purchaseGroupId) {
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${input.paymentId}" não pertence a nenhum purchase_group — não é um surplus (use processRefund para payments legacy/order).`, 400);
    }
    // Único lock necessário aqui: o do group — não existe order envolvido,
    // logo nenhum lock de orderId é adquirido (não há o que serializar).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${paymentPeek.purchaseGroupId}))`);

    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new RefundValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um retry/webhook duplicado não reverta o dinheiro duas vezes.');
    }

    const existing = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) {
      const r = existing[0];
      return {
        id: r.id, paymentId: r.paymentId, purchaseGroupId: r.purchaseGroupId, amount: Number(r.amount),
        currency: r.currency, status: r.status, alreadyProcessed: true,
      };
    }

    const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
    if (!payment) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Payment "${input.paymentId}" não encontrado.`, 404);
    }

    // Validações estruturais (seção 20) — FAIL CLOSED antes de qualquer escrita.
    if (payment.orderId !== null) {
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${payment.id}" possui orderId preenchido — pertence a um order (legacy ou child), não é um surplus. Use processRefund.`, 400);
    }
    if (payment.settlementRole !== 'surplus') {
      // Cobre tanto 'primary' (nunca refundável por este caminho — teria
      // que ser um refund de child via allocation) quanto 'candidate'
      // (nunca deveria chegar pago sem eleição).
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${payment.id}" tem settlementRole="${payment.settlementRole}" (esperado "surplus").`, 400);
    }
    if (payment.status !== 'paid') {
      // Também cobre o caso "já foi refunded por uma tentativa anterior com
      // OUTRA idempotencyKey" (seção 21) — o status já não é mais 'paid'.
      throw new RefundValidationError('PAYMENT_NOT_ELIGIBLE_FOR_REFUND', `Payment "${payment.id}" está com status="${payment.status}" (esperado "paid").`, 409);
    }

    // Defensivo (nunca deveria acontecer por construção — surplus nunca
    // ganha allocation, provado na Fase C4.1): um surplus com allocations
    // seria uma corrupção de dados grave, nunca tratado silenciosamente.
    const existingAllocations = await tx.select({ id: paymentAllocations.id }).from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id)).limit(1);
    if (existingAllocations.length > 0) {
      throw new RefundValidationError('PURCHASE_GROUP_SURPLUS_HAS_ALLOCATIONS', `Payment "${payment.id}" está marcado surplus mas possui payment_allocations — estado inconsistente, refund recusado.`, 409);
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // ÚNICA escrita financeira: o próprio payment. Nada mais é tocado —
    // nenhum order, allocation, escrow ou wallet, e purchase_groups.status
    // NUNCA muda por causa de um surplus (ele deriva do PRIMARY). Extraída
    // em `applySurplusRefundFinancialEffects` (Fase C5.2-D.5) — reaproveitada
    // pelo novo fluxo, que faz UPDATE na refund já existente em vez de INSERT.
    await applySurplusRefundFinancialEffects(tx, payment);

    await tx.insert(refunds).values({
      id: refundId,
      paymentId: payment.id,
      orderId: null,
      purchaseGroupId: payment.purchaseGroupId,
      amount: payment.amount,
      currency: payment.currency,
      reason: input.reason || null,
      status: 'processed',
      approvedBy: input.performedBy ?? null,
      sellerDebitAmount: null,
      idempotencyKey,
      createdAt: new Date(),
    });

    return {
      id: refundId, paymentId: payment.id, purchaseGroupId: payment.purchaseGroupId,
      amount: Number(payment.amount), currency: payment.currency, status: 'processed', alreadyProcessed: false,
    };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

// ============================================================================
// FASE C5.2-D.4 — RESERVATION + EXTERNAL SUBMISSION (fluxo provider-managed)
// ============================================================================
//
// `processRefund`/`processSurplusRefund` acima (Fase C5.2-C) continuam sendo
// o ENGINE DE FINALIZAÇÃO — nenhuma linha deles foi tocada, nenhuma
// invariante enfraquecida. A partir daqui, um fluxo NOVO e SEPARADO, restrito
// exclusivamente a:
//   A) refund de child order de purchase_group (`reserveOrderRefund`);
//   B) refund de payment surplus (`reserveSurplusRefund`);
// nunca ao refund legacy (order sem purchaseGroupId) — esse continua
// exclusivamente via `processRefund()`, chamado por `resolveDispute()`
// (dispute BUYER_WIN) e pelo webhook `PAYMENT_REFUNDED` (asaasWebhookService.ts),
// nenhum dos dois alterado nesta fase (auditoria completa no relatório D.4).
//
// Três fases estritamente separadas, cada uma sua própria transação Postgres
// curta — a chamada ao provider externo NUNCA roda com transação/advisory
// lock aberto (mesmo princípio já estabelecido na C3.1 para
// `initiatePurchaseGroupPayment`):
//
//   1. reserve*Refund      — cria a refund row com status='pending' e
//                            providerCorrelationKey já gerada. COMMIT.
//   2. submitReservedRefund — CAS pending->provider_pending (transação curta,
//                            decide quem tem direito de fazer o POST) + COMMIT
//                            + chamada HTTP ao provider (fora de transação) +
//                            persistRefundProviderOutcome (transação curta
//                            separada, só evidência/status).
//
// NENHUMA linha aqui escreve em escrow_accounts/escrow_transactions/wallets/
// wallet_transactions/payment_allocations(refundedAmount|status)/orders
// (status|escrowStatus)/payments(status, agregado do PRIMARY)/purchase_groups
// (status) — essa é a invariante central da D.4, provada exaustivamente na
// suíte de testes (bloco FINANCIAL INERTNESS). A finalização econômica real
// (ler providerStatus='DONE' num refund 'provider_pending' e SÓ ENTÃO acionar
// o equivalente do que `processRefund`/`processSurplusRefund` já sabem fazer)
// é escopo da Fase C5.2-D.5, ainda não implementada.

/** Mesmos 3 estados "ativos/bloqueantes" já fixados no desenho da unique
 * parcial da Fase C5.2-D.2 (`refunds_child_active_reservation_uq`/
 * `refunds_surplus_active_reservation_uq`) — reaproveitado aqui como a MESMA
 * lista, nunca redefinida com nomes diferentes em dois lugares do código. */
const ACTIVE_RESERVATION_STATUSES = ['pending', 'provider_pending', 'ambiguous_timeout'] as const;

/**
 * Resolver mínimo e explícito (seção 27 do pedido) — nunca
 * `new AsaasPaymentProvider()` incondicionalmente para qualquer refund,
 * independente de qual provider realmente financiou o payment. Hoje só
 * 'asaas' tem implementação real; qualquer outro provider (pix_engine,
 * orange_money, mtn, stripe, nusali_pay — todos valores já aceitos em
 * `payments.provider`, ver schema.ts) falha fechado e explícito, sem
 * inventar um comportamento de refund que não existe.
 */
export function resolvePaymentProviderForRefund(providerName: string): PaymentProvider {
  if (providerName === 'asaas') return new AsaasPaymentProvider();
  const err: any = new Error(
    `PROVIDER_REFUND_NOT_IMPLEMENTED: refund externo para o provider "${providerName}" ainda não foi implementado — nenhuma chamada externa foi feita.`
  );
  err.code = 'PROVIDER_REFUND_NOT_IMPLEMENTED';
  err.status = 501;
  throw err;
}

export interface ReserveOrderRefundInput {
  orderId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
  performedBy?: string | null;
}

/**
 * Fase C5.2-D.4, seção 3 — reserva local (transação curta, sem nenhuma
 * chamada externa) de um refund PROVIDER-MANAGED para child order de
 * purchase_group. EXCLUSIVO para child orders — refund legacy (order sem
 * purchaseGroupId) continua via `processRefund()`, nunca aqui (seção 2 do
 * pedido: "não forçar legacy histórico para Asaas sem desenho específico").
 *
 * Ao final desta função: existe uma linha em `refunds` com status='pending'
 * e providerCorrelationKey já gerada — e SÓ ISSO. Nenhum escrow/wallet/
 * allocation/order/payment/purchase_group foi tocado.
 */
export async function reserveOrderRefund(input: ReserveOrderRefundInput, executor?: any) {
  const runInTx = async (tx: any) => {
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new RefundValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um retry/webhook duplicado não crie duas reservas.');
    }
    if (!input.amount || input.amount <= 0) {
      throw new RefundValidationError('INVALID_AMOUNT', 'Informe um valor de refund válido.');
    }

    // 1. Peek — existência + purchaseGroupId. Decide o lock E valida escopo
    // (reserveOrderRefund é EXCLUSIVO para child order) ANTES de adquirir
    // qualquer advisory lock.
    const [orderPeek] = await tx.select({ purchaseGroupId: orders.purchaseGroupId }).from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!orderPeek) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${input.orderId} não encontrado.`, 404);
    }
    if (!orderPeek.purchaseGroupId) {
      throw new RefundValidationError(
        'RESERVE_ORDER_REFUND_REQUIRES_GROUP_CHILD',
        `Pedido ${input.orderId} não pertence a um purchase_group — reserveOrderRefund() é exclusivo para child orders do novo fluxo provider-managed. Refund legacy usa processRefund().`,
        400
      );
    }

    // 2/3. Lock GROUP primeiro, ORDER depois — MESMA ordem já estabelecida
    // em processRefund/confirmPurchaseGroupPayment (C4.1/C5.1/C5.2-C), nunca
    // invertida (evita deadlock cruzado com as outras operações que já
    // seguem esta convenção).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderPeek.purchaseGroupId}))`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`);

    // 4. Idempotency lookup — retorna a MESMA row, nunca cria outra. Não
    // decide NADA sobre reenvio de POST (isso é submitReservedRefund/CAS).
    const existing = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) {
      return { ...existing[0], alreadyReserved: true };
    }

    // 5. Carrega o order completo.
    const [order] = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    if (!order) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${input.orderId} não encontrado.`, 404);
    }

    // 6. resolveFundingPaymentForOrder — MESMA função/mesmos checks já
    // validados em C5.1/C5.2-C (owner, role=primary, status=paid,
    // currency/amount de reconciliação) — nunca duplicados aqui.
    const resolved = await PaymentService.resolveFundingPaymentForOrder(tx, order);
    const fundingPayment = resolved.payment;
    const allocation = resolved.allocation!;

    // 7. Allocation ativa — resolveFundingPaymentForOrder já garante status
    // 'active' (senão não a teria retornado), reforçado aqui explicitamente
    // por clareza/defesa em profundidade (mesmo padrão de processRefund).
    if (Number(allocation.refundedAmount) !== 0 || allocation.status !== 'active') {
      throw new RefundValidationError(
        'PURCHASE_GROUP_ALLOCATION_ALREADY_REFUNDED',
        `Allocation "${allocation.id}" do pedido ${order.id} já foi refunded anteriormente.`,
        409
      );
    }
    // 8/9. Payment PRIMARY + status='paid' — resolveFundingPaymentForOrder já
    // lança se não for; reforçado aqui por clareza (seção 3, itens 8-9).
    if (fundingPayment.settlementRole !== 'primary' || fundingPayment.status !== 'paid') {
      throw new RefundValidationError(
        'PURCHASE_GROUP_PAYMENT_NOT_ELIGIBLE',
        `Payment financiador "${fundingPayment.id}" não está elegível (settlementRole="${fundingPayment.settlementRole}", status="${fundingPayment.status}").`,
        409
      );
    }

    // 10. Full-refund-only — MESMA tolerância (0.005) já usada por
    // processRefund/schema (nunca uma tolerância nova inventada aqui).
    if (Math.abs(input.amount - Number(allocation.amount)) > 0.005) {
      throw new RefundValidationError(
        'PURCHASE_GROUP_PARTIAL_REFUND_NOT_SUPPORTED',
        `Refund parcial de child order de purchase_group ainda não é suportado — valor solicitado (${input.amount}) precisa ser exatamente o total da allocation (${allocation.amount}).`,
        400
      );
    }

    // 11. ACTIVE RESERVATION GUARD — SELECT explícito (seção 5 do pedido).
    // O advisory lock do orderId já serializa qualquer tentativa concorrente
    // para o MESMO order (nenhum FOR UPDATE adicional é necessário aqui —
    // duas transações nunca chegam a este ponto ao mesmo tempo para o mesmo
    // orderId), mas o guard em si é uma camada EXPLÍCITA e semântica, não
    // apenas a unique parcial da D.2 (que é defesa em profundidade, nunca a
    // substitui — seção 5: "A constraint é defesa em profundidade, não
    // substitui o guard").
    const activeReservation = await tx.select({ id: refunds.id }).from(refunds).where(and(
      eq(refunds.orderId, order.id),
      isNotNull(refunds.providerCorrelationKey),
      inArray(refunds.status, ACTIVE_RESERVATION_STATUSES as unknown as string[])
    )).limit(1);
    if (activeReservation.length > 0) {
      throw new RefundValidationError(
        'ACTIVE_RESERVATION_EXISTS',
        `Já existe uma reserva de refund ativa (id="${activeReservation[0].id}") para o pedido ${order.id} — aguarde a conclusão/reconciliação antes de criar outra.`,
        409
      );
    }

    // 12. Cria o refund local. O id PRECISA existir ANTES da correlationKey
    // (seção 4 do pedido) — a correlationKey é SEMPRE gerada pelo backend,
    // NUNCA aceita/confiada de um valor enviado pelo chamador.
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const providerCorrelationKey = `NUSALI_REFUND:${refundId}`;

    const [inserted] = await tx.insert(refunds).values({
      id: refundId,
      paymentId: fundingPayment.id,
      orderId: order.id,
      purchaseGroupId: null,
      amount: String(input.amount.toFixed(2)),
      currency: order.currency,
      reason: input.reason || null,
      status: 'pending',
      approvedBy: input.performedBy ?? null,
      sellerDebitAmount: null,
      idempotencyKey,
      provider: fundingPayment.provider,
      providerCorrelationKey,
      providerStatus: null,
      providerRequestedAt: null,
      providerConfirmedAt: null,
      providerRawResponse: null,
      lastError: null,
      createdAt: new Date(),
    }).returning();

    return { ...inserted, alreadyReserved: false };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export interface ReserveSurplusRefundInput {
  paymentId: string;
  reason: string;
  idempotencyKey: string;
  performedBy?: string | null;
}

/**
 * Fase C5.2-D.4, seção 7 — equivalente de `reserveOrderRefund` para payment
 * SURPLUS. Nunca aceita `amount` do chamador (mesma convenção já usada por
 * `processSurplusRefund`): surplus é SEMPRE refund total, o valor é sempre
 * `payment.amount` — não há o que comparar/validar contra um input externo,
 * "full-refund-only" é garantido estruturalmente pela própria ausência de um
 * campo de amount na entrada, nunca por uma checagem que poderia ser burlada.
 * Só GROUP lock (nunca existe order lock — surplus nunca tem order).
 */
export async function reserveSurplusRefund(input: ReserveSurplusRefundInput, executor?: any) {
  const runInTx = async (tx: any) => {
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey.trim() : '';
    if (!idempotencyKey) {
      throw new RefundValidationError('IDEMPOTENCY_KEY_REQUIRED', 'Informe idempotencyKey — necessária para que um retry/webhook duplicado não crie duas reservas.');
    }

    const [paymentPeek] = await tx.select({ purchaseGroupId: payments.purchaseGroupId }).from(payments).where(eq(payments.id, input.paymentId)).limit(1);
    if (!paymentPeek) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Payment "${input.paymentId}" não encontrado.`, 404);
    }
    if (!paymentPeek.purchaseGroupId) {
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${input.paymentId}" não pertence a nenhum purchase_group — não é um surplus (use processRefund/reserveOrderRefund para payments legacy/order).`, 400);
    }

    // GROUP lock — não há order lock (surplus nunca financia nenhum order).
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${paymentPeek.purchaseGroupId}))`);

    const existing = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
    if (existing.length > 0) {
      return { ...existing[0], alreadyReserved: true };
    }

    const [payment] = await tx.select().from(payments).where(eq(payments.id, input.paymentId)).limit(1);
    if (!payment) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Payment "${input.paymentId}" não encontrado.`, 404);
    }
    if (payment.orderId !== null) {
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${payment.id}" possui orderId preenchido — pertence a um order (legacy ou child), não é um surplus.`, 400);
    }
    if (payment.settlementRole !== 'surplus') {
      throw new RefundValidationError('PAYMENT_NOT_SURPLUS', `Payment "${payment.id}" tem settlementRole="${payment.settlementRole}" (esperado "surplus").`, 400);
    }
    if (payment.status !== 'paid') {
      throw new RefundValidationError('PAYMENT_NOT_ELIGIBLE_FOR_REFUND', `Payment "${payment.id}" está com status="${payment.status}" (esperado "paid").`, 409);
    }

    // Defensivo (nunca deveria acontecer por construção — surplus nunca
    // ganha allocation, provado na C4.1): mesmo guard já usado por
    // processSurplusRefund, reaproveitado aqui sem duplicar a lógica de negócio.
    const existingAllocations = await tx.select({ id: paymentAllocations.id }).from(paymentAllocations).where(eq(paymentAllocations.paymentId, payment.id)).limit(1);
    if (existingAllocations.length > 0) {
      throw new RefundValidationError('PURCHASE_GROUP_SURPLUS_HAS_ALLOCATIONS', `Payment "${payment.id}" está marcado surplus mas possui payment_allocations — estado inconsistente, refund recusado.`, 409);
    }

    // ACTIVE RESERVATION GUARD (seção 8 do pedido).
    const activeReservation = await tx.select({ id: refunds.id }).from(refunds).where(and(
      eq(refunds.paymentId, payment.id),
      isNull(refunds.orderId),
      eq(refunds.purchaseGroupId, payment.purchaseGroupId!),
      isNotNull(refunds.providerCorrelationKey),
      inArray(refunds.status, ACTIVE_RESERVATION_STATUSES as unknown as string[])
    )).limit(1);
    if (activeReservation.length > 0) {
      throw new RefundValidationError(
        'ACTIVE_RESERVATION_EXISTS',
        `Já existe uma reserva de refund ativa (id="${activeReservation[0].id}") para o payment surplus ${payment.id} — aguarde a conclusão/reconciliação antes de criar outra.`,
        409
      );
    }

    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const providerCorrelationKey = `NUSALI_REFUND:${refundId}`;

    const [inserted] = await tx.insert(refunds).values({
      id: refundId,
      paymentId: payment.id,
      orderId: null,
      purchaseGroupId: payment.purchaseGroupId,
      amount: payment.amount,
      currency: payment.currency,
      reason: input.reason || null,
      status: 'pending',
      approvedBy: input.performedBy ?? null,
      sellerDebitAmount: null,
      idempotencyKey,
      provider: payment.provider,
      providerCorrelationKey,
      providerStatus: null,
      providerRequestedAt: null,
      providerConfirmedAt: null,
      providerRawResponse: null,
      lastError: null,
      createdAt: new Date(),
    }).returning();

    return { ...inserted, alreadyReserved: false };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export interface SubmitReservedRefundResult {
  refundId: string;
  /** 'SKIPPED_NOT_FIRST_SENDER': o CAS não foi ganho por ESTA chamada
   * (refund já não estava 'pending') — NENHUM POST foi feito por esta
   * invocação. Nos demais casos, espelha `RefundGatewayOutcome['outcome']`. */
  outcome: 'SKIPPED_NOT_FIRST_SENDER' | RefundGatewayOutcome['outcome'];
  localStatus: string;
  providerStatus: string | null;
}

/**
 * Fase C5.2-D.4, seção 9 — orquestrador de submissão externa. NUNCA finaliza
 * nada financeiramente (isso é escopo da D.5). Três fases, cada uma sua
 * própria transação curta:
 *
 *  FASE 1 (transação curta) — CAS `pending` -> `provider_pending` (seção 10):
 *    só quem ganha este UPDATE (rowCount=1) tem direito de chamar o
 *    provider. Isso é a ÚNICA autoridade sobre "quem faz o POST" — nenhuma
 *    outra sincronização é necessária, mesmo com múltiplos callers
 *    concorrentes para a MESMA refund row. COMMIT antes de qualquer rede.
 *
 *  FASE 2 (SEM transação/lock Postgres aberto) — provider.refundPayment(...).
 *    Se esta chamada nunca retornar (crash do processo, timeout do próprio
 *    processo, etc.) o refund fica preso em 'provider_pending' com
 *    providerRawResponse ainda NULL — o mesmo estado documentado na seção 11
 *    do pedido ("crash após CAS, antes do POST"): nunca resolvido com um novo
 *    POST cego; a Fase C5.2-D.5 precisará reconciliar via GET + correlationKey.
 *
 *  FASE 3 (transação curta separada) — persistRefundProviderOutcome: só
 *    grava evidência/status: NUNCA escrow/wallet/allocation/order/payment
 *    agregado/purchase_group.
 *
 * Se a FASE 3 falhar (ex.: DB indisponível) DEPOIS de a FASE 2 já ter
 * completado com sucesso, a exceção propaga sem nenhum novo POST ser
 * tentado — o refund permanece 'provider_pending' (da FASE 1), reconciliável
 * por providerCorrelationKey + GET (seção 28 do pedido, testado na suíte).
 */
export async function submitReservedRefund(refundId: string): Promise<SubmitReservedRefundResult> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  // FASE 1 — CAS. Nenhuma chamada de rede acontece dentro desta transação.
  const cas = await db.transaction(async (tx: any) => {
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!refund) {
      throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado.`, 404);
    }
    if (refund.status !== 'pending') {
      // Não é a primeira tentativa (já provider_pending/ambiguous_timeout/
      // processed/failed) — NUNCA um novo POST é disparado aqui (seções 6/18).
      return { won: false as const, refund, fundingPayment: null };
    }

    // Resolve o provider ANTES de qualquer transição de estado. Se o
    // provider do payment financiador não tem implementação real
    // (`resolvePaymentProviderForRefund` lança PROVIDER_REFUND_NOT_IMPLEMENTED),
    // a transação INTEIRA aborta aqui — o refund permanece 'pending', nunca
    // fica preso em 'provider_pending' para uma tentativa que nunca chegou a
    // ser feita de verdade. Isso é uma falha DIFERENTE da ambiguidade
    // legítima de rede/5xx (seção 16): aqui sabemos com certeza que nenhuma
    // chamada externa foi tentada, então não há nada a reconciliar via GET —
    // basta corrigir o provider e chamar submitReservedRefund de novo.
    const provider = resolvePaymentProviderForRefund(refund.provider);

    const updated = await tx.update(refunds)
      .set({ status: 'provider_pending', providerRequestedAt: new Date() })
      .where(and(eq(refunds.id, refundId), eq(refunds.status, 'pending')))
      .returning();

    if (updated.length === 0) {
      // Outro caller ganhou a corrida entre nosso SELECT e nosso UPDATE.
      const [after] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
      return { won: false as const, refund: after, fundingPayment: null };
    }

    // Lido NA MESMA transação curta — payments.transactionRef nunca muda
    // depois de criado (write-once), então usá-lo depois do COMMIT (fase 2)
    // é seguro, sem risco de leitura obsoleta.
    const [fundingPayment] = await tx.select().from(payments).where(eq(payments.id, updated[0].paymentId)).limit(1);
    return { won: true as const, refund: updated[0], fundingPayment, provider };
  });

  if (!cas.won) {
    return {
      refundId,
      outcome: 'SKIPPED_NOT_FIRST_SENDER',
      localStatus: cas.refund.status,
      providerStatus: cas.refund.providerStatus,
    };
  }

  const refund = cas.refund;
  const fundingPayment = cas.fundingPayment;

  // Corrupção estrutural (nunca deveria acontecer — FK restrict garante que
  // paymentId sempre aponta para uma linha existente) — falha fechada SEM
  // chamar o provider.
  if (!fundingPayment) {
    await db.transaction(async (tx: any) => {
      await tx.update(refunds).set({
        status: 'failed',
        lastError: `REFUND_FUNDING_PAYMENT_NOT_FOUND: payment "${refund.paymentId}" não encontrado para o refund "${refundId}".`,
      }).where(eq(refunds.id, refundId));
    });
    return { refundId, outcome: 'DEFINITIVE_FAILURE', localStatus: 'failed', providerStatus: null };
  }
  if (!fundingPayment.transactionRef) {
    await db.transaction(async (tx: any) => {
      await tx.update(refunds).set({
        status: 'failed',
        lastError: `REFUND_FUNDING_PAYMENT_MISSING_TRANSACTION_REF: payment "${fundingPayment.id}" não possui transactionRef.`,
      }).where(eq(refunds.id, refundId));
    });
    return { refundId, outcome: 'DEFINITIVE_FAILURE', localStatus: 'failed', providerStatus: null };
  }

  // FASE 2 — chamada externa, SEM transação/lock Postgres aberto. Se isto
  // lançar (ex.: bug de validação local no provider, que nunca deveria
  // acontecer pois já validamos tudo na reserva; ou o processo travar/cair
  // no meio da chamada), a exceção propaga sem nenhuma persistência — o
  // refund fica em 'provider_pending' com providerRawResponse ainda NULL,
  // exatamente o estado "crash após CAS, antes do POST" documentado na
  // seção 11 do pedido. `provider` já foi resolvido DENTRO da transação do
  // CAS (nunca depois) — ver comentário acima.
  const provider = cas.provider;
  const outcome: RefundGatewayOutcome = await provider.refundPayment({
    transactionRef: fundingPayment.transactionRef,
    amount: Number(refund.amount),
    correlationKey: refund.providerCorrelationKey,
  });

  // FASE 3 — transação curta separada, só evidência/status.
  await persistRefundProviderOutcome(refundId, outcome);

  const providerStatus = outcome.outcome === 'SUBMITTED' ? outcome.providerStatus : null;
  const localStatus =
    outcome.outcome === 'SUBMITTED' && outcome.providerStatus === 'CANCELLED' ? 'failed'
    : outcome.outcome === 'DEFINITIVE_FAILURE' ? 'failed'
    : outcome.outcome === 'AMBIGUOUS_EXTERNAL_RESULT' ? 'ambiguous_timeout'
    : outcome.outcome === 'RESPONSE_CORRELATION_FAILURE' ? 'ambiguous_timeout'
    : 'provider_pending'; // SUBMITTED/PENDING ou SUBMITTED/DONE — nunca finalizado aqui.

  return { refundId, outcome: outcome.outcome, localStatus, providerStatus };
}

/**
 * Fase C5.2-D.4 — grava a evidência/estado de UM `RefundGatewayOutcome` numa
 * refund row já reservada/submetida. Exportada (não interna a
 * `submitReservedRefund`) porque a MESMA classificação (seções 12-17 do
 * pedido) será reaproveitada pela Fase C5.2-D.5 quando a evidência vier de
 * uma reconciliação via GET, não só do retorno síncrono da POST — nunca
 * duplicar esta lógica de classificação em dois lugares.
 *
 * NUNCA toca escrow/wallet/allocation/order/payment agregado/purchase_group
 * — só as colunas de evidência/status da própria refund row.
 */
export async function persistRefundProviderOutcome(refundId: string, outcome: RefundGatewayOutcome, executor?: any): Promise<void> {
  const runInTx = async (tx: any) => {
    switch (outcome.outcome) {
      case 'SUBMITTED': {
        if (outcome.providerStatus === 'DONE') {
          // Seção 13 — persiste evidência, NUNCA finaliza. status permanece
          // 'provider_pending' DE PROPÓSITO: D.5 decide finalizar ao
          // encontrar providerStatus='DONE' num refund ainda não-terminal.
          await tx.update(refunds).set({
            providerStatus: 'DONE',
            providerRawResponse: outcome.rawEvidence,
            providerConfirmedAt: new Date(),
            lastError: null,
          }).where(eq(refunds.id, refundId));
        } else if (outcome.providerStatus === 'CANCELLED') {
          // Seção 14 — CANCELLED = valor NÃO devolvido; status vira
          // 'failed' (terminal local) para liberar uma futura nova reserva
          // (active-reservation guard/unique só bloqueiam pending/
          // provider_pending/ambiguous_timeout).
          await tx.update(refunds).set({
            status: 'failed',
            providerStatus: 'CANCELLED',
            providerRawResponse: outcome.rawEvidence,
            lastError: 'ASAAS_REFUND_CANCELLED: o provedor cancelou o estorno — nenhum valor foi devolvido.',
          }).where(eq(refunds.id, refundId));
        } else if (outcome.providerStatus === 'PENDING') {
          // Seção 12.
          await tx.update(refunds).set({
            status: 'provider_pending',
            providerStatus: 'PENDING',
            providerRawResponse: outcome.rawEvidence,
            lastError: null,
          }).where(eq(refunds.id, refundId));
        } else {
          // Enum fechado (PENDING|CANCELLED|DONE, auditoria D.1) — um valor
          // fora desses três nunca deveria chegar aqui. Fail closed: trata
          // como ambíguo, nunca finaliza, nunca inventa semântica nova.
          await tx.update(refunds).set({
            status: 'ambiguous_timeout',
            providerStatus: outcome.providerStatus,
            providerRawResponse: outcome.rawEvidence,
            lastError: `UNKNOWN_PROVIDER_STATUS: valor "${outcome.providerStatus}" fora do enum documentado (PENDING|CANCELLED|DONE).`,
          }).where(eq(refunds.id, refundId));
        }
        break;
      }
      case 'DEFINITIVE_FAILURE': {
        // Seção 15 — nenhuma alteração financeira; 'failed' deixa de
        // bloquear nova reservation.
        await tx.update(refunds).set({
          status: 'failed',
          lastError: `DEFINITIVE_FAILURE[${outcome.httpStatus}] ${outcome.code}: ${outcome.message}`,
        }).where(eq(refunds.id, refundId));
        break;
      }
      case 'AMBIGUOUS_EXTERNAL_RESULT': {
        // Seção 16 — NUNCA repete POST, NUNCA marca failed, NUNCA libera a
        // reserva, NUNCA finaliza. D.5 fará GET + reconciliação.
        await tx.update(refunds).set({
          status: 'ambiguous_timeout',
          lastError: `AMBIGUOUS_EXTERNAL_RESULT ${outcome.code}: ${outcome.message}`,
        }).where(eq(refunds.id, refundId));
        break;
      }
      case 'RESPONSE_CORRELATION_FAILURE': {
        // Seção 17 — HTTP 200 chegou (a chamada alcançou o Asaas) mas não
        // foi possível identificar com segurança qual item é o nosso.
        // `evidence` (quando não-null) já vem sanitizada pelo provider
        // (whitelist de 7 campos, nunca headers/API key) — seguro persistir.
        await tx.update(refunds).set({
          status: 'ambiguous_timeout',
          providerRawResponse: outcome.evidence ?? null,
          lastError: `RESPONSE_CORRELATION_FAILURE: ${outcome.reason}`,
        }).where(eq(refunds.id, refundId));
        break;
      }
    }
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  await db.transaction(runInTx);
}

// ============================================================================
// FASE C5.2-D.5 — RECONCILIATION + FINALIZAÇÃO LOCAL EXACTLY-ONCE
// ============================================================================
//
// A partir daqui, o refund reservado/submetido pela D.4 (status
// 'provider_pending' ou 'ambiguous_timeout') é reconciliado com o estado
// REAL do provider (via GET, nunca POST — `submitReservedRefund`/
// `refundPayment` NUNCA são chamados por nenhuma função abaixo) e, quando
// (e só quando) o provider confirma DONE, os MESMOS efeitos econômicos do
// engine C5.2-C (`applyOrderRefundFinancialEffects`/
// `applySurplusRefundFinancialEffects`, extraídos acima) são aplicados —
// numa UPDATE da PRÓPRIA refund row já existente, NUNCA um novo INSERT.

// Fase C5.2-D.6 — exportada (era module-private) para que
// asaasWebhookService.ts possa usar a MESMA lista ao descobrir quais
// refunds locais são elegíveis para reconciliação a partir de um evento
// agregado — nunca duplicar esta lista em dois arquivos (risco de drift).
// Nenhuma mudança de valor/comportamento, só de visibilidade.
export const ASAAS_RECONCILIABLE_LOCAL_STATUSES = ['provider_pending', 'ambiguous_timeout'] as const;

export interface ReconcileReservedRefundResult {
  refundId: string;
  outcome:
    | 'ALREADY_TERMINAL_PROCESSED'
    | 'ALREADY_TERMINAL_FAILED'
    | 'FINALIZED'
    | 'STILL_PROVIDER_PENDING'
    | 'STILL_AMBIGUOUS_NOT_FOUND'
    | 'STILL_AMBIGUOUS_MULTIPLE_MATCHES'
    | 'STILL_AMBIGUOUS_AMOUNT_MISMATCH'
    | 'STILL_AMBIGUOUS_GET_ERROR'
    | 'CANCELLED'
    | 'PROVIDER_NOT_IMPLEMENTED';
  localStatus: string;
  providerStatus: string | null;
}

/** UPDATE simples de evidência/status — nunca toca escrow/wallet/allocation/
 * order/payment agregado/purchase_group. Usado pelos ramos de reconciliação
 * que NÃO finalizam (PENDING/CANCELLED/0-matches/>1-matches/amount-mismatch/
 * GET error). Transação curta e isolada, própria — nunca a mesma transação
 * de uma eventual finalização (que só ocorre em `finalizeReservedOrderRefund`/
 * `finalizeReservedSurplusRefund`). */
async function persistReconciliationEvidence(refundId: string, fields: {
  status: 'provider_pending' | 'ambiguous_timeout' | 'failed';
  providerStatus?: string | null;
  providerRawResponse?: unknown;
  lastError: string | null;
}): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  await db.transaction(async (tx: any) => {
    const values: any = { status: fields.status, lastError: fields.lastError };
    if (fields.providerStatus !== undefined) values.providerStatus = fields.providerStatus;
    if (fields.providerRawResponse !== undefined) values.providerRawResponse = fields.providerRawResponse;
    await tx.update(refunds).set(values).where(eq(refunds.id, refundId));
  });
}

/**
 * Fase C5.2-D.5, seção 4 — ENTRY POINT de reconciliação. NUNCA chama
 * `provider.refundPayment()` (prova estrutural: nenhuma referência a esse
 * método existe em todo este bloco, confirmável por grep/monkey-patch —
 * seção 41 do pedido). Faz NO MÁXIMO uma operação `listAllRefunds` por
 * invocação (que internamente pode paginar, nunca um loop de polling).
 *
 *   A. carrega refund;                              (abaixo)
 *   B. resolve payment/provider;                     (abaixo, fail closed se não-Asaas)
 *   C. nunca POST;                                   (garantido estruturalmente)
 *   D. GET só quando necessário (nunca se já processed/failed/DONE local);
 *   E. correlaciona por providerCorrelationKey;       (findRefundByCorrelation)
 *   F. valida amount;                                 (idem, tolerância ASAAS_AMOUNT_TOLERANCE)
 *   G. persiste último status/evidence;                (persistReconciliationEvidence)
 *   H. finaliza SOMENTE se DONE.                       (finalizeReservedOrderRefund/Surplus)
 */
export async function reconcileReservedRefund(refundId: string): Promise<ReconcileReservedRefundResult> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  const [refund] = await db.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
  if (!refund) {
    throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado.`, 404);
  }

  // Seção 37 — processed: curto-circuito total. ZERO GET, ZERO POST, ZERO
  // escrita no banco (nem sequer a leitura acima conta como "efeito").
  if (refund.status === 'processed') {
    return { refundId, outcome: 'ALREADY_TERMINAL_PROCESSED', localStatus: 'processed', providerStatus: refund.providerStatus };
  }
  // Seção 38 — failed: terminal. ZERO GET automático, ZERO POST. Nova
  // tentativa exige nova refund row (nova idempotencyKey via reserve*Refund).
  if (refund.status === 'failed') {
    return { refundId, outcome: 'ALREADY_TERMINAL_FAILED', localStatus: 'failed', providerStatus: refund.providerStatus };
  }
  // Seção 5 — só reconcilia provider_pending/ambiguous_timeout. Qualquer
  // outro status (ex.: 'pending' — nunca deveria chegar aqui pelo desenho
  // atual, já que o CAS da D.4 sempre transiciona pending->provider_pending
  // antes de qualquer chamada externa) é fail closed, nunca tratado como
  // "seguro reconciliar".
  if (!ASAAS_RECONCILIABLE_LOCAL_STATUSES.includes(refund.status as any)) {
    throw new RefundValidationError('REFUND_NOT_RECONCILIABLE', `Refund "${refundId}" está em status="${refund.status}" — reconciliação não se aplica.`, 409);
  }

  // Seção 6, OPÇÃO A — evidência DONE já persistida pela própria POST da D.4
  // (`providerStatus='DONE'` + `providerRawResponse` preenchido) NÃO precisa
  // de um GET adicional: a POST já entregou o refund individual
  // correlacionado e sanitizado. Revalidamos description===correlationKey e
  // amount localmente antes de confiar nela (nunca cegamente) — só então
  // finalizamos. Se por algum motivo a evidência local não bater mais
  // (nunca deveria acontecer — dado imutável), caímos para o fluxo de GET
  // normal abaixo em vez de finalizar com uma evidência suspeita.
  if (refund.providerStatus === 'DONE' && refund.providerRawResponse) {
    const evidence = refund.providerRawResponse as AsaasRefund;
    const localCorrelation = findRefundByCorrelation([evidence], refund.providerCorrelationKey!, Number(refund.amount));
    if (localCorrelation.status === 'FOUND') {
      return finalizeReservedRefundFromEvidence(refund, localCorrelation.refund);
    }
  }

  // Resolve o provider — fail closed SEM nenhum GET se não implementado
  // (seção 33). Nenhuma entidade financeira é alterada; o refund permanece
  // exatamente como estava, reconciliável manualmente/quando o provider for
  // implementado.
  let provider: PaymentProvider;
  try {
    provider = resolvePaymentProviderForRefund(refund.provider);
  } catch {
    return { refundId, outcome: 'PROVIDER_NOT_IMPLEMENTED', localStatus: refund.status, providerStatus: refund.providerStatus };
  }
  if (!(provider instanceof AsaasPaymentProvider)) {
    // Estruturalmente inalcançável hoje (o resolver só retorna
    // AsaasPaymentProvider ou lança) — defensivo, nunca finaliza às cegas.
    return { refundId, outcome: 'PROVIDER_NOT_IMPLEMENTED', localStatus: refund.status, providerStatus: refund.providerStatus };
  }

  const [fundingPayment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
  if (!fundingPayment || !fundingPayment.transactionRef) {
    // Corrupção estrutural (nunca deveria acontecer — FK restrict) — mantém
    // ambíguo/reconciliável, nunca finaliza, nunca marca failed às cegas.
    await persistReconciliationEvidence(refundId, {
      status: 'ambiguous_timeout',
      lastError: 'REFUND_RECONCILIATION_FUNDING_PAYMENT_INVALID: payment financiador não encontrado ou sem transactionRef.',
    });
    return { refundId, outcome: 'STILL_AMBIGUOUS_GET_ERROR', localStatus: 'ambiguous_timeout', providerStatus: refund.providerStatus };
  }

  // ÚNICA operação de leitura externa desta invocação — nunca um loop de
  // polling (a paginação, se houver, acontece TODA dentro desta chamada).
  let refundsList: AsaasRefund[];
  try {
    refundsList = await provider.listAllRefunds(fundingPayment.transactionRef);
  } catch (err: any) {
    // Seção 32 — GET pode falhar (network/429/5xx/401/etc.). NUNCA vira
    // failed automaticamente (perderia a chance de reconciliar um refund
    // externo que pode já existir de verdade) — preferência conservadora:
    // ambiguous_timeout. err.message já sanitizado pelo AsaasClient.
    await persistReconciliationEvidence(refundId, {
      status: 'ambiguous_timeout',
      lastError: `REFUND_RECONCILIATION_GET_ERROR ${err.code || 'UNKNOWN'}: ${err.message}`,
    });
    return { refundId, outcome: 'STILL_AMBIGUOUS_GET_ERROR', localStatus: 'ambiguous_timeout', providerStatus: refund.providerStatus };
  }

  const correlation = findRefundByCorrelation(refundsList, refund.providerCorrelationKey!, Number(refund.amount), ASAAS_AMOUNT_TOLERANCE);

  if (correlation.status === 'NOT_FOUND') {
    // Seção 8 — 0 matches NÃO prova que o POST nunca chegou ao Asaas.
    // NENHUM retry de POST, NENHUMA liberação de reserva, NENHUM failed.
    await persistReconciliationEvidence(refundId, { status: 'ambiguous_timeout', lastError: 'REFUND_RECONCILIATION_NOT_FOUND' });
    return { refundId, outcome: 'STILL_AMBIGUOUS_NOT_FOUND', localStatus: 'ambiguous_timeout', providerStatus: refund.providerStatus };
  }
  if (correlation.status === 'AMBIGUOUS') {
    // Seção 9 — fail closed, nunca escolhe um dos matches.
    await persistReconciliationEvidence(refundId, { status: 'ambiguous_timeout', lastError: 'REFUND_RECONCILIATION_MULTIPLE_MATCHES' });
    return { refundId, outcome: 'STILL_AMBIGUOUS_MULTIPLE_MATCHES', localStatus: 'ambiguous_timeout', providerStatus: refund.providerStatus };
  }
  if (correlation.status === 'AMOUNT_MISMATCH') {
    // Seção 10.
    await persistReconciliationEvidence(refundId, { status: 'ambiguous_timeout', lastError: 'REFUND_RECONCILIATION_AMOUNT_MISMATCH' });
    return { refundId, outcome: 'STILL_AMBIGUOUS_AMOUNT_MISMATCH', localStatus: 'ambiguous_timeout', providerStatus: refund.providerStatus };
  }

  // FOUND — despacha pelo status do provider.
  const found = correlation.refund;
  if (found.status === 'PENDING') {
    // Seção 11.
    await persistReconciliationEvidence(refundId, {
      status: 'provider_pending', providerStatus: 'PENDING', providerRawResponse: found, lastError: null,
    });
    return { refundId, outcome: 'STILL_PROVIDER_PENDING', localStatus: 'provider_pending', providerStatus: 'PENDING' };
  }
  if (found.status === 'CANCELLED') {
    // Seção 12 — nenhum efeito financeiro; a reserva deixa de bloquear nova
    // tentativa (status vira terminal 'failed', fora da lista de active
    // reservation). Nova tentativa exige nova idempotencyKey/refund row.
    await persistReconciliationEvidence(refundId, {
      status: 'failed', providerStatus: 'CANCELLED', providerRawResponse: found,
      lastError: 'ASAAS_REFUND_CANCELLED: o provedor cancelou o estorno — nenhum valor foi devolvido (confirmado via reconciliação GET).',
    });
    return { refundId, outcome: 'CANCELLED', localStatus: 'failed', providerStatus: 'CANCELLED' };
  }
  // found.status === 'DONE' — seção 13: finalização em UMA transação curta,
  // sem nenhuma chamada de rede dentro dela (o GET já terminou acima).
  return finalizeReservedRefundFromEvidence(refund, found);
}

/** Despacha para o finalize correto (child vs surplus) com base no owner
 * shape já garantido pelo schema (order_id XOR purchase_group_id). */
async function finalizeReservedRefundFromEvidence(
  refund: typeof refunds.$inferSelect,
  evidence: AsaasRefund
): Promise<ReconcileReservedRefundResult> {
  if (refund.orderId) {
    return finalizeReservedOrderRefund(refund.id, evidence);
  }
  return finalizeReservedSurplusRefund(refund.id, evidence);
}

/**
 * Fase C5.2-D.5, seções 14/16-20 — finalização exactly-once de um refund
 * reservado de CHILD ORDER. Locks: GROUP primeiro, ORDER depois (mesma
 * ordem de `processRefund`/`confirmPurchaseGroupPayment` — nunca invertida,
 * mesmo princípio que já protege contra a corrida RELEASE×REFUND desde a
 * C5.2-C). `FOR UPDATE` na própria refund row é a AUTORIDADE exactly-once:
 * uma segunda chamada concorrente para o MESMO refundId bloqueia aqui até a
 * primeira commitar, relê `status='processed'` e retorna idempotente sem
 * nenhum efeito novo — nenhuma outra sincronização é necessária.
 */
export async function finalizeReservedOrderRefund(refundId: string, evidence: AsaasRefund): Promise<ReconcileReservedRefundResult> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  return db.transaction(async (tx: any) => {
    // Peek (sem lock) só para saber orderId/purchaseGroupId — decide QUAIS
    // locks pegar, nunca decide nada financeiro.
    const [refundPeek] = await tx.select({ orderId: refunds.orderId }).from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!refundPeek || !refundPeek.orderId) {
      throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado ou não é de child order.`, 404);
    }
    const [orderPeek] = await tx.select({ purchaseGroupId: orders.purchaseGroupId }).from(orders).where(eq(orders.id, refundPeek.orderId)).limit(1);
    if (!orderPeek || !orderPeek.purchaseGroupId) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido do refund "${refundId}" não encontrado ou não pertence a um purchase_group.`, 404);
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${orderPeek.purchaseGroupId}))`); // GROUP primeiro
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${refundPeek.orderId}))`); // ORDER depois

    // AUTORIDADE exactly-once — FOR UPDATE na própria refund row.
    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update').limit(1);
    if (!refund) {
      throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado.`, 404);
    }
    if (refund.status === 'processed') {
      // Idempotente — outra chamada (ou esta mesma, num retry) já finalizou.
      return { refundId, outcome: 'ALREADY_TERMINAL_PROCESSED', localStatus: 'processed', providerStatus: refund.providerStatus } as ReconcileReservedRefundResult;
    }
    if (refund.status === 'failed') {
      return { refundId, outcome: 'ALREADY_TERMINAL_FAILED', localStatus: 'failed', providerStatus: refund.providerStatus } as ReconcileReservedRefundResult;
    }
    if (!ASAAS_RECONCILIABLE_LOCAL_STATUSES.includes(refund.status as any)) {
      throw new RefundValidationError('REFUND_NOT_RECONCILIABLE', `Refund "${refundId}" está em status="${refund.status}" — finalização não se aplica.`, 409);
    }

    const [order] = await tx.select().from(orders).where(eq(orders.id, refund.orderId)).limit(1);
    if (!order) {
      throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${refund.orderId} não encontrado.`, 404);
    }

    // Seção 19 — MESMA função/mesmos checks já validados (owner, role=primary,
    // status=paid, allocation ACTIVE do child correto) — nunca duplicados.
    const resolved = await PaymentService.resolveFundingPaymentForOrder(tx, order);
    const fundingPayment = resolved.payment;
    const allocation = resolved.allocation!;
    if (allocation.paymentId !== refund.paymentId) {
      // Nunca deveria divergir (refund.paymentId foi gravado na reserva com
      // exatamente este valor) — defesa em profundidade contra corrupção.
      throw new Error(`REFUND_ALLOCATION_PAYMENT_MISMATCH: allocation "${allocation.id}" tem paymentId="${allocation.paymentId}", esperado "${refund.paymentId}".`);
    }

    // Efeitos econômicos — MESMO helper do engine C5.2-C/legacy, nunca uma
    // segunda implementação divergente (seções 17-20 do pedido).
    const { sellerDebitAmount } = await applyOrderRefundFinancialEffects(tx, {
      order, payment: fundingPayment, groupAllocation: allocation,
      amount: Number(refund.amount), reason: refund.reason, performedBy: refund.approvedBy,
      refundId: refund.id, walletTxIdempotencyKey: refund.idempotencyKey || refund.id,
    });

    // Seção 23 — UPDATE da MESMA row, nunca um INSERT novo. Tudo (efeitos +
    // este UPDATE) faz parte da MESMA transação — COMMIT junto ou ROLLBACK
    // total (seção 16/24).
    await tx.update(refunds).set({
      status: 'processed',
      providerStatus: 'DONE',
      providerRawResponse: evidence,
      providerConfirmedAt: refund.providerConfirmedAt ?? new Date(),
      sellerDebitAmount: sellerDebitAmount !== null ? String(sellerDebitAmount.toFixed(2)) : null,
      lastError: null,
    }).where(eq(refunds.id, refundId));

    return { refundId, outcome: 'FINALIZED', localStatus: 'processed', providerStatus: 'DONE' } as ReconcileReservedRefundResult;
  });
}

/**
 * Fase C5.2-D.5, seção 15/22 — finalização exactly-once de um refund
 * reservado de SURPLUS. Só GROUP lock (nunca order — surplus nunca tem
 * order). MESMA autoridade exactly-once via `FOR UPDATE` na refund row.
 */
export async function finalizeReservedSurplusRefund(refundId: string, evidence: AsaasRefund): Promise<ReconcileReservedRefundResult> {
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');

  return db.transaction(async (tx: any) => {
    const [refundPeek] = await tx.select({ purchaseGroupId: refunds.purchaseGroupId, orderId: refunds.orderId }).from(refunds).where(eq(refunds.id, refundId)).limit(1);
    if (!refundPeek || refundPeek.orderId !== null || !refundPeek.purchaseGroupId) {
      throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado ou não é de surplus.`, 404);
    }

    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${refundPeek.purchaseGroupId}))`); // só GROUP lock

    const [refund] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for('update').limit(1);
    if (!refund) {
      throw new RefundValidationError('REFUND_NOT_FOUND', `Refund "${refundId}" não encontrado.`, 404);
    }
    if (refund.status === 'processed') {
      return { refundId, outcome: 'ALREADY_TERMINAL_PROCESSED', localStatus: 'processed', providerStatus: refund.providerStatus } as ReconcileReservedRefundResult;
    }
    if (refund.status === 'failed') {
      return { refundId, outcome: 'ALREADY_TERMINAL_FAILED', localStatus: 'failed', providerStatus: refund.providerStatus } as ReconcileReservedRefundResult;
    }
    if (!ASAAS_RECONCILIABLE_LOCAL_STATUSES.includes(refund.status as any)) {
      throw new RefundValidationError('REFUND_NOT_RECONCILIABLE', `Refund "${refundId}" está em status="${refund.status}" — finalização não se aplica.`, 409);
    }

    const [payment] = await tx.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1);
    if (!payment) {
      throw new RefundValidationError('PAYMENT_NOT_FOUND', `Payment "${refund.paymentId}" não encontrado.`, 404);
    }
    if (payment.status !== 'paid') {
      // Nunca deveria divergir (só este caminho toca payment surplus) —
      // defesa em profundidade contra corrupção/corrida externa ao desenho.
      throw new Error(`REFUND_SURPLUS_PAYMENT_NOT_PAID: payment "${payment.id}" está com status="${payment.status}" (esperado "paid") ao finalizar refund "${refundId}".`);
    }

    // Seção 22 — nenhum allocation/escrow/order/wallet/PRIMARY é tocado.
    await applySurplusRefundFinancialEffects(tx, payment);

    await tx.update(refunds).set({
      status: 'processed',
      providerStatus: 'DONE',
      providerRawResponse: evidence,
      providerConfirmedAt: refund.providerConfirmedAt ?? new Date(),
      lastError: null,
    }).where(eq(refunds.id, refundId));

    return { refundId, outcome: 'FINALIZED', localStatus: 'processed', providerStatus: 'DONE' } as ReconcileReservedRefundResult;
  });
}

export interface CreateBuyerDisputeInput {
  orderId: string;
  buyerId: string;
  reason?: string;
  description: string;
  claimAmount?: number;
}

/**
 * Abertura de disputa pelo comprador (fase "Desbloqueio do lançamento").
 * ACHADO BLOCKER_LAUNCH corrigido: a rota anterior gravava sellerId e
 * currency fixos ('seller_001'/'XOF'), nunca lendo o pedido real. Aqui
 * sellerId e currency vêm exclusivamente do pedido; nunca de entrada do
 * cliente. Segue a mesma convenção "um vendedor por pedido" já usada por
 * escrow_accounts/orders (schema atual não modela pedidos multi-vendedor de
 * forma inequívoca — não inventamos uma regra nova aqui).
 */
export async function createBuyerDispute(input: CreateBuyerDisputeInput, executor?: any) {
  const runInTx = async (tx: any) => {
    // Fase "Proteção pós-entrega": MESMO advisory lock usado por
    // releaseEscrowForOrder — serializa "abrir disputa" contra "liberar escrow"
    // para o mesmo pedido, para que as duas operações concorrentes nunca produzam
    // um estado contraditório. Se o release ganhar a corrida e já tiver concluído
    // (escrow released) quando a disputa for criada, a disputa continua sendo
    // permitida normalmente (auditoria item 5) — resolveDispute -> processRefund já
    // sabe debitar proporcionalmente a wallet do vendedor num escrow 'released'.
    // Nenhuma regra nova de bloqueio pós-release foi adicionada aqui de propósito.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${input.orderId}))`);

    const orderRows = await tx.select().from(orders).where(eq(orders.id, input.orderId)).limit(1);
    const order = orderRows[0];
    if (!order) {
      throw new RefundValidationError('ORDER_NOT_FOUND', 'Pedido não encontrado.', 404);
    }
    if (order.buyerId !== input.buyerId) {
      throw new RefundValidationError('FORBIDDEN', 'Você não tem permissão para abrir uma disputa sobre este pedido.', 403);
    }
    if (!order.sellerId) {
      throw new RefundValidationError('ORDER_SELLER_MISSING', 'Este pedido não possui um vendedor associado — não é possível abrir disputa.', 400);
    }
    if (order.paymentStatus !== 'paid') {
      throw new RefundValidationError('ORDER_NOT_ELIGIBLE_FOR_DISPUTE', 'Este pedido ainda não teve o pagamento confirmado — não é possível abrir disputa.', 409);
    }

    const existingDisputes = await tx.select().from(disputes).where(eq(disputes.orderId, input.orderId));
    const existingOpen = existingDisputes.find((d: any) => d.status === 'open' || d.status === 'in_mediation');
    if (existingOpen) {
      return { ...existingOpen, claimAmount: Number(existingOpen.claimAmount), alreadyOpen: true };
    }

    const dispId = `disp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newDispute = {
      id: dispId,
      orderId: order.id,
      buyerId: input.buyerId,
      sellerId: order.sellerId,
      reason: input.reason || 'Produto divergente',
      description: input.description,
      status: 'open',
      claimAmount: String(input.claimAmount || order.totalAmount || 0),
      currency: order.currency,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await tx.insert(disputes).values(newDispute);
    await tx.insert(disputeMessages).values({
      id: `dm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      disputeId: dispId,
      senderId: input.buyerId,
      senderRole: 'buyer',
      message: input.description,
      createdAt: new Date(),
    });

    return { ...newDispute, claimAmount: Number(newDispute.claimAmount), alreadyOpen: false };
  };

  if (executor) return runInTx(executor);
  const db = getDb();
  if (!db) throw new Error('Banco de dados indisponível.');
  return db.transaction(runInTx);
}

export type DisputeResolution = 'refund_buyer' | 'seller_win';

/**
 * Resolução de disputa (item 6 do pedido). Idempotente no nível da disputa: uma
 * disputa já resolvida (resolved_buyer/resolved_seller) não é reprocessada, nem
 * BUYER_WIN nem SELLER_WIN. SELLER_WIN nunca move dinheiro.
 *
 * Fase C5.2-D.7 — BUYER_WIN agora se ramifica pela MESMA distinção
 * legacy/group-child já usada em toda a série D.2-D.6:
 *
 *   LEGACY (order.purchaseGroupId == NULL): comportamento 100% preservado —
 *   `processRefund()` continua rodando na MESMA transação da mudança de
 *   status da disputa (atômico: ou os dois acontecem, ou nenhum).
 *
 *   GROUP CHILD (order.purchaseGroupId != NULL): fluxo provider-managed.
 *   Só a RESERVA (`reserveOrderRefund` — puramente local, sem chamada
 *   externa) é atômica com a mudança de status da disputa, na MESMA
 *   transação — se a reserva falhar (ex.: já existe uma reserva ativa,
 *   allocation não elegível), a transação INTEIRA desfaz e a disputa NUNCA
 *   fica "resolvida" sem uma reserva de refund correspondente. A submissão
 *   externa (`submitReservedRefund`) e a reconciliação
 *   (`reconcileReservedRefund`) NUNCA podem rodar dentro de uma transação
 *   Postgres (mesma regra de toda a D.4-D.6) — rodam DEPOIS do commit, de
 *   forma best-effort: uma falha nelas NUNCA desfaz a resolução da disputa
 *   já commitada — o refund permanece reservado e reconciliável depois
 *   (via D.6/webhook, ou uma nova chamada futura), nunca perdido.
 */

/**
 * Fase C5.2-D.7.1 — RECOVERY de "reserved-but-not-submitted". Delega
 * inteiramente para `submitReservedRefund` — nenhuma lógica extra além da
 * intenção nomeada explicitamente, porque a proteção real já existe:
 * `submitReservedRefund` só age (CAS `UPDATE ... WHERE status='pending'`)
 * quando o refund está EXATAMENTE em `status='pending'`; para qualquer
 * outro status (`provider_pending`/`ambiguous_timeout`/`processed`/`failed`)
 * ele já retorna `SKIPPED_NOT_FIRST_SENDER` sem nenhum POST novo — nunca
 * precisa de um gate adicional aqui.
 *
 * Por que esta função existe separada, então: nomeação de INTENÇÃO — um
 * refund `pending` com `providerRequestedAt IS NULL` é o único estado em
 * que sabemos, com certeza, que NENHUMA execução anterior chegou a ganhar o
 * direito à submissão (seção 2 do pedido: não é ambíguo, é seguro tentar a
 * primeira submissão). Chamar esta função (em vez de `submitReservedRefund`
 * direto) documenta essa garantia no call site e dá um ponto único e
 * reutilizável tanto para o retry manual do admin (D.7.1) quanto para um
 * futuro job de recovery automático (ainda não implementado — ver
 * recomendação no relatório).
 */
export async function resumeUnsubmittedReservedRefund(refundId: string): Promise<SubmitReservedRefundResult> {
  return submitReservedRefund(refundId);
}

export async function resolveDispute(
  disputeId: string,
  resolution: DisputeResolution,
  options: { performedBy?: string | null; resolutionNote?: string } = {},
  executor?: any
) {
  const runInTx = async (tx: any) => {
    const disputeRows = await tx.select().from(disputes).where(eq(disputes.id, disputeId)).for('update').limit(1);
    if (disputeRows.length === 0) {
      throw new RefundValidationError('DISPUTE_NOT_FOUND', 'Disputa não encontrada.', 404);
    }
    const dispute = disputeRows[0];

    if (dispute.status === 'resolved_buyer' || dispute.status === 'resolved_seller') {
      // Fase C5.2-D.7.1 — RECOVERY da janela "reserved-but-not-submitted"
      // (seções 4/10 do pedido): mesmo numa disputa JÁ resolvida, se a
      // decisão foi BUYER_WIN e existe um refund provider-managed reservado
      // sob a MESMA idempotencyKey determinística que NUNCA chegou a ganhar
      // o CAS de submissão (`status='pending' AND providerRequestedAt IS
      // NULL` — seção 2: o ÚNICO estado seguro para tentar a primeira
      // submissão de novo, nunca ambíguo), sinaliza para a FASE 2 (fora de
      // transação, abaixo) tentar `resumeUnsubmittedReservedRefund`.
      //
      // NUNCA cria uma segunda refund row (mesma idempotencyKey já
      // reservada). NUNCA reenvia POST para provider_pending/
      // ambiguous_timeout/processed/failed — só a própria condição abaixo
      // decide (e o CAS de `submitReservedRefund`, autoridade final, age
      // apenas sobre status='pending' de qualquer forma — defesa em
      // profundidade, nunca confiada isoladamente).
      let resumableRefundId: string | null = null;
      if (resolution === 'refund_buyer') {
        const idempotencyKey = `dispute_resolution:${dispute.id}`;
        const [existing] = await tx.select().from(refunds).where(eq(refunds.idempotencyKey, idempotencyKey)).limit(1);
        if (existing && existing.status === 'pending' && existing.providerRequestedAt === null) {
          resumableRefundId = existing.id;
        }
      }
      return { success: true, message: `Disputa #${disputeId} já estava resolvida ("${dispute.status}") — nenhuma nova ação executada.`, alreadyResolved: true, status: dispute.status, refund: null, mode: null, newlyReservedRefundId: resumableRefundId };
    }

    const isBuyerWin = resolution === 'refund_buyer';
    let refundResult: any = null;
    let mode: 'legacy' | 'provider_managed' | null = null;
    let newlyReservedRefundId: string | null = null;

    if (isBuyerWin) {
      const refundAmount = dispute.refundAmount !== null && dispute.refundAmount !== undefined
        ? Number(dispute.refundAmount)
        : Number(dispute.claimAmount);
      const reason = `Disputa #${dispute.id} resolvida a favor do comprador. ${options.resolutionNote || ''}`.trim();
      const performedBy = options.performedBy ?? dispute.arbitratorId ?? null;
      const idempotencyKey = `dispute_resolution:${dispute.id}`;

      const [orderPeek] = await tx.select({ purchaseGroupId: orders.purchaseGroupId }).from(orders).where(eq(orders.id, dispute.orderId)).limit(1);
      if (!orderPeek) {
        throw new RefundValidationError('ORDER_NOT_FOUND', `Pedido ${dispute.orderId} (da disputa ${dispute.id}) não encontrado.`, 404);
      }

      if (!orderPeek.purchaseGroupId) {
        // LEGACY — inalterado.
        mode = 'legacy';
        refundResult = await processRefund({ orderId: dispute.orderId, amount: refundAmount, reason, idempotencyKey, performedBy }, tx);
      } else {
        // GROUP CHILD — só reserva aqui, atômico com a disputa.
        mode = 'provider_managed';
        const reservation = await reserveOrderRefund({ orderId: dispute.orderId, amount: refundAmount, reason, idempotencyKey, performedBy }, tx);
        refundResult = reservation;
        if (!reservation.alreadyReserved) {
          newlyReservedRefundId = reservation.id;
        }
      }
    }

    await tx.update(disputes).set({
      status: isBuyerWin ? 'resolved_buyer' : 'resolved_seller',
      resolution: options.resolutionNote || 'Resolvido pelo Administrador',
      updatedAt: new Date(),
    }).where(eq(disputes.id, dispute.id));

    return { success: true, message: `Disputa #${dispute.id} resolvida com sucesso!`, refund: refundResult, alreadyResolved: false, status: isBuyerWin ? 'resolved_buyer' : 'resolved_seller', mode, newlyReservedRefundId };
  };

  const result: any = executor
    ? await runInTx(executor)
    : await (async () => {
        const db = getDb();
        if (!db) throw new Error('Banco de dados indisponível.');
        return db.transaction(runInTx);
      })();

  // FASE 2 — FORA de qualquer transação Postgres (seção central da D.7,
  // reafirmada pela D.7.1 seção 10): executa quando uma NOVA reserva
  // provider-managed foi criada por ESTA chamada OU (D.7.1) quando esta
  // chamada é um retry sobre uma disputa JÁ resolvida que encontrou um
  // refund `pending`/`providerRequestedAt=NULL` recuperável — nos dois
  // casos o campo carrega o MESMO significado: "existe uma refund row
  // sentada em 'pending' que nunca ganhou o CAS de submissão". Best-effort:
  // qualquer falha aqui é registrada, mas NUNCA propagada — a disputa já
  // foi resolvida (ou já estava) e commitada; o refund reservado permanece
  // reconciliável depois.
  const refundId: string | null = result.newlyReservedRefundId ?? null;
  delete result.newlyReservedRefundId;

  if (refundId) {
    try {
      await resumeUnsubmittedReservedRefund(refundId);
      result.reconcile = await reconcileReservedRefund(refundId);
    } catch (err: any) {
      logger.warn({ disputeId, refundId, error: err?.message }, '[resolveDispute] Submissão/reconciliação best-effort do refund provider-managed falhou — disputa já resolvida, refund permanece reservado/reconciliável (D.6/webhook ou nova tentativa futura).');
      result.reconcileError = err?.message ?? String(err);
    }
    // D.7.1 — devolve o estado ATUAL da refund row (útil sobretudo no
    // caminho de recovery, onde `refund` nasceu `null` na FASE 1 por não
    // termos reservado nada de novo nesta chamada) — nunca deixa o
    // chamador sem visibilidade do que de fato aconteceu. Best-effort como
    // o resto desta fase: se o banco estiver indisponível aqui (nunca
    // deveria, já que as chamadas acima já teriam lançado antes), apenas
    // preserva o `refund` que a FASE 1 já retornou, sem propagar erro novo.
    const dbForRefresh = getDb();
    if (dbForRefresh) {
      const [freshRefund] = await dbForRefresh.select().from(refunds).where(eq(refunds.id, refundId)).limit(1);
      if (freshRefund) result.refund = freshRefund;
    }
  }

  return result;
}
