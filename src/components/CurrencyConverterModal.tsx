import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  TrendingUp,
  ArrowRightLeft,
  DollarSign,
  Globe2,
  CheckCircle2,
  Calendar,
  Sparkles,
  Zap,
} from 'lucide-react';
import { CurrencyService, LiveRatesResponse } from '../services/currencyService';
import { countriesConfig, formatCurrency, getExchangeRateDetails } from '../utils/currencyUtils';
import { CurrencyCode } from '../types';

interface CurrencyConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CurrencyConverterModal: React.FC<CurrencyConverterModalProps> = ({ isOpen, onClose }) => {
  const [ratesData, setRatesData] = useState<LiveRatesResponse>(CurrencyService.getRates());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [amount, setAmount] = useState<number>(100);
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>('USD');
  const [targetCurrency, setTargetCurrency] = useState<CurrencyCode>('BRL');

  useEffect(() => {
    setRatesData(CurrencyService.getRates());
    const unsubscribe = CurrencyService.subscribe((updated) => {
      setRatesData(updated);
    });
    return unsubscribe;
  }, []);

  if (!isOpen) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const updated = await CurrencyService.fetchLiveRates();
      setRatesData(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const supportedCurrencies: Array<{ code: CurrencyCode; name: string; flag: string; symbol: string }> = [
    { code: 'XOF', name: 'Franco CFA (Guiné-Bissau / BCEAO)', flag: '🇬🇼', symbol: 'CFA' },
    { code: 'BRL', name: 'Real Brasileiro (Brasil / Pix)', flag: '🇧🇷', symbol: 'R$' },
    { code: 'EUR', name: 'Euro (Portugal / Europa)', flag: '🇵🇹', symbol: '€' },
    { code: 'USD', name: 'Dólar Americano (Internacional)', flag: '🇺🇸', symbol: '$' },
    { code: 'AOA', name: 'Kwanza Angolano (Angola)', flag: '🇦🇴', symbol: 'Kz' },
    { code: 'MZN', name: 'Metical Moçambicano (Moçambique)', flag: '🇲🇿', symbol: 'MT' },
    { code: 'CVE', name: 'Escudo Cabo-verdiano (Cabo Verde)', flag: '🇨🇻', symbol: 'Esc' },
    { code: 'STN', name: 'Dobra Santomense (São Tomé e Príncipe)', flag: '🇸🇹', symbol: 'Db' },
  ];

  const convertedValue = CurrencyService.convert(amount, baseCurrency, targetCurrency);
  const directRate = CurrencyService.getPairRate(baseCurrency, targetCurrency);
  const inverseRate = directRate > 0 ? Number((1 / directRate).toFixed(4)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-gray-100 overflow-hidden relative animate-in fade-in zoom-in duration-200 my-6">
        {/* Header */}
        <div className="bg-linear-to-r from-emerald-700 via-teal-800 to-emerald-900 p-6 text-white relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-1 rounded-full bg-white/10 hover:bg-white/20 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 bg-emerald-500/30 text-emerald-100 border border-emerald-400/30 font-black text-[11px] px-3 py-0.5 rounded-full">
              <Zap className="w-3 h-3 text-yellow-300" /> CÂMBIO OFICIAL EM TEMPO REAL
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-200">
              <Calendar className="w-3 h-3" /> {ratesData.date}
            </span>
          </div>

          <h2 className="text-2xl font-black flex items-center gap-2">
            <Globe2 className="w-6 h-6 text-emerald-300" /> Conversor e Cotação Internacional do Dia
          </h2>
          <p className="text-xs text-emerald-100 mt-1 max-w-xl">
            Todas as conversões de compras, pedidos e Pix no Mercado Nusali utilizam a taxa de câmbio comercial do dia atualizada pelos bancos centrais e bolsas internacionais.
          </p>

          <div className="mt-4 flex items-center justify-between pt-3 border-t border-white/15 text-xs">
            <div className="flex items-center gap-2 text-emerald-100 font-medium">
              <span>Fonte:</span>
              <span className="font-bold text-white">{ratesData.source}</span>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Atualizando...' : 'Atualizar Cotação'}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {/* Interactive Live Converter */}
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-emerald-700" /> Simulador de Conversão Direta
              </span>
              <span className="text-[11px] text-emerald-800 font-semibold bg-emerald-100 px-2 py-0.5 rounded-full">
                1 {baseCurrency} = {directRate.toLocaleString('pt-BR', { maximumFractionDigits: 4 })} {targetCurrency}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              {/* From currency input */}
              <div className="bg-white p-3.5 rounded-xl border border-emerald-300/70 shadow-xs">
                <label className="block text-[11px] font-bold text-gray-600 mb-1.5">
                  Valor de Origem:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
                    className="w-full text-lg font-black text-gray-900 focus:outline-hidden"
                  />
                  <select
                    value={baseCurrency}
                    onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
                    className="bg-gray-100 border border-gray-300 rounded-lg px-2.5 py-1.5 text-xs font-black text-gray-900 cursor-pointer"
                  >
                    {supportedCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* To currency result */}
              <div className="bg-emerald-600 text-white p-3.5 rounded-xl border border-emerald-700 shadow-md">
                <label className="block text-[11px] font-bold text-emerald-100 mb-1.5">
                  Valor Convertido no Câmbio de Hoje:
                </label>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xl font-black text-white truncate">
                    {formatCurrency(convertedValue, targetCurrency)}
                  </div>
                  <select
                    value={targetCurrency}
                    onChange={(e) => setTargetCurrency(e.target.value as CurrencyCode)}
                    className="bg-emerald-800 text-white border border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs font-black cursor-pointer"
                  >
                    {supportedCurrencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.flag} {c.code} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-emerald-900 font-medium pt-1">
              <span>
                Taxa Inversa: 1 {targetCurrency} = {inverseRate.toLocaleString('pt-BR', { maximumFractionDigits: 6 })} {baseCurrency}
              </span>
              <span className="text-emerald-700 font-bold">Sem spread abusivo • Paridade Oficial</span>
            </div>
          </div>

          {/* Quotation Grid of the Day for 1 USD and 1 EUR */}
          <div className="space-y-3">
            <h3 className="text-sm font-black text-gray-900 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-emerald-600" /> Tabela de Câmbio Comercial Oficial do Dia
              </span>
              <span className="text-[11px] text-gray-500 font-normal">Base: 1 USD / 1 EUR</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {supportedCurrencies.map((c) => {
                const rateToUSD = ratesData.rates[c.code] || 1;
                const convertedFrom100Usd = CurrencyService.convert(100, 'USD', c.code);
                const convertedFrom100Eur = CurrencyService.convert(100, 'EUR', c.code);

                return (
                  <div
                    key={c.code}
                    className="p-3.5 bg-gray-50 rounded-2xl border border-gray-200 hover:border-emerald-300 transition space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{c.flag}</span>
                        <div>
                          <div className="font-extrabold text-xs text-gray-900 flex items-center gap-1">
                            {c.code} <span className="text-[10px] text-gray-500 font-normal">({c.symbol})</span>
                          </div>
                          <div className="text-[10px] text-gray-500 truncate max-w-[170px]">{c.name}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-emerald-800">
                          {c.code === 'USD' ? '1.00 USD' : `1 USD = ${rateToUSD.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`}
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-200 flex items-center justify-between text-[10px] text-gray-600 font-mono">
                      <span>$100 USD = {formatCurrency(convertedFrom100Usd, c.code)}</span>
                      <span>€100 EUR = {formatCurrency(convertedFrom100Eur, c.code)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Informative Footer */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-xs space-y-1.5 text-blue-950">
            <div className="flex items-center gap-2 font-bold text-blue-900">
              <CheckCircle2 className="w-4 h-4 text-blue-700" />
              <span>Garantia de Transparência Cambial Mercado Nusali</span>
            </div>
            <p className="text-[11px] text-blue-800 leading-relaxed">
              O Mercado Nusali realiza a liquidação e conversão de transações internacionais (como pagamentos de compradores no Brasil via Pix ou clientes em Portugal via Euro para vendedores na Guiné-Bissau e África) baseada exatamente na cotação oficial diária internacional, sem margens ocultas.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-gray-900 hover:bg-black text-white font-bold text-xs px-6 py-2.5 rounded-xl transition cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
