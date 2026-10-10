import React from 'react';
import {
  clearAttributeFilter, setAttributeRange, toggleAttributeOption,
  type AttributeFacet, type AttributeFilters, type CatalogFacets,
} from '../utils/attributeFilters';
import { formatNumberPtBr } from '../utils/attributeFormat';

export interface FacetSelection {
  brand?: string;
  condition: 'all' | 'novo' | 'usado';
  priceMin?: number;
  priceMax?: number;
  attrs: AttributeFilters;
}

interface Props {
  facets?: CatalogFacets;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  selection: FacetSelection;
  /** características só valem com uma categoria escolhida */
  showAttributes: boolean;
  onBrand: (brand: string | undefined) => void;
  onCondition: (c: 'all' | 'novo' | 'usado') => void;
  onPrice: (min: number | undefined, max: number | undefined) => void;
  onAttrs: (next: AttributeFilters) => void;
}

const CONDITION_LABEL: Record<string, string> = { new: 'Novo', used: 'Usado', refurbished: 'Recondicionado' };
const MAX_VISIBLE_OPTIONS = 8;

const fmt = (n: number, _decimals?: number | null) => formatNumberPtBr(n);

/** Número digitado (vírgula decimal aceita) -> número, vazio/ruim -> undefined. */
function readNumber(raw: string): number | undefined {
  const t = raw.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Duas caixas de mínimo/máximo; confirma ao sair do campo ou com Enter (nunca a cada tecla). */
const RangeInputs: React.FC<{
  idPrefix: string; min?: number; max?: number; placeholderMin?: string; placeholderMax?: string; unit?: string | null; label: string;
  onCommit: (min: string, max: string) => void;
}> = ({ idPrefix, min, max, placeholderMin, placeholderMax, unit, label, onCommit }) => {
  const minRef = React.useRef<HTMLInputElement>(null);
  const maxRef = React.useRef<HTMLInputElement>(null);
  const commit = () => onCommit(minRef.current?.value ?? '', maxRef.current?.value ?? '');
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } };
  const cls = 'w-full p-2 border border-gray-300 rounded-lg text-xs font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-hidden';
  return (
    <div className="flex items-center gap-2" data-testid={`${idPrefix}-range`}>
      <input ref={minRef} id={`${idPrefix}-min`} aria-label={`${label}: mínimo`} type="text" inputMode="decimal" defaultValue={min ?? ''} key={`min-${min ?? ''}`}
        placeholder={placeholderMin ?? 'Mín.'} onBlur={commit} onKeyDown={onKey} className={cls} />
      <span className="text-gray-400 text-xs" aria-hidden="true">–</span>
      <input ref={maxRef} id={`${idPrefix}-max`} aria-label={`${label}: máximo`} type="text" inputMode="decimal" defaultValue={max ?? ''} key={`max-${max ?? ''}`}
        placeholder={placeholderMax ?? 'Máx.'} onBlur={commit} onKeyDown={onKey} className={cls} />
      {unit ? <span className="text-[11px] font-bold text-gray-500 shrink-0">{unit}</span> : null}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode; testId?: string }> = ({ title, children, testId }) => (
  <fieldset className="space-y-2 border-0 p-0 m-0 min-w-0" data-testid={testId}>
    <legend className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-1">{title}</legend>
    {children}
  </fieldset>
);

function OptionList({ facet, selected, onToggle }: { facet: AttributeFacet; selected: string[]; onToggle: (value: string) => void }) {
  const options = facet.options ?? [];
  const visible = options.slice(0, MAX_VISIBLE_OPTIONS);
  // opção escolhida nunca fica escondida atrás de "ver mais"
  const hiddenSelected = options.slice(MAX_VISIBLE_OPTIONS).filter((o) => selected.includes(o.value));
  const rest = options.slice(MAX_VISIBLE_OPTIONS).filter((o) => !selected.includes(o.value));
  const row = (o: { value: string; count: number }) => (
    <label key={o.value} className="flex items-center gap-2 cursor-pointer text-xs text-gray-700">
      <input type="checkbox" checked={selected.includes(o.value)} onChange={() => onToggle(o.value)} className="rounded text-emerald-600 focus:ring-emerald-500" />
      <span className="flex-1 min-w-0 break-words">{o.value}</span>
      <span className="text-[11px] text-gray-400 tabular-nums">{o.count}</span>
    </label>
  );
  return (
    <div className="space-y-1.5">
      {[...visible, ...hiddenSelected].map(row)}
      {rest.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-emerald-700 font-semibold">Ver todas ({rest.length} a mais)</summary>
          <div className="space-y-1.5 pt-1.5">{rest.map(row)}</div>
        </details>
      )}
    </div>
  );
}

