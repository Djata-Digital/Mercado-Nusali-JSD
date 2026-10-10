import React, { useEffect, useState } from 'react';
import { User as UserIcon } from 'lucide-react';
import { avatarColorClass, getInitials, resolveAvatarUrl } from '../utils/avatar';

interface UserAvatarProps {
  /** Nome da pessoa: as iniciais acompanham o nome (mudou o nome, mudam as iniciais). */
  name?: string | null;
  /** Foto carregada (URL do armazenamento ou prévia local). Qualquer outra coisa — avatar predefinido antigo, link — vira iniciais. */
  src?: string | null;
  /** Tamanho e tipografia (Tailwind), ex.: "w-10 h-10 text-sm". */
  className?: string;
  /** Formato; o padrão é circular. */
  shape?: 'circle' | 'rounded';
  title?: string;
}

/**
 * Avatar ÚNICO do Mercado Nusali: foto real carregada pela pessoa ou, sem foto (ou se a imagem não carregar), um círculo com as iniciais
 * do nome (João Djata → JD, Maria → M). Sem nome nenhum, mostra o ícone neutro de pessoa.
 */
export const UserAvatar: React.FC<UserAvatarProps> = ({ name, src, className = 'w-10 h-10 text-sm', shape = 'circle', title }) => {
  const photo = resolveAvatarUrl(src);
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  const initials = getInitials(name);
  const radius = shape === 'circle' ? 'rounded-full' : 'rounded-xl';
  const label = name?.trim() ? `Foto de perfil de ${name.trim()}` : 'Foto de perfil';

  if (photo && !broken) {
    return (
      <img
        src={photo}
        alt={label}
        title={title}
        data-testid="user-avatar-photo"
        onError={() => setBroken(true)}
        className={`${className} ${radius} object-cover shrink-0 bg-gray-100`}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={initials ? `Iniciais de ${name!.trim()}: ${initials}` : 'Sem foto de perfil'}
      title={title ?? (name?.trim() || undefined)}
      data-testid="user-avatar-initials"
      className={`${className} ${radius} ${initials ? avatarColorClass(name) : 'bg-gray-400'} text-white font-extrabold inline-flex items-center justify-center shrink-0 select-none leading-none`}
    >
      {initials || <UserIcon className="w-1/2 h-1/2" aria-hidden="true" />}
    </span>
  );
};

export default UserAvatar;
