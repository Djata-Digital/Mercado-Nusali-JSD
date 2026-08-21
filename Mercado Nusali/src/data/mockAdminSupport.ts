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
  status: 'novo' | 'em_atendimento' | 'aguardando_usuario' | 'escalado' | 'fechado';
  createdAt: string;
  updatedAt: string;
  messages: { sender: string; text: string; time: string; isInternal?: boolean }[];
}

export const mockSupportTicketsList: SupportTicketRecord[] = [];
