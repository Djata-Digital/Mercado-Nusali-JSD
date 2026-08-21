import React, { useState } from 'react';
import { Megaphone, Calendar, CheckCircle2, ArrowRight, Sparkles, Users } from 'lucide-react';

interface SellerCampaignsProps {
  showToast: (msg: string) => void;
}

export const SellerCampaigns: React.FC<SellerCampaignsProps> = ({ showToast }) => {
  const [campaigns, setCampaigns] = useState<any[]>([]);

  const handleToggleJoin = (id: string, title: string, currentJoined: boolean) => {
    setCampaigns(prev => prev.map(c => c.id === id ? {
      ...c,
      joined: !currentJoined,
      status: !currentJoined ? 'Participando' : 'Inscrições Abertas'
    } : c));

    if (!currentJoined) {
      showToast(`Inscrição confirmada na campanha "${title}"! Seus produtos elegíveis serão destacados.`);
    } else {
      showToast(`Você cancelou a participação na campanha "${title}".`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-emerald-600" />
            Campanhas Coletivas Oficiais da Plataforma
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Inscreva seus produtos nas grandes datas comemorativas organizadas pelo Mercado Nusali para ganhar visibilidade máxima.
          </p>
        </div>
      </div>

      {campaigns.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhuma campanha sazonal aberta para inscrição no momento.</p>
          <p className="text-xs text-gray-400 mt-1">Fique atento aos anúncios da diretoria de marketing para novos eventos sazonais.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {campaigns.map(c => (
          <div key={c.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden flex flex-col">
            <div className="h-36 relative overflow-hidden bg-gray-900">
              <img src={c.banner} alt="" className="w-full h-full object-cover opacity-80" />
              <span className="absolute top-3 right-3 bg-emerald-600 text-white font-extrabold text-[10px] px-2.5 py-1 rounded-full uppercase shadow-xs">
                {c.badge}
              </span>
            </div>

            <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
              <div>
                <h3 className="text-base font-black text-gray-900 leading-tight">{c.title}</h3>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" /> {c.dates}
                </p>
                <p className="text-xs font-bold text-emerald-800 mt-2">
                  {c.eligibleCount} produtos do seu catálogo cumprem os requisitos de desconto.
                </p>
              </div>

              <button
                onClick={() => handleToggleJoin(c.id, c.title, c.joined)}
                className={`w-full py-2.5 rounded-xl font-extrabold text-xs transition flex items-center justify-center gap-1.5 shadow-xs ${
                  c.joined
                    ? 'bg-emerald-100 text-emerald-900 border border-emerald-300 hover:bg-emerald-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                {c.joined ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" /> Inscrito na Campanha
                  </>
                ) : (
                  <>
                    Garantir Minha Vaga na Campanha <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
        </div>
      )}
    </div>
  );
};
