import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useCategories } from '../hooks/useProducts';
import { Smartphone, Tv, Laptop, Zap, Activity, Wrench, Home, ShoppingBag } from 'lucide-react';

export const CategoryCarousel: React.FC = () => {
  const navigate = useNavigate();
  const { data: realCategories = [] } = useCategories();
  const activeCategories = (realCategories || []).filter((c: any) => c.isActive !== false);

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
    <div className="my-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800 tracking-tight">Categorias Populares</h2>
        <span className="text-xs text-gray-500 font-medium">Navegue pelas principais ofertas</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {activeCategories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => navigate(`/categories/${cat.slug || cat.id}`)}
            className="flex flex-col items-center justify-center p-3 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition text-center group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-2 group-hover:scale-110 group-hover:bg-blue-100 transition">
              {getIcon(cat.icon)}
            </div>
            <span className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 line-clamp-2 leading-tight">
              {cat.name}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

