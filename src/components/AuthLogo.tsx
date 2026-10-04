import React from 'react';
import { MercadoNusaliLogo } from './MercadoNusaliLogo';

/**
 * Logo oficial do Mercado Nusali para as telas de autenticação (fundo azul-escuro): o mesmo asset horizontal do Header,
 * sobre a mesma pílula branca (o texto azul/verde do logo some no fundo escuro sem ela). Altura h-10 no celular e h-12
 * a partir de sm; a largura segue sempre a proporção do arquivo (nunca distorce). Quem usa envolve em <Link to="/">.
 */
export const AuthLogo: React.FC = () => (
  <span className="inline-flex items-center rounded-full bg-white py-0.5 pl-1.5 pr-3 shadow-md">
    <MercadoNusaliLogo variant="horizontal" className="h-10 sm:h-12" />
  </span>
);
