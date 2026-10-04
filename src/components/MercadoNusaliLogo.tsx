import React from 'react';

interface MercadoNusaliLogoProps {
  /**
   * 'full' (padrão): logotipo oficial vertical, arquivo original sem alteração (fundo BRANCO: só em superfícies claras).
   * 'horizontal': variante derivada do oficial para o Header — símbolo + "MERCADO NUSALI" lado a lado, fundo transparente.
   * 'symbol': só o símbolo oficial (sacola + coração + mãos), quadrado, fundo transparente (mesmo arquivo do favicon).
   */
  variant?: 'full' | 'horizontal' | 'symbol';
  /** Altura em px. Se omitida, a altura vem do className (ex.: "h-9 sm:h-10"); a largura segue sempre a proporção (nunca distorce). */
  height?: number;
  className?: string;
}

const ASSETS = {
  full: { src: '/mercado-nusali-logo.png', width: 1436, height: 1096 },
  horizontal: { src: '/mercado-nusali-logo-horizontal.png', width: 655, height: 132 },
  symbol: { src: '/mercado-nusali-favicon.png', width: 256, height: 256 },
} as const;

/** Logotipo oficial do marketplace Mercado Nusali (ver public/mercado-nusali-logo*.png). */
export const MercadoNusaliLogo: React.FC<MercadoNusaliLogoProps> = ({ variant = 'full', height, className = '' }) => {
  const asset = ASSETS[variant];
  return (
    <img
      src={asset.src}
      alt="Mercado Nusali"
      width={asset.width}
      height={asset.height}
      style={{ ...(height ? { height: `${height}px` } : {}), width: 'auto', maxWidth: '100%' }}
      className={`block object-contain select-none ${className}`}
      draggable={false}
    />
  );
};
