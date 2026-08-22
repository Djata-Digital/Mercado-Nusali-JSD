// Intelligent Fuzzy & Semantic Product Search Engine for CPLP Marketplace

export interface SearchMatchResult<T> {
  item: T;
  score: number;
  matchedTerms: string[];
  suggestedCorrection?: string;
  isSynonymMatch: boolean;
}

// 1. Text Normalizer (removes accents, punctuation, lowercases)
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^\w\s]/gi, ' ') // replace punctuation with space
    .replace(/\s+/g, ' ')
    .trim();
}

// 2. Comprehensive CPLP Multilingual & Regional Synonyms Dictionary
export const SYNONYM_GROUPS: Record<string, string[]> = {
  // Celulares / Smartphones / Telefones
  smartphone: [
    'smartphone', 'smartphones', 'smartfone', 'celular', 'celulares', 'telemovel', 'telemoveis',
    'telefone', 'telefones', 'telemovel', 'mobile', 'iphone', 'galaxy', 'xiaomi', 'redmi',
    'android', 'aparelho', 'aparelho celular', 'telefonia'
  ],
  celular: [
    'celular', 'celulares', 'smartphone', 'smartphones', 'smartfone', 'telemovel', 'telemoveis',
    'telefone', 'telefones', 'mobile', 'iphone', 'galaxy', 'aparelho'
  ],
  telemovel: [
    'telemovel', 'telemoveis', 'celular', 'celulares', 'smartphone', 'smartphones', 'smartfone',
    'telefone', 'telefones', 'mobile', 'iphone', 'galaxy'
  ],
  iphone: [
    'iphone', 'aifone', 'ifone', 'ipone', 'apple', 'ios', 'smartphone', 'celular', 'telemovel', 'pro max'
  ],
  samsung: [
    'samsung', 'sansung', 'samsug', 'samsumg', 'galaxy', 'smartphone', 'celular', 'telemovel', 'android'
  ],

  // Computadores / Laptops / Informática
  computador: [
    'computador', 'computadores', 'computador portatil', 'pc', 'desktop', 'notebook', 'notebooks',
    'laptop', 'laptops', 'macbook', 'portatil', 'portateis', 'computacao', 'informatica', 'gamer'
  ],
  notebook: [
    'notebook', 'notebooks', 'notbook', 'notbuk', 'notebuk', 'laptop', 'laptops', 'portatil',
    'portateis', 'macbook', 'computador', 'computador portatil', 'ultrabook'
  ],
  laptop: [
    'laptop', 'laptops', 'notebook', 'notebooks', 'portatil', 'portateis', 'computador', 'macbook'
  ],
  tablet: [
    'tablet', 'tablets', 'tab', 'ipad', 'tab', 'galaxy tab', 'mesa digitalizadora'
  ],

  // Áudio / Fones de ouvido / Auscultadores
  fone: [
    'fone', 'fones', 'fone de ouvido', 'fones de ouvido', 'auricular', 'auriculares',
    'auscultador', 'auscultadores', 'headphone', 'headphones', 'headset', 'headsets',
    'earphone', 'earbuds', 'airpods', 'bluetooth', 'sem fio'
  ],
  auscultadores: [
    'auscultador', 'auscultadores', 'fone', 'fones', 'fones de ouvido', 'auricular',
    'auriculares', 'headphone', 'headphones', 'headset', 'airpods'
  ],
  auriculares: [
    'auricular', 'auriculares', 'fone', 'fones', 'fones de ouvido', 'auscultadores',
    'earbuds', 'airpods', 'headset'
  ],
  caixa_som: [
    'caixa de som', 'coluna de som', 'colunas', 'alto falante', 'altifalante', 'speaker',
    'soundbar', 'jbl', 'bluetooth speaker'
  ],

  // TVs / Vídeo
  tv: [
    'tv', 'tvs', 'televisao', 'televisoes', 'televisor', 'televisores', 'smart tv',
    'smarttv', 'oled', 'qled', '4k', 'monitor', 'ecra', 'tela'
  ],
  televisao: [
    'televisao', 'televisoes', 'tv', 'tvs', 'televisor', 'televisores', 'smart tv', 'monitor'
  ],

  // Eletrodomésticos
  geladeira: [
    'geladeira', 'geladeiras', 'frigorifico', 'frigorificos', 'refrigerador', 'congelador', 'freezer'
  ],
  frigorifico: [
    'frigorifico', 'frigorificos', 'geladeira', 'geladeiras', 'refrigerador', 'congelador', 'freezer'
  ],
  fogao: [
    'fogao', 'fogoes', 'fogao a gas', 'placa de inducao', 'cooktop', 'forno', 'microondas'
  ],
  ar_condicionado: [
    'ar condicionado', 'climatizador', 'ar-condicionado', 'split', 'ventilador', 'ventoinha'
  ],
  ventilador: [
    'ventilador', 'ventiladores', 'ventoinha', 'ventoinhas', 'climatizador', 'circulador'
  ],

  // Moda e Calçados
  tenis: [
    'tenis', 'sapatilha', 'sapatilhas', 'calcado', 'calcados', 'sapato', 'sapatos',
    'sneakers', 'sneaker', 'chinelo', 'sandalia', 'bota', 'chuteira'
  ],
  sapatilhas: [
    'sapatilha', 'sapatilhas', 'tenis', 'calcado', 'sapato', 'sapatos', 'sneakers', 'sneaker'
  ],
  camiseta: [
    'camiseta', 'camisetas', 'camisa', 'camisas', 't-shirt', 'tshirt', 't shirt',
    'blusa', 'polo', 'regata', 'roupa', 'vestuario'
  ],
  camisa: [
    'camisa', 'camisas', 'camiseta', 'camisetas', 't-shirt', 'tshirt', 'blusa', 'polo'
  ],
  calca: [
    'calca', 'calcas', 'jeans', 'calcoes', 'shorts', 'bermuda', 'bermudas', 'fato de treino'
  ],
  relogio: [
    'relogio', 'relogios', 'smartwatch', 'smart watch', 'relogio inteligente', 'relogio digital', 'band'
  ],
  smartwatch: [
    'smartwatch', 'smart watch', 'relogio inteligente', 'relogio', 'relogios', 'apple watch', 'galaxy watch', 'pulseira inteligente'
  ],

  // Alimentos e Bebidas (Produtos CPLP)
  cafe: [
    'cafe', 'cafes', 'cafeina', 'graos de cafe', 'expresso', 'espresso', 'arabica', 'robusta', 'sao tome'
  ],
  caju: [
    'caju', 'castanha de caju', 'castanhas', 'amendoas', 'snack', 'guine-bissau', 'bissau'
  ],
  azeite: [
    'azeite', 'oleo', 'azeite de oliva', 'azeite extra virgem', 'azeite portugues'
  ],

  // Acessórios e periféricos
  carregador: [
    'carregador', 'carregadores', 'alimentador', 'fonte', 'cabo', 'cabo usb', 'tipo c',
    'lightning', 'carregador rapido', 'power bank', 'bateria externa'
  ],
  mochila: [
    'mochila', 'mochilas', 'bolsa', 'bolsas', 'mala', 'malas', 'pasta', 'sacola'
  ]
};

