export interface AdminOrderRecord {
  id: string;
  buyerName: string;
  sellerName: string;
  storeName: string;
  originCountry: string;
  destCountry: string;
  currency: string;
  total: number;
  totalFormatted: string;
  paymentMethod: string;
  escrowStatus: 'retained' | 'released' | 'disputed' | 'refunded';
  logisticsStatus: 'criado' | 'aguardando_pagamento' | 'pago' | 'em_preparacao' | 'enviado' | 'em_transito' | 'alfandega' | 'entregue' | 'cancelado' | 'devolvido' | 'em_disputa';
  date: string;
  trackingCode: string;
}

export const mockAdminOrdersList: AdminOrderRecord[] = [
  {
    id: 'ORD-9102',
    buyerName: 'Amadou Diallo',
    sellerName: 'Carlos Biai',
    storeName: 'Bissau Tech Store',
    originCountry: 'GW',
    destCountry: 'GW',
    currency: 'XOF',
    total: 450000,
    totalFormatted: '450.000 XOF',
    paymentMethod: 'Orange Money',
    escrowStatus: 'retained',
    logisticsStatus: 'em_transito',
    date: '31/07/2026',
    trackingCode: 'NUS-GW-9102-X'
  },
  {
    id: 'ORD-8750',
    buyerName: 'Maria Silva',
    sellerName: 'Soluções Agrícolas Lda',
    storeName: 'Nusali Agro Bissau',
    originCountry: 'GW',
    destCountry: 'BR',
    currency: 'BRL',
    total: 1250.0,
    totalFormatted: 'R$ 1.250,00',
    paymentMethod: 'PIX',
    escrowStatus: 'released',
    logisticsStatus: 'entregue',
    date: '28/07/2026',
    trackingCode: 'NUS-BR-8750-INT'
  },
  {
    id: 'ORD-8810',
    buyerName: 'Bacai Sanhá',
    sellerName: 'Ana Paula Rocha',
    storeName: 'Moda Afro CPLP',
    originCountry: 'BR',
    destCountry: 'GW',
    currency: 'XOF',
    total: 180000,
    totalFormatted: '180.000 XOF',
    paymentMethod: 'Nusali Pay (Saldo)',
    escrowStatus: 'disputed',
    logisticsStatus: 'em_disputa',
    date: '29/07/2026',
    trackingCode: 'NUS-GW-8810-CB'
  },
  {
    id: 'ORD-9200',
    buyerName: 'Kumba Dabó',
    sellerName: 'Carlos Biai',
    storeName: 'Bissau Tech Store',
    originCountry: 'GW',
    destCountry: 'GW',
    currency: 'XOF',
    total: 890000,
    totalFormatted: '890.000 XOF',
    paymentMethod: 'MTN Mobile Money',
    escrowStatus: 'retained',
    logisticsStatus: 'alfandega',
    date: '30/07/2026',
    trackingCode: 'NUS-GW-9200-ALF'
  }
];
