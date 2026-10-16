import React from 'react';
import { Link } from 'react-router-dom';
import { useCategories } from '../hooks/useProducts';
import { Smartphone, Tv, Laptop, Zap, Activity, Wrench, Home, ShoppingBag, ChevronRight } from 'lucide-react';

/** Subcategorias mostradas no cartão do departamento; o restante fica a um clique ("Ver todas"). No celular o cartão é compacto: só as primeiras. */
const SUBCATEGORY_PREVIEW = 6;
const SUBCATEGORY_PREVIEW_MOBILE = 3;

export const CategoriesPage: React.FC = () => {
  const { data: rawCategories = [] } = useCategories();
  const categories = (rawCategories || []).filter((c: any) => c.isActive !== false);
  // Departamentos = categorias principais; cada um lista suas subcategorias diretas. Sem hierarquia (dados legados), lista tudo.
  const roots = categories.filter((c: any) => !c.parentId);
  const departments = roots.length > 0 ? roots : categories;
  const childrenOf = (id: string) => (roots.length > 0 ? categories.filter((c: any) => c.parentId === id) : []);

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'Smartphone': return <Smartphone className="w-8 h-8 text-blue-600" />;
      case 'Tv': return <Tv className="w-8 h-8 text-blue-600" />;
      case 'Laptop': return <Laptop className="w-8 h-8 text-blue-600" />;
      case 'Zap': return <Zap className="w-8 h-8 text-blue-600" />;
      case 'Activity': return <Activity className="w-8 h-8 text-blue-600" />;
      case 'Wrench': return <Wrench className="w-8 h-8 text-blue-600" />;
      case 'Home': return <Home className="w-8 h-8 text-blue-600" />;
      default: return <ShoppingBag className="w-8 h-8 text-blue-600" />;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-4 py-4 sm:py-8 space-y-3 sm:space-y-6">
      <div className="border-b border-gray-200 pb-3 sm:pb-4">
        <h1 className="text-xl sm:text-2xl font-black text-gray-900">Todas as Categorias</h1>
        <p className="text-xs text-gray-500 mt-1">Navegue por departamento e encontre o produto ideal</p>
      </div>

      <div data-testid="categories-grid" className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-6">
        {departments.map((cat: any) => {
          const subs = childrenOf(cat.id);
          return (
            <div
              key={cat.id}
              className="bg-white p-3 sm:p-6 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-lg transition flex flex-col justify-between group"
            >
              <Link to={`/categories/${cat.slug || cat.id}`} className="flex items-center gap-2 sm:gap-4">
                <div className="p-2 sm:p-3 bg-blue-50 group-hover:bg-emerald-50 rounded-xl transition shrink-0 [&_svg]:w-6 [&_svg]:h-6 sm:[&_svg]:w-8 sm:[&_svg]:h-8">
                  {getIcon(cat.icon || cat.iconName)}
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 group-hover:text-emerald-700 transition line-clamp-2 leading-tight">
                    {cat.name}
                  </h3>
                  {typeof cat.prods === 'number' && cat.prods > 0 && (
                    <span className="text-xs text-gray-500">{cat.prods} ofertas disponíveis</span>
                  )}
                </div>
              </Link>

              {subs.length > 0 && (
                <ul className="mt-2 sm:mt-4 space-y-1 sm:space-y-1.5" aria-label={`Subcategorias de ${cat.name}`}>
                  {subs.slice(0, SUBCATEGORY_PREVIEW).map((sub: any, idx: number) => (
                    <li key={sub.id} className={idx >= SUBCATEGORY_PREVIEW_MOBILE ? 'hidden sm:block' : undefined}>
                      <Link
                        to={`/categories/${sub.slug || sub.id}`}
                        className="block py-0.5 text-xs text-gray-600 hover:text-emerald-700 hover:underline"
                      >
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              <Link
                to={`/categories/${cat.slug || cat.id}`}
                className="mt-2 sm:mt-4 pt-2 sm:pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-blue-600 hover:text-emerald-700"
              >
                <span className="sm:hidden">{subs.length > SUBCATEGORY_PREVIEW_MOBILE ? `Ver todas (${subs.length})` : 'Explorar'}</span>
                <span className="hidden sm:inline">{subs.length > SUBCATEGORY_PREVIEW ? `Ver todas as ${subs.length} subcategorias` : 'Explorar catálogo'}</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
};
