import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applyPageSeo, clearStructuredData } from '../utils/pageSeo';
import { classifyPath, staticSeoFor } from '../utils/seoRoutes';

/**
 * Atualiza título/description/canonical/robots a cada navegação SPA (C3.2). Sem UI.
 * Deve ser montado ANTES do <Routes>: assim o efeito dele roda antes dos efeitos das páginas, e as páginas de recurso
 * (produto/categoria/loja), que chamam usePageSeo com o nome real, sobrescrevem o estado "pendente" definido aqui.
 */
export const SeoManager: React.FC = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const info = classifyPath(pathname);
    const seo = staticSeoFor(info, pathname);
    applyPageSeo({ title: seo.title, description: seo.description, canonicalPath: seo.canonicalPath, robots: seo.robots });
    if (info.kind !== 'home') clearStructuredData();
  }, [pathname]);

  return null;
};
