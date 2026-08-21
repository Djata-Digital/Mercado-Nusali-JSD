import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useFavorites } from '../hooks/useFavorites';
import { useProducts } from '../hooks/useProducts';
import { ProductCard } from './ProductCard';
import { Heart } from 'lucide-react';

export const FavoritesView: React.FC = () => {
  const navigate = useNavigate();
  const { favorites } = useFavorites();
  const { data: products = [] } = useProducts();

  const favoriteProducts = products.filter((p) => favorites.includes(p.id));

  if (favoriteProducts.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center space-y-4">
        <Heart className="w-16 h-16 text-red-400 mx-auto" />
        <h2 className="text-xl font-bold text-gray-900">Sua lista de favoritos está vazia</h2>
        <p className="text-xs text-gray-500">
          Clique no ícone de coração nos produtos que você gosta para salvá-los e acompanhar reduções de preço.
        </p>
        <button
          onClick={() => navigate('/products')}
          className="bg-blue-600 text-white font-extrabold px-6 py-2.5 rounded-md text-xs hover:bg-blue-700 transition"
        >
          Explorar Ofertas
        </button>
      </div>
    );
  }


  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-black text-gray-900 flex items-center gap-2">
          <Heart className="w-6 h-6 text-red-600 fill-red-600" /> Meus Favoritos ({favoriteProducts.length})
        </h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {favoriteProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};
