export interface LogisticsShipmentRecord {
  id: string;
  orderId: string;
  trackingCode: string;
  originCountry: string;
  destCountry: string;
  originCity: string;
  destCity: string;
  carrierName: string;
  warehouseName: string;
  senderName: string;
  recipientName: string;
  weightFormatted: string;
  status: 'coletado' | 'em_hub_origem' | 'em_transito_internacional' | 'alfandega_destino' | 'saiu_para_entrega' | 'entregue' | 'atrasado' | 'devolvido' | 'extraviado';
  dispatchDate: string;
  estimatedDeliveryDate: string;
  customsDutyPaid: boolean;
}

export const mockLogisticsShipmentsList: LogisticsShipmentRecord[] = [];

export const mockAdminLogisticsList = mockLogisticsShipmentsList;
