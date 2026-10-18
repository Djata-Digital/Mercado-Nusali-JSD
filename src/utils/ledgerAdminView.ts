/**
 * Utilitários PUROS do painel do ledger (E6): perfis, rótulos, formatação e mensagens de erro. Perfis aqui são só UX — o servidor é a autoridade (ver ledgerAdminRoutes.ts).
 */
export const LEDGER_READ_ROLES: readonly string[] = ['GLOBAL_ADMIN', 'FINANCE', 'RISK_ANALYST'];
export const LEDGER_ADMIN_ROLES: readonly string[] = ['GLOBAL_ADMIN'];
export const canReadLedger = (role?: string | null) => LEDGER_READ_ROLES.includes((role || '').toUpperCase());
export const canAdminLedger = (role?: string | null) => LEDGER_ADMIN_ROLES.includes((role || '').toUpperCase());

export const TX_TYPE_LABEL: Record<string, string> = {
  PAYMENT_RECEIVED: 'Pagamento recebido', ORDER_DELIVERY_CONFIRMED: 'Entrega confirmada (liberação)', REFUND_PROCESSED: 'Reembolso concluído', SHIPPING_COST_REVERSED: 'Reversão de custo de frete',
  CHARGEBACK_CONFIRMED: 'Chargeback confirmado', CHARGEBACK_ALLOCATED: 'Chargeback — responsabilidade alocada', CHARGEBACK_RECOVERY: 'Chargeback — recuperação', CHARGEBACK_WRITE_OFF: 'Chargeback — baixa',
};
export const TX_TYPES = Object.keys(TX_TYPE_LABEL);
export const EVENT_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pendente', PROCESSING: 'Processando', RETRYING: 'Nova tentativa', DONE: 'Concluído', SKIPPED: 'Ignorado', NEEDS_INTERVENTION: 'Exige intervenção', DISMISSED: 'Descartado',
};
export const SEVERITY_LABEL: Record<string, string> = { CRITICAL: 'Crítica', WARNING: 'Aviso', INFO: 'Informativa' };
export const FINDING_STATUS_LABEL: Record<string, string> = { OPEN: 'Aberta', ACKNOWLEDGED: 'Reconhecida', RESOLVED: 'Resolvida' };
export const CAUSE_LABEL: Record<string, string> = {
  SELLER_FAULT: 'Falha do vendedor', NUSALI_FAULT: 'Falha da Nusali', LOGISTICS_FAULT: 'Falha logística', EXTERNAL_FRAUD: 'Fraude externa', SHARED: 'Responsabilidade compartilhada', INDETERMINATE: 'Indeterminada',
};
export const PARTY_LABEL: Record<string, string> = { SELLER: 'Vendedor', NUSALI: 'Nusali', THIRD_PARTY: 'Terceiro' };
export const STAGE_LABEL: Record<string, string> = { BEFORE_RELEASE: 'Antes da liberação (Escrow absorve)', AFTER_RELEASE: 'Depois da liberação (perda pendente)' };
export const DECISION_STATUS_LABEL: Record<string, string> = { PROPOSED: 'Proposta', APPROVED: 'Aprovada', SUPERSEDED: 'Substituída', REJECTED: 'Rejeitada' };

export const HOLD_STATE_LABEL: Record<string, string> = {
  OK: 'Coberta pela obrigação', RELEASED: 'Liberada', CHARGEBACK_NOT_LOST: 'Chargeback deixou de estar perdido', NO_APPROVED_OBLIGATION: 'Sem decisão aprovada vigente',
  EXCEEDS_APPROVED_OBLIGATION: 'Acima da responsabilidade aprovada vigente', EXCEEDS_ORDER_NET_CAP: 'Acima do líquido (N) do pedido', UNSUPPORTED_REFERENCE: 'Referência não suportada',
};
/** estados que exigem atenção do administrador (a retenção NUNCA é alterada sozinha) */
export const holdStateNeedsAttention = (s?: string) => !!s && !['OK', 'RELEASED'].includes(s);
export const holdStateClass = (s?: string) => (s === 'OK' ? 'bg-emerald-100 text-emerald-800' : s === 'RELEASED' ? 'bg-gray-200 text-gray-700' : 'bg-rose-100 text-rose-800');

