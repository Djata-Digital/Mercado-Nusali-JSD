import React, { useEffect, useMemo, useState } from 'react';
import {
  Route, MapPinned, Layers, Truck, Search, X, Check, Loader2, Power, ChevronLeft, ChevronRight, Plus, AlertTriangle, Pencil,
} from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import { useCountries } from '../../hooks/useCountries';
import { ShippingRateForm } from './ShippingRateForm';
import { ShippingLeadTimeEditor } from './ShippingLeadTimeEditor';
import { leadTimeErrorMessage } from '../../utils/shippingLeadTime';
import {
  RateFormValues, emptyRateForm, rateToForm, buildRatePayload, rateErrorMessage, describeValidity, describeRateEdit,
} from '../../utils/shippingRateForm';

/**
 * FASE D15-B — painel administrativo real da fundação de frete por setor
 * criada no D15-A (shipping_regions/shipping_sectors/shipping_routes/
 * shipping_services/shipping_route_rates).
 *
 * Deliberadamente um componente NOVO, NÃO uma transformação de
 * AdminRegionsManager.tsx ("Regiões & Setores" no menu "Liderança &
 * Operações"): auditoria confirmou que aquela tela pertence à tabela
 * `regions` (RBAC territorial — supervisores regionais, texto livre,
 * nenhuma relação com geografia de frete) e continua 100% funcional e
 * intocada. Reaproveita, sim, o PADRÃO VISUAL já comprovado em
 * AdminShippingRatesManager.tsx (tabela + modal para tarifas por faixa de
 * peso) — mas para o modelo novo de setor/rota, em paralelo ao sistema
 * país↔país antigo (que este arquivo nunca lê nem escreve).
 *
 * NÃO integra ao checkout — só administração/configuração da nova
 * arquitetura (D15-B). Todas as validações financeiras (overlap, peso,
 * moeda, país) são de autoridade EXCLUSIVA do backend
 * (validateShippingRouteRateInput, D15-A) — este arquivo nunca duplica essa
 * lógica, só exibe o erro exato que a API devolve.
 */

interface ShippingRegion { id: string; countryCode: string; name: string; code: string; isActive: boolean }
interface ShippingSector { id: string; countryCode: string; regionId: string; name: string; code: string; isActive: boolean }
interface ShippingService { id: string; countryCode: string; name: string; code: string; description?: string | null; isActive: boolean }
interface ShippingRouteRow {
  id: string; countryCode: string; originSectorId: string; destinationSectorId: string;
  isActive: boolean; deletedAt: string | null;
  originSectorName?: string | null; destinationSectorName?: string | null; configuredServiceCodes?: string[];
}

interface AdminShippingGeographyManagerProps {
  showToast: (msg: string) => void;
}

const PAGE_SIZE = 20;

