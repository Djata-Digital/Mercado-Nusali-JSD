import React from 'react';
import { ProductCard } from './ProductCard';
import { Product } from '../types';
import { usePreferences } from '../context/PreferencesContext';
import { useProductRecommendations } from '../hooks/useProducts';

interface ProductRecommendationsSectionProps {
  productId: string;
}

// FASE D17-B3 — largura fixa por card (nunca `grid-cols-N`, que sempre
// divide o container em N faixas iguais mesmo com 1 produto só, deixando o
// card pequeno num canto de uma faixa enorme vazia). Com flex + largura
// fixa por item, 1 produto ocupa só a própria largura e o resto da linha é
// simplesmente o fundo natural da página — nunca uma caixa vazia. Mesma
// proporção de itens por linha do grid anterior (2/3/4/5), só que calculada
// como % do container menos a fatia do gap, então nunca depende da largura
// específica do viewport de um ambiente em particular.
const CARD_WIDTH_CLASSES = 'flex-none w-[calc(50%-0.5rem)] sm:w-[calc(33.3333%-0.6667rem)] md:w-[calc(25%-0.75rem)] lg:w-[calc(20%-0.8rem)]';

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
      <div>
        <div className="h-5 w-48 bg-gray-100 rounded animate-pulse mb-3" />
        <div className="border-b border-gray-200 mb-4" />
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={`${CARD_WIDTH_CLASSES} h-64 bg-gray-50 rounded-lg animate-pulse border border-gray-100`} />
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
    <div className="space-y-10">
      {relatedProducts.length > 0 && (
        <RecommendationBlock title="Produtos relacionados" products={relatedProducts} />
      )}
      {sameStoreProducts.length > 0 && (
        <RecommendationBlock title="Mais desta loja" products={sameStoreProducts} />
      )}
      {youMayAlsoLike.length > 0 && (
        <RecommendationBlock title="Você também pode gostar" products={youMayAlsoLike} />
      )}
    </div>
  );
};

const RecommendationBlock: React.FC<{ title: string; products: Product[] }> = ({ title, products }) => (
  <div>
    <h2 className="text-lg font-bold text-gray-900 mb-3">{title}</h2>
    <div className="border-b border-gray-200 mb-4" />
    <div className="flex flex-wrap gap-4">
      {products.map((product) => (
        <div key={product.id} className={CARD_WIDTH_CLASSES}>
          <ProductCard product={product} />
        </div>
      ))}
    </div>
  </div>
);
