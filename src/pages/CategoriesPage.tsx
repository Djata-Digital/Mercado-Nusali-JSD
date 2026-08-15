import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories } from '../hooks/useProducts';
import { mockCategories } from '../data/mockData';
import { Smartphone, Tv, Laptop, Zap, Activity, Wrench, Home, ShoppingBag, ChevronRight } from 'lucide-react';

export const CategoriesPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: categories = mockCategories } = useCategories();

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
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-gray-900">Todas as Categorias</h1>
        <p className="text-xs text-gray-500 mt-1">Navegue por departamento e encontre o produto ideal</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => navigate(`/categories/${cat.slug}`)}
            className="bg-white p-6 rounded-xl border border-gray-200 hover:border-emerald-500 hover:shadow-lg transition cursor-pointer flex flex-col justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 group-hover:bg-emerald-50 rounded-xl transition">
                {getIcon(cat.iconName)}
              </div>
              <div>
                <h3 className="font-bold text-gray-900 group-hover:text-emerald-700 transition">
                  {cat.name}
                </h3>
                <span className="text-xs text-gray-500">{cat.itemCount} ofertas disponíveis</span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs font-semibold text-blue-600 group-hover:text-emerald-700">
              <span>Explorar catálogo</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