export const AdminShippingGeographyManager: React.FC<AdminShippingGeographyManagerProps> = ({ showToast }) => {
  const { data: operationalCountries } = useCountries();
  const [country, setCountry] = useState('GW');
  const currentCountry = operationalCountries?.find((c) => c.code === country);

  const [activeTab, setActiveTab] = useState<'geography' | 'routes' | 'services'>('geography');

  const [regions, setRegions] = useState<ShippingRegion[]>([]);
  const [sectors, setSectors] = useState<ShippingSector[]>([]);
  const [services, setServices] = useState<ShippingService[]>([]);
  const [routesWithRateCount, setRoutesWithRateCount] = useState<number | null>(null);
  const [routesTotalCount, setRoutesTotalCount] = useState<number | null>(null);
  const [isLoadingGeo, setIsLoadingGeo] = useState(true);

  const loadGeography = async () => {
    setIsLoadingGeo(true);
    try {
      const [regionsRes, sectorsRes, servicesRes, totalRes, withRateRes] = await Promise.all([
        AdminApi.getShippingGeographyRegions({ country }),
        AdminApi.getShippingGeographySectors({ country }),
        AdminApi.getShippingGeographyServices({ country }),
        AdminApi.getShippingRoutes({ country, page: 1, limit: 1 }),
        AdminApi.getShippingRoutes({ country, hasRate: true, page: 1, limit: 1 }),
      ]);
      setRegions(regionsRes.success ? regionsRes.data || [] : []);
      setSectors(sectorsRes.success ? sectorsRes.data || [] : []);
      setServices(servicesRes.success ? servicesRes.data || [] : []);
      setRoutesTotalCount((totalRes as any)?.pagination?.total ?? null);
      setRoutesWithRateCount((withRateRes as any)?.pagination?.total ?? null);
    } catch {
      showToast('Erro ao carregar geografia de frete.');
    } finally {
      setIsLoadingGeo(false);
    }
  };

  useEffect(() => {
    loadGeography();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const sectorsByRegion = useMemo(() => {
    const map = new Map<string, ShippingSector[]>();
    for (const s of sectors) {
      const list = map.get(s.regionId) || [];
      list.push(s);
      map.set(s.regionId, list);
    }
    return map;
  }, [sectors]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Route className="w-6 h-6 text-purple-600" />
            Rotas & Tarifas de Frete por Setor
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Fundação D15-A (região → setor → rota → serviço → tarifa) — sistema paralelo ao de "Tarifas de Frete" (país↔país). Ainda não conectado ao checkout.
          </p>
        </div>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="p-2.5 border border-gray-300 rounded-xl text-xs font-bold bg-white"
        >
          {(operationalCountries || [{ code: 'GW', name: 'Guiné-Bissau', flag: '🇬🇼' } as any]).map((c: any) => (
            <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.code})</option>
          ))}
        </select>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Regiões', value: regions.length, icon: MapPinned },
          { label: 'Setores', value: sectors.length, icon: Layers },
          { label: 'Rotas', value: routesTotalCount ?? '—', icon: Route },
          { label: 'Rotas com tarifa configurada', value: routesWithRateCount ?? '—', icon: Truck },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-1">
            <div className="flex items-center gap-1.5 text-gray-400">
              <card.icon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{card.label}</span>
            </div>
            <div className="text-2xl font-black text-gray-900">{isLoadingGeo ? <Loader2 className="w-5 h-5 animate-spin text-gray-300" /> : card.value}</div>
          </div>
        ))}
      </div>

      {/* Navegação interna */}
      <div className="bg-white rounded-2xl border border-gray-200 p-2 shadow-xs inline-flex gap-1">
        {[
          { id: 'geography', label: 'Regiões & Setores' },
          { id: 'routes', label: 'Rotas & Tarifas' },
          { id: 'services', label: 'Serviços' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as any)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              activeTab === t.id ? 'bg-purple-600 text-white shadow-xs' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'geography' && (
        <GeographyTab regions={regions} sectorsByRegion={sectorsByRegion} isLoading={isLoadingGeo} />
      )}

      {activeTab === 'routes' && (
        <RoutesTab
          country={country}
          currency={currentCountry?.currency || ''}
          regions={regions}
          sectors={sectors}
          services={services}
          showToast={showToast}
          onRoutesChanged={loadGeography}
        />
      )}

      {activeTab === 'services' && <ServicesTab services={services} isLoading={isLoadingGeo} />}
    </div>
  );
};

