import React, { useState } from 'react';
import { ShieldCheck, Plus, CheckCircle2, Lock, Edit2, Trash2, X, Check } from 'lucide-react';

interface AdminRolesPermissionsProps {
  showToast: (msg: string) => void;
}

interface RoleItem {
  id: string;
  name: string;
  users: number;
  desc: string;
  permissions: string[];
}

export const AdminRolesPermissions: React.FC<AdminRolesPermissionsProps> = ({ showToast }) => {
  const [roles, setRoles] = useState<RoleItem[]>([]);

  const allAvailablePermissions = [
    'KYC',
    'Escrow',
    'Financeiro',
    'Usuários',
    'Configurações',
    'Catálogo',
    'Moderação',
    'Disputas',
    'Logística',
    'Marketing',
    'Suporte'
  ];

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);

  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);

  const handleOpenCreate = () => {
    setEditingRole(null);
    setName('');
    setDesc('');
    setSelectedPerms(['Suporte', 'Relatórios']);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (r: RoleItem) => {
    setEditingRole(r);
    setName(r.name);
    setDesc(r.desc);
    setSelectedPerms(r.permissions);
    setIsModalOpen(true);
  };

  const togglePermission = (perm: string) => {
    setSelectedPerms(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Por favor, digite o nome do perfil.');
      return;
    }

    if (editingRole) {
      setRoles(prev =>
        prev.map(r =>
          r.id === editingRole.id
            ? { ...r, name, desc, permissions: selectedPerms }
            : r
        )
      );
      showToast(`Matriz de permissões do perfil "${name}" atualizada!`);
    } else {
      const newRole: RoleItem = {
        id: `ROL-${Date.now().toString().slice(-4)}`,
        name,
        users: 0,
        desc: desc || 'Perfil personalizado',
        permissions: selectedPerms
      };
      setRoles(prev => [...prev, newRole]);
      showToast(`Novo perfil "${name}" criado com sucesso!`);
    }

    setIsModalOpen(false);
  };

  const handleDelete = (id: string, roleName: string) => {
    if (confirm(`Excluir o perfil "${roleName}"?`)) {
      setRoles(prev => prev.filter(r => r.id !== id));
      showToast(`Perfil "${roleName}" removido.`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Lock className="w-6 h-6 text-purple-600" />
            Matriz de Perfis, Funções & Permissões Granulares
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Configuração de acessos por perfil de liderança nacional e regional.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Criar Novo Perfil
        </button>
      </div>

      {roles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Lock className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhum perfil de permissão personalizado cadastrado.</p>
          <p className="text-xs text-gray-400 mt-1">Clique no botão acima para definir a primeira matriz de perfis e acessos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {roles.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-sm text-gray-900">{r.name}</h3>
                <p className="text-xs text-gray-500">{r.desc}</p>
              </div>
              <span className="bg-purple-50 text-purple-700 text-[10px] font-black px-2 py-0.5 rounded whitespace-nowrap">
                {r.users} Usuários Ativos
              </span>
            </div>

            <div className="flex flex-wrap gap-1 pt-1">
              {r.permissions.map((p, idx) => (
                <span key={idx} className="bg-gray-100 text-gray-700 text-[10px] font-bold px-2 py-0.5 rounded-md">
                  ✓ {p}
                </span>
              ))}
            </div>

            <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
              <button
                onClick={() => handleOpenEdit(r)}
                className="text-purple-600 font-extrabold hover:underline cursor-pointer flex items-center gap-1"
              >
                <Edit2 className="w-3.5 h-3.5" /> Editar Matriz de Permissões
              </button>
              <button
                onClick={() => handleDelete(r.id, r.name)}
                className="text-red-600 font-bold hover:underline cursor-pointer"
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
        </div>
      )}

      {/* Modal Criar / Editar Perfil */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-fadeIn">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
                <Lock className="w-5 h-5 text-purple-600" />
                {editingRole ? `Editar Perfil: ${editingRole.name}` : 'Criar Novo Perfil'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-gray-700 mb-1">Nome do Perfil:</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Auditor Financeiro Regional"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-1">Descrição das Responsabilidades:</label>
                <input
                  type="text"
                  placeholder="Ex: Responsável por auditorias de saques e boletos."
                  value={desc}
                  onChange={e => setDesc(e.target.value)}
                  className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-gray-700 mb-2">Selecione as Permissões do Módulo:</label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded-xl border border-gray-200 max-h-48 overflow-y-auto">
                  {allAvailablePermissions.map(perm => {
                    const isChecked = selectedPerms.includes(perm);
                    return (
                      <label
                        key={perm}
                        onClick={() => togglePermission(perm)}
                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition font-bold select-none ${
                          isChecked ? 'bg-purple-100 text-purple-900 border border-purple-300' : 'bg-white text-gray-700 border border-gray-200'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        {perm}
                      </label>
                    );
                  })}
                </div>
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
                  <Check className="w-4 h-4" /> Salvar Perfil
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
