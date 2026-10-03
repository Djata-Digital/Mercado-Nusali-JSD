import React from 'react';

interface MercadoNusaliLogoProps {
  /** Altura em px da imagem inteira (a largura segue a proporção original 1436×1096; nunca distorce). */
  height?: number;
  className?: string;
}

/**
 * Logotipo OFICIAL do marketplace Mercado Nusali (public/mercado-nusali-logo.png, arquivo original sem alteração).
 * A imagem tem fundo BRANCO: use somente sobre superfícies brancas/claras. Sobre fundos escuros aparece um retângulo branco.
 */
export const MercadoNusaliLogo: React.FC<MercadoNusaliLogoProps> = ({ height = 128, className = '' }) => (
  <img
    src="/mercado-nusali-logo.png"
    alt="Mercado Nusali"
    width={1436}
    height={1096}
    style={{ height: `${height}px`, width: 'auto', maxWidth: '100%' }}
    className={`block object-contain select-none ${className}`}
    draggable={false}
  />
);
