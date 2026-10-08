import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import {
  describeLimits,
  groupFormAttributes,
  type FormAttribute,
  type FormValue,
  type FormValues,
} from '../../utils/attributeFormModel';

interface Props {
  fields: FormAttribute[];
  values: FormValues;
  errors: Record<string, string>;
  onChange: (code: string, value: FormValue) => void;
  isLoading?: boolean;
  /** Campos só leitura (não usado pelo assistente desde a Fase 6; mantido para outras telas). */
  readOnly?: boolean;
  /** Edição: características gravadas que a categoria atual não pede mais (desativadas). Continuam salvas, mas não aparecem na página. */
  inactiveLabels?: string[];
  /** Categoria ainda não é uma subcategoria final (folha): pede para escolher uma. */
  needsLeafCategory?: boolean;
  /** Atributos descartados na última troca de subcategoria (só aviso). */
  droppedLabels?: string[];
}

const inputBase = 'w-full p-2.5 border rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-purple-500 focus:outline-hidden disabled:bg-gray-50 disabled:text-gray-500';
const borderFor = (hasError: boolean) => (hasError ? 'border-red-400' : 'border-gray-300');

/** Campos dinâmicos de atributos da categoria: texto, número, seleção, múltipla seleção e Sim/Não. Só apresentação: regras em attributeFormModel. */
export const ProductAttributeFields: React.FC<Props> = ({ fields, values, errors, onChange, isLoading, readOnly, needsLeafCategory, droppedLabels = [], inactiveLabels = [] }) => {
  const groups = React.useMemo(() => groupFormAttributes(fields), [fields]);

  const renderControl = (f: FormAttribute) => {
    const id = `attr-field-${f.code}`;
    const err = errors[f.code];
    const describedBy = [err ? `${id}-error` : null, f.helpText ? `${id}-help` : null].filter(Boolean).join(' ') || undefined;
    const common = { id, disabled: readOnly, 'aria-invalid': Boolean(err) || undefined, 'aria-describedby': describedBy } as const;
    const options: string[] = Array.isArray(f.optionsJson) ? (f.optionsJson as unknown[]).map(String) : [];
    const value = values[f.code];

    if (f.type === 'select') {
      return (
        <select {...common} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(f.code, e.target.value)} className={`${inputBase} ${borderFor(Boolean(err))} font-bold`}>
          <option value="">{f.placeholder || `Selecione ${f.name}...`}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (f.type === 'boolean') {
      return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex gap-2">
          {[{ v: 'true', l: 'Sim' }, { v: 'false', l: 'Não' }].map((o) => (
            <button
              key={o.v}
              type="button"
              role="radio"
              aria-checked={value === o.v}
              disabled={readOnly}
              data-testid={`${id}-${o.v}`}
              onClick={() => onChange(f.code, value === o.v && !f.isRequired ? '' : o.v)}
              className={`flex-1 px-3 py-2.5 text-sm rounded-xl border font-bold transition cursor-pointer disabled:cursor-not-allowed ${
                value === o.v ? 'bg-purple-600 text-white border-purple-600' : `bg-white text-gray-700 hover:border-purple-400 ${borderFor(Boolean(err))}`
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      );
    }
    if (f.type === 'multiselect') {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div id={id} role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy} className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                disabled={readOnly}
                onClick={() => onChange(f.code, on ? selected.filter((s) => s !== o) : [...selected, o])}
                className={`px-3 py-2 text-xs rounded-lg border font-bold transition cursor-pointer disabled:cursor-not-allowed ${
                  on ? 'bg-purple-600 text-white border-purple-600 shadow-2xs' : `bg-white text-gray-700 hover:border-purple-400 ${borderFor(Boolean(err))}`
                }`}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
    // number e text: texto simples (vírgula decimal aceita; "0" é um valor válido)
    return (
      <div className="relative">
        <input
          {...common}
          type="text"
          inputMode={f.type === 'number' ? 'decimal' : 'text'}
          autoComplete="off"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(f.code, e.target.value)}
          placeholder={f.placeholder || (f.type === 'number' ? 'Ex.: 0' : `Digite ${f.name}`)}
          className={`${inputBase} ${borderFor(Boolean(err))} ${f.unit && f.type === 'number' ? 'pr-14' : ''}`}
        />
        {f.unit && f.type === 'number' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md pointer-events-none">{f.unit}</span>
        )}
      </div>
    );
  };

  return (
    <div className="p-5 bg-white border border-gray-200 rounded-2xl space-y-5 shadow-2xs" data-testid="product-attribute-fields">
      <div className="flex items-center justify-between border-b border-gray-100 pb-3">
        <div>
          <h4 className="font-extrabold text-sm text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-600" />
            Características do produto
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">Preencha as especificações da categoria para aumentar a relevância do seu anúncio nas buscas.</p>
        </div>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-purple-600" aria-label="Carregando" />}
      </div>

      {readOnly && (
        <p role="note" className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs font-medium text-amber-900">
          Estas características estão somente para conferência.
        </p>
      )}

      {inactiveLabels.length > 0 && (
        <p role="note" data-testid="inactive-attributes-note" className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium text-gray-700">
          {inactiveLabels.length === 1 ? 'A característica' : 'As características'} <strong>{inactiveLabels.join(', ')}</strong>{' '}
          {inactiveLabels.length === 1 ? 'foi desativada' : 'foram desativadas'} pelo catálogo. {inactiveLabels.length === 1 ? 'O valor continua salvo' : 'Os valores continuam salvos'}, mas não {inactiveLabels.length === 1 ? 'aparece' : 'aparecem'} mais na página do produto nem {inactiveLabels.length === 1 ? 'pode' : 'podem'} ser alterado{inactiveLabels.length === 1 ? '' : 's'}.
        </p>
      )}

      {needsLeafCategory ? (
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 font-medium text-center">
          Escolha a subcategoria final do produto para ver as características que ela exige.
        </div>
      ) : isLoading ? (
        <div className="p-4 text-center text-xs text-gray-400 font-medium">Carregando características da categoria...</div>
      ) : fields.length === 0 ? (
        <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-500 font-medium text-center">
          Esta categoria não possui características específicas cadastradas no catálogo.
        </div>
      ) : (
        <>
          {droppedLabels.length > 0 && (
            <p role="status" className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs font-medium text-blue-900">
              Ao trocar de categoria, {droppedLabels.length === 1 ? 'a característica' : 'as características'} <strong>{droppedLabels.join(', ')}</strong> {droppedLabels.length === 1 ? 'não existe' : 'não existem'} na nova categoria e {droppedLabels.length === 1 ? 'foi removida' : 'foram removidas'}.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.name} aria-label={g.name} className="space-y-3">
              {groups.length > 1 && <h5 className="text-[11px] font-black uppercase tracking-wide text-gray-500">{g.name}</h5>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {g.fields.map((f) => {
                  const id = `attr-field-${f.code}`;
                  const err = errors[f.code];
                  const limits = describeLimits(f);
                  return (
                    <div key={f.id || f.code} className={`space-y-1 ${f.type === 'multiselect' ? 'sm:col-span-2' : ''}`}>
                      <label id={`${id}-label`} htmlFor={id} className="block text-gray-900 font-extrabold text-xs">
                        {f.name}
                        {f.isRequired ? <span className="text-red-500 font-black ml-0.5" aria-hidden="true">*</span> : <span className="text-gray-400 font-medium ml-1">(opcional)</span>}
                        {f.isRequired && <span className="sr-only"> (obrigatório)</span>}
                      </label>
                      {renderControl(f)}
                      {f.helpText && <p id={`${id}-help`} className="text-[11px] text-gray-500 font-medium">{f.helpText}</p>}
                      {limits && <p className="text-[11px] text-gray-400 font-medium">{limits}</p>}
                      {err && <p id={`${id}-error`} role="alert" className="text-[11px] text-red-600 font-bold">{err}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </>
      )}
    </div>
  );
};

export default ProductAttributeFields;

interface CategoryChangeProps {
  fromName?: string | null;
  toName: string;
  /** Características que serão removidas por não existirem (ou não valerem) na nova categoria. */
  removedLabels: string[];
  confirmed: boolean;
  onConfirm: (value: boolean) => void;
  /** Aviso vindo do servidor (409) quando a lista de removidos difere da calculada no formulário. */
  serverMessage?: string | null;
}

/** Edição: aviso de troca de subcategoria + confirmação explícita antes de perder especificações. */
export const AttributeCategoryChangeNotice: React.FC<CategoryChangeProps> = ({ fromName, toName, removedLabels, confirmed, onConfirm, serverMessage }) => (
  <div id="attr-category-change" data-testid="attr-category-change" role="alert" className="p-4 bg-amber-50 border border-amber-300 rounded-2xl space-y-2 text-xs font-medium text-amber-900">
    <p className="font-black text-sm">Mudança de categoria{fromName ? `: ${fromName} → ${toName}` : `: ${toName}`}</p>
    <p>As características compatíveis foram mantidas. Preencha as que a nova categoria exige; variações, preço e estoque não mudam.</p>
    {removedLabels.length > 0 && (
      <>
        <p>
          <strong>Serão removidas</strong> por não existirem na nova categoria: <strong>{removedLabels.join(', ')}</strong>.
        </p>
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={confirmed} onChange={(e) => onConfirm(e.target.checked)} className="mt-0.5 w-4 h-4 accent-amber-700" />
          <span>Entendo que {removedLabels.length === 1 ? 'esta característica será perdida' : 'estas características serão perdidas'} ao salvar.</span>
        </label>
      </>
    )}
    {serverMessage && <p className="text-red-700 font-bold">{serverMessage}</p>}
  </div>
);
