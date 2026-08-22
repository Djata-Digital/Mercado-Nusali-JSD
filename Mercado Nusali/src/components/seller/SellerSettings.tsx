import React, { useState, useEffect } from 'react';
import { Settings, Shield, Bell, Truck, FileText, ToggleLeft, ToggleRight, Save, Loader2 } from 'lucide-react';
import { SellerProfileData } from '../../data/mockSellerData';
import { SellerService } from '../../services/sellerService';

interface SellerSettingsProps {
  showToast: (msg: string) => void;
  profile?: SellerProfileData;
  onUpdateProfile?: (profile: SellerProfileData) => void;
}

export const SellerSettings: React.FC<SellerSettingsProps> = ({ showToast, profile, onUpdateProfile }) => {
  const [stores, setStores] = useState<any[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [vacationMode, setVacationMode] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(true);
  const [autoFreeShipping, setAutoFreeShipping] = useState(false);
  const [shippingMode, setShippingMode] = useState<'CUSTOMER_PAYS' | 'SELLER_FREE_SHIPPING' | 'SELLER_SUBSIDIZED'>('CUSTOMER_PAYS');
  const [subsidyType, setSubsidyType] = useState<'MAX_AMOUNT' | 'PERCENT'>('MAX_AMOUNT');
  const [subsidyMaxAmount, setSubsidyMaxAmount] = useState<number>(0);
  const [subsidyPercent, setSubsidyPercent] = useState<number>(0);
  const [nifTaxId, setNifTaxId] = useState('NIF-982109482');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadStores = async () => {
      try {
        const storesRes = await SellerService.getStores();
        if (storesRes.success && Array.isArray(storesRes.data) && storesRes.data.length > 0) {
          setStores(storesRes.data);
          setSelectedStoreId(storesRes.data[0].id);
        }
      } catch (err) {
        console.error('Error loading stores in settings:', err);
      }
    };
    loadStores();
  }, []);

  useEffect(() => {
    const loadSettingsAndPolicy = async () => {
      try {
        const settingsRes = await SellerService.getSettings();
        if (settingsRes.success && settingsRes.data) {
          setVacationMode(!!settingsRes.data.vacationMode);
          setEmailAlerts(settingsRes.data.emailAlerts ?? true);
          setSmsAlerts(settingsRes.data.smsAlerts ?? true);
          setAutoFreeShipping(!!settingsRes.data.autoFreeShipping);
          if (settingsRes.data.nifTaxId) setNifTaxId(settingsRes.data.nifTaxId);
        }

        if (selectedStoreId) {
          const policyRes = await SellerService.getShippingPolicy(selectedStoreId);
          if (policyRes.success && policyRes.data) {
            setShippingMode(policyRes.data.mode || 'CUSTOMER_PAYS');
            setSubsidyMaxAmount(Number(policyRes.data.sellerSubsidyMaxAmount) || 0);
            setSubsidyPercent(Number(policyRes.data.sellerSubsidyPercent) || 0);
            setSubsidyType(policyRes.data.subsidyType || 'MAX_AMOUNT');
          }
        }
      } catch (err) {
        console.error('Error loading settings and shipping policy:', err);
      }
    };
    loadSettingsAndPolicy();
  }, [selectedStoreId]);

  const handleSaveSettings = async () => {
    if (!selectedStoreId) {
      showToast('Selecione uma loja para salvar a política de frete.');
      return;
    }
    try {
      setLoading(true);
      const [settingsRes, policyRes] = await Promise.all([
        SellerService.updateSettings({
          vacationMode,
          emailAlerts,
          smsAlerts,
          autoFreeShipping,
          nifTaxId,
        }),
        SellerService.updateShippingPolicy({
          storeId: selectedStoreId,
          mode: shippingMode,
          sellerSubsidyMaxAmount: subsidyType === 'MAX_AMOUNT' ? subsidyMaxAmount : 0,
          sellerSubsidyPercent: subsidyType === 'PERCENT' ? subsidyPercent : 0,
          subsidyType,
        }),
      ]);

      if (settingsRes.success && policyRes.success) {
        showToast('Configurações e Política de Frete salvas com sucesso!');
      } else {
        showToast(policyRes.error?.message || policyRes.message || settingsRes.message || 'Erro ao salvar configurações.');
      }
    } catch (err: any) {
      showToast(err.message || 'Erro de conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-emerald-600" />
            Configurações Gerais da Loja
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Preferências de funcionamento, modo férias, regras de frete e configurações fiscais.
          </p>
        </div>

        <button
          onClick={handleSaveSettings}
          disabled={loading}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Salvar Alterações
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-6 space-y-6">
        {/* Vacation Mode */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <div>
            <h3 className="text-xs font-black text-gray-900 uppercase">Modo Férias / Pausa nas Vendas</h3>
            <p className="text-xs text-gray-500">Pausa temporariamente o recebimento de novos pedidos sem perder suas métricas de reputação.</p>
          </div>
          <button
            onClick={() => { setVacationMode(!vacationMode); showToast(vacationMode ? 'Modo férias desativado.' : 'Modo férias ativado!'); }}
            className="text-emerald-600"
          >
            {vacationMode ? <ToggleRight className="w-10 h-10 text-emerald-600" /> : <ToggleLeft className="w-10 h-10 text-gray-300" />}
          </button>
        </div>

        {/* Notifications */}
        <div className="space-y-3 border-b border-gray-100 pb-4">
          <h3 className="text-xs font-black text-gray-900 uppercase">Alertas & Notificações</h3>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-700 font-bold">Alertas por E-mail em cada venda:</span>
            <input type="checkbox" checked={emailAlerts} onChange={() => setEmailAlerts(!emailAlerts)} className="w-4 h-4 text-emerald-600 rounded" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-700 font-bold">Alertas SMS / WhatsApp para perguntas de clientes:</span>
            <input type="checkbox" checked={smsAlerts} onChange={() => setSmsAlerts(!smsAlerts)} className="w-4 h-4 text-emerald-600 rounded" />
          </div>
        </div>

        {/* Freight Policy Selection (Requirement 7) */}
        <div className="space-y-4 border-b border-gray-100 pb-5">
          <div>
            <h3 className="text-xs font-black text-gray-900 uppercase flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-emerald-600" /> Política de Frete e Subsídios da Loja
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Defina como os custos de frete são compartilhados entre sua loja e o comprador.
            </p>
          </div>

          {stores.length > 0 && (
            <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-emerald-900">Configurando política da loja:</span>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="text-xs font-bold bg-white border border-emerald-300 text-gray-900 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              >
                {stores.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name || st.title} ({st.countryCode || 'BR'})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-3 pt-1">
            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
              <input
                type="radio"
                name="shippingMode"
                value="CUSTOMER_PAYS"
                checked={shippingMode === 'CUSTOMER_PAYS'}
                onChange={() => setShippingMode('CUSTOMER_PAYS')}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <span className="font-extrabold text-gray-900 block">Cliente paga o frete</span>
                <span className="text-gray-500">O comprador assume 100% do custo calculado da entrega no momento do checkout.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
              <input
                type="radio"
                name="shippingMode"
                value="SELLER_FREE_SHIPPING"
                checked={shippingMode === 'SELLER_FREE_SHIPPING'}
                onChange={() => setShippingMode('SELLER_FREE_SHIPPING')}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs">
                <span className="font-extrabold text-gray-900 block">Oferecer Frete Grátis integral</span>
                <span className="text-gray-500">O comprador vê "Frete GRÁTIS". O custo real calculado da entrega será descontado do seu saldo a receber.</span>
              </div>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50/80 transition cursor-pointer">
              <input
                type="radio"
                name="shippingMode"
                value="SELLER_SUBSIDIZED"
                checked={shippingMode === 'SELLER_SUBSIDIZED'}
                onChange={() => setShippingMode('SELLER_SUBSIDIZED')}
                className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
              />
              <div className="text-xs space-y-1.5 w-full">
                <span className="font-extrabold text-gray-900 block">Subsidiar parte do frete</span>
                <span className="text-gray-500 block">Sua loja cobre uma parcela do frete e o comprador paga apenas o valor excedente.</span>

                {shippingMode === 'SELLER_SUBSIDIZED' && (
                  <div className="space-y-3 pt-2 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <span className="text-[11px] font-extrabold text-gray-800 block">Escolha a regra de subsídio (apenas uma modalidade):</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className={`p-2.5 rounded-lg border flex items-start gap-2 cursor-pointer transition ${subsidyType === 'MAX_AMOUNT' ? 'bg-white border-emerald-500 shadow-2xs' : 'bg-gray-100/60 border-gray-200'}`}>
                        <input
                          type="radio"
                          name="subsidyType"
                          value="MAX_AMOUNT"
                          checked={subsidyType === 'MAX_AMOUNT'}
                          onChange={() => setSubsidyType('MAX_AMOUNT')}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="w-full">
                          <span className="text-[11px] font-bold text-gray-900 block">Valor Máximo Fixo (R$)</span>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs font-bold text-gray-500">R$</span>
                            <input
                              type="number"
                              disabled={subsidyType !== 'MAX_AMOUNT'}
                              value={subsidyMaxAmount || ''}
                              onChange={(e) => setSubsidyMaxAmount(Number(e.target.value))}
                              placeholder="20.00"
                              className="w-full p-1.5 text-xs font-bold border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
                            />
                          </div>
                        </div>
                      </label>

                      <label className={`p-2.5 rounded-lg border flex items-start gap-2 cursor-pointer transition ${subsidyType === 'PERCENT' ? 'bg-white border-emerald-500 shadow-2xs' : 'bg-gray-100/60 border-gray-200'}`}>
                        <input
                          type="radio"
                          name="subsidyType"
                          value="PERCENT"
                          checked={subsidyType === 'PERCENT'}
                          onChange={() => setSubsidyType('PERCENT')}
                          className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="w-full">
                          <span className="text-[11px] font-bold text-gray-900 block">Percentual do Frete (%)</span>
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="number"
                              disabled={subsidyType !== 'PERCENT'}
                              value={subsidyPercent || ''}
                              onChange={(e) => setSubsidyPercent(Number(e.target.value))}
                              placeholder="50"
                              className="w-full p-1.5 text-xs font-bold border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 disabled:opacity-40"
                            />
                            <span className="text-xs font-bold text-gray-500">%</span>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </label>
          </div>

          {/* Informative Warning */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs flex items-start gap-2">
            <Truck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Aviso Importante:</strong> Frete grátis não significa custo logístico zero. O valor do frete calculado pela transportadora/tabela será descontado do seu recebimento da venda.
            </p>
          </div>
        </div>

        {/* Fiscal NIF */}
        <div className="space-y-2">
          <h3 className="text-xs font-black text-gray-900 uppercase">Identificação Fiscal (NIF / CNPJ)</h3>
          <input
            type="text"
            value={nifTaxId}
            onChange={(e) => setNifTaxId(e.target.value)}
            className="w-full max-w-md p-2.5 text-xs font-mono border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      </div>
    </div>
  );
};
