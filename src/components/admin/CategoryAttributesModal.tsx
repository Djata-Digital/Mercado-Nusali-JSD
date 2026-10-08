import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Sliders,
  X,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  Check,
  ChevronRight,
  Lock,
  AlertTriangle,
  CornerDownRight,
  EyeOff,
  RotateCcw,
  Replace,
  Layers,
  Info,
} from 'lucide-react';
import { AdminApi } from '../../api/clients/AdminApi';
import { Category, getCategoryPath } from '../../utils/categoryUtils';
import {
  ATTRIBUTE_LIMITS,
  ATTRIBUTE_ROLE_LABELS,
  ATTRIBUTE_TYPE_LABELS,
  AXIS_ALLOWED_TYPES,
  FILTERABLE_TYPES,
  buildAttributeDraft,
  deriveAttributeCode,
  validateAttributeDraft,
  type AttributeRole,
  type AttributeType,
} from '../../utils/attributeRules';

interface Props {
  category: Category;
  categories: Category[];
  onClose: () => void;
  showToast: (msg: string) => void;
}

type OwnAttr = any;
type InheritedAttr = any;

interface FormState {
  mode: 'create' | 'edit' | 'override';
  id?: string;
  overridesId?: string | null;
  overridesLabel?: string;
  name: string;
  code: string;
  codeTouched: boolean;
  type: string;
  role: string;
  isRequired: boolean;
  isActive: boolean;
  isFilterable: boolean;
  unit: string;
  placeholder: string;
  helpText: string;
  displayGroup: string;
  sortOrder: string;
  minValue: string;
  maxValue: string;
  maxLength: string;
  decimals: string;
  options: string[];
  usage: number;
  usedOptions: string[];
  /** campos de identidade travados (atributo em uso ou substituição) */
  lockIdentity: boolean;
  lockReason: string;
}

const emptyForm = (): FormState => ({
  mode: 'create', name: '', code: '', codeTouched: false, type: 'text', role: 'spec', isRequired: false, isActive: true, isFilterable: false,
  unit: '', placeholder: '', helpText: '', displayGroup: '', sortOrder: '0', minValue: '', maxValue: '', maxLength: '', decimals: '', options: [''],
  usage: 0, usedOptions: [], lockIdentity: false, lockReason: '',
});

const isSelectType = (t: string) => t === 'select' || t === 'multiselect';
const numStr = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** Lê a mensagem e os erros por campo de uma resposta de erro da API (axios). */
function readApiError(err: any): { message: string; fields: Record<string, string> } {
  const data = err?.response?.data;
  const fields: Record<string, string> = {};
  const details = data?.error?.details;
  if (Array.isArray(details)) {
    for (const d of details) if (d?.field && d?.message && !fields[d.field]) fields[d.field] = d.message;
  } else if (details && typeof details === 'object' && typeof (details as any).field === 'string' && data?.message) {
    fields[(details as any).field] = data.message;
  }
  const message = data?.message || data?.error?.message || err?.message || 'Não foi possível concluir a operação.';
  return { message, fields };
}

const badge = 'px-2 py-0.5 rounded-md text-[10px] font-extrabold border';

/** Rótulo + campo + mensagem de erro/ajuda. Definido FORA do componente do modal: se fosse recriado a cada render, os inputs perderiam o foco a cada tecla. */
const Field: React.FC<{ label: string; error?: string; hint?: string; children: React.ReactNode }> = ({ label, error, hint, children }) => (
  <div>
    <label className="block font-bold text-gray-800 mb-1">{label}</label>
    {children}
    {error ? <p className="text-[11px] text-red-600 font-semibold mt-1" role="alert">{error}</p> : hint ? <p className="text-[10px] text-gray-400 mt-1">{hint}</p> : null}
  </div>
);

