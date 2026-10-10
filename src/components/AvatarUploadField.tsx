import React, { useRef } from 'react';
import { Camera, Loader2, Upload } from 'lucide-react';
import { AVATAR_ALLOWED_TYPES, AVATAR_MAX_BYTES, validateAvatarFile } from '../utils/avatar';
import { UserAvatar } from './UserAvatar';

interface Props {
  /** nome atual (as iniciais da prévia acompanham o que a pessoa digita) */
  name?: string | null;
  /** foto atual (URL do armazenamento ou prévia local) */
  src?: string | null;
  /** chamado só com um arquivo JÁ validado (tipo e tamanho) */
  onFile: (file: File) => void | Promise<void>;
  /** arquivo recusado (formato/tamanho): recebe a mensagem em português */
  onInvalid?: (message: string) => void;
  busy?: boolean;
  error?: string | null;
  tone?: 'light' | 'dark';
  id?: string;
}

/**
 * Único jeito de pôr foto de perfil: "Carregar Foto" (arquivo do computador ou do telemóvel). Sem avatares predefinidos e sem link.
 * Sem foto, a prévia mostra as iniciais do nome.
 */
export const AvatarUploadField: React.FC<Props> = ({ name, src, onFile, onInvalid, busy, error, tone = 'light', id = 'avatar-upload' }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dark = tone === 'dark';

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite escolher o mesmo arquivo de novo depois de um erro
    if (!file) return;
    const problem = validateAvatarFile(file);
    if (problem) { onInvalid?.(problem); return; }
    await onFile(file);
  };

  return (
    <div data-testid="avatar-upload-field" className={`p-4 rounded-2xl space-y-3 ${dark ? 'bg-white/10 border border-white/20' : 'bg-slate-50 border border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className={`text-xs font-bold flex items-center gap-1.5 ${dark ? 'text-yellow-300' : 'text-gray-800'}`}>
          <Camera className="w-4 h-4" aria-hidden="true" /> Foto de Perfil <span className={`font-medium ${dark ? 'text-gray-300' : 'text-gray-500'}`}>(opcional)</span>
        </label>
      </div>
      <div className="flex items-center gap-4">
        <UserAvatar name={name} src={src} className="w-16 h-16 text-xl border-2 border-white/30 shadow-md" />
        <div className="flex-1 space-y-1.5 min-w-0">
          <button
            type="button"
            data-testid="avatar-upload-button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className={`px-3 py-2 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-60 ${dark ? 'bg-white/20 hover:bg-white/30 text-white' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-300'}`}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Upload className="w-3.5 h-3.5" aria-hidden="true" />} Carregar Foto
          </button>
          <input
            ref={inputRef}
            id={id}
            type="file"
            accept={AVATAR_ALLOWED_TYPES.join(',')}
            onChange={handleChange}
            className="sr-only"
            aria-describedby={`${id}-help`}
          />
          <p id={`${id}-help`} className={`text-[11px] ${dark ? 'text-gray-300' : 'text-gray-500'}`}>
            JPG, PNG ou WEBP, até {AVATAR_MAX_BYTES / (1024 * 1024)} MB. Sem foto, mostramos as iniciais do seu nome.
          </p>
          {error && <p role="alert" data-testid="avatar-upload-error" className={`text-[11px] font-bold ${dark ? 'text-red-300' : 'text-red-600'}`}>{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default AvatarUploadField;
