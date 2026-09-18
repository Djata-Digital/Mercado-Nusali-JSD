import React from 'react';
import { ProductCard } from './ProductCard';
import { Product } from '../types';
import { usePreferences } from '../context/PreferencesContext';
import { useProductRecommendations } from '../hooks/useProducts';

interface ProductRecommendationsSectionProps {
  productId: string;
}

// FASE D17-B2 — "Produtos relacionados" / "Mais desta loja" / "Você também
// pode gostar", logo após a área principal do produto (galeria, variantes,
// preço, frete, buy box, descrição, perguntas e avaliações continuam
// intocados — este componente só lê productId e o contexto de
// preferências já existente, nunca escreve em nenhum estado da página).
//
// Conteúdo secundário: enquanto carrega ou se falhar, a página do produto
// continua 100% funcional (compra, variantes, frete) — ver useProducts.ts
// (retry:false, degradação silenciosa) e o `return null` em caso de erro
// abaixo.
export const ProductRecommendationsSection: React.FC<ProductRecommendationsSectionProps> = ({ productId }) => {
  // selectedCountry = destino/comercialização do comprador (nunca alterado
  // aqui). catalogOriginFilter = filtro visual de origem, conceito
  // independente — os dois são passados tal como o resto do catálogo já
  // passa (Home/Search/Store), nunca uma terceira regra inventada aqui.
  const { selectedCountry, catalogOriginFilter } = usePreferences();
  const { data, isLoading, isError } = useProductRecommendations(productId, selectedCountry, catalogOriginFilter);

  if (isError) return null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="h-5 w-48 bg-gray-100 rounded animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className="bg-gray-50 rounded-lg h-64 animate-pulse border border-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  const relatedProducts: Product[] = data?.relatedProducts || [];
  const sameStoreProducts: Product[] = data?.sameStoreProducts || [];
  const youMayAlsoLike: Product[] = data?.youMayAlsoLike || [];

  // PASSO 5 — seção vazia nunca renderiza título/espaço/mensagem, some por
  // completo (o pai só devolve null; o gap entre irmãos vem do space-y-6 do
  // container raiz de ProductDetailView, então uma seção ausente não deixa
  // buraco).
  if (relatedProducts.length === 0 && sameStoreProducts.length === 0 && youMayAlsoLike.length === 0) {
    return null;
  }

  return (
    <>
      {relatedProducts.length > 0 && (
        <RecommendationBlock title="Produtos relacionados" products={relatedProducts} />
      )}
      {sameStoreProducts.length > 0 && (
        <RecommendationBlock title="Mais desta loja" products={sameStoreProducts} />
      )}
      {youMayAlsoLike.length > 0 && (
        <RecommendationBlock title="Você também pode gostar" products={youMayAlsoLike} />
      )}
    </>
  );
};

const RecommendationBlock: React.FC<{ title: string; products: Product[] }> = ({ title, products }) => (
  <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-xs space-y-4">
    <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-3">{title}</h2>
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  </div>
);