// 3. Levenshtein Distance Calculation for Typo Tolerance
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

// 4. Similarity ratio (0 to 1)
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeText(str1);
  const s2 = normalizeText(str2);

  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  // If one contains the other directly
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    return 0.85 + (minLen / maxLen) * 0.15;
  }

  const distance = levenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  return Math.max(0, 1 - distance / maxLength);
}

// 5. Expand query with synonyms
export function getSynonymsForTerm(term: string): string[] {
  const norm = normalizeText(term);
  const synonymsSet = new Set<string>();
  synonymsSet.add(norm);

  for (const [key, group] of Object.entries(SYNONYM_GROUPS)) {
    const normalizedGroup = group.map(normalizeText);
    const keyNorm = normalizeText(key);

    const matchesKey = keyNorm === norm || calculateSimilarity(keyNorm, norm) > 0.8;
    const matchesAnyInGroup = normalizedGroup.some(g => g === norm || calculateSimilarity(g, norm) >= 0.82);

    if (matchesKey || matchesAnyInGroup) {
      normalizedGroup.forEach(item => synonymsSet.add(item));
      synonymsSet.add(keyNorm);
    }
  }

  return Array.from(synonymsSet);
}

// 6. Find Spell Correction / "Você quis dizer..."
export function findSpellCorrection(query: string, allCorpusTerms: string[]): string | null {
  const normQuery = normalizeText(query);
  if (!normQuery || normQuery.length < 3) return null;

  // Check if already matches exactly
  if (allCorpusTerms.some(t => normalizeText(t) === normQuery)) {
    return null;
  }

  let bestMatch: string | null = null;
  let highestScore = 0;

  // Check dictionary keys and all corpus terms
  const candidates = [
    ...Object.keys(SYNONYM_GROUPS),
    ...Object.values(SYNONYM_GROUPS).flat(),
    ...allCorpusTerms
  ];

  for (const candidate of candidates) {
    const normCand = normalizeText(candidate);
    if (normCand.length < 3 || normCand === normQuery) continue;

    const sim = calculateSimilarity(normQuery, normCand);
    // Typo threshold: similarity > 0.72 and not equal
    if (sim > 0.72 && sim > highestScore) {
      highestScore = sim;
      bestMatch = candidate;
    }
  }

  return highestScore >= 0.75 ? bestMatch : null;
}

