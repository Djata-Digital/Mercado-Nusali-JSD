/**
 * Foto escolhida NO CADASTRO. O envio de arquivos exige sessão e a conta só abre sessão depois de verificar o e-mail; por isso a foto
 * escolhida fica guardada (reduzida) só nesta aba e é enviada, pelo mesmo mecanismo de upload do perfil, assim que a verificação do
 * e-mail conclui. Qualquer falha deixa a pessoa com as iniciais — a foto sempre pode ser carregada depois, no perfil.
 */
import { validateAvatarFile } from '../utils/avatar';

export const SIGNUP_AVATAR_KEY = 'nusali_signup_avatar';
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SIDE = 640;

export interface SignupAvatarDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  /** reduz a foto para caber no armazenamento da aba (browser); devolve um data URL */
  shrink: (file: File) => Promise<string>;
  /** data URL -> arquivo para o upload */
  toFile: (dataUrl: string) => Promise<File>;
  /** upload da pasta "profiles" (uploadService.uploadProfile) */
  upload: (file: File) => Promise<{ url: string }>;
  /** grava a URL no perfil (PUT /buyer/profile) */
  save: (url: string) => Promise<void>;
  now?: () => number;
}

const normEmail = (e: string) => String(e || '').trim().toLowerCase();

/** Guarda a foto escolhida no cadastro. Devolve uma mensagem de erro (foto recusada) ou null. */
export async function stashSignupAvatar(file: File, email: string, deps: Pick<SignupAvatarDeps, 'storage' | 'shrink' | 'now'>): Promise<string | null> {
  const problem = validateAvatarFile(file);
  if (problem) return problem;
  try {
    const dataUrl = await deps.shrink(file);
    deps.storage.setItem(SIGNUP_AVATAR_KEY, JSON.stringify({ email: normEmail(email), dataUrl, savedAt: (deps.now ?? Date.now)() }));
    return null;
  } catch {
    return 'Não foi possível preparar a foto. Você poderá carregá-la depois, no seu perfil.';
  }
}

export async function discardSignupAvatar(storage: SignupAvatarDeps['storage']): Promise<void> {
  try { storage.removeItem(SIGNUP_AVATAR_KEY); } catch { /* */ }
}

/**
 * Envia a foto guardada se (e só se) ela foi escolhida para ESTE e-mail. Sempre limpa o que estava guardado.
 * 'none' = nada guardado/outro e-mail/expirado; 'uploaded' = foto enviada e salva; 'failed' = falhou (a pessoa fica com as iniciais).
 */
export async function flushSignupAvatar(verifiedEmail: string, deps: Omit<SignupAvatarDeps, 'shrink'>): Promise<{ status: 'none' | 'uploaded' | 'failed'; url?: string }> {
  let raw: string | null = null;
  try { raw = deps.storage.getItem(SIGNUP_AVATAR_KEY); } catch { raw = null; }
  if (!raw) return { status: 'none' };
  try { deps.storage.removeItem(SIGNUP_AVATAR_KEY); } catch { /* */ }
  let data: { email?: string; dataUrl?: string; savedAt?: number } | null = null;
  try { data = JSON.parse(raw); } catch { return { status: 'none' }; }
  const fresh = typeof data?.savedAt === 'number' && (deps.now ?? Date.now)() - data.savedAt <= TTL_MS;
  if (!data || !fresh || normEmail(data.email || '') !== normEmail(verifiedEmail) || typeof data.dataUrl !== 'string') return { status: 'none' };
  try {
    const file = await deps.toFile(data.dataUrl);
    const problem = validateAvatarFile(file);
    if (problem) return { status: 'failed' };
    const uploaded = await deps.upload(file);
    await deps.save(uploaded.url);
    return { status: 'uploaded', url: uploaded.url };
  } catch {
    return { status: 'failed' };
  }
}

// ---------------------------------------------------------------- implementação para o navegador

/** Reduz para no máx. 640 px (JPEG) e devolve data URL; sem suporte a canvas, só aceita arquivo pequeno. */
export async function shrinkImageInBrowser(file: File): Promise<string> {
  const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('read failed'));
    r.readAsDataURL(blob);
  });
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('no blob');
    return await readAsDataUrl(blob);
  } catch {
    if (file.size <= 1.5 * 1024 * 1024) return readAsDataUrl(file);
    throw new Error('image too large to keep');
  }
}

export async function dataUrlToFile(dataUrl: string): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `avatar.${ext}`, { type: blob.type });
}
