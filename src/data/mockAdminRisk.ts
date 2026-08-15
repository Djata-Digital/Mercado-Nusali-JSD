export interface RiskAlertRecord {
  id: string;
  type: 'pagamento_suspeito' | 'multiplas_contas' | 'documentos_inconsistentes' | 'saque_alto_risco' | 'vendedor_novo_volume' | 'chargeback' | 'endereco_suspeito' | 'fraude_logistica' | 'falsificacao';
  entityName: string;
  entityType: 'Vendedor' | 'Comprador' | 'Transação' | 'Pedido';
  country: string;
  riskScoreNumber: number; // 0-100
  riskScoreLabel: 'Baixo' | 'Médio' | 'Alto' | 'Crítico';
  description: string;
  detectedAt: string;
  status: 'em_investigacao' | 'bloqueado' | 'liberado' | 'monitorado';
}

export const mockRiskAlertsList: RiskAlertRecord[] = [
  {
    id: 'RSK-101',
    type: 'saque_alto_risco',
    entityName: 'EletroBissau Ltda',
    entityType: 'Vendedor',
    country: 'GW',
    riskScoreNumber: 88,
    riskScoreLabel: 'Crítico',
    description: 'Solicitação de saque no valor de 8.500.000 XOF realizada 2 horas após a primeira venda.',
    detectedAt: '31/07/2026 às 12:15',
    status: 'em_investigacao'
  },
  {
    id: 'RSK-102',
    type: 'multiplas_contas',
    entityName: 'Kumba Dabó',
    entityType: 'Comprador',
    country: 'GW',
    riskScoreNumber: 76,
    riskScoreLabel: 'Alto',
    description: 'Mesmo dispositivo e IP associados a 4 contas de compradores abertas recentemente.',
    detectedAt: '30/07/2026 às 18:40',
    status: 'bloqueado'
  },
  {
    id: 'RSK-103',
    type: 'falsificacao',
    entityName: 'Importadora Caxito',
    entityType: 'Vendedor',
    country: 'AO',
    riskScoreNumber: 92,
    riskScoreLabel: 'Crítico',
    description: 'Anúncio com imagens e preços desproporcionais suspeitos de contrafação de eletrônicos.',
    detectedAt: '29/07/2026 às 11:20',
    status: 'bloqueado'
  }
];
