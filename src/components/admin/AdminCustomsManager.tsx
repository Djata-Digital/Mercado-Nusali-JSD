import React, { useState } from 'react';
import { Shield, FileCheck, DollarSign, CheckCircle2, Plus, X, Check } from 'lucide-react';

interface AdminCustomsManagerProps {
  showToast: (msg: string) => void;
}

interface CustomsDoc {
  id: string;
  orderId: string;
  route: string;
  declarant: string;
  taxAmount: string;
  status: string;
}

export const AdminCustomsManager: React.FC<AdminCustomsManagerProps> = ({ showToast }) => {
  const [customsDocs, setCustomsDocs] = useState<CustomsDoc[]>([
    { id: 'CST-901', orderId: 'ORD-9200', route: 'Lisboa ➔ Bissau', declarant: 'Eletro PT', taxAmount: '42.500 XOF', status: 'Aguardando Despacho Alfândega Bissau' },
    { id: 'CST-902', orderId: 'ORD-9205', route: 'São Paulo ➔ Bissau', declarant: 'Agro BR', taxAmount: '85.000 XOF', status: 'Aguardando Despacho Alfândega Bissau' }
  ]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [route, setRoute] = useState('Lisboa ➔ Bissau');
  const [declarant, setDeclarant] = useState('');
  const [taxAmount, setTaxAmount] = useState('25.000 XOF');

  const handleCreateDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) {
      showToast('Por favor, informe o código do pedido.');
      return;
    }

    const newDoc: CustomsDoc = {
      id: `CST-${Date.now().toString().slice(-3)}`,
      orderId,
      route,
      declarant: declarant || 'Declarante Homologado',
      taxAmount: taxAmount || '0 XOF',
      status: 'Aguardando Despacho Alfândega Bissau'
    };

    setCustomsDocs(prev => [newDoc, ...prev]);
    showToast(`Guia de Despacho DTA ${newDoc.id} gerada para o pedido ${orderId}!`);
    setIsModalOpen(false);

    setOrderId('');
    setDeclarant('');
  };

  const handleClearCustoms = (doc: CustomsDoc) => {
    setCustomsDocs(prev =>
      prev.map(c => c.id === doc.id ? { ...c, status: 'Despacho Liberado / DTA Emitida' } : c)
    );
    showToast(`Despacho aduaneiro ${doc.id} liberado com sucesso!`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Shield className="w-6 h-6 text-purple-600" />
            Gestão Alfandegária, DTA & Impostos CPLP
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Controle de declarações aduaneiras de importação/exportação e cálculo de tarifas de desembaraço.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Emitir Guia DTA / Declaração
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Declaração</th>
                <th className="p-3">Pedido</th>
                <th className="p-3">Rota Cross-Border</th>
                <th className="p-3">Imposto Apurado</th>
                <th className="p-3">Status Aduaneiro</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customsDocs.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="p-3 font-extrabold text-gray-900">{c.id}</td>
                  <td className="p-3 font-bold text-purple-700">{c.orderId}</td>
                  <td className="p-3 font-bold text-gray-800">{c.route}</td>
                  <td className="p-3 font-black text-emerald-700">{c.taxAmount}</td>
                  <td className="p-3">
                    <span className={`font-bold ${
                      c.status.includes('Liberado') ? 'text-emerald-600' : 'text-amber-700'
                    }`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleClearCustoms(c)}
                      className="px-2.5 py-1 bg-purple-50 text-purple-700 font-bold rounded-lg hover:bg-purple-100 transition cursor-pointer"
                    >
                      Liberar Despacho
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Emitir Guia DTA */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-purple-600" /> Emitir Guia DTA Aduaneira
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDoc} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Código do Pedido (Ref):</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: ORD-9210"
                  value={orderId}
                  onChange={e => setOrderId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold uppercase"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Rota de Trânsito Cross-Border:</label>
                <select
                  value={route}
                  onChange={e => setRoute(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                >
                  <option value="Lisboa ➔ Bissau">🇵🇹 Lisboa ➔ 🇬🇼 Bissau</option>
                  <option value="São Paulo ➔ Bissau">🇧🇷 São Paulo ➔ 🇬🇼 Bissau</option>
                  <option value="Luanda ➔ Bissau">🇦🇴 Luanda ➔ 🇬🇼 Bissau</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Declarante / Empresa Importadora:</label>
                <input
                  type="text"
                  placeholder="Ex: Importadora Bissau Tech Lda"
                  value={declarant}
                  onChange={e => setDeclarant(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Imposto Aduaneiro Calculado (XOF):</label>
                <input
                  type="text"
                  placeholder="Ex: 35.000 XOF"
                  value={taxAmount}
                  onChange={e => setTaxAmount(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Emitir Declaração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
