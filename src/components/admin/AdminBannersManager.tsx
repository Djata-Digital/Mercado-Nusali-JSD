import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowDown, ArrowUp, Check, Copy, Edit2, Eye, Globe, Image as ImageIcon, Loader2,
  Megaphone, Plus, Power, RefreshCw, ShieldAlert, Trash2, Upload, X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCountries } from '../../hooks/useCountries';
import {
  BannersApi, bannerErrorMessage,
  type AdminBanner, type BannerImagePolicy, type BannerInput, type BannerState,
} from '../../api/clients/BannersApi';
import {
  BANNER_BG_PRESETS, BANNER_BG_STYLES, BANNER_TEXT_LIMITS, validateBannerCta,
  type BannerBgStyle, type BannerCtaType, type BannerStatus,
} from '../../utils/bannerRules';
import type { BannerSlide } from '../../utils/bannerSlides';
import { BannerSlideView, type BannerSlidePreviewMode } from '../BannerSlider';

interface AdminBannersManagerProps {
  showToast: (msg: string) => void;
}

type Policy = { desktop: BannerImagePolicy; mobile: BannerImagePolicy };
// Valores de referência até o servidor informar a política (GET /admin/banners → meta.imagePolicy).
const DEFAULT_POLICY: Policy = {
  desktop: { recommended: { width: 1920, height: 600 }, minWidth: 1200, maxWidth: 3840, minHeight: 300, maxHeight: 1200, maxBytes: 1_572_864 },
  mobile: { recommended: { width: 750, height: 900 }, minWidth: 480, maxWidth: 1500, minHeight: 480, maxHeight: 1800, maxBytes: 1_048_576 },
};
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

const STATE_META: Record<BannerState, { label: string; cls: string }> = {
  live: { label: 'Ao vivo', cls: 'bg-emerald-100 text-emerald-800' },
  scheduled: { label: 'Agendado', cls: 'bg-sky-100 text-sky-800' },
  expired: { label: 'Encerrado', cls: 'bg-gray-200 text-gray-700' },
  draft: { label: 'Rascunho', cls: 'bg-amber-100 text-amber-800' },
  inactive: { label: 'Inativo', cls: 'bg-rose-100 text-rose-800' },
};

