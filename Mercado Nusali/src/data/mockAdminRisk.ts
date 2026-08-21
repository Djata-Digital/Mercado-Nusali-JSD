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

export const mockRiskAlertsList: RiskAlertRecord[] = [];