// ============================================================================
// ABA 1 — Regiões & Setores (somente leitura nesta primeira versão, por
// escopo: o pedido explicitamente permite não editar nomes agora).
// ============================================================================
const GeographyTab: React.FC<{ regions: ShippingRegion[]; sectorsByRegion: Map<string, ShippingSector[]>; isLoading: boolean }> = ({ regions, sectorsByRegion, isLoading }) => {
  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Carregando regiões...</div>;
  }
  if (regions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500 font-bold">
        Nenhuma região de frete cadastrada para este país. Rode o seed da geografia de frete antes de continuar.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {regions.map((r) => {
        const sectorsInRegion = sectorsByRegion.get(r.id) || [];
        return (
          <div key={r.id} className="bg-white rounded-2xl border border-gray-200 shadow-xs p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-mono">{r.code}</span>
                <h3 className="font-extrabold text-sm text-gray-900 mt-1">{r.name}</h3>
              </div>
              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                {r.isActive ? 'ATIVA' : 'INATIVA'}
              </span>
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase">{sectorsInRegion.length} setores</div>
            <div className="flex flex-wrap gap-1">
              {sectorsInRegion.map((s) => (
                <span key={s.id} className={`text-[10px] font-medium px-2 py-0.5 rounded ${s.isActive ? 'bg-gray-100 text-gray-700' : 'bg-gray-50 text-gray-400 line-through'}`}>
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================================
// ABA 3 — Serviços (somente leitura — criação de serviços fica pelo seed,
// fora de escopo do D15-B).
// ============================================================================
const ServicesTab: React.FC<{ services: ShippingService[]; isLoading: boolean }> = ({ services, isLoading }) => {
  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Carregando serviços...</div>;
  }
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider">
          <tr>
            <th className="text-left px-4 py-3 font-bold">Código</th>
            <th className="text-left px-4 py-3 font-bold">Nome</th>
            <th className="text-left px-4 py-3 font-bold">Descrição</th>
            <th className="text-left px-4 py-3 font-bold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {services.map((s) => (
            <tr key={s.id}>
              <td className="px-4 py-3 font-mono font-bold text-purple-700">{s.code}</td>
              <td className="px-4 py-3 font-bold text-gray-900">{s.name}</td>
              <td className="px-4 py-3 text-gray-500">{s.description || '—'}</td>
              <td className="px-4 py-3">
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                  {s.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ============================================================================
// ABA 2 — Rotas & Tarifas — tabela paginada, NUNCA as 1.521 de uma vez.
// ============================================================================
const RoutesTab: React.FC<{
  country: string; currency: string; regions: ShippingRegion[]; sectors: ShippingSector[]; services: ShippingService[];
  showToast: (msg: string) => void; onRoutesChanged: () => void;
}> = ({ country, currency, regions, sectors, services, showToast, onRoutesChanged }) => {
  const [routes, setRoutes] = useState<ShippingRouteRow[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);
  const [managingRoute, setManagingRoute] = useState<ShippingRouteRow | null>(null);

  const [filterOriginRegion, setFilterOriginRegion] = useState('');
  const [filterOriginSector, setFilterOriginSector] = useState('');
  const [filterDestinationRegion, setFilterDestinationRegion] = useState('');
  const [filterDestinationSector, setFilterDestinationSector] = useState('');
  const [filterActive, setFilterActive] = useState<'all' | 'true' | 'false'>('all');
  const [filterService, setFilterService] = useState('');
  const [filterOnlyWithoutRate, setFilterOnlyWithoutRate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);

  const originSectorOptions = filterOriginRegion ? sectors.filter((s) => s.regionId === filterOriginRegion) : sectors;
  const destinationSectorOptions = filterDestinationRegion ? sectors.filter((s) => s.regionId === filterDestinationRegion) : sectors;

  const loadRoutes = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getShippingRoutes({
        country,
        originRegion: filterOriginRegion || undefined,
        originSector: filterOriginSector || undefined,
        destinationRegion: filterDestinationRegion || undefined,
        destinationSector: filterDestinationSector || undefined,
        active: filterActive === 'all' ? undefined : filterActive === 'true',
        service: filterService || undefined,
        hasRate: filterOnlyWithoutRate ? false : undefined,
        q: searchTerm.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      });
      if (res.success) {
        setRoutes((res.data as any) || []);
        setPagination((res as any).pagination || { total: 0, page: 1, totalPages: 1 });
      } else {
        showToast('Erro ao carregar rotas.');
      }
    } catch {
      showToast('Erro ao carregar rotas.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRoutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, filterOriginRegion, filterOriginSector, filterDestinationRegion, filterDestinationSector, filterActive, filterService, filterOnlyWithoutRate, page]);

  // Busca textual: debounce simples via botão, evita disparar 1 request por tecla.
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadRoutes();
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select value={filterOriginRegion} onChange={(e) => { setFilterOriginRegion(e.target.value); setFilterOriginSector(''); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="">Região de origem: todas</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={filterOriginSector} onChange={(e) => { setFilterOriginSector(e.target.value); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="">Setor de origem: todos</option>
            {originSectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={filterDestinationRegion} onChange={(e) => { setFilterDestinationRegion(e.target.value); setFilterDestinationSector(''); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="">Região de destino: todas</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select value={filterDestinationSector} onChange={(e) => { setFilterDestinationSector(e.target.value); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="">Setor de destino: todos</option>
            {destinationSectorOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
          <select value={filterActive} onChange={(e) => { setFilterActive(e.target.value as any); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="all">Status: todos</option>
            <option value="true">Somente ativas</option>
            <option value="false">Somente inativas</option>
          </select>
          <select value={filterService} onChange={(e) => { setFilterService(e.target.value); setPage(1); }} className="p-2 border border-gray-300 rounded-xl text-xs font-bold bg-white">
            <option value="">Serviço: todos</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filterOnlyWithoutRate} onChange={(e) => { setFilterOnlyWithoutRate(e.target.checked); setPage(1); }} className="w-4 h-4" />
            Somente sem tarifa
          </label>
          <form onSubmit={handleSearchSubmit} className="relative">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Buscar setor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-2 py-2 text-xs border border-gray-300 rounded-xl font-bold"
            />
          </form>
        </div>
      </div>

      {/* Tabela paginada */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Carregando rotas...</div>
        ) : routes.length === 0 ? (
          <div className="p-12 text-center text-gray-500 font-bold">Nenhuma rota encontrada para estes filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="text-left px-4 py-3 font-bold">Origem</th>
                  <th className="text-left px-4 py-3 font-bold">Destino</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  {services.map((s) => <th key={s.id} className="text-left px-4 py-3 font-bold">{s.name}</th>)}
                  <th className="text-right px-4 py-3 font-bold">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {routes.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">{r.originSectorName || r.originSectorId}</td>
                    <td className="px-4 py-3 font-bold text-gray-900">{r.destinationSectorName || r.destinationSectorId}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                        {r.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    {services.map((s) => (
                      <td key={s.id} className="px-4 py-3">
                        {(r.configuredServiceCodes || []).includes(s.code) ? (
                          <span className="text-emerald-700 font-bold">Configurado</span>
                        ) : (
                          <span className="text-gray-400">Não configurado</span>
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setManagingRoute(r)}
                        className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold rounded-lg cursor-pointer"
                      >
                        Gerenciar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span>{pagination.total} rotas no total — página {pagination.page} de {pagination.totalPages}</span>
            <div className="flex items-center gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-30 cursor-pointer">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {managingRoute && (
        <RouteManageDrawer
          routeId={managingRoute.id}
          currency={currency}
          showToast={showToast}
          onClose={() => setManagingRoute(null)}
          onChanged={() => { loadRoutes(); onRoutesChanged(); }}
        />
      )}
    </div>
  );
};

// ============================================================================
// Drawer "Gerenciar" — status da rota + tarifas por serviço.
// ============================================================================
const RouteManageDrawer: React.FC<{
  routeId: string; currency: string; showToast: (msg: string) => void; onClose: () => void; onChanged: () => void;
}> = ({ routeId, currency, showToast, onClose, onChanged }) => {
  const [detail, setDetail] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTogglingRoute, setIsTogglingRoute] = useState(false);
  const [addingForService, setAddingForService] = useState<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [togglingRateId, setTogglingRateId] = useState<string | null>(null);
  const [savingLeadServiceId, setSavingLeadServiceId] = useState<string | null>(null);

  const loadDetail = async () => {
    setIsLoading(true);
    try {
      const res = await AdminApi.getShippingRouteById(routeId);
      if (res.success) setDetail(res.data);
      else showToast('Erro ao carregar detalhe da rota.');
    } catch {
      showToast('Erro ao carregar detalhe da rota.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  const handleToggleRoute = async () => {
    if (!detail) return;
    setIsTogglingRoute(true);
    try {
      const res = await AdminApi.updateShippingRouteStatus(routeId, { isActive: !detail.isActive });
      if (res.success) {
        showToast(!detail.isActive ? 'Rota ativada.' : 'Rota desativada. A rota e as tarifas continuam preservadas.');
        await loadDetail();
        onChanged();
      } else {
        showToast(res.error?.message || 'Erro ao alterar status da rota.');
      }
    } finally {
      setIsTogglingRoute(false);
    }
  };

  const handleOpenAdd = (serviceId: string) => {
    setEditingRateId(null);
    setAddingForService(serviceId);
  };

  const handleOpenEdit = (rate: any) => {
    setAddingForService(null);
    setEditingRateId(rate.id);
  };

  // A AUTORIDADE de validação financeira (sobreposição de faixas, faixa, moeda, país, vigência) é do backend
  // (validateShippingRouteRateInput, D15-A). O formulário só confere presença/formato; o erro do backend volta traduzido.
  const handleSubmitCreate = async (serviceId: string, values: RateFormValues): Promise<string | null> => {
    setIsSaving(true);
    try {
      const res = await AdminApi.createShippingRouteRate({ routeId, serviceId, currency, ...buildRatePayload(values) });
      if (!res.success) return rateErrorMessage(res.error?.message || res.message);
      showToast('Tarifa criada com sucesso.');
      setAddingForService(null);
      await loadDetail();
      onChanged();
      return null;
    } catch (err: any) {
      return rateErrorMessage(err?.response?.data?.error?.message || err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Editar = PATCH do MESMO registro (id preservado). Só preço, faixa de peso e vigência; rota/serviço/moeda não mudam.
  const handleSubmitEdit = async (rate: any, values: RateFormValues): Promise<string | null> => {
    setIsSaving(true);
    try {
      const res = await AdminApi.updateShippingRouteRate(rate.id, buildRatePayload(values));
      if (!res.success) return rateErrorMessage(res.error?.message || res.message);
      showToast(describeRateEdit(rate, res.data || rate, rate.currency || currency));
      setEditingRateId(null);
      await loadDetail();
      onChanged();
      return null;
    } catch (err: any) {
      return rateErrorMessage(err?.response?.data?.error?.message || err?.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Prazo estimado por rota+serviço: independente das faixas de peso e sem efeito financeiro.
  const handleSaveLeadTime = async (serviceId: string, minDays: number, maxDays: number): Promise<string | null> => {
    setSavingLeadServiceId(serviceId);
    try {
      const res = await AdminApi.setShippingLeadTime(routeId, serviceId, { minDays, maxDays });
      if (!res.success) return leadTimeErrorMessage(res.error?.message || res.message);
      showToast('Prazo estimado salvo. O checkout já mostra o novo prazo; pedidos já feitos não mudam.');
      await loadDetail();
      return null;
    } catch (err: any) {
      return leadTimeErrorMessage(err?.response?.data?.error?.message || err?.message);
    } finally {
      setSavingLeadServiceId(null);
    }
  };

  const handleRemoveLeadTime = async (serviceId: string): Promise<string | null> => {
    setSavingLeadServiceId(serviceId);
    try {
      const res = await AdminApi.removeShippingLeadTime(routeId, serviceId);
      if (!res.success) return leadTimeErrorMessage(res.error?.message || res.message);
      showToast('Prazo removido. O checkout mostrará "Prazo a confirmar" para este serviço.');
      await loadDetail();
      return null;
    } catch (err: any) {
      return leadTimeErrorMessage(err?.response?.data?.error?.message || err?.message);
    } finally {
      setSavingLeadServiceId(null);
    }
  };

  const handleToggleRate = async (rate: any) => {
    setTogglingRateId(rate.id);
    try {
      const res = await AdminApi.updateShippingRouteRate(rate.id, { isActive: !rate.isActive });
      if (!res.success) {
        showToast(res.error?.message || 'Erro ao alterar status da tarifa.');
        return;
      }
      showToast(!rate.isActive ? 'Tarifa ativada.' : 'Tarifa desativada. A tarifa continua preservada no histórico.');
      await loadDetail();
      onChanged();
    } finally {
      setTogglingRateId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-end">
      <div className="bg-white h-full w-full max-w-xl shadow-2xl overflow-y-auto p-6 space-y-5 animate-fadeIn">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
            <Route className="w-5 h-5 text-purple-600" /> Gerenciar Rota
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        {isLoading || !detail ? (
          <div className="p-12 text-center text-gray-400"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />Carregando...</div>
        ) : (
          <>
            <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-400 block text-[10px] uppercase font-bold">Origem</span><span className="font-black text-gray-900">{detail.originSector?.name}</span></div>
              <div><span className="text-gray-400 block text-[10px] uppercase font-bold">Destino</span><span className="font-black text-gray-900">{detail.destinationSector?.name}</span></div>
              <div className="col-span-2 flex items-center justify-between pt-2 border-t border-gray-200">
                <div>
                  <span className="text-gray-400 block text-[10px] uppercase font-bold">Status</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${detail.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'}`}>
                    {detail.isActive ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <button
                  onClick={handleToggleRoute}
                  disabled={isTogglingRoute}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    detail.isActive ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" /> {detail.isActive ? 'Desativar Rota' : 'Ativar Rota'}
                </button>
              </div>
            </div>

            {(detail.services || []).map((svc: any) => {
              const svcRates = (detail.rates || []).filter((r: any) => r.serviceId === svc.id);
              return (
                <div key={svc.id} className="border border-gray-200 rounded-2xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                    <span className="font-black text-xs text-gray-900">{svc.name}</span>
                    <button
                      onClick={() => handleOpenAdd(svc.id)}
                      className="text-purple-600 hover:text-purple-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" /> Adicionar faixa
                    </button>
                  </div>

                  <ShippingLeadTimeEditor
                    serviceName={svc.name}
                    current={(detail.leadTimes || []).find((l: any) => l.serviceId === svc.id) || null}
                    isBusy={savingLeadServiceId === svc.id}
                    onSave={(min, max) => handleSaveLeadTime(svc.id, min, max)}
                    onRemove={() => handleRemoveLeadTime(svc.id)}
                  />

                  {svcRates.length === 0 && addingForService !== svc.id ? (
                    <div className="px-4 py-3 text-xs text-gray-400">Não configurado — entrega ficará indisponível para este serviço nesta rota.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {svcRates.map((r: any) => editingRateId === r.id ? (
                        <ShippingRateForm
                          key={r.id}
                          mode="edit"
                          currency={r.currency || currency}
                          initial={rateToForm(r)}
                          isSaving={isSaving}
                          onSubmit={(values) => handleSubmitEdit(r, values)}
                          onCancel={() => setEditingRateId(null)}
                        />
                      ) : (
                        <div key={r.id} data-testid={`shipping-rate-row-${r.id}`} className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 text-xs">
                          <div className="min-w-0">
                            <span className="font-mono text-gray-700 block">
                              {Number(r.minWeightKg)} kg &lt;= peso &lt; {Number(r.maxWeightKg)} kg
                            </span>
                            {describeValidity(r) && <span className="text-[10px] text-gray-500 block" data-testid={`shipping-rate-validity-${r.id}`}>{describeValidity(r)}</span>}
                          </div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-gray-900">{Number(r.amount).toFixed(2)} {r.currency}</span>
                            <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${r.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                              {r.isActive ? 'Ativa' : 'Inativa'}
                            </span>
                            <button
                              onClick={() => handleOpenEdit(r)}
                              data-testid={`shipping-rate-edit-${r.id}`}
                              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 sm:p-1 flex items-center justify-center text-purple-600 hover:text-purple-800 cursor-pointer"
                              title="Editar tarifa"
                              aria-label={`Editar tarifa ${Number(r.minWeightKg)} a ${Number(r.maxWeightKg)} kg`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              disabled={togglingRateId === r.id}
                              onClick={() => handleToggleRate(r)}
                              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 p-2 sm:p-1 flex items-center justify-center text-gray-500 hover:text-gray-800 cursor-pointer disabled:opacity-40"
                              title={r.isActive ? 'Desativar tarifa' : 'Ativar tarifa'}
                              aria-label={r.isActive ? 'Desativar tarifa' : 'Ativar tarifa'}
                            >
                              <Power className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingForService === svc.id && (
                    <ShippingRateForm
                      mode="create"
                      currency={currency}
                      initial={emptyRateForm()}
                      isSaving={isSaving}
                      onSubmit={(values) => handleSubmitCreate(svc.id, values)}
                      onCancel={() => setAddingForService(null)}
                    />
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};