// 7. Core Matcher for Single Product
export function scoreProductAgainstQuery(
  product: any,
  query: string
): { score: number; matchedTerms: string[]; isSynonymMatch: boolean } {
  const normQuery = normalizeText(query);
  if (!normQuery) return { score: 100, matchedTerms: [], isSynonymMatch: false };

  const queryTokens = normQuery.split(' ').filter(t => t.length > 0);
  const expandedSynonyms = getSynonymsForTerm(normQuery);

  const productTitle = normalizeText(product.title || '');
  const productCategory = normalizeText(product.category || product.categorySlug || '');
  const productBrand = normalizeText(product.brand || '');
  const productDesc = normalizeText(product.description || '');
  const productModel = normalizeText(product.model || '');

  let score = 0;
  const matchedTerms: string[] = [];
  let isSynonymMatch = false;

  // A. Exact Full Query in Title
  if (productTitle.includes(normQuery)) {
    score += 150;
    matchedTerms.push(normQuery);
  }

  // B. Exact Full Query in Brand or Model
  if (productBrand.includes(normQuery) || productModel.includes(normQuery)) {
    score += 120;
    matchedTerms.push(productBrand || productModel);
  }

  // C. Exact Full Query in Category
  if (productCategory.includes(normQuery)) {
    score += 90;
    matchedTerms.push(productCategory);
  }

  // D. Synonym Expansion Matching
  for (const syn of expandedSynonyms) {
    if (syn === normQuery) continue; // Skip identical

    if (productTitle.includes(syn)) {
      score += 110;
      matchedTerms.push(syn);
      isSynonymMatch = true;
    }
    if (productCategory.includes(syn)) {
      score += 80;
      matchedTerms.push(syn);
      isSynonymMatch = true;
    }
    if (productBrand.includes(syn)) {
      score += 85;
      matchedTerms.push(syn);
      isSynonymMatch = true;
    }
  }

  // E. Token-by-Token Match with Fuzzy Tolerance
  let matchedTokensCount = 0;
  for (const token of queryTokens) {
    if (token.length < 2) continue;

    let tokenMatched = false;

    // Check direct substring
    if (
      productTitle.includes(token) ||
      productBrand.includes(token) ||
      productCategory.includes(token) ||
      productDesc.includes(token)
    ) {
      score += 40;
      matchedTokensCount++;
      tokenMatched = true;
      matchedTerms.push(token);
    } else {
      // Check token synonyms
      const tokenSyns = getSynonymsForTerm(token);
      for (const tSyn of tokenSyns) {
        if (productTitle.includes(tSyn) || productCategory.includes(tSyn) || productBrand.includes(tSyn)) {
          score += 35;
          matchedTokensCount++;
          tokenMatched = true;
          isSynonymMatch = true;
          matchedTerms.push(tSyn);
          break;
        }
      }

      // If still not matched, check Fuzzy similarity with words in title & brand
      if (!tokenMatched && token.length >= 3) {
        const titleWords = productTitle.split(' ');
        for (const word of titleWords) {
          if (word.length < 3) continue;
          const sim = calculateSimilarity(token, word);
          if (sim >= 0.75) {
            score += Math.round(30 * sim);
            matchedTokensCount++;
            tokenMatched = true;
            matchedTerms.push(word);
            break;
          }
        }
      }
    }
  }

  // If multi-token query, reward matching all or most tokens
  if (queryTokens.length > 1 && matchedTokensCount > 0) {
    const coverage = matchedTokensCount / queryTokens.length;
    score *= (0.5 + coverage * 0.8);
  }

  return {
    score: Math.round(score),
    matchedTerms: Array.from(new Set(matchedTerms)),
    isSynonymMatch
  };
}

// 8. Main Fuzzy & Semantic Search Filtering Function
export function searchProductsIntelligent<T extends Record<string, any>>(
  products: T[],
  query: string,
  minScoreThreshold = 25
): {
  results: T[];
  suggestedCorrection?: string | null;
  synonymApplied: boolean;
  searchedQuery: string;
} {
  const norm = normalizeText(query);
  if (!norm) {
    return {
      results: products,
      suggestedCorrection: null,
      synonymApplied: false,
      searchedQuery: query
    };
  }

  // Build corpus terms for spelling correction
  const corpusTerms = products.flatMap(p => [
    p.title,
    p.brand,
    p.category,
    p.categorySlug,
    p.model
  ]).filter(Boolean);

  const suggestedCorrection = findSpellCorrection(query, corpusTerms);

  const scoredList: Array<{ item: T; score: number; isSynonym: boolean }> = [];
  let anySynonymApplied = false;

  for (const prod of products) {
    const { score, isSynonymMatch } = scoreProductAgainstQuery(prod, query);

    if (isSynonymMatch) {
      anySynonymApplied = true;
    }

    if (score >= minScoreThreshold) {
      scoredList.push({ item: prod, score, isSynonym: isSynonymMatch });
    }
  }

  // If zero results and we have a suggested correction, attempt secondary search with correction
  if (scoredList.length === 0 && suggestedCorrection) {
    for (const prod of products) {
      const { score, isSynonymMatch } = scoreProductAgainstQuery(prod, suggestedCorrection);
      if (score >= minScoreThreshold) {
        scoredList.push({ item: prod, score: score * 0.9, isSynonym: isSynonymMatch || true });
      }
    }
    anySynonymApplied = true;
  }

  // Sort descending by calculated relevance score
  scoredList.sort((a, b) => b.score - a.score);

  return {
    results: scoredList.map(s => s.item),
    suggestedCorrection,
    synonymApplied: anySynonymApplied,
    searchedQuery: query
  };
}