export const severityClass = (s: string) => (s === 'CRITICAL' ? 'bg-rose-100 text-rose-800' : s === 'WARNING' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800');
export const eventStatusClass = (s: string) => (s === 'DONE' ? 'bg-emerald-100 text-emerald-800' : s === 'NEEDS_INTERVENTION' ? 'bg-rose-100 text-rose-800' : s === 'RETRYING' || s === 'PROCESSING' ? 'bg-amber-100 text-amber-800' : s === 'DISMISSED' ? 'bg-gray-200 text-gray-700' : 'bg-sky-100 text-sky-800');

export const fmtMoney = (v: string | number | null | undefined, currency = 'XOF') => {
  const n = Number(v); if (!Number.isFinite(n)) return '—';
  return `${n.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
};
export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const raw = String(iso); const d = new Date(/[zZ]|[+-]\d{2}(:?\d{2})?$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};
/** Nova chave de idempotência para cada abertura de formulário: o mesmo envio repetido nunca duplica. */
export const newIdempotencyKey = (prefix: string) => `${prefix}:${(globalThis.crypto && 'randomUUID' in globalThis.crypto) ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;

/** Valida texto livre mínimo (mesmos mínimos dos serviços; o servidor revalida). */
export const minLen = (v: string, n: number) => v.trim().length >= n;
/** Valor monetário com até 2 casas e > 0. */
export const parseMoney = (v: string): string | null => { const s = v.trim().replace(',', '.'); return /^\d+(\.\d{1,2})?$/.test(s) && Number(s) > 0 ? s : null; };

const ERROR_TEXT: Record<string, string> = {
  LEDGER_ACCESS_DENIED: 'Seu perfil não tem acesso à gestão do ledger.',
  LEDGER_ADMIN_REQUIRED: 'Esta operação é restrita ao Administrador Geral.',
  FORBIDDEN: 'Seu perfil não pode executar esta operação.',
  FOUR_EYES: 'Quem propõe a decisão não pode aprová-la: peça a outro Administrador Geral.',
  CONFLICT_OF_INTEREST: 'Você está ligado a este caso (comprador, vendedor ou membro da loja) e não pode decidir.',
  SELLER_CAP_EXCEEDED: 'A responsabilidade do vendedor não pode passar do valor líquido (N) do pedido. O excedente exige uma linha explícita (Nusali ou terceiro).',
  LINES_SUM_MISMATCH: 'As linhas da decisão têm de somar exatamente o valor alocado a cada pedido.',
  EVIDENCE_REQUIRED: 'Informe a evidência (obrigatória).',
  RATIONALE_REQUIRED: 'A fundamentação é obrigatória (mínimo 30 caracteres).',
  PARTIES_HEARD_REQUIRED: 'Informe as partes ouvidas e quando.',
  REASON_REQUIRED: 'Informe o motivo (mínimo 10 caracteres).',
  CONTRACT_REFERENCE_REQUIRED: 'Linha de terceiro exige a referência contratual.',
  INVALID_STATE: 'O registro mudou de estado; atualize a tela.',
  IDEMPOTENCY_CONFLICT: 'Esta chave de envio já foi usada com outros dados. Reabra o formulário.',
  EXCEEDS_RECEIVABLE: 'O valor excede o recebível do terceiro.',
  EXCEEDS_SHIPPING_COST: 'A reversão acumulada excede o custo de frete do pedido.',
  REFUNDED_BEFORE_RELEASE: 'Reembolso feito antes da liberação: o subsídio nunca foi reconhecido — não há o que reverter.',
  ORDER_NOT_REFUNDED: 'O pedido não tem reembolso concluído.',
  NO_THIRD_PARTY_RECEIVABLE: 'Não há recebível de terceiro com esse identificador (a cobrança do vendedor pela carteira não existe).',
  CHARGEBACK_REFUND_OVERLAP: 'O pedido tem reembolso concluído e chargeback perdido (perda dobrada): resolva a sobreposição antes.',
  CHARGEBACK_NOT_LOST: 'Só se decide responsabilidade sobre valor efetivamente debitado (chargeback perdido).',
  CONFIRMATION_REQUIRED: 'Confirme explicitamente para aplicar.',
  PROPOSAL_ALREADY_OPEN: 'Já existe uma proposta aberta para este chargeback.',
  NO_APPROVED_OBLIGATION: 'Não há decisão de responsabilidade APROVADA com valor do vendedor para esta alocação.',
  HOLD_NOT_ALLOWED: 'Só há retenção para perda depois da liberação, sem sobreposição com reembolso.',
  EXCEEDS_APPROVED_OBLIGATION: 'A retenção acumulada excederia a responsabilidade aprovada vigente do vendedor.',
  EXCEEDS_ORDER_NET_CAP: 'A retenção acumulada no pedido excederia o valor líquido (N) do vendedor.',
  INSUFFICIENT_UNHELD_BALANCE: 'Saldo livre insuficiente: não há retenção parcial automática — informe um valor que caiba no saldo livre.',
  DUPLICATE_ACTIVE_HOLD: 'Já existe uma retenção ativa para esta alocação. Libere-a (outro Administrador Geral) para criar outra com novo valor.',
  REVISION_AFTER_SETTLEMENT_NOT_SUPPORTED: 'Já há recuperação/baixa registrada: a revisão não é suportada.',
};
/** Retenções: o servidor já devolve a mensagem exata (inclusive valores); usa-a antes do texto genérico. */
export function holdErrorMessage(e: any): string {
  const msg = e?.response?.data?.error?.message ?? e?.error?.message;
  return msg ? String(msg) : ledgerErrorMessage(e);
}
export function ledgerErrorMessage(e: any): string {
  const code = e?.response?.data?.error?.code ?? e?.error?.code ?? e?.code;
  const msg = e?.response?.data?.error?.message ?? e?.error?.message ?? e?.message;
  if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
  if (msg) return String(msg);
  const st = e?.response?.status; if (st === 401) return 'Sessão expirada. Entre novamente.'; if (st === 403) return 'Seu perfil não pode executar esta operação.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}
