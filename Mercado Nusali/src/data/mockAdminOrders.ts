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

export const mockAdminOrdersList: AdminOrderRecord[] = [];
