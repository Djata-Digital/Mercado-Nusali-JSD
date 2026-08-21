import React, { useState, useEffect } from 'react';
import { Database, Server, RefreshCw, CheckCircle2, AlertCircle, Cpu, Zap, Layers, HardDrive, Plus, Table } from 'lucide-react';

interface SystemHealth {
  status: string;
  environment: string;
  timestamp: string;
  database: {
    engine: string;
    status: string;
    message: string;
    poolStats: {
      totalCount: number;
      idleCount: number;
      waitingCount: number;
      serverTime: string;
    } | null;
  };
  cache: {
    engine: string;
    status: string;
    type: string;
    cachedKeys: number;
  };
}

export const AdminDatabaseMonitor: React.FC = () => {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [source, setSource] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);

  // New product form
  const [newTitle, setNewTitle] = useState('');
  const [newPrice, setNewPrice] = useState('150000');
  const [newBrand, setNewBrand] = useState('Nusali Official');

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/health');
      const data = await res.json();
      if (data.success) {
        setHealth(data.data);
      }
    } catch (err) {
      console.error('Health fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/v1/products');
      const data = await res.json();
      if (data.success) {
        setProducts(data.data || []);
        setSource(data.source || 'db');
      }
    } catch (err) {
      console.error('Products fetch error:', err);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      const res = await fetch('/api/v1/db/seed', { method: 'POST' });
      const data = await res.json();
      setMessage(data.message || 'Banco de dados populado com sucesso!');
      await fetchHealth();
      await fetchProducts();
    } catch (err: any) {
      setMessage('Erro ao popular banco de dados: ' + err.message);
    } finally {
      setSeeding(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;

    try {
      const res = await fetch('/api/v1/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          price: Number(newPrice),
          currency: 'XOF',
          brand: newBrand,
          description: 'Produto inserido em tempo real no PostgreSQL com cache invalidado no Redis',
          image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=800',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage('✨ Produto gravado com sucesso na tabela PostgreSQL!');
        setNewTitle('');
        await fetchProducts();
        await fetchHealth();
      } else {
        setMessage('Erro: ' + data.message);
      }
    } catch (err: any) {
      setMessage('Erro ao inserir produto: ' + err.message);
    }
  };

  useEffect(() => {
    fetchHealth();
    fetchProducts();
  }, []);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-3xl p-6 md:p-8 shadow-2xl border border-emerald-500/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase px-3 py-1 rounded-full border border-emerald-500/30 inline-flex items-center gap-1.5 mb-2">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> PostgreSQL & Redis Production Suite
            </span>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Database className="w-7 h-7 text-emerald-400" /> Infraestrutura Cloud SQL & In-Memory Redis
            </h1>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl">
              Monitoramento em tempo real do banco de dados relacional PostgreSQL (Cloud SQL) e da camada de cache Redis de alta performance para o Mercado Nusali.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                fetchHealth();
                fetchProducts();
              }}
              disabled={loading}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-2xl border border-white/20 transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar Status
            </button>

            <button
              onClick={handleSeed}
              disabled={seeding}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-emerald-600/40 transition-all flex items-center gap-2"
            >
              <Server className="w-4 h-4" />
              {seeding ? 'Semeando DB...' : 'Reiniciar / Semear DB'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="bg-emerald-900/90 text-emerald-100 p-4 rounded-2xl border border-emerald-500/50 flex items-center justify-between font-medium text-xs shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{message}</span>
          </div>
          <button onClick={() => setMessage(null)} className="text-white font-bold opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      {/* Health Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* PostgreSQL Cloud SQL Card */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">PostgreSQL Database</h3>
                <span className="text-[10px] text-gray-500 font-mono">Cloud SQL Engine</span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold flex items-center gap-1 ${
              health?.database.status === 'connected'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${health?.database.status === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {health?.database.status === 'connected' ? 'ONLINE (Cloud SQL)' : 'STANDBY / LOCAL'}
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Status da Conexão:</span>
              <strong className="text-gray-900">{health?.database.message || 'Verificando...'}</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Pool de Conexões:</span>
              <strong className="text-gray-900">{health?.database.poolStats?.totalCount || 0} Ativas</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Hora do Servidor SQL:</span>
              <strong className="text-gray-900 font-mono text-[11px]">
                {health?.database.poolStats?.serverTime
                  ? new Date(health.database.poolStats.serverTime).toLocaleTimeString('pt-BR')
                  : 'N/A'}
              </strong>
            </div>
          </div>
        </div>

        {/* Redis Cache Card */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center">
                <Cpu className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">Redis In-Memory Cache</h3>
                <span className="text-[10px] text-gray-500 font-mono">High-Speed Cache Store</span>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              ONLINE
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Mecanismo Cache:</span>
              <strong className="text-gray-900">{health?.cache.type || 'Redis / Memory'}</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Chaves em Memória:</span>
              <strong className="text-red-600 font-extrabold">{health?.cache.cachedKeys || 0} Chaves</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Latência Cache:</span>
              <strong className="text-emerald-600 font-extrabold">&lt; 1ms (In-Memory)</strong>
            </div>
          </div>
        </div>

        {/* Real-time Query Stats Card */}
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center">
                <Layers className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="font-black text-gray-900 text-sm">Estatísticas de Leitura</h3>
                <span className="text-[10px] text-gray-500 font-mono">Última Leitura de Produtos</span>
              </div>
            </div>

            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
              source === 'redis_cache'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-blue-50 text-blue-700 border border-blue-200'
            }`}>
              {source === 'redis_cache' ? '⚡ Servido via REDIS' : '🐘 Servido via POSTGRESQL'}
            </span>
          </div>

          <div className="space-y-2 pt-2 border-t border-gray-100 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Registros Carregados:</span>
              <strong className="text-gray-900">{products.length} Produtos</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Origem dos Dados:</span>
              <strong className="text-gray-900 capitalize">{source || 'PostgreSQL'}</strong>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>TTL do Cache:</span>
              <strong className="text-gray-900">60 segundos</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Form: Insert Product directly to PostgreSQL */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-3xl p-6 border border-gray-200 shadow-xs">
          <h3 className="font-black text-gray-900 text-base flex items-center gap-2 mb-4">
            <Plus className="w-5 h-5 text-emerald-600" /> Gravar Registro no PostgreSQL
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Insira um novo produto diretamente no banco PostgreSQL. Esta ação invalidará instantaneamente o cache do Redis!
          </p>

          <form onSubmit={handleAddProduct} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Nome do Produto</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="ex: Gerador Solar Nusali 5kW"
                required
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Preço (XOF)</label>
              <input
                type="number"
                value={newPrice}
                onChange={(e) => setNewPrice(e.target.value)}
                placeholder="150000"
                required
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Marca / Fabricante</label>
              <input
                type="text"
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="Nusali Official"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 font-medium focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" /> Gravar no Banco PostgreSQL
            </button>
          </form>
        </div>

        {/* Table of products in PostgreSQL */}
        <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
              <Table className="w-5 h-5 text-emerald-600" /> Tabela `products` no PostgreSQL
            </h3>
            <span className="text-xs font-bold text-gray-500">
              Total: {products.length} registros
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] font-black uppercase text-gray-400 bg-gray-50">
                  <th className="p-3">ID</th>
                  <th className="p-3">Produto</th>
                  <th className="p-3">Preço</th>
                  <th className="p-3">Marca</th>
                  <th className="p-3">Selo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400 font-medium">
                      Nenhum produto cadastrado na tabela PostgreSQL ainda. Clique em "Reiniciar / Semear DB".
                    </td>
                  </tr>
                ) : (
                  products.map((p, idx) => (
                    <tr key={p.id || idx} className="hover:bg-gray-50/80 transition-colors">
                      <td className="p-3 font-mono text-[10px] text-gray-400">{p.id}</td>
                      <td className="p-3 font-bold text-gray-900 flex items-center gap-2">
                        {p.image && <img src={p.image} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                        <span className="line-clamp-1">{p.title}</span>
                      </td>
                      <td className="p-3 font-black text-emerald-700">
                        {Number(p.price).toLocaleString('pt-GW')} {p.currency || 'XOF'}
                      </td>
                      <td className="p-3 text-gray-600 font-medium">{p.brand || 'Oficial'}</td>
                      <td className="p-3">
                        <span className="bg-emerald-50 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-md border border-emerald-200">
                          PostgreSQL DB
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
