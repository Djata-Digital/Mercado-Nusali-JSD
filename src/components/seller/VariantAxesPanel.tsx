import React from 'react';
import { Layers } from 'lucide-react';
import { planAxisUi } from '../../utils/variantAxes';
import type { AttributeDefinitionLike } from '../../utils/attributeValidator';

interface Props {
  axes: AttributeDefinitionLike[];
  /** Nomes de cor já adicionadas / valores da 2ª dimensão já adicionados (para marcar os chips). */
  selectedColors: string[];
  selectedSeconds: string[];
  onToggleColor: (name: string) => void;
  onToggleSecond: (value: string) => void;
  /** Eixos "sobrando": um valor por anúncio, aplicado a todas as variações. */
  extraValues: Record<string, string>;
  onExtraChange: (code: string, value: string) => void;
  /** Mensagens (do cliente ou do servidor) sobre as variações. */
  problems: string[];
}

const optionsOf = (a: AttributeDefinitionLike): string[] => (Array.isArray(a.optionsJson) ? (a.optionsJson as unknown[]).map(String) : []);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Resumo dos eixos de variação da categoria, com atalhos pelas opções definidas pelo administrador. Não substitui o assistente: ajuda. */
export const VariantAxesPanel: React.FC<Props> = ({ axes, selectedColors, selectedSeconds, onToggleColor, onToggleSecond, extraValues, onExtraChange, problems }) => {
  if (axes.length === 0 && problems.length === 0) return null;
  const ui = planAxisUi(axes);
  const where = (a: AttributeDefinitionLike) => (a === ui.colorAxis ? 'em "1. Cores Disponíveis"' : a === ui.secondAxis ? 'em "2. Tamanhos / Capacidades"' : 'abaixo, uma vez para o anúncio inteiro');

  const chips = (axis: AttributeDefinitionLike, selected: string[], onToggle: (v: string) => void) => (
    <div className="flex flex-wrap gap-2 pt-1">
      {optionsOf(axis).map((o) => {
        const on = selected.some((s) => same(s, o));
        return (
          <button key={o} type="button" aria-pressed={on} onClick={() => onToggle(o)}
            className={`px-3 py-2 text-xs rounded-lg border font-bold transition cursor-pointer ${on ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-700 border-gray-300 hover:border-purple-400'}`}>
            {o}
          </button>
        );
      })}
    </div>
  );

  return (
    <section data-testid="variant-axes-panel" aria-label="Eixos de variação da categoria" className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-3 text-xs">
      <div className="flex items-start gap-2">
        <Layers className="w-4 h-4 text-purple-700 mt-0.5 shrink-0" />
        <div>
          <h4 className="font-black text-sm text-gray-900">Variações desta categoria</h4>
          <p className="text-gray-600 font-medium">A categoria define como o produto varia. Cada combinação (cor, tamanho…) só pode existir uma vez, com SKU, preço e estoque próprios.</p>
        </div>
      </div>

      {axes.map((axis) => {
        const isExtra = axis !== ui.colorAxis && axis !== ui.secondAxis;
        const options = optionsOf(axis);
        return (
          <div key={axis.id || axis.code} className="space-y-1">
            <div className="font-extrabold text-gray-900">
              {axis.name}
              {axis.isRequired ? <span className="text-red-500 ml-0.5" aria-hidden="true">*</span> : <span className="text-gray-400 font-medium ml-1">(opcional)</span>}
              {axis.isRequired && <span className="sr-only"> (obrigatório em todas as variações)</span>}
              <span className="text-gray-500 font-medium ml-2">— definido {where(axis)}</span>
            </div>
            {axis === ui.colorAxis && options.length > 0 && chips(axis, selectedColors, onToggleColor)}
            {axis === ui.secondAxis && options.length > 0 && chips(axis, selectedSeconds, onToggleSecond)}
            {isExtra && (
              options.length > 0 ? (
                <select id={`axis-extra-${axis.code}`} value={extraValues[axis.code] ?? ''} onChange={(e) => onExtraChange(axis.code, e.target.value)}
                  className="w-full sm:w-72 p-2.5 border border-gray-300 rounded-xl bg-white text-sm font-bold">
                  <option value="">Selecione {axis.name}...</option>
                  {options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input id={`axis-extra-${axis.code}`} type="text" value={extraValues[axis.code] ?? ''} onChange={(e) => onExtraChange(axis.code, e.target.value)}
                  placeholder={`Valor de ${axis.name}`} className="w-full sm:w-72 p-2.5 border border-gray-300 rounded-xl bg-white text-sm font-medium" />
              )
            )}
          </div>
        );
      })}

      {problems.length > 0 && (
        <ul role="alert" className="space-y-1 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 font-bold list-disc pl-6">
          {problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
    </section>
  );
};

export default VariantAxesPanel;
