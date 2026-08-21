export interface AdminDisputeRecord {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  productTitle: string;
  country: string;
  reason: string;
  amountFormatted: string;
  escrowStatus: string;
  messagesCount: number;
  evidencesCount: number;
  mediatorName?: string;
  status: 'nova' | 'awaiting_buyer' | 'awaiting_seller' | 'in_mediation' | 'evidences_submitted' | 'pending_decision' | 'resolved' | 'appealed';
  deadline: string;
  timeline: { title: string; date: string; done: boolean }[];
}

export const mockAdminDisputesList: AdminDisputeRecord[] = [
  {
    id: 'DSP-9821',
    orderId: 'ORD-8810',
    buyerName: 'Bacai Sanhá',
    sellerName: 'Ana Paula Rocha (Moda Afro CPLP)',
    productTitle: 'Inversor Solar Híbrido 5kW 48V High Efficiency',
    country: 'GW',
    reason: 'Produto com caixa amassada e avaria no gabinete exterior durante envio cross-border.',
    amountFormatted: '180.000 XOF',
    escrowStatus: 'Bloqueado (180.000 XOF)',
    messagesCount: 8,
    evidencesCount: 3,
    mediatorName: 'Mussá Mane (Mediador Senior)',
    status: 'in_mediation',
    deadline: '24 horas restantes',
    timeline: [
      { title: 'Disputa Aberta pelo Comprador', date: '29/07 10:15', done: true },
      { title: 'Vendedor Enviou Réplica com NF e fotos de despacho', date: '29/07 16:30', done: true },
      { title: 'Análise de Evidências Logísticas e Fotos', date: '30/07 09:00', done: true },
      { title: 'Proposta de Acordo com Reembolso Parcial de 30.000 XOF', date: '31/07 11:00', done: false },
      { title: 'Decisão Final e Liberação Escrow', date: 'Pendente', done: false }
    ]
  },
  {
    id: 'DSP-9822',
    orderId: 'ORD-7712',
    buyerName: 'Maria Silva',
    sellerName: 'Bissau Tech Store',
    productTitle: 'Galaxy S23 Ultra 512GB Phantom Black',
    country: 'BR',
    reason: 'Comprador alega que não recebeu um dos acessórios listados no anúncio.',
    amountFormatted: 'R$ 4.200,00',
    escrowStatus: 'Retido em Mediação',
    messagesCount: 4,
    evidencesCount: 2,
    mediatorName: 'Juliana Mendes',
    status: 'pending_decision',
    deadline: '12 horas restantes',
    timeline: [
      { title: 'Disputa Aberta', date: '27/07 14:00', done: true },
      { title: 'Solicitação de Evidências ao Vendedor', date: '28/07 09:00', done: true },
      { title: 'Envio de comprovante de empacotamento HUB Bissau', date: '29/07 11:00', done: true },
      { title: 'Emissão de Decisão Final pelo Mediador', date: '31/07 17:00', done: false }
    ]
  }
];