const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(bytes % 1_048_576 ? 1 : 0).replace('.', ',')} MB`;
const fileSize = (bytes: number) => (bytes < 1_048_576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : mb(bytes));
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null);

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Slide para o preview, a partir de um banner salvo ou dos campos do formulário. */
function toSlide(b: {
  id?: string; title: string; subtitle?: string | null; tagText?: string | null; badgeText?: string | null;
  ctaLabel?: string | null; ctaType?: BannerCtaType | null; ctaTarget?: string | null;
  desktopImageUrl?: string | null; mobileImageUrl?: string | null; bgStyle: BannerBgStyle;
}): BannerSlide {
  const check = b.ctaLabel && b.ctaType ? validateBannerCta(b.ctaType, b.ctaTarget) : null;
  return {
    id: b.id || 'preview',
    tag: b.tagText || null,
    badge: b.badgeText || null,
    title: b.title || 'Título do banner',
    subtitle: b.subtitle || null,
    cta: check && check.ok && b.ctaType ? { label: b.ctaLabel as string, type: b.ctaType, target: check.value } : null,
    bgStyle: b.bgStyle,
    desktopImageUrl: b.desktopImageUrl || null,
    mobileImageUrl: b.mobileImageUrl || null,
  };
}

const inputCls = 'w-full p-2.5 border border-gray-300 rounded-xl font-bold text-xs focus:outline-none focus:ring-2 focus:ring-purple-300';
const labelCls = 'block font-bold text-gray-700 mb-1 text-xs';
const errCls = 'text-[11px] font-bold text-red-600 mt-1';

/** Miniatura que some (sem o ícone de imagem quebrada do navegador) se a imagem não carregar. */
const SafeThumb: React.FC<{ src: string; className?: string }> = ({ src, className = '' }) => {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [src]);
  if (failed) return <span className="text-[10px] font-bold text-white/70 px-3 text-center">Imagem indisponível</span>;
  return <img src={src} alt="" className={className} onError={() => setFailed(true)} />;
};

// ---------------------------------------------------------------------------------------------
export const AdminBannersManager: React.FC<AdminBannersManagerProps> = ({ showToast }) => {
  const { user } = useAuth();
  // Só UX: o servidor decide (requireGlobalAdminForBanners). Outros perfis veem o aviso em vez de uma tela que falharia.
  if ((user?.role || '').toUpperCase() !== 'GLOBAL_ADMIN') {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500" role="alert">
        <ShieldAlert className="w-12 h-12 mx-auto mb-3 text-amber-500 stroke-1" />
        <p className="font-black text-sm text-gray-800">Acesso restrito ao Administrador Geral</p>
        <p className="text-xs mt-1">Somente o Administrador Geral pode gerenciar os banners da home.</p>
      </div>
    );
  }
  return <BannersManagerInner showToast={showToast} />;
};

const BannersManagerInner: React.FC<AdminBannersManagerProps> = ({ showToast }) => {
  const { data: countries = [] } = useCountries();
  const countryName = useCallback((code: string | null) => {
    if (!code) return 'Global';
    const c = countries.find((x) => x.code === code);
    return c ? `${c.flag} ${c.name}` : code;
  }, [countries]);

  const [items, setItems] = useState<AdminBanner[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [filter, setFilter] = useState<'all' | BannerStatus>('all');
  const [editing, setEditing] = useState<{ banner: AdminBanner | null } | null>(null);
  const [previewing, setPreviewing] = useState<BannerSlide | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminBanner | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await BannersApi.list();
      if (!res.success || !Array.isArray(res.data)) throw new Error(res.error?.message || 'Resposta inválida.');
      setItems(res.data);
      const p = (res as any).meta?.imagePolicy;
      if (p?.desktop && p?.mobile) setPolicy(p);
    } catch (e) {
      setItems((prev) => prev); // mantém o que já está na tela
      setLoadError(bannerErrorMessage(e, 'Não foi possível carregar os banners.'));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const act = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try { await fn(); } catch (e) { showToast(bannerErrorMessage(e)); } finally { setBusyId(null); }
  };

  const toggleStatus = (b: AdminBanner) => act(b.id, async () => {
    const next = b.status === 'active' ? 'inactive' : 'active';
    const res = await BannersApi.setStatus(b.id, next);
    if (res.data) setItems((prev) => (prev || []).map((x) => (x.id === b.id ? res.data! : x)));
    showToast(next === 'active' ? `Banner "${b.title}" ativado.` : `Banner "${b.title}" desativado.`);
  });

  const duplicate = (b: AdminBanner) => act(b.id, async () => {
    await BannersApi.duplicate(b.id);
    await load();
    showToast(`Banner duplicado como rascunho: "${b.title} (cópia)".`);
  });

  const remove = (b: AdminBanner) => act(b.id, async () => {
    await BannersApi.remove(b.id);
    setConfirmDelete(null);
    await load();
    showToast(`Banner "${b.title}" excluído. As imagens permanecem no armazenamento.`);
  });

  const move = (b: AdminBanner, dir: -1 | 1) => act(b.id, async () => {
    const list = items || [];
    const i = list.findIndex((x) => x.id === b.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const ids = list.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    const res = await BannersApi.reorder(ids);
    if (res.data) setItems(res.data);
  });

  const visible = useMemo(() => (items || []).filter((b) => filter === 'all' || b.status === filter), [items, filter]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-purple-600" />
            Marketing &amp; Banners
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            Banners do carrossel da home: texto, imagem, botão, país e período de exibição. Sem nenhum banner ativo, a home mostra os slides padrão.
          </p>
        </div>
        <button
          onClick={() => setEditing({ banner: null })}
          className="bg-purple-600 hover:bg-purple-700 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition flex items-center gap-1.5 shadow-md cursor-pointer"
        >
          <Plus className="w-4 h-4" /> Novo banner
        </button>
      </div>

      {items !== null && items.length > 0 && (
        <div className="flex items-center gap-2 text-xs" role="tablist" aria-label="Filtrar banners por status">
          {([['all', 'Todos'], ['active', 'Ativos'], ['draft', 'Rascunhos'], ['inactive', 'Inativos']] as const).map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-full font-bold border transition cursor-pointer ${
                filter === value ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
          <button onClick={() => void load()} className="ml-auto p-2 text-gray-500 hover:bg-gray-100 rounded-lg cursor-pointer" title="Atualizar lista">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      )}

      {items === null && !loadError && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-500" role="status">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-purple-500" />
          <p className="text-sm font-bold">Carregando banners…</p>
        </div>
      )}

      {loadError && (
        <div className="bg-white rounded-2xl border border-red-200 p-8 text-center" role="alert">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-red-500 stroke-1" />
          <p className="font-black text-sm text-gray-800">Não foi possível carregar os banners</p>
          <p className="text-xs text-gray-500 mt-1">{loadError}</p>
          <button onClick={() => void load()} className="mt-4 px-4 py-2 border border-gray-300 font-bold text-xs text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer">
            Tentar novamente
          </button>
        </div>
      )}

      {items !== null && items.length === 0 && !loadError && (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400">
          <Megaphone className="w-12 h-12 mx-auto mb-3 text-gray-300 stroke-1" />
          <p className="font-bold text-sm text-gray-600">Nenhum banner criado.</p>
          <p className="text-xs text-gray-400 mt-1">A home está mostrando os slides padrão. Clique em &ldquo;Novo banner&rdquo; para criar o primeiro.</p>
        </div>
      )}

      {items !== null && items.length > 0 && visible.length === 0 && (
        <p className="text-center text-xs text-gray-500 py-6">Nenhum banner com esse status.</p>
      )}

      <div className="space-y-3">
        {visible.map((b) => {
          const full = (items || []).findIndex((x) => x.id === b.id);
          const busy = busyId === b.id;
          const meta = STATE_META[b.state];
          const preset = BANNER_BG_PRESETS[b.bgStyle];
          return (
            <div key={b.id} className={`bg-white rounded-2xl border border-gray-200 shadow-xs p-4 flex flex-col xl:flex-row gap-4 ${busy ? 'opacity-60' : ''}`}>
              <div className={`relative w-full sm:max-w-xs xl:w-52 h-28 shrink-0 rounded-xl overflow-hidden bg-gradient-to-r ${preset.bgClass} flex items-center justify-center`}>
                {b.desktopImageUrl || b.mobileImageUrl ? (
                  <SafeThumb src={(b.desktopImageUrl || b.mobileImageUrl) as string} className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-white/70 px-3 text-center">Sem imagem (cores e texto)</span>
                )}
              </div>

              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-extrabold text-sm text-gray-900 break-words max-w-full">{b.title}</h3>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${b.isGlobal ? 'bg-purple-100 text-purple-800' : 'bg-indigo-100 text-indigo-800'}`}>
                    {b.isGlobal && <Globe className="w-3 h-3" />} {countryName(b.countryCode)}
                  </span>
                </div>
                {b.subtitle && <p className="text-xs text-gray-500 line-clamp-2">{b.subtitle}</p>}
                <p className="text-[11px] text-gray-500 font-bold">
                  {b.ctaLabel ? `Botão: "${b.ctaLabel}" → ${b.ctaTarget}` : 'Sem botão'}
                  {' · '}
                  {b.startsAt || b.endsAt ? `Período: ${fmtDate(b.startsAt) || 'já'} → ${fmtDate(b.endsAt) || 'sem fim'}` : 'Sem período definido'}
                </p>
              </div>

              <div className="flex flex-wrap xl:flex-col items-center xl:items-end justify-end gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => void move(b, -1)} disabled={busy || full <= 0 || filter !== 'all'} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 cursor-pointer" title={filter !== 'all' ? 'Mostre "Todos" para reordenar' : 'Subir na ordem'}>
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => void move(b, 1)} disabled={busy || full === (items || []).length - 1 || filter !== 'all'} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-30 cursor-pointer" title={filter !== 'all' ? 'Mostre "Todos" para reordenar' : 'Descer na ordem'}>
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => setPreviewing(toSlide(b))} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg cursor-pointer" title="Pré-visualizar">
                    <Eye className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditing({ banner: b })} disabled={busy} className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg cursor-pointer" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => void duplicate(b)} disabled={busy} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer" title="Duplicar como rascunho">
                    <Copy className="w-4 h-4" />
                  </button>
                  <button onClick={() => setConfirmDelete(b)} disabled={busy} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => void toggleStatus(b)}
                  disabled={busy}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer ${
                    b.status === 'active' ? 'bg-rose-50 text-rose-700 hover:bg-rose-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" /> {b.status === 'active' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <BannerFormModal
          initial={editing.banner}
          policy={policy}
          countries={countries}
          onClose={() => setEditing(null)}
          onPreview={setPreviewing}
          onSaved={async (b, created) => {
            setEditing(null);
            await load();
            showToast(created ? `Banner "${b.title}" criado${b.status === 'draft' ? ' como rascunho' : ''}.` : `Banner "${b.title}" atualizado.`);
          }}
        />
      )}

      {previewing && <PreviewModal slide={previewing} onClose={() => setPreviewing(null)} />}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Confirmar exclusão">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-black text-base text-gray-900">Excluir banner?</h3>
            <p className="text-xs text-gray-600">
              &ldquo;{confirmDelete.title}&rdquo; deixa de aparecer na home e sai da lista. As imagens continuam guardadas no armazenamento.
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer">Cancelar</button>
              <button onClick={() => void remove(confirmDelete)} disabled={busyId === confirmDelete.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl cursor-pointer disabled:opacity-60">
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
const PreviewModal: React.FC<{ slide: BannerSlide; onClose: () => void }> = ({ slide, onClose }) => {
  const [mode, setMode] = useState<BannerSlidePreviewMode>('desktop');
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Pré-visualização do banner">
      <div className="bg-white rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-auto p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black text-base text-gray-900 flex items-center gap-2"><Eye className="w-5 h-5 text-sky-600" /> Pré-visualização</h3>
          <div className="flex items-center gap-2 text-xs">
            {(['desktop', 'mobile'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={`px-3 py-1.5 rounded-full font-bold border cursor-pointer ${mode === m ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-gray-600 border-gray-300'}`}>
                {m === 'desktop' ? 'Desktop' : 'Celular'}
              </button>
            ))}
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer" title="Fechar"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="bg-gray-100 rounded-xl p-4 overflow-auto flex justify-center">
          <div className={`overflow-hidden rounded-lg shadow-md bg-slate-900 ${mode === 'mobile' ? 'w-[375px] shrink-0' : 'w-full'}`}>
            <BannerSlideView banner={slide} previewMode={mode} />
          </div>
        </div>
        <p className="text-[11px] text-gray-500">O botão não é clicável aqui. No site, imagens que falharem ao carregar mostram só as cores e o texto.</p>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------------------------
interface ImageState { key: string | null; url: string | null; info?: string }

const BannerFormModal: React.FC<{
  initial: AdminBanner | null;
  policy: Policy;
  countries: { code: string; name: string; flag: string }[];
  onClose: () => void;
  onPreview: (s: BannerSlide) => void;
  onSaved: (b: AdminBanner, created: boolean) => void | Promise<void>;
}> = ({ initial, policy, countries, onClose, onPreview, onSaved }) => {
  const [title, setTitle] = useState(initial?.title || '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle || '');
  const [tagText, setTagText] = useState(initial?.tagText || '');
  const [badgeText, setBadgeText] = useState(initial?.badgeText || '');
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel || '');
  const [ctaType, setCtaType] = useState<'' | BannerCtaType>(initial?.ctaType || '');
  const [ctaTarget, setCtaTarget] = useState(initial?.ctaTarget || '');
  const [bgStyle, setBgStyle] = useState<BannerBgStyle>(initial?.bgStyle || 'blue');
  const [countryCode, setCountryCode] = useState(initial?.countryCode || '');
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt || null));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt || null));
  const [status, setStatus] = useState<BannerStatus>('draft');
  const [desktop, setDesktop] = useState<ImageState>({ key: initial?.desktopImageKey || null, url: initial?.desktopImageUrl || null });
  const [mobile, setMobile] = useState<ImageState>({ key: initial?.mobileImageKey || null, url: initial?.mobileImageUrl || null });
  const [uploading, setUploading] = useState<{ desktop: boolean; mobile: boolean }>({ desktop: false, mobile: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = 'Informe o título do banner.';
    if (ctaLabel.trim() || ctaType || ctaTarget.trim()) {
      if (!ctaLabel.trim()) e.ctaLabel = 'Informe o texto do botão.';
      if (!ctaType) e.ctaType = 'Escolha o tipo de destino.';
      else {
        const v = validateBannerCta(ctaType, ctaTarget);
        if (v.ok === false) e.ctaTarget = v.message;
      }
    }
    if (startsAt && endsAt && !(new Date(startsAt).getTime() < new Date(endsAt).getTime())) e.endsAt = 'O fim deve ser depois do início.';
    return e;
  };

  const onFile = async (kind: 'desktop' | 'mobile', file: File | undefined) => {
    if (!file) return;
    const p = policy[kind];
    setErrors((prev) => { const n = { ...prev }; delete n[`${kind}Image`]; return n; });
    // conferência rápida no navegador; quem decide de verdade é o servidor (bytes reais do arquivo)
    if (!ACCEPTED_TYPES.includes(file.type)) { setErrors((prev) => ({ ...prev, [`${kind}Image`]: 'Use uma imagem PNG, JPEG ou WebP.' })); return; }
    if (file.size > p.maxBytes) { setErrors((prev) => ({ ...prev, [`${kind}Image`]: `A imagem tem ${fileSize(file.size)}; o máximo é ${mb(p.maxBytes)}.` })); return; }
    setUploading((u) => ({ ...u, [kind]: true }));
    try {
      const res = await BannersApi.upload(kind, file);
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Falha no envio.');
      const next = { key: res.data.objectKey, url: res.data.url, info: `${res.data.width}×${res.data.height} px · ${fileSize(res.data.size)}` };
      if (kind === 'desktop') setDesktop(next); else setMobile(next);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [`${kind}Image`]: bannerErrorMessage(err, 'Não foi possível enviar a imagem.') }));
    } finally {
      setUploading((u) => ({ ...u, [kind]: false }));
    }
  };

  const draft = () => ({ title, subtitle, tagText, badgeText, ctaLabel, ctaType: ctaType || null, ctaTarget, desktopImageUrl: desktop.url, mobileImageUrl: mobile.url, bgStyle });

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    const hasCta = Boolean(ctaLabel.trim() || ctaType || ctaTarget.trim());
    const payload: BannerInput = {
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      tagText: tagText.trim() || null,
      badgeText: badgeText.trim() || null,
      ctaLabel: hasCta ? ctaLabel.trim() : null,
      ctaType: hasCta ? (ctaType || null) : null,
      ctaTarget: hasCta ? ctaTarget.trim() : null,
      desktopImageKey: desktop.key,
      mobileImageKey: mobile.key,
      bgStyle,
      startsAt: fromLocalInput(startsAt),
      endsAt: fromLocalInput(endsAt),
      countryCode: countryCode || null,
    };
    setSaving(true);
    try {
      const res = initial ? await BannersApi.update(initial.id, payload) : await BannersApi.create({ ...payload, status });
      if (!res.success || !res.data) throw new Error(res.error?.message || 'Falha ao salvar.');
      await onSaved(res.data, !initial);
    } catch (err: any) {
      const fields = err?.response?.data?.error?.fields;
      if (fields && typeof fields === 'object') setErrors(fields);
      else setErrors({ form: bannerErrorMessage(err, 'Não foi possível salvar o banner.') });
    } finally {
      setSaving(false);
    }
  };

  const imageField = (kind: 'desktop' | 'mobile', img: ImageState, set: (s: ImageState) => void) => {
    const p = policy[kind];
    return (
      <div className="space-y-1.5">
        <label className={labelCls}>
          Imagem {kind === 'desktop' ? 'desktop' : 'mobile'} <span className="font-medium text-gray-400">(opcional)</span>
        </label>
        <p className="text-[11px] text-gray-500">
          Recomendado {p.recommended.width}×{p.recommended.height} px · até {mb(p.maxBytes)} · PNG, JPEG ou WebP (mín. {p.minWidth}×{p.minHeight}, máx. {p.maxWidth}×{p.maxHeight})
        </p>
        <div className="flex items-center gap-3">
          <div className="w-28 h-16 rounded-lg border border-dashed border-gray-300 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
            {img.url ? <SafeThumb src={img.url} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-gray-300" />}
          </div>
          <div className="space-y-1 min-w-0">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg font-bold text-[11px] text-gray-700 hover:bg-gray-50 cursor-pointer">
              {uploading[kind] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading[kind] ? 'Enviando…' : img.url ? 'Trocar imagem' : 'Enviar imagem'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={uploading[kind]}
                aria-label={`Enviar imagem ${kind === 'desktop' ? 'desktop' : 'mobile'}`}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void onFile(kind, f); }}
              />
            </label>
            {img.url && !uploading[kind] && (
              <button type="button" onClick={() => set({ key: null, url: null })} className="ml-2 text-[11px] font-bold text-red-600 hover:underline cursor-pointer">Remover</button>
            )}
            {img.info && <p className="text-[11px] text-emerald-700 font-bold" role="status">Enviada: {img.info}</p>}
          </div>
        </div>
        {errors[`${kind}Image`] && <p className={errCls} role="alert">{errors[`${kind}Image`]}</p>}
        {errors[`${kind}ImageKey`] && <p className={errCls} role="alert">{errors[`${kind}ImageKey`]}</p>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={initial ? 'Editar banner' : 'Novo banner'}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] overflow-y-auto p-6 shadow-2xl border border-gray-100 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-purple-600" />
            {initial ? 'Editar banner' : 'Novo banner'}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer" title="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {errors.form && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-bold" role="alert">{errors.form}</div>}

          <div>
            <label className={labelCls} htmlFor="bn-title">Título *</label>
            <input id="bn-title" className={inputCls} maxLength={BANNER_TEXT_LIMITS.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Ofertas de Primavera" />
            {errors.title && <p className={errCls} role="alert">{errors.title}</p>}
          </div>
          <div>
            <label className={labelCls} htmlFor="bn-sub">Subtítulo / descrição</label>
            <textarea id="bn-sub" rows={2} className={inputCls} maxLength={BANNER_TEXT_LIMITS.subtitle} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            {errors.subtitle && <p className={errCls} role="alert">{errors.subtitle}</p>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls} htmlFor="bn-tag">Etiqueta (ex.: NOVIDADE)</label>
              <input id="bn-tag" className={inputCls} maxLength={BANNER_TEXT_LIMITS.tagText} value={tagText} onChange={(e) => setTagText(e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="bn-badge">Selo (ex.: Cadastro aberto)</label>
              <input id="bn-badge" className={inputCls} maxLength={BANNER_TEXT_LIMITS.badgeText} value={badgeText} onChange={(e) => setBadgeText(e.target.value)} />
            </div>
          </div>

          <fieldset className="border border-gray-200 rounded-xl p-3 space-y-3">
            <legend className="px-1 text-xs font-black text-gray-700">Botão (opcional)</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls} htmlFor="bn-cta-label">Texto do botão</label>
                <input id="bn-cta-label" className={inputCls} maxLength={BANNER_TEXT_LIMITS.ctaLabel} value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="Ex.: Ver produtos" />
                {errors.ctaLabel && <p className={errCls} role="alert">{errors.ctaLabel}</p>}
              </div>
              <div>
                <label className={labelCls} htmlFor="bn-cta-type">Tipo de destino</label>
                <select id="bn-cta-type" className={inputCls} value={ctaType} onChange={(e) => setCtaType(e.target.value as '' | BannerCtaType)}>
                  <option value="">Sem botão</option>
                  <option value="internal">Página do site (interno)</option>
                  <option value="external">Link externo (https)</option>
                </select>
                {errors.ctaType && <p className={errCls} role="alert">{errors.ctaType}</p>}
              </div>
            </div>
            <div>
              <label className={labelCls} htmlFor="bn-cta-target">Destino</label>
              <input id="bn-cta-target" className={inputCls} maxLength={BANNER_TEXT_LIMITS.ctaTarget} value={ctaTarget} onChange={(e) => setCtaTarget(e.target.value)}
                placeholder={ctaType === 'external' ? 'https://exemplo.com/pagina' : '/products'} />
              <p className="text-[11px] text-gray-500 mt-1">
                {ctaType === 'external' ? 'Somente https:// (abre em nova aba).' : 'Caminho dentro do site, começando com "/" (ex.: /products, /register).'}
              </p>
              {errors.ctaTarget && <p className={errCls} role="alert">{errors.ctaTarget}</p>}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {imageField('desktop', desktop, setDesktop)}
            {imageField('mobile', mobile, setMobile)}
          </div>

          <div>
            <span className={labelCls}>Cores do fundo (sem imagem, ou atrás dela)</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cores do fundo">
              {BANNER_BG_STYLES.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={bgStyle === s} onClick={() => setBgStyle(s)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${bgStyle === s ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-300'}`}>
                  <span className={`w-10 h-5 rounded bg-gradient-to-r ${BANNER_BG_PRESETS[s].bgClass}`} /> {BANNER_BG_PRESETS[s].label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className={labelCls} htmlFor="bn-country">País</label>
              <select id="bn-country" className={inputCls} value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
                <option value="">Global (todos os países)</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                {countryCode && !countries.some((c) => c.code === countryCode) && <option value={countryCode}>{countryCode}</option>}
              </select>
              {errors.countryCode && <p className={errCls} role="alert">{errors.countryCode}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="bn-start">Início (opcional)</label>
              <input id="bn-start" type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              {errors.startsAt && <p className={errCls} role="alert">{errors.startsAt}</p>}
            </div>
            <div>
              <label className={labelCls} htmlFor="bn-end">Fim (opcional)</label>
              <input id="bn-end" type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              {errors.endsAt && <p className={errCls} role="alert">{errors.endsAt}</p>}
            </div>
          </div>
          <p className="text-[11px] text-gray-500 -mt-2">Datas no horário do seu navegador. Em branco = sem limite.</p>

          {!initial && (
            <div>
              <label className={labelCls} htmlFor="bn-status">Situação ao criar</label>
              <select id="bn-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as BannerStatus)}>
                <option value="draft">Rascunho (não aparece na home)</option>
                <option value="active">Ativo (aparece na home dentro do período)</option>
                <option value="inactive">Inativo</option>
              </select>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 flex flex-wrap justify-between gap-2 text-xs">
            <button type="button" onClick={() => onPreview(toSlide(draft() as any))} className="px-4 py-2 border border-sky-300 text-sky-700 font-bold rounded-xl hover:bg-sky-50 flex items-center gap-1.5 cursor-pointer">
              <Eye className="w-4 h-4" /> Pré-visualizar
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer">Cancelar</button>
              <button type="submit" disabled={saving || uploading.desktop || uploading.mobile} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-60">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} {saving ? 'Salvando…' : 'Salvar banner'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
