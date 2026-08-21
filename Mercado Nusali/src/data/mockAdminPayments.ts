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

export const mockAdminPaymentsList: AdminPaymentRecord[] = [];
