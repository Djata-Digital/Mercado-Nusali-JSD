export interface PaymentGatewayRequest {
  orderId: string;
  amount: number;
  currency: string;
  customerName: string;
  customerEmail: string;
  paymentMethod: string;
  metadata?: Record<string, any>;
}

export interface PaymentGatewayResponse {
  success: boolean;
  transactionRef: string;
  status: 'PENDING' | 'APPROVED' | 'FAILED' | 'REFUNDED';
  qrCodeUrl?: string;
  pixCopiaECola?: string;
  rawResponse?: any;
}

export interface PayoutGatewayRequest {
  payoutId: string;
  sellerId: string;
  amount: number;
  currency: string;
  method: string;
  destinationAccount: {
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    pixKey?: string;
    mobileMoneyNumber?: string;
  };
}

export interface PayoutGatewayResponse {
  success: boolean;
  transactionRef: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  rawResponse?: any;
}

export interface PaymentProvider {
  readonly name: string;
  initiatePayment(req: PaymentGatewayRequest): Promise<PaymentGatewayResponse>;
  checkPaymentStatus(transactionRef: string): Promise<PaymentGatewayResponse>;
  refundPayment(transactionRef: string, amount?: number): Promise<PaymentGatewayResponse>;
}

export interface PayoutProvider {
  readonly name: string;
  processPayout(req: PayoutGatewayRequest): Promise<PayoutGatewayResponse>;
  getPayoutStatus(transactionRef: string): Promise<PayoutGatewayResponse>;
}
