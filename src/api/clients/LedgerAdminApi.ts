import { apiClient, ApiResponse } from '../apiClient';

/**
 * Cliente da API administrativa do ledger sombra (E6): /admin/ledger. A AUTORIZAÇÃO é do servidor (leitura: GLOBAL_ADMIN/FINANCE/RISK_ANALYST; ações sensíveis: só GLOBAL_ADMIN);
 * a interface apenas esconde o que o perfil não pode usar. Não há chamada que altere lançamentos, e nenhuma ação movimenta dinheiro real.
 */
export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export type Q = Record<string, string | number | undefined>;
const clean = (p?: Q) => Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== ''));
const base = '/admin/ledger';

export class LedgerAdminApi {
  static summary(): Promise<ApiResponse<any>> { return apiClient.get(`${base}/summary`); }

  static transactions(params?: Q): Promise<ApiResponse<Page<any>>> { return apiClient.get(`${base}/transactions`, { params: clean(params) }); }
  static transaction(id: string): Promise<ApiResponse<any>> { return apiClient.get(`${base}/transactions/${encodeURIComponent(id)}`); }

  static outbox(params?: Q): Promise<ApiResponse<Page<any>>> { return apiClient.get(`${base}/outbox`, { params: clean(params) }); }
  static outboxEvent(id: string): Promise<ApiResponse<any>> { return apiClient.get(`${base}/outbox/${encodeURIComponent(id)}`); }
  static requeue(id: string, reason: string): Promise<ApiResponse<any>> { return apiClient.post(`${base}/outbox/${encodeURIComponent(id)}/requeue`, { reason }); }
  static dismiss(id: string, reason: string): Promise<ApiResponse<any>> { return apiClient.post(`${base}/outbox/${encodeURIComponent(id)}/dismiss`, { reason }); }
  /** Sem apply = simulação. Aplicar exige confirm:true (o servidor recusa sem ele). */
  static repairMissing(opts: { apply?: boolean; confirm?: boolean; limit?: number }): Promise<ApiResponse<any>> { return apiClient.post(`${base}/repair-missing`, opts); }

  static findings(params?: Q): Promise<ApiResponse<Page<any>>> { return apiClient.get(`${base}/findings`, { params: clean(params) }); }
  static finding(id: string): Promise<ApiResponse<any>> { return apiClient.get(`${base}/findings/${encodeURIComponent(id)}`); }
  static acknowledge(id: string, note: string): Promise<ApiResponse<any>> { return apiClient.post(`${base}/findings/${encodeURIComponent(id)}/acknowledge`, { note }); }

  static chargebacks(params?: Q): Promise<ApiResponse<Page<any>>> { return apiClient.get(`${base}/chargebacks`, { params: clean(params) }); }
  static chargeback(id: string): Promise<ApiResponse<any>> { return apiClient.get(`${base}/chargebacks/${encodeURIComponent(id)}`); }
  static addEvidence(id: string, body: { kind: string; description: string; fileRef?: string; sha256?: string }): Promise<ApiResponse<any>> { return apiClient.post(`${base}/chargebacks/${encodeURIComponent(id)}/evidence`, body); }
  static proposeDecision(id: string, body: any): Promise<ApiResponse<any>> { return apiClient.post(`${base}/chargebacks/${encodeURIComponent(id)}/decisions`, body); }
  static approveDecision(id: string): Promise<ApiResponse<any>> { return apiClient.post(`${base}/chargeback-decisions/${encodeURIComponent(id)}/approve`, {}); }
  static rejectDecision(id: string, reason: string): Promise<ApiResponse<any>> { return apiClient.post(`${base}/chargeback-decisions/${encodeURIComponent(id)}/reject`, { reason }); }
  static settle(allocationId: string, body: { kind: 'RECOVERY' | 'WRITE_OFF'; partyRef: string; amount: string; evidenceRef: string; reason: string; idempotencyKey: string }): Promise<ApiResponse<any>> {
    return apiClient.post(`${base}/chargeback-allocations/${encodeURIComponent(allocationId)}/settlements`, body);
  }

  static shippingReversals(params?: Q): Promise<ApiResponse<Page<any>>> { return apiClient.get(`${base}/shipping-reversals`, { params: clean(params) }); }
  static recordShippingReversal(body: { orderId: string; amount: string; evidenceRef: string; reason: string; idempotencyKey: string }): Promise<ApiResponse<any>> { return apiClient.post(`${base}/shipping-reversals`, body); }
}
