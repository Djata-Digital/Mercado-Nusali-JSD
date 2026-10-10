/**
 * Fotografia de perfil — regras PURAS (sem rede, sem DOM), usadas pela tela e pelo servidor.
 *
 * Só existe UMA fonte de foto: o arquivo que a pessoa carrega do dispositivo (pasta "profiles" do armazenamento). Sem avatares
 * predefinidos e sem foto por link. Quem não tem foto mostra as iniciais do nome.
 */

export const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Mesmo limite do servidor para a pasta "profiles" (uploadRoutes). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Iniciais do nome: primeira letra do primeiro nome + primeira letra do último sobrenome. Um só nome => uma letra.
 *   "João Djata" => "JD" · "Djata Digital" => "DD" · "Maria" => "M" · "Maria da Silva" => "MS" · "" => ""
 */
export function getInitials(name: string | null | undefined): string {
  const tokens = String(name ?? '')
    .trim()
    .split(/\s+/)
    .map((t) => Array.from(t).find((ch) => /[\p{L}\p{N}]/u.test(ch)) ?? '')
    .filter(Boolean);
  if (tokens.length === 0) return '';
  const first = tokens[0];
  const last = tokens.length > 1 ? tokens[tokens.length - 1] : '';
  return (first + last).toLocaleUpperCase('pt-PT');
}

/** Mensagem de erro (em português) se o arquivo não serve como foto de perfil; null = serve. Mesmas regras do servidor. */
export function validateAvatarFile(file: { type?: string; size?: number } | null | undefined): string | null {
  if (!file) return 'Selecione uma imagem.';
  if (!(AVATAR_ALLOWED_TYPES as readonly string[]).includes(String(file.type || '').toLowerCase())) {
    return 'Formato não aceito. Use uma foto JPG, PNG ou WEBP.';
  }
  if (!file.size || file.size <= 0) return 'O arquivo está vazio.';
  if (file.size > AVATAR_MAX_BYTES) return `A foto é grande demais (máximo ${AVATAR_MAX_BYTES / (1024 * 1024)} MB).`;
  return null;
}

/**
 * Tipo REAL da imagem pelos primeiros bytes (assinatura do arquivo), independente do que o navegador declarou.
 * JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A · WEBP: "RIFF"....."WEBP".
 */
export function sniffImageMime(bytes: Uint8Array | ArrayLike<number> | null | undefined): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (!bytes || bytes.length < 12) return null;
  const b = (i: number) => bytes[i];
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return 'image/png';
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 && b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return 'image/webp';
  return null;
}

/**
 * A URL é de uma FOTO CARREGADA pela pessoa? (objeto na pasta "profiles" do armazenamento, ou uma prévia local data:/blob: da
 * foto recém-escolhida). Qualquer outra coisa — os avatares predefinidos antigos (Unsplash) e links colados — NÃO é foto de perfil.
 */
export function isUploadedAvatarUrl(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  const u = url.trim();
  if (!u) return false;
  if (/^data:image\/(jpeg|png|webp);base64,/i.test(u) || u.startsWith('blob:')) return true;
  try {
    const parsed = new URL(u);
    return /^https?:$/.test(parsed.protocol) && /(^|\/)profiles\/[^/]+\//.test(parsed.pathname.replace(/^\//, ''));
  } catch {
    return false;
  }
}

/** A foto a mostrar, ou null (=> iniciais). Avatar artificial antigo guardado no banco deixa de aparecer, sem ser apagado. */
export function resolveAvatarUrl(url: unknown): string | null {
  return isUploadedAvatarUrl(url) ? String(url).trim() : null;
}

/** Cor de fundo estável por nome (as mesmas iniciais sempre com a mesma cor). Classes Tailwind completas (não montadas por texto). */
const PALETTE = ['bg-blue-900', 'bg-emerald-700', 'bg-indigo-800', 'bg-teal-700', 'bg-purple-800', 'bg-rose-800', 'bg-amber-700', 'bg-slate-700'];
export function avatarColorClass(name: string | null | undefined): string {
  const s = String(name ?? '').trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
