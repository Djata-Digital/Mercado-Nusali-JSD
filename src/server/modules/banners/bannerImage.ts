/**
 * Validação de imagens de banner SEM dependências: o tipo real vem dos magic bytes (nunca do
 * mimetype/extensão/nome enviados pelo cliente) e as dimensões vêm dos próprios headers do arquivo.
 * Aceita somente PNG, JPEG e WebP. SVG, AVIF, GIF, HTML etc. nunca passam (não têm assinatura aceita).
 */

export type BannerImageKind = 'desktop' | 'mobile';
export type BannerImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface InspectedImage {
  mime: BannerImageMime;
  ext: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

/**
 * Política de imagens. O "recomendado" é o tamanho ideal (mostrado no painel); os limites
 * mínimo/máximo abaixo são o que o servidor realmente exige, para não obrigar dimensões exatas.
 */
export const BANNER_IMAGE_POLICY: Record<BannerImageKind, {
  recommended: { width: number; height: number };
  minWidth: number; maxWidth: number; minHeight: number; maxHeight: number;
  maxBytes: number;
}> = {
  desktop: { recommended: { width: 1920, height: 600 }, minWidth: 1200, maxWidth: 3840, minHeight: 300, maxHeight: 1200, maxBytes: 1_572_864 }, // 1,5 MB
  mobile: { recommended: { width: 750, height: 900 }, minWidth: 480, maxWidth: 1500, minHeight: 480, maxHeight: 1800, maxBytes: 1_048_576 }, // 1 MB
};

/** Maior arquivo que o multer aceita ler para a rota de banners (o limite por tipo é conferido depois). */
export const BANNER_UPLOAD_HARD_LIMIT_BYTES = BANNER_IMAGE_POLICY.desktop.maxBytes;

export class BannerImageError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
    this.name = 'BannerImageError';
  }
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const startsWith = (buf: Buffer, sig: number[], offset = 0) => sig.every((b, i) => buf[offset + i] === b);
const ascii = (buf: Buffer, start: number, end: number) => buf.toString('latin1', start, end);

function parsePng(buf: Buffer): InspectedImage | null {
  // 8 (assinatura) + 4 (tamanho) + 4 ("IHDR") + 4 (largura) + 4 (altura)
  if (buf.length < 24) return null;
  if (buf.readUInt32BE(8) !== 13 || ascii(buf, 12, 16) !== 'IHDR') return null;
  return { mime: 'image/png', ext: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function parseJpeg(buf: Buffer): InspectedImage | null {
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1];
    // bytes de preenchimento 0xFF
    while (marker === 0xff && i + 2 < buf.length) { i++; marker = buf[i + 1]; }
    i += 2;
    // marcadores sem payload
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9 || marker === 0xda) return null; // fim da imagem / início dos dados sem ter achado SOF
    if (i + 1 >= buf.length) return null;
    const segLen = buf.readUInt16BE(i);
    if (segLen < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (i + 7 > buf.length) return null;
      return { mime: 'image/jpeg', ext: 'jpg', height: buf.readUInt16BE(i + 3), width: buf.readUInt16BE(i + 5) };
    }
    i += segLen;
  }
  return null;
}

function parseWebp(buf: Buffer): InspectedImage | null {
  if (buf.length < 30) return null;
  const chunk = ascii(buf, 12, 16);
  let width: number; let height: number;
  if (chunk === 'VP8 ') {
    // quadro de vídeo VP8: start code 9D 01 2A, depois 14 bits de largura e de altura
    if (buf[23] !== 0x9d || buf[24] !== 0x01 || buf[25] !== 0x2a) return null;
    width = buf.readUInt16LE(26) & 0x3fff; height = buf.readUInt16LE(28) & 0x3fff;
  } else if (chunk === 'VP8L') {
    if (buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    width = (bits & 0x3fff) + 1; height = ((bits >> 14) & 0x3fff) + 1;
  } else if (chunk === 'VP8X') {
    if (buf[20] & 0x02) return null; // WebP animado não é aceito em banner
    width = (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1;
    height = (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1;
  } else {
    return null;
  }
  return { mime: 'image/webp', ext: 'webp', width, height };
}

/** Identifica PNG/JPEG/WebP pelos bytes reais e lê as dimensões. Retorna null para qualquer outra coisa/arquivo corrompido. */
export function inspectImage(buf: Buffer): InspectedImage | null {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  let info: InspectedImage | null = null;
  if (startsWith(buf, PNG_SIG)) info = parsePng(buf);
  else if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) info = parseJpeg(buf);
  else if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 12) === 'WEBP') info = parseWebp(buf);
  if (!info || !Number.isInteger(info.width) || !Number.isInteger(info.height) || info.width <= 0 || info.height <= 0) return null;
  return info;
}

/**
 * Valida o arquivo contra a política do tipo (desktop/mobile). Ignora por completo o mimetype e o
 * nome informados pelo cliente: o tipo/extensão resultantes vêm dos bytes.
 */
export function validateBannerImage(buf: Buffer, kind: BannerImageKind): InspectedImage {
  const policy = BANNER_IMAGE_POLICY[kind];
  if (!buf || buf.length === 0) throw new BannerImageError('FILE_EMPTY', 'O arquivo está vazio.');
  if (buf.length > policy.maxBytes) {
    throw new BannerImageError('FILE_TOO_LARGE', `A imagem ${kind === 'desktop' ? 'desktop' : 'mobile'} excede ${(policy.maxBytes / 1_048_576).toFixed(policy.maxBytes % 1_048_576 ? 1 : 0).replace('.', ',')} MB.`, 413);
  }
  const info = inspectImage(buf);
  if (!info) throw new BannerImageError('INVALID_IMAGE', 'Arquivo inválido: envie uma imagem PNG, JPEG ou WebP real.', 415);
  if (info.width < policy.minWidth || info.width > policy.maxWidth || info.height < policy.minHeight || info.height > policy.maxHeight) {
    throw new BannerImageError(
      'INVALID_DIMENSIONS',
      `Dimensões ${info.width}×${info.height} fora do permitido para ${kind === 'desktop' ? 'desktop' : 'mobile'} (${policy.minWidth}–${policy.maxWidth} × ${policy.minHeight}–${policy.maxHeight} px; recomendado ${policy.recommended.width}×${policy.recommended.height}).`,
      422,
    );
  }
  return info;
}

/** Chave da imagem gerada pelo servidor: banners/AAAA/MM/UUID.ext (nunca usa nome enviado pelo cliente). */
export const BANNER_OBJECT_KEY_PATTERN = /^banners\/\d{4}\/(?:0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|webp)$/;

export function buildBannerObjectKey(ext: InspectedImage['ext'], uuid: string, now = new Date()): string {
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `banners/${yyyy}/${mm}/${uuid}.${ext}`;
}
