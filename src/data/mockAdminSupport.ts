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

export const mockSupportTicketsList: SupportTicketRecord[] = [
  {
    id: 'TCK-801',
    userName: 'Amadou Diallo',
    userEmail: 'amadou.diallo@gmail.com',
    userType: 'comprador',
    country: 'GW',
    category: 'pagamento',
    priority: 'alta',
    agentName: 'Aissatu Sow (Atendimento)',
    subject: 'Dúvida sobre saldo retido no Orange Money pós-compra',
    status: 'em_atendimento',
    createdAt: '31/07/2026 às 10:00',
    updatedAt: 'Há 25 minutos',
    messages: [
      { sender: 'Amadou Diallo', text: 'Fiz a compra do Inversor via Orange Money mas o saldo ainda aparece como pendente no meu aplicativo.', time: '10:00' },
      { sender: 'Aissatu Sow', text: 'Olá Amadou, o seu pagamento já foi recebido no sistema Nusali Pay e está em custódia Escrow para sua própria proteção.', time: '10:20' }
    ]
  },
  {
    id: 'TCK-802',
    userName: 'Carlos Biai (Bissau Tech)',
    userEmail: 'carlos.biai@nusali.gw',
    userType: 'vendedor',
    country: 'GW',
    category: 'kyc',
    priority: 'urgente',
    agentName: 'Malam Bacai Sanhá Jr.',
    subject: 'Solicitação de ampliação de limite de saques diários Orange Money',
    status: 'escalado',
    createdAt: '30/07/2026 às 15:30',
    updatedAt: 'Hoje às 09:10',
    messages: [
      { sender: 'Carlos Biai', text: 'Atingi o limite mensal de 10.000.000 XOF e preciso de autorização especial para saques da campanha.', time: '15:30' },
      { sender: 'Equipe KYC', text: 'Chamado escalado para a representação nacional da Guiné-Bissau.', time: '09:10', isInternal: true }
    ]
  }
];
