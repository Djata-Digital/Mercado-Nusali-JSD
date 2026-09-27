import React from 'react';
import { CreditCard, Info } from 'lucide-react';

interface AdminPaymentsManagerProps {
  showToast: (msg: string) => void;
}

// FASE D18-C4.1 (P0-B) — o botão "Estornar" desta tela só chamava
// showToast(...), sem NENHUMA chamada ao backend: um admin podia acreditar
// que um estorno real tinha ocorrido quando nada foi movimentado. Auditoria
// completa (D18-C4/D18-C4.1): a lista desta tela (`mockAdminPaymentsList`)
// é dado fictício (e sempre vazia hoje — nenhum código a popula), sem
// orderId/payment reais para validar contra `processRefund()` (que exige um
// order/payment de verdade — ver refundService.ts). Reaproveitar
// processRefund() aqui exigiria primeiro construir uma listagem real de
// transações (endpoint novo, fora do escopo mínimo desta correção) — sem
// isso, não há precondições suficientes para um refund financeiro seguro.
// Por isso a AÇÃO foi removida, não substituída por um novo motor
// financeiro paralelo. O reembolso real de devoluções já existe e funciona
// em Devoluções (POST /admin/returns/:id/refund) e Disputas (resolver
// disputa com reembolso) — ambos reutilizam o MESMO processRefund().
export const AdminPaymentsManager: React.FC<AdminPaymentsManagerProps> = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-purple-600" />
            Nusali Pay - Gestão Transacional & Gateways
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Monitoramento das integrações Orange Money, MTN, PIX, Multicaixa, MB WAY e Carteiras Digitais.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-8">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-900">
          <Info className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold">Listagem de transações ainda não conectada a um endpoint real.</p>
            <p>
              Para processar um reembolso de verdade, use <strong>Devoluções</strong> (após o vendedor confirmar
              recebimento e inspeção) ou a resolução de <strong>Disputas</strong> — ambos já usam o motor financeiro
              real (mesma lógica de escrow/wallet, nunca duplicada).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