/** Filtros da busca/categoria: condição, preço, marca e as características (isFilterable) da categoria. Só opções com resultado. */
export const CatalogFacetsPanel: React.FC<Props> = ({ facets, isLoading, isError, onRetry, selection, showAttributes, onBrand, onCondition, onPrice, onAttrs }) => {
  const attrs = selection.attrs ?? {};
  const conditions = (facets?.conditions ?? []).filter((c) => CONDITION_LABEL[c.value]);
  const conditionRows: Array<{ key: 'all' | 'novo' | 'usado'; label: string; count?: number }> = [
    { key: 'all', label: 'Todos' },
    ...(conditions.find((c) => c.value === 'new') || selection.condition === 'novo' ? [{ key: 'novo' as const, label: 'Novo', count: conditions.find((c) => c.value === 'new')?.count ?? 0 }] : []),
    ...(conditions.find((c) => c.value === 'used') || selection.condition === 'usado' ? [{ key: 'usado' as const, label: 'Usado', count: conditions.find((c) => c.value === 'used')?.count ?? 0 }] : []),
  ];
  const brands = facets?.brands ?? [];
  const brandRows = selection.brand && !brands.some((b) => b.value.toLowerCase() === selection.brand!.toLowerCase()) ? [{ value: selection.brand, count: 0 }, ...brands] : brands;
  const attributeFacets = showAttributes ? facets?.attributes ?? [] : [];

  return (
    <div className="space-y-5" data-testid="catalog-facets" aria-busy={isLoading ? 'true' : undefined}>
      {isError && (
        <p role="alert" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-medium text-red-800">
          Não foi possível carregar as opções de filtro.{' '}
          {onRetry && <button type="button" onClick={onRetry} className="font-bold underline cursor-pointer">Tentar novamente</button>}
        </p>
      )}

      <Section title="Condição" testId="facet-condition">
        <div className="space-y-1.5 text-xs text-gray-700">
          {conditionRows.map((c) => (
            <label key={c.key} className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="facet-condition" checked={selection.condition === c.key} onChange={() => onCondition(c.key)} className="text-emerald-600 focus:ring-emerald-500" />
              <span className="flex-1">{c.label}</span>
              {c.count !== undefined && <span className="text-[11px] text-gray-400 tabular-nums">{c.count}</span>}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Preço" testId="facet-price">
        <RangeInputs
          idPrefix="facet-price" label="Preço" min={selection.priceMin} max={selection.priceMax}
          placeholderMin={facets?.price ? fmt(facets.price.min) : 'Mín.'} placeholderMax={facets?.price ? fmt(facets.price.max) : 'Máx.'}
          onCommit={(a, b) => onPrice(readNumber(a), readNumber(b))}
        />
      </Section>

      {brandRows.length > 0 && (
        <Section title="Marca" testId="facet-brand">
          <div className="space-y-1.5 text-xs text-gray-700">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="facet-brand" checked={!selection.brand} onChange={() => onBrand(undefined)} className="text-emerald-600 focus:ring-emerald-500" />
              <span>Todas as marcas</span>
            </label>
            {brandRows.slice(0, MAX_VISIBLE_OPTIONS).map((b) => (
              <label key={b.value} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="facet-brand" checked={selection.brand?.toLowerCase() === b.value.toLowerCase()} onChange={() => onBrand(b.value)} className="text-emerald-600 focus:ring-emerald-500" />
                <span className="flex-1 min-w-0 break-words">{b.value}</span>
                <span className="text-[11px] text-gray-400 tabular-nums">{b.count}</span>
              </label>
            ))}
            {brandRows.length > MAX_VISIBLE_OPTIONS && (
              <details>
                <summary className="cursor-pointer text-emerald-700 font-semibold">Ver todas ({brandRows.length - MAX_VISIBLE_OPTIONS} a mais)</summary>
                <div className="space-y-1.5 pt-1.5">
                  {brandRows.slice(MAX_VISIBLE_OPTIONS).map((b) => (
                    <label key={b.value} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="facet-brand" checked={selection.brand?.toLowerCase() === b.value.toLowerCase()} onChange={() => onBrand(b.value)} className="text-emerald-600 focus:ring-emerald-500" />
                      <span className="flex-1 min-w-0 break-words">{b.value}</span>
                      <span className="text-[11px] text-gray-400 tabular-nums">{b.count}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        </Section>
      )}

      {attributeFacets.map((f) => {
        const title = f.unit && f.type === 'number' ? `${f.name} (${f.unit})` : f.name;
        const value = attrs[f.code];
        return (
          <Section key={f.code} title={title} testId={`facet-attr-${f.code}`}>
            {(f.type === 'select' || f.type === 'multiselect') && (
              <OptionList facet={f} selected={Array.isArray(value) ? value : []} onToggle={(opt) => onAttrs(toggleAttributeOption(attrs, f.code, opt))} />
            )}
            {f.type === 'boolean' && f.bool && (
              <div className="space-y-1.5 text-xs text-gray-700">
                {([
                  { key: 'all', label: 'Todos', checked: typeof value !== 'boolean', next: null as boolean | null, count: undefined as number | undefined },
                  { key: 'yes', label: 'Sim', checked: value === true, next: true, count: f.bool.yes },
                  { key: 'no', label: 'Não', checked: value === false, next: false, count: f.bool.no },
                ]).filter((r) => r.key === 'all' || r.checked || (r.count ?? 0) > 0).map((r) => (
                  <label key={r.key} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name={`facet-bool-${f.code}`} checked={r.checked} onChange={() => onAttrs(r.next === null ? clearAttributeFilter(attrs, f.code) : { ...attrs, [f.code]: r.next })} className="text-emerald-600 focus:ring-emerald-500" />
                    <span className="flex-1">{r.label}</span>
                    {r.count !== undefined && <span className="text-[11px] text-gray-400 tabular-nums">{r.count}</span>}
                  </label>
                ))}
              </div>
            )}
            {f.type === 'number' && f.range && (
              <RangeInputs
                idPrefix={`facet-${f.code}`} label={f.name} unit={f.unit}
                min={value && typeof value === 'object' && !Array.isArray(value) ? value.min : undefined}
                max={value && typeof value === 'object' && !Array.isArray(value) ? value.max : undefined}
                placeholderMin={fmt(f.range.min, f.decimals)} placeholderMax={fmt(f.range.max, f.decimals)}
                onCommit={(a, b) => onAttrs(setAttributeRange(attrs, f.code, a, b))}
              />
            )}
          </Section>
        );
      })}

      {showAttributes && !isLoading && !isError && attributeFacets.length === 0 && facets && (
        <p className="text-[11px] text-gray-400 font-medium">Sem outras características para filtrar nesta lista.</p>
      )}
    </div>
  );
};

export default CatalogFacetsPanel;
