/**
 * FASE D16-E5.1 — identidade HUMANA e genérica de uma variante, para as
 * tabelas de estoque (loja e HUB). Nunca lê products.attributesJson (fonte
 * errada corrigida no D16-E5) — só os campos estruturados de product_variants
 * (color/size/capacity) e o attributesJson DA VARIANTE, que é um mapa
 * livre chave/valor (ex.: { "RAM": "12 GB" }), nunca um schema novo.
 *
 * Puro — nunca acessa rede/DOM — para poder ser testado sem servidor.
 */
export interface VariantIdentityInput {
  color?: string | null;
  size?: string | null;
  capacity?: string | null;
  attributesJson?: Record<string, any> | null;
}

/**
 * Ex.: { color: 'Preta', size: 'M' } => "Preta • M"
 * Ex.: { color: 'Preto', attributesJson: { RAM: '12 GB' } } => "Preto • 12 GB RAM"
 * Nunca retorna JSON cru, IDs técnicos, "undefined"/"null" ou "[object Object]".
 */
export function formatVariantIdentity(input: VariantIdentityInput | null | undefined): string {
  if (!input) return '';
  const parts: string[] = [];
  const usedValues = new Set<string>();

  const pushStructured = (value?: string | null) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (!text) return;
    parts.push(text);
    usedValues.add(text.toLowerCase());
  };

  pushStructured(input.color);
  pushStructured(input.size);
  pushStructured(input.capacity);

  const attrs = input.attributesJson;
  if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
    for (const [key, rawValue] of Object.entries(attrs)) {
      if (rawValue === null || rawValue === undefined) continue;
      if (typeof rawValue === 'object') continue; // nunca "[object Object]"
      const value = String(rawValue).trim();
      if (!value) continue;
      // Já representado por color/size/capacity (ou por outro atributo) —
      // não duplica o mesmo valor humano duas vezes.
      if (usedValues.has(value.toLowerCase())) continue;
      const label = String(key).trim();
      parts.push(label ? `${value} ${label}` : value);
      usedValues.add(value.toLowerCase());
    }
  }

  return parts.join(' • ');
}
