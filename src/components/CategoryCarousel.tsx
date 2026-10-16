import React from 'react';
import { Link } from 'react-router-dom';
import { useCategories } from '../hooks/useProducts';
import { Smartphone, Tv, Laptop, Zap, Activity, Wrench, Home, ShoppingBag, ChevronRight } from 'lucide-react';

/** Quantas categorias PRINCIPAIS a Home mostra; as demais ficam em "Ver todas as categorias" (/categories). */
const HOME_CATEGORY_LIMIT = 16;
/** No celular a Home mostra uma FAIXA compacta (rolagem horizontal) com as primeiras categorias e o atalho "Ver todas". */
const HOME_CATEGORY_LIMIT_MOBILE = 8;

export const CategoryCarousel: React.FC = () => {
  const { data: realCategories = [] } = useCategories();
  const activeCategories = (realCategories || []).filter((c: any) => c.isActive !== false);
  // Só departamentos (categorias principais): as subcategorias aparecem no menu "Categorias" e na página de cada departamento.
  // Sem nenhuma principal (dados legados sem hierarquia), cai para a lista inteira como antes.
  const roots = activeCategories.filter((c: any) => !c.parentId);
  const departments = roots.length > 0 ? roots : activeCategories;
  const visible = departments.slice(0, HOME_CATEGORY_LIMIT);
  const visibleMobile = departments.slice(0, HOME_CATEGORY_LIMIT_MOBILE);

  const getIcon = (iconName?: string) => {
    switch (iconName) {
      case 'Smartphone': return <Smartphone className="w-6 h-6 text-blue-600" />;
      case 'Tv': return <Tv className="w-6 h-6 text-blue-600" />;
      case 'Laptop': return <Laptop className="w-6 h-6 text-blue-600" />;
      case 'Zap': return <Zap className="w-6 h-6 text-blue-600" />;
      case 'Activity': return <Activity className="w-6 h-6 text-blue-600" />;
      case 'Wrench': return <Wrench className="w-6 h-6 text-blue-600" />;
      case 'Home': return <Home className="w-6 h-6 text-blue-600" />;
      default: return <ShoppingBag className="w-6 h-6 text-blue-600" />;
    }
  };

  if (activeCategories.length === 0) {
    return null;
  }

  return (
    <div className="my-3 sm:my-6">
      <div className="flex items-center justify-between mb-2 sm:mb-4">
        <h2 className="text-base sm:text-xl font-bold text-gray-800 tracking-tight">Categorias Populares</h2>
        <Link to="/categories" className="text-xs text-blue-800 font-bold hover:underline flex items-center gap-1">
          Ver todas<span className="hidden sm:inline"> as categorias</span> <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Celular: faixa compacta de uma linha (rolagem horizontal) + atalho "Ver todas" — em vez de uma grade alta de blocos */}
      <div data-testid="category-strip" className="sm:hidden flex gap-3 overflow-x-auto pb-1 -mx-2 px-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleMobile.map((cat: any) => (
          <Link
            key={cat.id}
            to={`/categories/${cat.slug || cat.id}`}
            className="snap-start shrink-0 w-[68px] flex flex-col items-center gap-1 text-center"
          >
            <span className="w-12 h-12 rounded-full bg-blue-50 border border-blue-100 flex items-center justify-center">{getIcon(cat.icon)}</span>
            <span className="text-[11px] font-semibold text-gray-800 line-clamp-2 leading-tight">{cat.name}</span>
          </Link>
        ))}
        <Link
          to="/categories"
          data-testid="category-strip-all"
          className="snap-start shrink-0 w-[68px] flex flex-col items-center gap-1 text-center"
        >
          <span className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center"><ChevronRight className="w-6 h-6 text-emerald-700" aria-hidden="true" /></span>
          <span className="text-[11px] font-bold text-emerald-800 leading-tight">Ver todas</span>
        </Link>
      </div>

      <div className="hidden sm:grid grid-cols-4 lg:grid-cols-8 gap-3">
        {visible.map((cat: any) => (
          <Link
            key={cat.id}
            to={`/categories/${cat.slug || cat.id}`}
            className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition text-center group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-2 group-hover:scale-110 group-hover:bg-blue-100 transition">
              {getIcon(cat.icon)}
            </div>
            <span className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 line-clamp-2 leading-tight">
              {cat.name}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
};
