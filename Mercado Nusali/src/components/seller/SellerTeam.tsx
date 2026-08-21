import React, { useState } from 'react';
import {
  Users,
  PlusCircle,
  Shield,
  UserPlus,
  Mail,
  Phone,
  Store,
  CheckCircle2,
  XCircle,
  X,
  Check,
} from 'lucide-react';
import { SellerTeamMember, SellerStoreData } from '../../data/mockSellerData';

interface SellerTeamProps {
  team: SellerTeamMember[];
  stores: SellerStoreData[];
  onAddMember: (member: SellerTeamMember) => void;
  showToast: (msg: string) => void;
}

export const SellerTeam: React.FC<SellerTeamProps> = ({
  team,
  stores,
  onAddMember,
  showToast,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<SellerTeamMember['role']>('attendant');
  const [assignedStoreId, setAssignedStoreId] = useState('all');

  const roleLabels = {
    owner: 'Proprietário (Acesso Total)',
    manager: 'Gerente Geral de Loja',
    attendant: 'Atendente SAC & Perguntas',
    order_operator: 'Operador de Pedidos & Etiquetas',
    inventory_manager: 'Gerente de Estoque & HUB',
    financial: 'Analista Financeiro & Saques',
    marketing: 'Analista de Marketing & Anúncios',
  };

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    const newMember: SellerTeamMember = {
      id: `tm-${Date.now()}`,
      name,
      email,
      phone: phone || '+245 955000000',
      role,
      assignedStoreId,
      status: 'active',
      lastAccess: 'Nunca acessou',
    };

    onAddMember(newMember);
    showToast(`Convite enviado para ${name} (${email})!`);
    setIsModalOpen(false);
    setName('');
    setEmail('');
  };

  // Permission Matrix Schema
  const permissionModules = [
    { name: 'Visão Geral & Métricas', rolesAllowed: ['owner', 'manager', 'financial'] },
    { name: 'Gestão de Produtos & IA', rolesAllowed: ['owner', 'manager', 'inventory_manager', 'marketing'] },
    { name: 'Estoque & Armazéns HUB', rolesAllowed: ['owner', 'manager', 'inventory_manager'] },
    { name: 'Processamento de Pedidos', rolesAllowed: ['owner', 'manager', 'order_operator'] },
    { name: 'Finanças & Saques (Orange/Bank)', rolesAllowed: ['owner', 'financial'] },
    { name: 'Marketing & Cupons', rolesAllowed: ['owner', 'manager', 'marketing'] },
    { name: 'Atendimento & SAC Chat', rolesAllowed: ['owner', 'manager', 'attendant'] },
  ];

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-emerald-700" /> Equipe da Loja & Matriz de Permissões
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Adicione funcionários e colaboradores com permissões específicas para gerenciar pedidos, responder clientes ou gerir finanças.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center gap-2 shadow-xs shrink-0"
        >
          <UserPlus className="w-4 h-4" /> Convidar Novo Membro
        </button>
      </div>

      {/* Team Members List */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
        <h2 className="text-sm font-bold text-gray-900 border-b border-gray-100 pb-3">
          Membros da Equipe Cadastrados ({team.length})
        </h2>

        <div className="divide-y divide-gray-100">
          {team.length === 0 ? (
            <div className="p-8 text-center text-gray-500 font-bold">
              Nenhum membro na equipe
            </div>
          ) : (
            team.map((m) => {
            const assignedStore = stores.find((s) => s.id === m.assignedStoreId);

            return (
              <div key={m.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white font-black flex items-center justify-center text-xs shrink-0">
                    {m.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <span className="font-bold text-gray-900 block">{m.name}</span>
                    <span className="text-gray-500 font-mono text-[11px] block">{m.email} • {m.phone}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2.5 py-1 rounded-lg text-[11px]">
                    {roleLabels[m.role]}
                  </span>

                  <span className="text-gray-500 font-medium text-[11px]">
                    Loja: <strong className="text-gray-800">{assignedStore ? assignedStore.name : 'Todas as Lojas'}</strong>
                  </span>

                  <span className="text-gray-400 font-mono text-[10px]">
                    {m.lastAccess}
                  </span>
                </div>
              </div>
            );
          }))}
        </div>
      </div>

      {/* Visual Permission Matrix Table */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-2xs space-y-4">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <Shield className="w-4 h-4 text-emerald-700" /> Matriz Visual de Permissões por Função
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-700">
                <th className="p-3 font-bold">Módulo da Central</th>
                <th className="p-3 font-bold text-center">Proprietário</th>
                <th className="p-3 font-bold text-center">Gerente</th>
                <th className="p-3 font-bold text-center">Atendente SAC</th>
                <th className="p-3 font-bold text-center">Operador Pedidos</th>
                <th className="p-3 font-bold text-center">Estoque HUB</th>
                <th className="p-3 font-bold text-center">Financeiro</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {permissionModules.map((pm, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50">
                  <td className="p-3 font-bold text-gray-900">{pm.name}</td>
                  {(['owner', 'manager', 'attendant', 'order_operator', 'inventory_manager', 'financial'] as const).map(
                    (r) => {
                      const hasPerm = pm.rolesAllowed.includes(r);
                      return (
                        <td key={r} className="p-3 text-center">
                          {hasPerm ? (
                            <Check className="w-4 h-4 text-emerald-600 mx-auto font-black" />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    }
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Member Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-base text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-700" /> Convidar Membro para a Equipe
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInvite} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-700 font-bold mb-1">Nome Completo *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Mariama Djalo"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">E-mail Corporativo *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="mariama@silvatech.gw"
                  required
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+245 955987654"
                  className="w-full p-2.5 border border-gray-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Função / Cargo *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white font-bold"
                >
                  <option value="manager">Gerente Geral de Loja</option>
                  <option value="attendant">Atendente SAC & Perguntas</option>
                  <option value="order_operator">Operador de Pedidos & Etiquetas</option>
                  <option value="inventory_manager">Gerente de Estoque & HUB</option>
                  <option value="financial">Analista Financeiro & Saques</option>
                  <option value="marketing">Analista de Marketing & Anúncios</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-bold mb-1">Loja Atribuída *</label>
                <select
                  value={assignedStoreId}
                  onChange={(e) => setAssignedStoreId(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl bg-white"
                >
                  <option value="all">Todas as Lojas (Acesso Global)</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 font-bold hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-2 shadow-xs"
                >
                  <UserPlus className="w-4 h-4" /> Enviar Convite por E-mail
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
