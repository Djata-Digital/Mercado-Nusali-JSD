export interface AuditLogRecord {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entity: string;
  previousValue: string;
  newValue: string;
  ipAddress: string;
  country: string;
  timestamp: string;
  result: 'sucesso' | 'falha' | 'alerta';
}

export const mockAuditLogsList: AuditLogRecord[] = [
  {
    id: 'AUD-501',
    userName: 'Malam Bacai Sanhá Jr.',
    userRole: 'Representante Nacional',
    action: 'Aprovação de KYC Vendedor',
    entity: 'Vendedor Bissau Tech Store (SEL-001)',
    previousValue: 'Pendente',
    newValue: 'Verificado Ouro',
    ipAddress: '197.214.12.89',
    country: 'GW',
    timestamp: '31/07/2026 14:22:10',
    result: 'sucesso'
  },
  {
    id: 'AUD-502',
    userName: 'Juliana Mendes',
    userRole: 'Representante Nacional BR',
    action: 'Resolução de Disputa Escrow',
    entity: 'Disputa #DSP-9822',
    previousValue: 'Em Mediação',
    newValue: 'Liberado para Vendedor',
    ipAddress: '187.32.110.45',
    country: 'BR',
    timestamp: '31/07/2026 13:05:40',
    result: 'sucesso'
  },
  {
    id: 'AUD-503',
    userName: 'Mussá Mane',
    userRole: 'Supervisor Regional Bissau',
    action: 'Ajuste de Tarifa Frete Regional',
    entity: 'Região Setor Autónomo Bissau',
    previousValue: '1.200 XOF',
    newValue: '1.500 XOF',
    ipAddress: '197.214.15.10',
    country: 'GW',
    timestamp: '30/07/2026 16:40:00',
    result: 'sucesso'
  }
];