export const CategoryAttributesModal: React.FC<Props> = ({ category, categories, onClose, showToast }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [own, setOwn] = useState<OwnAttr[]>([]);
  const [inherited, setInherited] = useState<InheritedAttr[]>([]);
  const [effective, setEffective] = useState<any[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showPaste, setShowPaste] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const path = useMemo(() => getCategoryPath(category.id, categories), [category.id, categories]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res: any = await AdminApi.getCategoryAttributes(category.id);
      setOwn(Array.isArray(res?.data) ? res.data : []);
      setInherited(Array.isArray(res?.inherited) ? res.inherited : []);
      setEffective(Array.isArray(res?.effective) ? res.effective : []);
    } catch (err: any) {
      setLoadError(readApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [category.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------------------------------------------------------------- formulário

  const openCreate = () => {
    setWarnings([]); setFormError(''); setServerFields({}); setShowPaste(false);
    setForm(emptyForm());
  };

  const openEdit = (a: OwnAttr) => {
    setWarnings([]); setFormError(''); setServerFields({}); setShowPaste(false);
    const used = (a.usageCount || 0) > 0;
    const overridden = (a.overriddenBy || []).length > 0;
    const isOverride = !!a.overridesId;
    setForm({
      mode: 'edit', id: a.id, overridesId: a.overridesId || null,
      overridesLabel: isOverride ? `${a.overridesName || a.name} de "${a.overridesCategoryName || 'categoria superior'}"` : undefined,
      name: a.name, code: a.code, codeTouched: true, type: a.type, role: a.role || 'spec', isRequired: !!a.isRequired, isActive: a.isActive !== false, isFilterable: !!a.isFilterable,
      unit: a.unit || '', placeholder: a.placeholder || '', helpText: a.helpText || '', displayGroup: a.displayGroup || '', sortOrder: numStr(a.sortOrder ?? 0),
      minValue: numStr(a.minValue), maxValue: numStr(a.maxValue), maxLength: numStr(a.maxLength), decimals: numStr(a.decimals),
      options: Array.isArray(a.optionsJson) && a.optionsJson.length ? [...a.optionsJson] : [''],
      usage: a.usageCount || 0, usedOptions: a.usedOptions || [],
      lockIdentity: used || overridden || isOverride,
      lockReason: used
        ? `Este atributo já tem valores em ${a.usageCount} produto(s): código, tipo, função e unidade estão travados e as opções em uso não podem ser removidas.`
        : overridden
          ? `Este atributo é substituído em ${(a.overriddenBy || []).length} categoria(s): código, tipo e função estão travados.`
          : 'Uma substituição mantém o código, o tipo e a função do atributo herdado.',
    });
  };

  const openOverride = (inh: InheritedAttr) => {
    setWarnings([]); setFormError(''); setServerFields({}); setShowPaste(false);
    setForm({
      ...emptyForm(),
      mode: 'override', overridesId: inh.id, overridesLabel: `${inh.name} de "${inh.originCategoryName}"`,
      name: inh.name, code: inh.code, codeTouched: true, type: inh.type, role: inh.role || 'spec', isRequired: !!inh.isRequired, isFilterable: !!inh.isFilterable,
      unit: inh.unit || '', placeholder: inh.placeholder || '', helpText: inh.helpText || '', displayGroup: inh.displayGroup || '', sortOrder: numStr(inh.sortOrder ?? 0),
      minValue: numStr(inh.minValue), maxValue: numStr(inh.maxValue), maxLength: numStr(inh.maxLength), decimals: numStr(inh.decimals),
      options: Array.isArray(inh.optionsJson) && inh.optionsJson.length ? [...inh.optionsJson] : [''],
      lockIdentity: true, lockReason: 'Uma substituição mantém o código, o tipo e a função do atributo herdado. Você pode mudar opções, obrigatoriedade, limites e textos só para esta categoria e suas subcategorias.',
    });
  };

  const patchForm = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  const draftPayload = (f: FormState) => ({
    name: f.name.trim(),
    code: f.code.trim() || deriveAttributeCode(f.name),
    type: f.type,
    role: f.role,
    isRequired: f.isRequired,
    isActive: f.isActive,
    isFilterable: f.isFilterable && FILTERABLE_TYPES.includes(f.type as AttributeType),
    unit: f.unit.trim() || null,
    placeholder: f.placeholder.trim() || null,
    helpText: f.helpText.trim() || null,
    displayGroup: f.displayGroup.trim() || null,
    sortOrder: f.sortOrder === '' ? 0 : Number(f.sortOrder),
    minValue: f.type === 'number' && f.minValue !== '' ? Number(f.minValue.replace(',', '.')) : null,
    maxValue: f.type === 'number' && f.maxValue !== '' ? Number(f.maxValue.replace(',', '.')) : null,
    maxLength: f.type === 'text' && f.maxLength !== '' ? Number(f.maxLength) : null,
    decimals: f.type === 'number' && f.decimals !== '' ? Number(f.decimals) : null,
    options: isSelectType(f.type) ? f.options.map((o) => o.trim()).filter(Boolean) : [],
  });

  // validação instantânea com as MESMAS regras do servidor
  const clientErrors = useMemo(() => {
    if (!form) return {} as Record<string, string>;
    const d = buildAttributeDraft(draftPayload(form));
    const out: Record<string, string> = {};
    for (const e of validateAttributeDraft(d)) if (!out[e.field]) out[e.field] = e.message;
    return out;
  }, [form]);
  const fieldError = (name: string) => serverFields[name] || (form && (form.name || form.code || name !== 'name') ? clientErrors[name] : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError('');
    setServerFields({});
    const first = Object.entries(clientErrors)[0];
    if (first) {
      setServerFields(clientErrors);
      setFormError(first[1]);
      return;
    }
    setSaving(true);
    try {
      const payload: any = draftPayload(form);
      let res: any;
      if (form.mode === 'edit' && form.id) {
        res = await AdminApi.updateCategoryAttribute(form.id, payload);
      } else {
        if (form.mode === 'override') payload.overridesId = form.overridesId;
        res = await AdminApi.createCategoryAttribute(category.id, payload);
      }
      if (res?.success === false) {
        setFormError(res.message || 'Não foi possível salvar o atributo.');
        return;
      }
      showToast(res?.message || 'Atributo salvo.');
      setWarnings(Array.isArray(res?.warnings) ? res.warnings : []);
      setForm(null);
      await load();
    } catch (err: any) {
      const { message, fields } = readApiError(err);
      // se a mensagem já aparece junto de um campo visível do formulário, não repete no banner
      const visibleFields = ['name', 'code', 'type', 'role', 'options', 'minValue', 'maxValue', 'decimals', 'maxLength', 'unit', 'sortOrder', 'displayGroup', 'placeholder', 'helpText', 'isFilterable'];
      setFormError(Object.keys(fields).some((k) => visibleFields.includes(k)) ? '' : message);
      setServerFields(fields);
    } finally {
      setSaving(false);
    }
  };

  const removeAttribute = async (a: OwnAttr) => {
    const isOv = !!a.overridesId;
    const text = isOv ? `Remover a substituição "${a.name}" e restaurar o atributo herdado nesta categoria?` : `Excluir o atributo "${a.name}"?`;
    if (!confirm(text)) return;
    setBusyId(a.id);
    try {
      const res: any = await AdminApi.deleteCategoryAttribute(a.id);
      showToast(res?.message || 'Atributo removido.');
      setWarnings([]);
      await load();
    } catch (err: any) {
      showToast(readApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const disableInherited = async (inh: InheritedAttr) => {
    if (!confirm(`Desativar "${inh.name}" apenas nesta categoria (e nas subcategorias)? O atributo original em "${inh.originCategoryName}" não será alterado.`)) return;
    setBusyId(inh.id);
    try {
      const res: any = await AdminApi.disableInheritedAttribute(category.id, inh.id);
      showToast(res?.message || 'Atributo herdado desativado nesta categoria.');
      setWarnings([]);
      await load();
    } catch (err: any) {
      showToast(readApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  // ---------------------------------------------------------------- partes da tela

  const typeBadge = (a: any) => (
    <span className={`${badge} bg-gray-100 text-gray-700 border-gray-200`}>{ATTRIBUTE_TYPE_LABELS[a.type as AttributeType] || a.type}</span>
  );
  const roleBadge = (a: any) =>
    a.role === 'variant_axis' ? (
      <span className={`${badge} bg-amber-50 text-amber-800 border-amber-200`} title="Muda por variante (cor, tamanho, capacidade…), com estoque e preço próprios">
        {ATTRIBUTE_ROLE_LABELS.variant_axis}
      </span>
    ) : (
      <span className={`${badge} bg-sky-50 text-sky-800 border-sky-200`} title="Um valor por produto (ficha técnica)">{ATTRIBUTE_ROLE_LABELS.spec}</span>
    );
  const reqBadge = (a: any) =>
    a.isRequired ? <span className={`${badge} bg-red-50 text-red-700 border-red-200`}>Obrigatório</span> : <span className={`${badge} bg-gray-50 text-gray-500 border-gray-200`}>Opcional</span>;

  const detailLine = (a: any) => {
    const bits: string[] = [];
    if (a.unit) bits.push(`Unidade: ${a.unit}`);
    if (a.type === 'number') {
      if (a.minValue !== null && a.minValue !== undefined) bits.push(`mín. ${a.minValue}`);
      if (a.maxValue !== null && a.maxValue !== undefined) bits.push(`máx. ${a.maxValue}`);
      if (a.decimals !== null && a.decimals !== undefined) bits.push(`${a.decimals} casa(s) decimal(is)`);
    }
    if (a.type === 'text' && a.maxLength) bits.push(`até ${a.maxLength} caracteres`);
    if (Array.isArray(a.optionsJson) && a.optionsJson.length) bits.push(`Opções (${a.optionsJson.length}): ${a.optionsJson.slice(0, 4).join(', ')}${a.optionsJson.length > 4 ? '…' : ''}`);
    if (a.displayGroup) bits.push(`Grupo: ${a.displayGroup}`);
    return bits.join('  •  ');
  };

  const renderOwn = (a: OwnAttr) => {
    const used = (a.usageCount || 0) > 0;
    const overridden = (a.overriddenBy || []).length > 0;
    const isOv = !!a.overridesId;
    const deleteBlock = used ? `Em uso por ${a.usageCount} produto(s): desative em vez de excluir.` : overridden ? 'Substituído em outras categorias: remova as substituições primeiro.' : '';
    return (
      <li key={a.id} className={`p-3 rounded-xl border ${a.isActive === false ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200'}`}>
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-extrabold text-gray-900 text-sm">{a.name}</span>
              <span className="font-mono text-[11px] text-gray-500">{a.code}</span>
              {a.isActive === false && <span className={`${badge} bg-gray-200 text-gray-600 border-gray-300`}>{a.isDisabledOverride ? 'Desativado aqui' : 'Inativo'}</span>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {typeBadge(a)}
              {roleBadge(a)}
              {reqBadge(a)}
              {a.isFilterable && <span className={`${badge} bg-violet-50 text-violet-700 border-violet-200`}>Filtrável</span>}
              {used && <span className={`${badge} bg-emerald-50 text-emerald-800 border-emerald-200`} title="Há produtos com valores neste atributo">Em uso: {a.usageCount} produto(s)</span>}
              {isOv && (
                <span className={`${badge} bg-indigo-50 text-indigo-800 border-indigo-200 inline-flex items-center gap-1`}>
                  <Replace className="w-3 h-3" /> Substitui «{a.overridesName}» de «{a.overridesCategoryName}»
                </span>
              )}
              {overridden && (
                <span className={`${badge} bg-indigo-50 text-indigo-800 border-indigo-200`}>
                  Substituído em: {(a.overriddenBy || []).map((o: any) => o.categoryName).slice(0, 3).join(', ')}
                </span>
              )}
            </div>
            {detailLine(a) && <p className="text-[11px] text-gray-500 break-words">{detailLine(a)}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {!a.isDisabledOverride && (
              <button onClick={() => openEdit(a)} className="px-2.5 py-1.5 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer" aria-label={`Editar ${a.name}`}>
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </button>
            )}
            <button
              onClick={() => removeAttribute(a)}
              disabled={!!deleteBlock || busyId === a.id}
              title={deleteBlock || (isOv ? 'Remover substituição e restaurar a herança' : 'Excluir atributo')}
              aria-label={isOv ? `Restaurar herança de ${a.name}` : `Excluir ${a.name}`}
              className="px-2.5 py-1.5 text-red-700 bg-red-50 hover:bg-red-100 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : isOv ? <RotateCcw className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isOv ? 'Restaurar herança' : 'Excluir'}
            </button>
          </div>
        </div>
      </li>
    );
  };

  const renderInherited = (a: InheritedAttr) => {
    const statusChip =
      a.status === 'overridden' ? (
        <span className={`${badge} bg-indigo-50 text-indigo-800 border-indigo-200`}>Substituído aqui</span>
      ) : a.status === 'disabled' ? (
        <span className={`${badge} bg-gray-200 text-gray-600 border-gray-300`}>Desativado aqui</span>
      ) : (
        <span className={`${badge} bg-emerald-50 text-emerald-800 border-emerald-200`}>Herdado</span>
      );
    return (
      <li key={a.id} className="p-3 rounded-xl border border-dashed border-gray-300 bg-gray-50/60">
        <div className="flex flex-col md:flex-row md:items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <CornerDownRight className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
              <span className="font-extrabold text-gray-800 text-sm">{a.name}</span>
              <span className="font-mono text-[11px] text-gray-500">{a.code}</span>
              {statusChip}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {typeBadge(a)}
              {roleBadge(a)}
              {reqBadge(a)}
              <span className={`${badge} bg-white text-gray-600 border-gray-200`}>Origem: {a.originCategoryName}</span>
            </div>
            {detailLine(a) && <p className="text-[11px] text-gray-500 break-words">{detailLine(a)}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {a.status === 'inherited' && (
              <>
                <button onClick={() => openOverride(a)} className="px-2.5 py-1.5 text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer" title="Alterar este atributo só nesta categoria e abaixo">
                  <Replace className="w-3.5 h-3.5" /> Substituir
                </button>
                <button onClick={() => disableInherited(a)} disabled={busyId === a.id} className="px-2.5 py-1.5 text-gray-700 bg-white border border-gray-300 hover:bg-gray-100 rounded-lg text-[11px] font-extrabold flex items-center gap-1 cursor-pointer disabled:opacity-50" title="Ocultar este atributo nesta categoria e abaixo, sem alterar o original">
                  {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />} Desativar aqui
                </button>
              </>
            )}
            {a.status !== 'inherited' && <span className="text-[11px] text-gray-500 font-semibold">Gerencie na lista acima</span>}
          </div>
        </div>
      </li>
    );
  };

  const inputCls = (name: string, extra = '') => `w-full p-2.5 border rounded-xl ${fieldError(name) ? 'border-red-400 bg-red-50/40' : 'border-gray-300'} ${extra}`;

  const renderForm = () => {
    if (!form) return null;
    const locked = form.lockIdentity;
    const typeLocked = locked || form.usage > 0;
    const title = form.mode === 'create' ? 'Novo atributo' : form.mode === 'override' ? 'Substituir atributo herdado' : 'Editar atributo';
    const axisTypeAllowed = (t: string) => form.role !== 'variant_axis' || (AXIS_ALLOWED_TYPES as readonly string[]).includes(t);
    return (
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
        <div className="bg-white sm:rounded-2xl rounded-t-2xl max-w-2xl w-full max-h-[94vh] overflow-y-auto shadow-2xl border border-gray-100 animate-fadeIn" role="dialog" aria-modal="true" aria-label={title}>
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600" /> {title}
            </h3>
            <button onClick={() => setForm(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer" aria-label="Fechar formulário">
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={submit} className="p-5 space-y-4 text-xs" noValidate>
            {form.mode === 'override' && (
              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 flex gap-2">
                <Replace className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Substituindo <strong>{form.overridesLabel}</strong>. {form.lockReason}</span>
              </div>
            )}
            {form.mode === 'edit' && form.lockIdentity && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 flex gap-2">
                <Lock className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{form.lockReason}</span>
              </div>
            )}
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800 font-semibold flex gap-2" role="alert">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Nome do atributo *" error={fieldError('name')}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    patchForm({ name, ...(form.mode === 'create' && !form.codeTouched ? { code: deriveAttributeCode(name) } : {}) });
                  }}
                  placeholder="Ex.: Memória RAM"
                  className={inputCls('name', 'font-bold')}
                />
              </Field>
              <Field label="Código (chave estável) *" error={fieldError('code')} hint={locked || form.usage > 0 ? 'Travado.' : 'Minúsculas, números e "_". Não muda depois que houver produtos.'}>
                <input
                  type="text"
                  value={form.code}
                  disabled={locked || form.usage > 0}
                  onChange={(e) => patchForm({ code: e.target.value, codeTouched: true })}
                  placeholder="ex.: memoria_ram"
                  className={inputCls('code', 'font-mono disabled:bg-gray-100 disabled:text-gray-500')}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Tipo de campo *" error={fieldError('type')}>
                <select
                  value={form.type}
                  disabled={typeLocked}
                  onChange={(e) => {
                    const t = e.target.value;
                    patchForm({ type: t, ...(t !== 'number' ? { minValue: '', maxValue: '', decimals: '' } : {}), ...(t !== 'text' ? { maxLength: '' } : {}), ...(t === 'text' ? { isFilterable: false } : {}), ...(!isSelectType(t) ? { options: [''] } : {}) });
                  }}
                  className={inputCls('type', 'font-bold bg-white disabled:bg-gray-100')}
                >
                  {(Object.keys(ATTRIBUTE_TYPE_LABELS) as AttributeType[]).map((t) => (
                    <option key={t} value={t} disabled={!axisTypeAllowed(t)}>{ATTRIBUTE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unidade (opcional)" error={fieldError('unit')}>
                <input type="text" value={form.unit} disabled={locked || form.usage > 0} onChange={(e) => patchForm({ unit: e.target.value })} placeholder="Ex.: GB, kg, cm, meses" className={inputCls('unit', 'font-bold disabled:bg-gray-100')} />
              </Field>
            </div>

            <fieldset>
              <legend className="block font-bold text-gray-800 mb-1">Função do atributo *</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(['spec', 'variant_axis'] as AttributeRole[]).map((r) => (
                  <label key={r} className={`p-3 rounded-xl border cursor-pointer flex gap-2 ${form.role === r ? 'border-indigo-500 bg-indigo-50/60' : 'border-gray-200'} ${typeLocked ? 'opacity-70 cursor-not-allowed' : ''}`}>
                    <input
                      type="radio"
                      name="attr-role"
                      value={r}
                      checked={form.role === r}
                      disabled={typeLocked}
                      onChange={() => patchForm({ role: r, ...(r === 'variant_axis' && !(AXIS_ALLOWED_TYPES as readonly string[]).includes(form.type) ? { type: 'select' } : {}) })}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-extrabold text-gray-900 block">{ATTRIBUTE_ROLE_LABELS[r]}</span>
                      <span className="text-[11px] text-gray-500 block">
                        {r === 'spec' ? 'Um valor por produto (ficha técnica): marca do chip, material, voltagem…' : 'Muda por variante, com estoque e preço próprios: cor, tamanho, capacidade…'}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {fieldError('role') && <p className="text-[11px] text-red-600 font-semibold mt-1" role="alert">{fieldError('role')}</p>}
            </fieldset>

            {isSelectType(form.type) && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-gray-800">Opções de seleção *</label>
                  <button type="button" onClick={() => setShowPaste((v) => !v)} className="text-[11px] font-extrabold text-indigo-700 hover:underline cursor-pointer">
                    {showPaste ? 'Voltar ao editor' : 'Colar lista (uma por linha)'}
                  </button>
                </div>
                {showPaste ? (
                  <textarea
                    rows={6}
                    value={form.options.join('\n')}
                    onChange={(e) => patchForm({ options: e.target.value.split('\n') })}
                    placeholder={'4 GB\n8 GB\n12 GB'}
                    className={inputCls('options', 'font-mono')}
                  />
                ) : (
                  <ul className="space-y-1.5">
                    {form.options.map((opt, idx) => {
                      const inUse = form.usedOptions.some((u) => u.toLocaleLowerCase('pt-BR') === opt.trim().toLocaleLowerCase('pt-BR')) && opt.trim() !== '';
                      return (
                        <li key={idx} className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={opt}
                            disabled={inUse}
                            maxLength={ATTRIBUTE_LIMITS.option}
                            onChange={(e) => patchForm({ options: form.options.map((o, i) => (i === idx ? e.target.value : o)) })}
                            placeholder={`Opção ${idx + 1}`}
                            aria-label={`Opção ${idx + 1}`}
                            className="flex-1 p-2 border border-gray-300 rounded-lg disabled:bg-gray-100"
                          />
                          {inUse ? (
                            <span className="text-emerald-700 flex items-center gap-1 text-[10px] font-bold px-1.5" title="Em uso por produtos: não pode ser removida nem renomeada"><Lock className="w-3.5 h-3.5" /> em uso</span>
                          ) : (
                            <button type="button" onClick={() => patchForm({ options: form.options.length > 1 ? form.options.filter((_, i) => i !== idx) : [''] })} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer" aria-label={`Remover opção ${idx + 1}`}>
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {!showPaste && (
                  <button type="button" onClick={() => patchForm({ options: [...form.options, ''] })} className="mt-1.5 text-[11px] font-extrabold text-indigo-700 flex items-center gap-1 cursor-pointer">
                    <Plus className="w-3.5 h-3.5" /> Adicionar opção
                  </button>
                )}
                {fieldError('options') ? <p className="text-[11px] text-red-600 font-semibold mt-1" role="alert">{fieldError('options')}</p> : <p className="text-[10px] text-gray-400 mt-1">Sem vírgulas. Opções repetidas são unidas automaticamente.</p>}
              </div>
            )}

            {form.type === 'number' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Valor mínimo" error={fieldError('minValue')}><input type="text" inputMode="decimal" value={form.minValue} onChange={(e) => patchForm({ minValue: e.target.value })} className={inputCls('minValue')} placeholder="sem limite" /></Field>
                <Field label="Valor máximo" error={fieldError('maxValue')}><input type="text" inputMode="decimal" value={form.maxValue} onChange={(e) => patchForm({ maxValue: e.target.value })} className={inputCls('maxValue')} placeholder="sem limite" /></Field>
                <Field label="Casas decimais (0 a 6)" error={fieldError('decimals')}><input type="text" inputMode="numeric" value={form.decimals} onChange={(e) => patchForm({ decimals: e.target.value })} className={inputCls('decimals')} placeholder="livre" /></Field>
              </div>
            )}
            {form.type === 'text' && (
              <Field label="Tamanho máximo (caracteres)" error={fieldError('maxLength')} hint={`Até ${ATTRIBUTE_LIMITS.maxLengthCap}. Vazio = padrão do sistema.`}>
                <input type="text" inputMode="numeric" value={form.maxLength} onChange={(e) => patchForm({ maxLength: e.target.value })} className={inputCls('maxLength')} placeholder="padrão" />
              </Field>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Ordem de exibição" error={fieldError('sortOrder')}><input type="text" inputMode="numeric" value={form.sortOrder} onChange={(e) => patchForm({ sortOrder: e.target.value })} className={inputCls('sortOrder', 'font-bold')} /></Field>
              <Field label="Grupo (opcional)" error={fieldError('displayGroup')}><input type="text" value={form.displayGroup} onChange={(e) => patchForm({ displayGroup: e.target.value })} placeholder="Ex.: Desempenho" className={inputCls('displayGroup')} /></Field>
              <Field label="Placeholder" error={fieldError('placeholder')}><input type="text" value={form.placeholder} onChange={(e) => patchForm({ placeholder: e.target.value })} className={inputCls('placeholder')} /></Field>
            </div>
            <Field label="Texto de ajuda" error={fieldError('helpText')}>
              <input type="text" value={form.helpText} onChange={(e) => patchForm({ helpText: e.target.value })} placeholder="Ex.: Capacidade da memória RAM principal" className={inputCls('helpText')} />
            </Field>

            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
              <label className="flex items-center gap-2 font-extrabold text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.isRequired} onChange={(e) => patchForm({ isRequired: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded-md" />
                Preenchimento obrigatório
              </label>
              <label className="flex items-center gap-2 font-extrabold text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => patchForm({ isActive: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded-md" />
                Ativo
              </label>
              <label className={`flex items-center gap-2 font-extrabold ${form.type === 'text' ? 'text-gray-400' : 'text-gray-900 cursor-pointer'}`} title={form.type === 'text' ? 'Texto livre não pode virar filtro' : 'Poderá ser usado como filtro no catálogo (futuro)'}>
                <input type="checkbox" disabled={form.type === 'text'} checked={form.isFilterable && form.type !== 'text'} onChange={(e) => patchForm({ isFilterable: e.target.checked })} className="w-4 h-4 text-indigo-600 rounded-md" />
                Filtrável no catálogo
              </label>
            </div>
            {fieldError('isFilterable') && <p className="text-[11px] text-red-600 font-semibold" role="alert">{fieldError('isFilterable')}</p>}

            <div className="pt-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white pb-1">
              <button type="button" onClick={() => setForm(null)} className="px-4 py-2 border border-gray-300 font-bold text-gray-700 rounded-xl hover:bg-gray-50 cursor-pointer">Cancelar</button>
              <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Salvar atributo
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------- render

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
      <div className="bg-white sm:rounded-2xl rounded-t-2xl max-w-4xl w-full shadow-2xl border border-gray-100 max-h-[94vh] overflow-y-auto animate-fadeIn" role="dialog" aria-modal="true" aria-label="Atributos da categoria">
        <div className="sticky top-0 z-10 bg-white flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-black text-base text-gray-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-600 shrink-0" /> Atributos da categoria
            </h3>
            <div className="text-xs text-indigo-900 font-bold mt-1 flex items-center gap-1 flex-wrap">
              {path.map((p, idx) => (
                <React.Fragment key={p.id}>
                  {idx > 0 && <ChevronRight className="w-3 h-3 text-indigo-400" />}
                  <span className={idx === path.length - 1 ? 'font-black text-indigo-700 underline' : ''}>{p.name}</span>
                </React.Fragment>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer shrink-0" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
            <p className="text-xs text-indigo-900 font-medium flex gap-2">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Estes atributos aparecem para o vendedor ao cadastrar produtos nesta categoria e nas subcategorias. Atributos herdados vêm das categorias superiores.</span>
            </p>
            <button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs px-3.5 py-2 rounded-xl transition flex items-center justify-center gap-1.5 shadow-sm cursor-pointer shrink-0">
              <Plus className="w-4 h-4" /> Novo atributo
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs space-y-1" role="status">
              <div className="font-extrabold flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Avisos</div>
              <ul className="list-disc pl-5 space-y-0.5">{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}

          {loading ? (
            <div className="p-8 text-center text-gray-400 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
              <p className="font-bold text-xs text-gray-500">Carregando atributos…</p>
            </div>
          ) : loadError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-xs font-semibold flex items-center justify-between gap-3" role="alert">
              <span>{loadError}</span>
              <button onClick={load} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg font-extrabold cursor-pointer">Tentar de novo</button>
            </div>
          ) : (
            <>
              <section aria-label="Atributos desta categoria" className="space-y-2">
                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Desta categoria ({own.length})</h4>
                {own.length === 0 ? (
                  <div className="p-6 text-center text-gray-400 space-y-1 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <Sliders className="w-7 h-7 mx-auto text-gray-300" />
                    <p className="font-bold text-sm text-gray-600">Nenhum atributo próprio nesta categoria</p>
                    <p className="text-xs text-gray-400">Use "Novo atributo" (ex.: Memória RAM, Voltagem, Material).</p>
                  </div>
                ) : (
                  <ul className="space-y-2">{own.map(renderOwn)}</ul>
                )}
              </section>

              <section aria-label="Atributos herdados" className="space-y-2">
                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Herdados das categorias superiores ({inherited.length})</h4>
                {inherited.length === 0 ? (
                  <p className="text-xs text-gray-400">{category.parentId ? 'Nenhum atributo herdado ativo.' : 'Esta é uma categoria principal: não herda atributos.'}</p>
                ) : (
                  <ul className="space-y-2">{inherited.map(renderInherited)}</ul>
                )}
              </section>

              <section aria-label="O que o vendedor verá" className="space-y-2">
                <h4 className="text-[11px] font-black text-gray-500 uppercase tracking-wider flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> O vendedor verá ({effective.length})</h4>
                {effective.length === 0 ? (
                  <p className="text-xs text-gray-400">Nenhum atributo específico para esta categoria.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {effective.map((a: any) => (
                      <span key={a.id} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${a.isRequired ? 'bg-red-50 text-red-800 border-red-200' : 'bg-gray-50 text-gray-700 border-gray-200'}`}>
                        {a.name}{a.isRequired ? ' *' : ''}{a.role === 'variant_axis' ? ' · variante' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
      {renderForm()}
    </div>
  );
};
