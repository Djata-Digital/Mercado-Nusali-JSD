export interface AdminEscrowRecord {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  amount: number;
  amountFormatted: string;
  currency: string;
  createdAt: string;
  releaseCondition: string;
  deliveryStatus: string;
  hasDispute: boolean;
  expectedReleaseDate: string;
  status: 'aguardando_pagamento' | 'retido' | 'aguardando_envio' | 'em_transporte' | 'aguardando_confirmacao' | 'disponivel_liberacao' | 'liberado' | 'em_disputa' | 'reembolsado' | 'bloqueado';
  notes?: string;
}

export const mockAdminEscrowList: AdminEscrowRecord[] = [
  {
    id: 'ESC-9102',
    orderId: 'ORD-9102',
    buyerName: 'Amadou Diallo',
    sellerName: 'Carlos Biai',
    amount: 450000,
    amountFormatted: '450.000 XOF',
    currency: 'XOF',
    createdAt: '31/07/2026',
    releaseCondition: 'Confirmação de Recepção pelo Comprador ou 48h pós-entrega',
    deliveryStatus: 'Em Trânsito - Nusali Logística Bissau',
    hasDispute: false,
    expectedReleaseDate: '02/08/2026',
    status: 'retido',
    notes: 'Valor em custódia segura Nusali Proteção.'
  },
  {
    id: 'ESC-8750',
    orderId: 'ORD-8750',
    buyerName: 'Maria Silva',
    sellerName: 'Soluções Agrícolas Lda',
    amount: 1250.0,
    amountFormatted: 'R$ 1.250,00',
    currency: 'BRL',
    createdAt: '28/07/2026',
    releaseCondition: 'Entrega confirmada pelo rastreamento internacional',
    deliveryStatus: 'Entregue em São Paulo/BR',
    hasDispute: false,
    expectedReleaseDate: '30/07/2026',
    status: 'liberado',
    notes: 'Liberado para o saldo da loja em 30/07.'
  },
  {
    id: 'ESC-8810',
    orderId: 'ORD-8810',
    buyerName: 'Bacai Sanhá',
    sellerName: 'Ana Paula Rocha',
    amount: 180000,
    amountFormatted: '180.000 XOF',
    currency: 'XOF',
    createdAt: '29/07/2026',
    releaseCondition: 'Bloqueado devido a Disputa aberta pelo Comprador',
    deliveryStatus: 'Pacote Danificado na Entrega',
    hasDispute: true,
    expectedReleaseDate: 'Pendente Mediador',
    status: 'em_disputa',
    notes: 'Em análise com Mediador de Disputas Nusali.'
  },
  {
    id: 'ESC-9200',
    orderId: 'ORD-9200',
    buyerName: 'Kumba Dabó',
    sellerName: 'Carlos Biai',
    amount: 890000,
    amountFormatted: '890.000 XOF',
    currency: 'XOF',
    createdAt: '30/07/2026',
    releaseCondition: 'Liberacao mediante vistoria alfandegaria Bissau',
    deliveryStatus: 'Aguardando Liberação Aduaneira',
    hasDispute: false,
    expectedReleaseDate: '03/08/2026',
    status: 'retido',
    notes: 'Documentação fiscal anexada pelo vendedor.'
  }
];
