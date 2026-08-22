import React, { useState } from 'react';
import { Bell, Send, CheckCircle2, History } from 'lucide-react';

interface AdminNotificationsManagerProps {
  showToast: (msg: string) => void;
}

interface SentNotification {
  id: string;
  audience: string;
  title: string;
  sentAt: string;
}

export const AdminNotificationsManager: React.FC<AdminNotificationsManagerProps> = ({ showToast }) => {
  const [audience, setAudience] = useState('Todos os Usuários da Guiné-Bissau (🇬🇼)');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<SentNotification[]>([
    {
      id: 'NOTIF-1',
      audience: 'Vendedores Verificados (Líder Ouro)',
      title: 'Aviso de encerramento de boletos no final de semana',
      sentAt: 'Ontem às 14:30'
    }
  ]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) {
      showToast('Por favor, preencha o título e a mensagem da notificação.');
      return;
    }

    const newNotif: SentNotification = {
      id: `NOTIF-${Date.now().toString().slice(-4)}`,
      audience,
      title,
      sentAt: 'Agora mesmo'
    };

    setHistory(prev => [newNotif, ...prev]);
    showToast(`Comunicado "${title}" disparado com sucesso para "${audience}"!`);

    setTitle('');
    setMessage('');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-purple-600" />
            Central de Notificações Push, SMS & E-mail
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Envio de comunicados em massa por país, segmento de usuários ou status de conta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
          <h3 className="font-extrabold text-sm text-gray-900">Disparar Comunicado Global ou Regional</h3>

          <form onSubmit={handleSend} className="space-y-3 text-xs">
            <div>
              <label className="font-bold text-gray-700 block mb-1">Público Alvo:</label>
              <select
                value={audience}
                onChange={e => setAudience(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold"
              >
                <option value="Todos os Usuários da Guiné-Bissau (🇬🇼)">Todos os Usuários da Guiné-Bissau (🇬🇼)</option>
                <option value="Vendedores Verificados (Líder Ouro)">Vendedores Verificados (Líder Ouro)</option>
                <option value="Compradores Nusali Plus">Compradores Nusali Plus</option>
                <option value="Usuários de Portugal (🇵🇹) e Brasil (🇧🇷)">Usuários de Portugal (🇵🇹) e Brasil (🇧🇷)</option>
              </select>
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Título da Notificação:</label>
              <input
                type="text"
                required
                placeholder="Ex: Grande Feira Digital de Bissau..."
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="font-bold text-gray-700 block mb-1">Mensagem Push / SMS / E-mail:</label>
              <textarea
                rows={4}
                required
                placeholder="Digite a mensagem para o push..."
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full p-2.5 border border-gray-300 rounded-xl font-bold focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-purple-600 text-white font-extrabold rounded-xl hover:bg-purple-700 transition flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Send className="w-4 h-4" /> Disparar Comunicado Agora
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-4">
          <h3 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
            <History className="w-4 h-4 text-purple-600" /> Histórico de Disparos
          </h3>

          <div className="space-y-3 text-xs">
            {history.map(item => (
              <div key={item.id} className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-1">
                <span className="text-[10px] text-purple-700 font-extrabold block">{item.audience}</span>
                <p className="font-extrabold text-gray-900">{item.title}</p>
                <span className="text-[10px] text-gray-400 block">{item.sentAt}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
