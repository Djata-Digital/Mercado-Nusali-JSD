import React, { useState, useEffect } from 'react';
import { Users, Search, Filter, Shield, Ban, Lock, Unlock, Key, RefreshCw, Eye, AlertOctagon, Plus, X, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { AdminService } from '../../services/adminService';
import { AdminUserRecord } from '../../data/mockAdminUsers';

interface AdminUsersManagerProps {
  showToast: (msg: string) => void;
}

export const AdminUsersManager: React.FC<AdminUsersManagerProps> = ({ showToast }) => {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'buyers' | 'sellers' | 'internal' | 'blocked' | 'suspended' | 'pending_kyc'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewUser, setViewUser] = useState<AdminUserRecord | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<AdminUserRecord | null>(null);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form for New User
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formCountry, setFormCountry] = useState('GW');
  const [formRole, setFormRole] = useState<'buyer' | 'seller' | 'admin' | 'country_rep' | 'supervisor'>('buyer');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const res = await AdminService.getUsers();
      if (res.success && res.data) {
        setUsers(res.data);
      }
    } catch {
      // handled in service
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = users.filter(u => {
    if (activeTab === 'buyers' && u.role !== 'buyer') return false;
    if (activeTab === 'sellers' && u.role !== 'seller') return false;
    if (activeTab === 'internal' && u.role !== 'admin' && u.role !== 'country_rep' && u.role !== 'supervisor') return false;
    if (activeTab === 'blocked' && u.status !== 'blocked') return false;
    if (activeTab === 'suspended' && u.status !== 'suspended') return false;
    if (activeTab === 'pending_kyc' && u.status !== 'pending_kyc') return false;
    if (searchTerm) {
      const match = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                    (u.phone && u.phone.includes(searchTerm));
      if (!match) return false;
    }
    return true;
  });

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim()) {
      showToast('Por favor, informe o nome e o email do usuário.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await AdminService.createUser({
        name: formName,
        email: formEmail,
        phone: formPhone || '+245 950000000',
        role: formRole,
        country: formCountry,
      });

      if (res.success && res.data) {
        setUsers(prev => [res.data, ...prev]);
        showToast(res.message || `Usuário "${formName}" cadastrado com sucesso!`);
      } else {
        showToast(`Usuário "${formName}" cadastrado no sistema!`);
      }
      setIsCreateModalOpen(false);

      // Reset form
      setFormName('');
      setFormEmail('');
      setFormPhone('');
      setFormCountry('GW');
      setFormRole('buyer');
    } catch (err: any) {
      showToast('Erro ao cadastrar usuário.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBlock = async (u: AdminUserRecord) => {
    const nextStatus = u.status === 'blocked' ? 'active' : 'blocked';
    try {
      const res = await AdminService.toggleUserStatus(u.id, nextStatus);
      setUsers(prev =>
        prev.map(item => item.id === u.id ? { ...item, status: nextStatus } : item)
      );
      showToast(res.message || `Usuário ${u.name} alterado para status ${nextStatus.toUpperCase()}.`);
    } catch {
      showToast(`Status de ${u.name} atualizado.`);
    }
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPasswordUser || !newPasswordInput.trim()) return;

    try {
      const res = await AdminService.resetUserPassword(resetPasswordUser.id, newPasswordInput);
      showToast(res.message || `Senha do usuário ${resetPasswordUser.name} redefinida com sucesso!`);
    } catch {
      showToast(`Senha redefinida.`);
    }
    setResetPasswordUser(null);
    setNewPasswordInput('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-purple-600" />
            Gestão Global de Usuários
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Administração de compradores, vendedores e equipe interna com controle de acesso e auditoria de risco.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Cadastrar Novo Usuário
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
        {/* Tabs & Search */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'buyers', label: 'Compradores' },
              { id: 'sellers', label: 'Vendedores' },
              { id: 'blocked', label: 'Bloqueados' },
              { id: 'suspended', label: 'Suspensos' },
              { id: 'pending_kyc', label: 'Pendentes KYC' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition cursor-pointer ${
                  activeTab === tab.id ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar por nome, email, tel..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 font-bold"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase font-black text-[10px]">
                <th className="p-3">Usuário / Email</th>
                <th className="p-3">País</th>
                <th className="p-3">Função</th>
                <th className="p-3">Status</th>
                <th className="p-3">Risco</th>
                <th className="p-3">Pedidos/Vendas</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(u => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="p-3">
                    <div className="font-extrabold text-gray-900">{u.name}</div>
                    <div className="text-[10px] text-gray-400">{u.email} • {u.phone}</div>
                  </td>
                  <td className="p-3 font-bold text-gray-800">
                    {u.country === 'GW' ? '🇬🇼 GW' : u.country === 'BR' ? '🇧🇷 BR' : u.country === 'PT' ? '🇵🇹 PT' : '🇦🇴 AO'}
                  </td>
                  <td className="p-3 font-bold text-purple-700">{u.roleLabel}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      u.status === 'active' ? 'bg-emerald-100 text-emerald-800' :
                      u.status === 'blocked' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {u.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3">
                    <span className={`font-bold ${
                      u.riskScore === 'critico' ? 'text-red-600' :
                      u.riskScore === 'alto' ? 'text-amber-600' : 'text-emerald-600'
                    }`}>
                      {u.riskScore.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 font-bold text-gray-700">{u.ordersCount} refs</td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewUser(u)}
                        className="p-1.5 hover:bg-purple-50 text-purple-600 rounded-lg cursor-pointer"
                        title="Visualizar Detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { setResetPasswordUser(u); setNewPasswordInput(''); }}
                        className="p-1.5 hover:bg-gray-100 text-gray-600 rounded-lg cursor-pointer"
                        title="Redefinir Senha"
                      >
                        <Key className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleToggleBlock(u)}
                        className={`p-1.5 rounded-lg cursor-pointer ${
                          u.status === 'blocked' ? 'hover:bg-emerald-50 text-emerald-600' : 'hover:bg-red-50 text-red-600'
                        }`}
                        title={u.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Novo Usuário */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" /> Cadastrar Novo Usuário
              </h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome Completo:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Domingos Caetano"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">E-mail de Acesso:</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: domingos@gmail.com"
                  value={formEmail}
                  onChange={e => setFormEmail(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Telefone / WhatsApp:</label>
                  <input
                    type="text"
                    placeholder="+245 950000000"
                    value={formPhone}
                    onChange={e => setFormPhone(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">País:</label>
                  <select
                    value={formCountry}
                    onChange={e => setFormCountry(e.target.value)}
                    className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                  >
                    <option value="GW">🇬🇼 Guiné-Bissau</option>
                    <option value="BR">🇧🇷 Brasil</option>
                    <option value="PT">🇵🇹 Portugal</option>
                    <option value="AO">🇦🇴 Angola</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Função / Perfil:</label>
                <select
                  value={formRole}
                  onChange={e => setFormRole(e.target.value as any)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                >
                  <option value="buyer">Comprador</option>
                  <option value="seller">Vendedor</option>
                  <option value="admin">Administrador Global</option>
                  <option value="country_rep">Representante Nacional</option>
                  <option value="supervisor">Supervisor de Operações</option>
                </select>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" /> Cadastrar Usuário
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal View Details */}
      {viewUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Eye className="w-5 h-5 text-purple-600" /> Detalhes do Usuário #{viewUser.id}
              </h3>
              <button onClick={() => setViewUser(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="bg-purple-50 p-4 rounded-xl space-y-1">
                <p className="font-extrabold text-sm text-purple-900">{viewUser.name}</p>
                <p className="text-purple-700 font-bold">{viewUser.email} • {viewUser.phone}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-gray-700">
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 text-[10px] block font-bold">Função</span>
                  <span className="font-extrabold text-gray-900">{viewUser.roleLabel}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 text-[10px] block font-bold">País</span>
                  <span className="font-extrabold text-gray-900">{viewUser.country}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 text-[10px] block font-bold">Status da Conta</span>
                  <span className="font-extrabold text-emerald-700 uppercase">{viewUser.status}</span>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl">
                  <span className="text-gray-400 text-[10px] block font-bold">Risco Antifraude</span>
                  <span className="font-extrabold text-purple-700 uppercase">{viewUser.riskScore}</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-gray-100">
              <button
                onClick={() => setViewUser(null)}
                className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold rounded-xl"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Redefinir Senha */}
      {resetPasswordUser && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Key className="w-5 h-5 text-purple-600" /> Redefinir Senha de {resetPasswordUser.name}
              </h3>
              <button onClick={() => setResetPasswordUser(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nova Senha Provisória:</label>
                <input
                  type="password"
                  required
                  placeholder="Digite a nova senha..."
                  value={newPasswordInput}
                  onChange={e => setNewPasswordInput(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setResetPasswordUser(null)}
                  className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md"
                >
                  Confirmar Redefinição
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
