/**
 * Fase M1-C — mensagens REAIS e persistentes de disputa (Buyer <-> Seller).
 *
 * Substitui o mock/in-memory (buyerDataStore.disputes) que existia em
 * POST /buyer/disputes/:id/messages: nenhuma mensagem gravada aqui nunca
 * volta a viver só em memória — tudo passa por `dispute_messages`
 * (Postgres, já existente no schema desde antes desta fase; NENHUMA
 * migration foi necessária).
 *
 * ESCOPO DELIBERADAMENTE ESTREITO: esta fase é só comunicação. Nenhuma
 * função aqui toca payments/refunds/wallets/escrow/chargeback — só lê
 * `disputes`/`orders` (para provar posse) e escreve em `dispute_messages`.
 *
 * OWNERSHIP (nunca confiar em id vindo do body):
 *   - buyer: dispute.buyerId === usuário autenticado E order.buyerId ===
 *     usuário autenticado (dupla checagem — ver nota em
 *     assertBuyerOwnsDispute).
 *   - seller: dispute.sellerId === sellers.id do vendedor autenticado E
 *     order.sellerId === o mesmo — mesma dupla checagem.
 * Em ambos os casos, se a disputa não existir OU pertencer a outro
 * usuário, a resposta é EXATAMENTE a mesma (DISPUTE_NOT_FOUND) — nunca
 * revela a um usuário não autorizado que o recurso existe mas é de outra
 * pessoa.
 *
 * IDENTIDADE DA MENSAGEM: senderId/senderRole SEMPRE derivados da sessão
 * autenticada (req.user.id / seller resolvido via sellers.userId), nunca do
 * body — mesmo que o body tente enviar senderId/senderRole, esses campos
 * são ignorados nesta camada (as funções abaixo nem aceitam esses
 * parâmetros vindos de fora).
 */
import { eq } from 'drizzle-orm';
import { disputes, disputeMessages, orders } from '../../../db/schema.js';

// Limite razoável para uma mensagem de chat de mediação — não existe
// constraint de tamanho no schema (`message` é `text`), então este valor é
// só uma salvaguarda de aplicação contra payloads absurdos, não uma regra
// de negócio herdada de outro lugar.
export const DISPUTE_MESSAGE_MAX_LENGTH = 4000;

export class DisputeMessageValidationError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function generateDisputeMessageId(): string {
  return `dm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Validação de conteúdo — idêntica para buyer e seller, nenhuma regra dupla. */
function normalizeDisputeMessageText(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new DisputeMessageValidationError('INVALID_MESSAGE', 'Mensagem inválida.', 400);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new DisputeMessageValidationError('EMPTY_MESSAGE', 'A mensagem não pode ficar vazia.', 400);
  }
  if (trimmed.length > DISPUTE_MESSAGE_MAX_LENGTH) {
    throw new DisputeMessageValidationError(
      'MESSAGE_TOO_LONG',
      `A mensagem excede o limite de ${DISPUTE_MESSAGE_MAX_LENGTH} caracteres.`,
      400
    );
  }
  return trimmed;
}

/**
 * Carrega a disputa e o pedido correspondente. Nunca lança 404 aqui — quem
 * chama decide a mensagem de erro (para poder unificar "não existe" e
 * "existe mas não é seu" na mesma resposta).
 */
async function loadDisputeWithOrder(db: any, disputeId: string) {
  const disputeRows = await db.select().from(disputes).where(eq(disputes.id, disputeId)).limit(1);
  const dispute = disputeRows[0];
  if (!dispute) return { dispute: null, order: null };

  const orderRows = await db.select().from(orders).where(eq(orders.id, dispute.orderId)).limit(1);
  return { dispute, order: orderRows[0] || null };
}

/**
 * NOTA sobre a checagem em dobro (dispute.buyerId/sellerId E
 * order.buyerId/sellerId): `createBuyerDispute` (refundService.ts) sempre
 * copia buyerId/sellerId do próprio order no momento da criação da disputa,
 * e nenhum caminho de código os altera depois — logo as duas fontes são
 * estruturalmente idênticas hoje. A checagem dupla é uma defesa em
 * profundidade barata (duas comparações de string) contra qualquer
 * divergência futura entre as tabelas, não uma correção de um bug
 * observado.
 */

export interface BuyerDisputeMessageInput {
  disputeId: string;
  buyerId: string;
  rawMessage: unknown;
}

export async function postBuyerDisputeMessage(db: any, input: BuyerDisputeMessageInput) {
  const message = normalizeDisputeMessageText(input.rawMessage);
  const { dispute, order } = await loadDisputeWithOrder(db, input.disputeId);

  if (!dispute || !order || dispute.buyerId !== input.buyerId || order.buyerId !== input.buyerId) {
    throw new DisputeMessageValidationError('DISPUTE_NOT_FOUND', 'Disputa não encontrada.', 404);
  }

  const [inserted] = await db
    .insert(disputeMessages)
    .values({
      id: generateDisputeMessageId(),
      disputeId: input.disputeId,
      senderId: input.buyerId,
      senderRole: 'buyer',
      message,
      createdAt: new Date(),
    })
    .returning();

  return inserted;
}

export interface SellerDisputeMessageInput {
  disputeId: string;
  sellerId: string; // sellers.id (posse do pedido/disputa)
  sellerUserId: string; // users.id (identidade real gravada em dispute_messages.sender_id)
  rawMessage: unknown;
}

export async function postSellerDisputeMessage(db: any, input: SellerDisputeMessageInput) {
  const message = normalizeDisputeMessageText(input.rawMessage);
  const { dispute, order } = await loadDisputeWithOrder(db, input.disputeId);

  if (!dispute || !order || dispute.sellerId !== input.sellerId || order.sellerId !== input.sellerId) {
    throw new DisputeMessageValidationError('DISPUTE_NOT_FOUND', 'Disputa não encontrada.', 404);
  }

  const [inserted] = await db
    .insert(disputeMessages)
    .values({
      id: generateDisputeMessageId(),
      disputeId: input.disputeId,
      // dispute_messages.sender_id referencia users.id, NUNCA sellers.id —
      // por isso gravamos o userId do vendedor, não o sellerId de posse.
      senderId: input.sellerUserId,
      senderRole: 'seller',
      message,
      createdAt: new Date(),
    })
    .returning();

  return inserted;
}
