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

/**
 * Variantes só com um eixo em attributes_json (ex.: Voltagem), sem tamanho nem capacidade: esse eixo é a 2ª dimensão do assistente.
 * Sem eixos conhecidos (ainda carregando) infere pelo primeiro valor que não é cor/tamanho/capacidade.
 */
export function inferSecondJson(variants: V[] | undefined | null, axes?: AttributeDefinitionLike[]): string | undefined {
  const list = (Array.isArray(variants) ? variants : []).filter((v) => v && v.isActive !== false);
  if (list.some((v) => (v.size && String(v.size).trim() !== '') || (v.capacity && String(v.capacity).trim() !== ''))) return undefined;
  const fromAxes = axes ? planAxisUi(axes).secondJson : undefined;
  if (fromAxes) return fromAxes;
  if (axes && planAxisUi(axes).secondAxis) return undefined;
  for (const v of list) {
    const json = v.attributesJson && typeof v.attributesJson === 'object' ? v.attributesJson : {};
    for (const [k, raw] of Object.entries(json)) {
      if ('column' in axisTarget(k)) continue;
      if (raw !== undefined && raw !== null && typeof raw !== 'object' && String(raw).trim() !== '') return k;
    }
  }
  return undefined;
}

/** Variantes carregadas -> estado da UI: capacidade-sem-tamanho (ou o eixo de attributes_json que é a 2ª dimensão) aparece na coluna da 2ª dimensão. */
export function uiVariantsFromLoaded<T extends V>(variants: T[], secondJson?: string): T[] {
  return variants.map((v) => {
    if (v.size) return v;
    if (v.capacity) return { ...v, size: v.capacity };
    const raw = secondJson && v.attributesJson && typeof v.attributesJson === 'object' ? (v.attributesJson as V)[secondJson] : undefined;
    return raw !== undefined && raw !== null && String(raw).trim() !== '' ? { ...v, size: String(raw) } : v;
  });
}

export function effectiveSecondColumn(axes: AttributeDefinitionLike[], loadedVariants: V[] | undefined | null): 'size' | 'capacity' {
  const ui = planAxisUi(axes);
  return ui.secondAxis ? ui.secondColumn : inferSecondColumn(loadedVariants);
}

/** Eixo (attributes_json) que a 2ª dimensão grava: o da categoria ou, sem eixos carregados, o inferido das variantes. */
export function effectiveSecondJson(axes: AttributeDefinitionLike[], loadedVariants: V[] | undefined | null): string | undefined {
  return planAxisUi(axes).secondJson ?? inferSecondJson(loadedVariants, axes.length > 0 ? axes : undefined);
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
  opts: { secondColumn: 'size' | 'capacity'; secondJson?: string; extraAxes: AttributeDefinitionLike[]; extraValues: Record<string, string> },
): T[] {
  return matrix.map((v) => {
    let out: V = { ...v };
    if (opts.secondJson) {
      // 2ª dimensão = eixo em attributes_json (ex.: Voltagem): o valor da coluna de UI vai para o mapa e a coluna "tamanho" fica vazia
      const second = out.size ?? out.capacity;
      const base = out.attributesJson && typeof out.attributesJson === 'object' ? { ...out.attributesJson } : {};
      if (second !== undefined && second !== null && String(second).trim() !== '') base[opts.secondJson] = String(second).trim();
      out = { ...out, size: undefined, capacity: undefined, attributesJson: Object.keys(base).length ? base : out.attributesJson };
    } else if (opts.secondColumn === 'capacity') {
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

/**
 * P2 — eixos OBRIGATÓRIOS da categoria que um produto SIMPLES não consegue informar (o valor mora na variação). Produto com uma única
 * opção usa "Produto com variações" com uma variação só. Devolve os nomes (para a mensagem); vazio = simples liberado.
 */
export function requiredAxesBlockingSimple(axes: AttributeDefinitionLike[]): string[] {
  return (Array.isArray(axes) ? axes : []).filter((a) => a && a.isRequired && a.isActive !== false).map((a) => a.name);
}

export function simpleModeAxesMessage(names: string[]): string {
  return `Esta categoria exige ${names.join(', ')}. Escolha "Produto com variações" e cadastre ao menos uma opção — pode ser uma só (ex.: uma única cor ou capacidade).`;
}
