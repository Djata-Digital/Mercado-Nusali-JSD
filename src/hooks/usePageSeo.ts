import { useEffect } from 'react';
import { applyPageSeo, type PageSeoInput } from '../utils/pageSeo';

/**
 * Páginas de recurso (produto, categoria, loja) chamam este hook quando já têm o nome real; passar `null` enquanto carrega
 * mantém o estado "pendente" definido pelo SeoManager. Efeito só quando o conteúdo muda.
 */
export function usePageSeo(seo: PageSeoInput | null): void {
  const key = seo ? JSON.stringify([seo.title, seo.description ?? '', seo.canonicalPath ?? null, seo.robots ?? '', seo.image ?? '']) : '';
  useEffect(() => {
    if (seo) applyPageSeo(seo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
