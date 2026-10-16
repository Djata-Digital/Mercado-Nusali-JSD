import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { shouldScrollToTop } from '../utils/scrollToTopRule';

/** Abre cada página nova no topo (ex.: o produto aberto a partir do meio de uma listagem). Regra em utils/scrollToTopRule. Sem UI. */
export const ScrollToTop: React.FC = () => {
  const location = useLocation();
  const navType = useNavigationType();
  const prev = useRef<{ pathname: string } | null>(null);

  useEffect(() => {
    if (shouldScrollToTop(prev.current, { pathname: location.pathname, hash: location.hash }, navType)) {
      window.scrollTo(0, 0);
    }
    prev.current = { pathname: location.pathname };
  }, [location.pathname, location.hash, navType]);

  return null;
};
