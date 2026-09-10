export interface SupportTicketRecord {
  id: string;
  userName: string;
  userEmail: string;
  userType: 'comprador' | 'vendedor' | 'representante';
  country: string;
  category: 'compra' | 'venda' | 'pagamento' | 'entrega' | 'disputa' | 'devolucao' | 'kyc' | 'seguranca' | 'conta' | 'tecnico';
  priority: 'baixa' | 'media' | 'alta' | 'urgente';
  agentName?: string;
  subject: string;
  // Fase M1-D2.6 — 'resolvido' adicionado: AdminSupportTickets.tsx marca o
  // ticket como 'resolvido' ao responder e compara `status === 'resolvido'`.
  // Não há API real de tickets ainda (lista abaixo é []); o componente é a
  // única especificação viva desta shape.
  status: 'novo' | 'em_atendimento' | 'aguardando_usuario' | 'escalado' | 'fechado' | 'resolvido';
  createdAt: string;
  updatedAt: string;
  // Shape alinhada ao que AdminSupportTickets.tsx realmente lê/grava
  // (senderName/senderRole/timestamp) — antes era sender/time, campos que o
  // componente nunca acessou.
  messages: { senderName: string; senderRole: string; text: string; timestamp: string; isInternal?: boolean }[];
}

export const mockSupportTicketsList: SupportTicketRecord[] = [];
