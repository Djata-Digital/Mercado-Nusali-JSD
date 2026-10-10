import React from 'react';
import type { ProductSpecSheet, SpecSheetItem } from '../types';
import { humanizeAttributeKey } from '../utils/attributeFormat';

interface Props {
  specSheet?: ProductSpecSheet;
  /** Formato legado { chave: texto }: só usado quando o backend ainda não enviou a ficha (cache antigo / dado de demonstração). */
  legacySpecs?: Record<string, string>;
  /** Opções do produto e escolha atual de variação (Cor, Capacidade, Voltagem… com o nome real do eixo), já com rótulos legíveis. */
  variantRows?: Array<[string, string]>;
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-200/60 last:border-none gap-2" title={title}>
      <span className="font-semibold text-gray-600">{label}</span>
      <span className="text-gray-900 text-right font-medium min-w-0 break-words [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      {title && <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{title}</h4>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0 bg-gray-50 px-4 py-2 rounded-lg border border-gray-100 text-xs">{children}</div>
    </section>
  );
}

function originTitle(item: SpecSheetItem): string | undefined {
  const s = item.source;
  if (!s || !s.categoryName) return undefined;
  if (s.overridden && s.replacesCategoryName) return `Definido em ${s.categoryName} (substitui a definição de ${s.replacesCategoryName})`;
  return s.inherited ? `Herdado de ${s.categoryName}` : `Definido em ${s.categoryName}`;
}

/** Ficha técnica pública: informações gerais, especificações agrupadas e outras informações. Nunca mostra códigos internos. */
export default function ProductSpecSheetView({ specSheet, legacySpecs, variantRows = [] }: Props) {
  const variantBlock = variantRows.length > 0 && (
    <Block title="Opções do produto">
      {variantRows.map(([k, v]) => <Row key={k} label={k} value={v} />)}
    </Block>
  );

  if (specSheet) {
    const general = specSheet.general.filter((g) => g.placement === 'general');
    const hasAny = general.length > 0 || specSheet.groups.length > 0 || specSheet.other.length > 0 || variantRows.length > 0;
    if (!hasAny) return null;
    return (
      <div className="pt-4 space-y-4" data-testid="product-spec-sheet">
        {general.length > 0 && (
          <Block title="Informações gerais">
            {general.map((g) => <Row key={g.key} label={g.label} value={g.displayValue} />)}
          </Block>
        )}
        {specSheet.groups.map((group) => (
          <Block key={group.name} title={group.name}>
            {group.items.map((item) => <Row key={item.code ?? item.label} label={item.label} value={item.displayValue} title={originTitle(item)} />)}
          </Block>
        ))}
        {specSheet.other.length > 0 && (
          <Block title="Outras informações">
            {specSheet.other.map((item) => <Row key={item.label} label={item.label} value={item.displayValue} />)}
          </Block>
        )}
        {variantBlock}
      </div>
    );
  }

  const legacy = Object.entries(legacySpecs || {}).filter(([k, v]) => v !== '' && v != null && k.trim().toLowerCase() !== 'armazém');
  if (legacy.length === 0 && variantRows.length === 0) return null;
  return (
    <div className="pt-4 space-y-4" data-testid="product-spec-sheet-legacy">
      {legacy.length > 0 && (
        <Block>
          {legacy.map(([k, v]) => <Row key={k} label={humanizeAttributeKey(k)} value={String(v)} />)}
        </Block>
      )}
      {variantBlock}
    </div>
  );
}
