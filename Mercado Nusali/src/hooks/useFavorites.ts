import { useState, useEffect } from 'react';
import { storageService } from '../services/storage/storageService';

export const useFavorites = () => {
  const [favorites, setFavorites] = useState<string[]>(() => {
    return storageService.getFavorites();
  });

  useEffect(() => {
    storageService.setFavorites(favorites);
  }, [favorites]);


  const toggleFavorite = (productId: string) => {
    setFavorites((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const isFavorite = (productId: string) => favorites.includes(productId);

  return {
    favorites,
    toggleFavorite,
    isFavorite,
  };
};
