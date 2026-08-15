export interface AdminPaymentRecord {
  id: string;
  orderId: string;
  buyerName: string;
  sellerName: string;
  method: string; // Orange Money, PIX, MB WAY, Multicaixa, Carteira Nusali
  country: string;
  currency: string;
  amount: number;
  amountFormatted: string;
  feeAmountFormatted: string;
  status: 'iniciado' | 'pendente' | 'processando' | 'pago' | 'falhou' | 'cancelado' | 'estornado' | 'reembolsado';
  riskLevel: 'baixo' | 'medio' | 'alto';
  date: string;
  transactionRef: string;
}

export const mockAdminPaymentsList: AdminPaymentRecord[] = [
  {
    id: 'TXN-8012',
    orderId: 'ORD-9102',
    buyerName: 'Amadou Diallo',
    sellerName: 'Carlos Biai',
    method: 'Orange Money',
    country: 'GW',
    currency: 'XOF',
    amount: 450000,
    amountFormatted: '450.000 XOF',
    feeAmountFormatted: '6.750 XOF (1.5%)',
    status: 'pago',
    riskLevel: 'baixo',
    date: '31/07/2026 às 11:42',
    transactionRef: 'OM-GW-20260731-98102'
  },
  {
    id: 'TXN-7988',
    orderId: 'ORD-8750',
    buyerName: 'Maria Silva',
    sellerName: 'Soluções Agrícolas Lda',
    method: 'PIX',
    country: 'BR',
    currency: 'BRL',
    amount: 1250.0,
    amountFormatted: 'R$ 1.250,00',
    feeAmountFormatted: 'R$ 12,50',
    status: 'pago',
    riskLevel: 'baixo',
    date: '28/07/2026 às 15:10',
    transactionRef: 'PIX-BR-99018239012'
  },
  {
    id: 'TXN-8045',
    orderId: 'ORD-8810',
    buyerName: 'Bacai Sanhá',
    sellerName: 'Ana Paula Rocha',
    method: 'Carteira Nusali',
    country: 'GW',
    currency: 'XOF',
    amount: 180000,
    amountFormatted: '180.000 XOF',
    feeAmountFormatted: '0 XOF (Interno)',
    status: 'pago',
    riskLevel: 'medio',
    date: '29/07/2026 às 09:20',
    transactionRef: 'PAY-INT-88001122'
  },
  {
    id: 'TXN-8090',
    orderId: 'ORD-9200',
    buyerName: 'Kumba Dabó',
    sellerName: 'Carlos Biai',
    method: 'MTN Mobile Money',
    country: 'GW',
    currency: 'XOF',
    amount: 890000,
    amountFormatted: '890.000 XOF',
    feeAmountFormatted: '13.350 XOF',
    status: 'processando',
    riskLevel: 'alto',
    date: '30/07/2026 às 18:05',
    transactionRef: 'MTN-GW-77829101'
  }
];
