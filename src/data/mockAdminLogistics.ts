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

export const mockLogisticsShipmentsList: LogisticsShipmentRecord[] = [
  {
    id: 'SHIP-901',
    orderId: 'ORD-9102',
    trackingCode: 'NUS-GW-9102-X',
    originCountry: 'GW',
    destCountry: 'GW',
    originCity: 'Bissau (HUB Bandim)',
    destCity: 'Bafatá (Centro)',
    carrierName: 'Nusali Logística Bissau',
    warehouseName: 'HUB Central Bandim Bissau',
    senderName: 'Bissau Tech Store',
    recipientName: 'Amadou Diallo',
    weightFormatted: '1.2 kg',
    status: 'saiu_para_entrega',
    dispatchDate: '31/07/2026',
    estimatedDeliveryDate: '01/08/2026',
    customsDutyPaid: true
  },
  {
    id: 'SHIP-902',
    orderId: 'ORD-8750',
    trackingCode: 'NUS-BR-8750-INT',
    originCountry: 'GW',
    destCountry: 'BR',
    originCity: 'Bissau',
    destCity: 'São Paulo/SP',
    carrierName: 'Nusali Air Cargo CPLP',
    warehouseName: 'HUB São Paulo Guarulhos',
    senderName: 'Soluções Agrícolas Lda',
    recipientName: 'Maria Silva',
    weightFormatted: '15.0 kg',
    status: 'entregue',
    dispatchDate: '24/07/2026',
    estimatedDeliveryDate: '28/07/2026',
    customsDutyPaid: true
  },
  {
    id: 'SHIP-903',
    orderId: 'ORD-9200',
    trackingCode: 'NUS-GW-9200-ALF',
    originCountry: 'PT',
    destCountry: 'GW',
    originCity: 'Lisboa',
    destCity: 'Bissau',
    carrierName: 'Nusali Cross-Border Freight',
    warehouseName: 'HUB Lisboa Transit',
    senderName: 'Eletro PT Europe',
    recipientName: 'Kumba Dabó',
    weightFormatted: '8.5 kg',
    status: 'alfandega_destino',
    dispatchDate: '28/07/2026',
    estimatedDeliveryDate: '03/08/2026',
    customsDutyPaid: false
  }
];

export const mockAdminLogisticsList = mockLogisticsShipmentsList;

