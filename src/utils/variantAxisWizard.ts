/**
 * ATRIBUTOS FASE 7 — ponte PURA entre a matriz de variações do assistente (Cor × Tamanho/Capacidade) e os eixos da categoria.
 *
 * O assistente continua com a UI simples de duas dimensões (Cores × Tamanhos/Capacidades). Os eixos da categoria decidem:
 *   - a 2ª dimensão grava em `size` (eixo Tamanho ou sem eixo) ou em `capacity` (eixo Capacidade sem Tamanho);
 *   - eixos que sobram (ex.: Voltagem, ou Capacidade quando já há Tamanho) viram UM valor por anúncio, aplicado a todas as variações;
 *   - a validação usa as MESMAS regras do servidor (validateVariantAxes): obrigatório, opções, combinação única.
 */
import type { AttributeDefinitionLike } from './attributeValidator';
import { axisTarget, planAxisUi, validateVariantAxes, type VariantAxisError } from './variantAxes';

type V = Record<string, any>;

/** Carregou variantes que só têm capacidade (sem tamanho)? Então a 2ª dimensão do assistente é a capacidade. */
export function inferSecondColumn(variants: V[] | undefined | null): 'size' | 'capacity' {
  const list = Array.isArray(variants) ? variants : [];
  const anySize = list.some((v) => v.size && String(v.size).trim() !== '');
  const anyCapacity = list.some((v) => v.capacity && String(v.capacity).trim() !== '');
  return anyCapacity && !anySize ? 'capacity' : 'size';
}

/** Variantes carregadas -> estado da UI: capacidade-sem-tamanho aparece na coluna de "Tamanhos / Capacidades". */
export function uiVariantsFromLoaded<T extends V>(variants: T[]): T[] {
  return variants.map((v) => (!v.size && v.capacity ? { ...v, size: v.capacity } : v));
}

export function effectiveSecondColumn(axes: AttributeDefinitionLike[], loadedVariants: V[] | undefined | null): 'size' | 'capacity' {
  const ui = planAxisUi(axes);
  return ui.secondAxis ? ui.secondColumn : inferSecondColumn(loadedVariants);
}

/** Valor atual (por anúncio) de cada eixo "sobrando", a partir de variantes carregadas. */
export function extraAxisValuesFromVariants(extraAxes: AttributeDefinitionLike[], variants: V[] | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  const first = (Array.isArray(variants) ? variants : []).find((v) => v && v.isActive !== false) ?? (variants ?? [])[0];
  if (!first) return out;
  for (const axis of extraAxes) {
    const t = axisTarget(axis.code);
    const raw = 'column' in t ? first[t.column] : first.attributesJson?.[t.json];
    if (raw !== undefined && raw !== null && String(raw).trim() !== '') out[axis.code] = String(raw);
  }
  return out;
}

/** Matriz da UI -> variantes do payload: 2ª dimensão na coluna certa e valores dos eixos extras aplicados a todas. */
export function buildAxisPayload<T extends V>(
  matrix: T[],
  opts: { secondColumn: 'size' | 'capacity'; extraAxes: AttributeDefinitionLike[]; extraValues: Record<string, string> },
): T[] {
  return matrix.map((v) => {
    let out: V = { ...v };
    if (opts.secondColumn === 'capacity') {
      const second = out.size ?? out.capacity;
      out = { ...out, capacity: second ?? undefined, size: undefined };
    }
    for (const axis of opts.extraAxes) {
      const val = (opts.extraValues[axis.code] ?? '').trim();
      if (!val) continue;
      const t = axisTarget(axis.code);
      if ('column' in t) out[t.column] = val;
      else out.attributesJson = { ...(out.attributesJson && typeof out.attributesJson === 'object' ? out.attributesJson : {}), [t.json]: val };
    }
    return out as T;
  });
}

/** Erros que o servidor também daria (obrigatório, opção fora da lista, combinação repetida), antes de enviar. */
export function validatePayloadAgainstAxes(axes: AttributeDefinitionLike[], payloadVariants: V[]): VariantAxisError[] {
  return validateVariantAxes(axes, payloadVariants).errors;
}
