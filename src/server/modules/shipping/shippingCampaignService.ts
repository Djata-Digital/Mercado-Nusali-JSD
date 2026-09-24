// FASE D18-C2 — fundação de domínio para campanhas de subsídio de frete
// financiadas pela Nusali (schema em src/db/schema.ts:
// shippingSubsidyCampaigns/shippingCampaignUsages).
//
// Este módulo é INTENCIONALMENTE puro: nenhuma função aqui toca o banco.
// Quem chamar decide como buscar candidatos e em que transaction aplicar o
// resultado — a lógica de "qual campanha vence" e "os valores fecham" nunca
// deve depender de COMO os dados chegaram até aqui.
//
// NADA neste arquivo é chamado pelo checkout ainda (D18-C2 é só fundação).
// A integração real com resolveShippingPayerPolicy/calculateOrderFinancials
// é do D18-C3 em diante.
//
// Modelo já decidido em D18-C1.1 (não revisitado aqui):
//   - target = BUYER_ONLY: uma campanha só pode reduzir a parcela que
//     sobraria para o comprador depois da política do seller já aplicada
//     — nunca a parcela que o seller assumiu voluntariamente;
//   - não-acumulável: só 1 campanha vale por child order.

export type ShippingCampaignFundingMode = 'FULL' | 'PERCENTAGE' | 'MAX_AMOUNT';

/**
 * Forma mínima de uma campanha para as funções puras abaixo — um subconjunto
 * de shippingSubsidyCampaigns (schema.ts), com os campos numéricos já como
 * `number` (o chamador é responsável por converter as colunas `numeric` do
 * Postgres, que o driver devolve como string).
 */
export interface ShippingCampaignLike {
  id: string;
  fundingMode: ShippingCampaignFundingMode;
  percentage: number | null;
  maxAmount: number | null;
  isActive: boolean;
  priority: number;
  startsAt: Date | null;
  endsAt: Date | null;
  campaignBudget: number | null;
  spentAmount: number;
  maxOrders: number | null;
  ordersServed: number;
  countryCode: string | null;
  regionId: string | null;
  sectorId: string | null;
  routeId: string | null;
  sellerId: string | null;
  storeId: string | null;
  categoryId: string | null;
  productId: string | null;
}

/**
 * Contexto de um child order (ou de uma cotação de preview) contra o qual o
 * escopo de uma campanha é testado. Vem SEMPRE de dados já resolvidos pelo
 * chamador (F3/F4, products.storeId/categoryId, etc.) — nunca inventado
 * aqui, e nunca confiado a um valor vindo direto do cliente.
 */
export interface ShippingCampaignScopeContext {
  countryCode?: string | null;
  regionId?: string | null;
  sectorId?: string | null;
  routeId?: string | null;
  sellerId?: string | null;
  storeId?: string | null;
  categoryId?: string | null;
  productId?: string | null;
}

export type ShippingCampaignValidationResult = { ok: true } | { ok: false; errors: string[] };

const SCOPE_FIELDS = ['countryCode', 'regionId', 'sectorId', 'routeId', 'sellerId', 'storeId', 'categoryId', 'productId'] as const;

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Valida a DEFINIÇÃO de uma campanha (os mesmos invariantes já reforçados
 * pelos CHECK constraints do banco — ver schema.ts — mas aplicados ANTES de
 * qualquer INSERT/UPDATE, com todos os erros coletados de uma vez, não só o
 * primeiro). Nunca consulta o banco.
 *
 * Semântica de maxOrders decidida aqui (ticket pediu explicitamente):
 * maxOrders, quando informado, deve ser um inteiro > 0. maxOrders=0 não
 * significa "campanha nunca usada" — isso é isActive=false; um "limite de
 * zero pedidos" é uma configuração sem sentido de negócio e é rejeitada.
 */
export function validateShippingCampaignDefinition(input: {
  name: string;
  fundingMode: ShippingCampaignFundingMode;
  percentage?: number | null;
  maxAmount?: number | null;
  priority?: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  campaignBudget?: number | null;
  spentAmount?: number;
  maxOrders?: number | null;
  ordersServed?: number;
}): ShippingCampaignValidationResult {
  const errors: string[] = [];

  if (!input.name || !input.name.trim()) {
    errors.push('name é obrigatório.');
  }

  const percentage = input.percentage ?? null;
  const maxAmount = input.maxAmount ?? null;
  if (!['FULL', 'PERCENTAGE', 'MAX_AMOUNT'].includes(input.fundingMode)) {
    errors.push(`fundingMode inválido: ${String(input.fundingMode)}. Use FULL, PERCENTAGE ou MAX_AMOUNT.`);
  } else if (input.fundingMode === 'FULL') {
    if (percentage !== null) errors.push('FULL não pode ter percentage (deve ser null).');
    if (maxAmount !== null) errors.push('FULL não pode ter maxAmount (deve ser null).');
  } else if (input.fundingMode === 'PERCENTAGE') {
    if (maxAmount !== null) errors.push('PERCENTAGE não pode ter maxAmount (deve ser null).');
    if (percentage === null || !isFiniteNumber(percentage)) errors.push('PERCENTAGE exige percentage finito.');
    else if (percentage <= 0 || percentage > 100) errors.push('percentage deve ser > 0 e <= 100.');
  } else if (input.fundingMode === 'MAX_AMOUNT') {
    if (percentage !== null) errors.push('MAX_AMOUNT não pode ter percentage (deve ser null).');
    if (maxAmount === null || !isFiniteNumber(maxAmount)) errors.push('MAX_AMOUNT exige maxAmount finito.');
    else if (maxAmount <= 0) errors.push('maxAmount deve ser > 0.');
  }

  if (input.priority !== undefined && (!isFiniteNumber(input.priority) || input.priority < 0)) {
    errors.push('priority deve ser um número finito >= 0.');
  }

  const startsAt = input.startsAt ?? null;
  const endsAt = input.endsAt ?? null;
  if (startsAt && endsAt && !(startsAt.getTime() < endsAt.getTime())) {
    errors.push('startsAt deve ser anterior a endsAt.');
  }

  const campaignBudget = input.campaignBudget ?? null;
  const spentAmount = input.spentAmount ?? 0;
  if (!isFiniteNumber(spentAmount) || spentAmount < 0) {
    errors.push('spentAmount deve ser um número finito >= 0.');
  }
  if (campaignBudget !== null) {
    if (!isFiniteNumber(campaignBudget) || campaignBudget < 0) errors.push('campaignBudget deve ser um número finito >= 0 (ou null para sem teto).');
    else if (isFiniteNumber(spentAmount) && spentAmount > campaignBudget) errors.push('spentAmount não pode exceder campaignBudget.');
  }

  const maxOrders = input.maxOrders ?? null;
  const ordersServed = input.ordersServed ?? 0;
  if (!Number.isInteger(ordersServed) || ordersServed < 0) {
    errors.push('ordersServed deve ser um inteiro >= 0.');
  }
  if (maxOrders !== null) {
    if (!Number.isInteger(maxOrders) || maxOrders <= 0) errors.push('maxOrders, quando informado, deve ser um inteiro > 0 (use isActive=false para desativar a campanha, nunca maxOrders=0).');
    else if (Number.isInteger(ordersServed) && ordersServed > maxOrders) errors.push('ordersServed não pode exceder maxOrders.');
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true };
}

/**
 * Janela de vigência semi-aberta: [startsAt, endsAt) — startsAt <= instant <
 * endsAt. Deliberadamente semi-aberta (não [startsAt, endsAt]) para que duas
 * campanhas adjacentes (uma terminando exatamente quando a outra começa)
 * nunca fiquem as duas ativas no mesmo instante de transição.
 * startsAt/endsAt null = sem limite naquele lado. isActive=false sempre
 * vence sobre qualquer janela de tempo.
 */
export function isShippingCampaignActiveAt(campaign: Pick<ShippingCampaignLike, 'isActive' | 'startsAt' | 'endsAt'>, instant: Date): boolean {
  if (!campaign.isActive) return false;
  if (campaign.startsAt && instant.getTime() < campaign.startsAt.getTime()) return false;
  if (campaign.endsAt && instant.getTime() >= campaign.endsAt.getTime()) return false;
  return true;
}

/**
 * Escopo combinável por AND: cada critério NÃO-NULO da campanha precisa
 * bater com o contexto. Uma campanha sem nenhum critério preenchido é
 * global e bate com qualquer contexto. Nunca um enum mutuamente exclusivo —
 * uma campanha pode ter vários critérios simultâneos (ex.: productId +
 * routeId = "só esse produto, só nessa rota").
 */
export function matchesShippingCampaignScope(campaign: ShippingCampaignLike, context: ShippingCampaignScopeContext): boolean {
  for (const field of SCOPE_FIELDS) {
    const required = campaign[field];
    if (required === null || required === undefined) continue; // wildcard
    if (context[field] !== required) return false;
  }
  return true;
}

/**
 * Especificidade = quantidade de critérios de escopo preenchidos. Quanto
 * mais critérios, mais específica a campanha (produto+rota > produto
 * sozinho; loja+destino > loja sozinha; seller+país > seller sozinho;
 * global = 0 = a menos específica possível). Deliberadamente um COUNT
 * simples, sem pesos arbitrários por tipo de campo — esta é sempre a
 * PRIMEIRA regra de desempate (D18-C2.1 confirma: mais critérios
 * combinados sempre vence, antes de qualquer granularidade semântica).
 * Empates de contagem são resolvidos por GRANULARITY_ORDER abaixo.
 */
export function computeShippingCampaignSpecificity(campaign: ShippingCampaignLike): number {
  let count = 0;
  for (const field of SCOPE_FIELDS) {
    if (campaign[field] !== null && campaign[field] !== undefined) count++;
  }
  return count;
}

/**
 * D18-C2.1 — desempate semântico quando duas campanhas têm o MESMO número
 * de critérios preenchidos (ex.: productId=X sozinho vs. countryCode=GW
 * sozinho — ambos count=1, mas um produto específico é claramente mais
 * restrito que um país inteiro). Ordem do MAIS para o MENOS específico,
 * justificada pela hierarquia real de contenção do domínio:
 *
 *   1. productId   — a entidade mais granular do catálogo: um único item.
 *   2. routeId     — fixa origem E destino (um corredor logístico exato);
 *                    mais restrito que um sectorId sozinho, que só fixa o
 *                    destino (convenção do schema: sectorId/regionId/
 *                    countryCode representam DESTINO; routeId cobre os dois
 *                    pontos ao mesmo tempo).
 *   3. storeId     — uma única loja; mais restrito que sellerId porque um
 *                    seller pode operar várias lojas.
 *   4. sectorId    — a granularidade geográfica mais fina que existe de
 *                    verdade no domínio (não há entidade "cidade" — D18-C2
 *                    já confirmou isso); mais restrito que regionId.
 *   5. categoryId  — corta transversalmente vendedores/lojas/produtos.
 *                    AMBIGUIDADE DOCUMENTADA (o ticket pede isso
 *                    explicitamente): uma categoria pode, em tese, abranger
 *                    milhares de produtos de dezenas de sellers diferentes
 *                    — um alcance bruto potencialmente MAIOR que um único
 *                    sellerId. Mesmo assim, tratamos categoryId como mais
 *                    específico que sellerId aqui, porque uma campanha por
 *                    categoria é uma decisão de negócio deliberada e
 *                    estreita ("só geladeiras"), enquanto uma campanha por
 *                    seller cobre INCONDICIONALMENTE tudo que aquele seller
 *                    vende, em qualquer categoria. É uma escolha reversível,
 *                    não uma verdade estrutural do schema — nenhum teste
 *                    desta fase depende da posição exata de categoryId
 *                    frente a seller/store; se o negócio decidir o
 *                    contrário no futuro, esta lista é o único lugar a
 *                    mudar.
 *   6. sellerId    — todas as lojas e produtos de um único vendedor.
 *   7. regionId    — contém várias sectorId.
 *   8. countryCode — o escopo geográfico mais amplo possível; contém várias
 *                    regionId.
 *
 * Comparação: para duas campanhas com a mesma contagem de critérios,
 * percorremos esta lista em ordem e a PRIMEIRA posição em que uma tem o
 * campo preenchido e a outra não decide o vencedor (tupla lexicográfica de
 * booleanos). Isso generaliza corretamente mesmo quando as duas campanhas
 * combinam critérios diferentes (ex.: productId+countryCode vs.
 * storeId+sectorId, ambas count=2): a comparação para na primeira posição
 * divergente, sem precisar de pesos numéricos arbitrários.
 */
export const GRANULARITY_ORDER: ReadonlyArray<typeof SCOPE_FIELDS[number]> = [
  'productId', 'routeId', 'storeId', 'sectorId', 'categoryId', 'sellerId', 'regionId', 'countryCode',
];

function granularityVector(campaign: ShippingCampaignLike): boolean[] {
  return GRANULARITY_ORDER.map((field) => campaign[field] !== null && campaign[field] !== undefined);
}

function compareByGranularity(a: ShippingCampaignLike, b: ShippingCampaignLike): number {
  const va = granularityVector(a);
  const vb = granularityVector(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) return va[i] ? -1 : 1; // true (tem o critério) vence
  }
  return 0;
}

/**
 * Comparador determinístico para ordenar candidatos e escolher o vencedor:
 * (1) maior especificidade (contagem de critérios) primeiro,
 * (2) empate -> granularidade semântica (GRANULARITY_ORDER acima),
 * (3) empate -> maior priority,
 * (4) empate final -> id (ordem alfabética simples, sempre a mesma para o
 * mesmo conjunto de ids — nunca depende da ordem em que o chamador buscou
 * as linhas). Não filtra por ativa/escopo/capacidade — isso é
 * responsabilidade de isShippingCampaignActiveAt/matchesShippingCampaignScope/
 * hasShippingCampaignCapacity, chamadas antes por resolveWinningShippingCampaign.
 */
export function compareShippingCampaignsForPrecedence(a: ShippingCampaignLike, b: ShippingCampaignLike): number {
  const specDiff = computeShippingCampaignSpecificity(b) - computeShippingCampaignSpecificity(a);
  if (specDiff !== 0) return specDiff;
  const granDiff = compareByGranularity(a, b);
  if (granDiff !== 0) return granDiff;
  const priorityDiff = b.priority - a.priority;
  if (priorityDiff !== 0) return priorityDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * D18-C2.1 — só rejeita campanhas já ESGOTADAS (orçamento ou contagem de
 * pedidos no limite exato ou acima). NÃO calcula se o subsídio de um novo
 * pedido específico caberia no saldo restante — isso depende do valor do
 * subsídio calculado (que só existe quando o resolver de frete for
 * integrado, D18-C3) e não pertence a esta função. null em qualquer
 * dimensão = sem limite naquela dimensão.
 */
export function hasShippingCampaignCapacity(campaign: Pick<ShippingCampaignLike, 'campaignBudget' | 'spentAmount' | 'maxOrders' | 'ordersServed'>): boolean {
  if (campaign.campaignBudget !== null && campaign.spentAmount >= campaign.campaignBudget) return false;
  if (campaign.maxOrders !== null && campaign.ordersServed >= campaign.maxOrders) return false;
  return true;
}

/**
 * D18-C2.1 — função pura de resolução: dado um conjunto de campanhas
 * candidatas (o chamador decide COMO buscá-las — este módulo nunca toca
 * banco), o contexto do child order e o instante de referência, devolve a
 * ÚNICA campanha vencedora (ou null se nenhuma se aplica). Pipeline:
 *
 *   1. isShippingCampaignActiveAt  (isActive + janela [startsAt, endsAt))
 *   2. matchesShippingCampaignScope (AND puro sobre os critérios preenchidos)
 *   3. hasShippingCampaignCapacity (orçamento e maxOrders ainda não esgotados)
 *   4. compareShippingCampaignsForPrecedence (especificidade -> granularidade
 *      -> priority -> id)
 *
 * A ordem do array `campaigns` de entrada NUNCA afeta o resultado — o sort
 * usa um comparador totalmente determinístico. Esta função SÓ seleciona:
 * não consome orçamento, não incrementa ordersServed, não cria
 * shipping_campaign_usages. Isso é responsabilidade de quem chamar (D18-C3,
 * ainda não implementado), dentro de uma transaction real com row lock.
 */
export function resolveWinningShippingCampaign(
  campaigns: ShippingCampaignLike[],
  context: ShippingCampaignScopeContext,
  instant: Date
): ShippingCampaignLike | null {
  const eligible = campaigns
    .filter((c) => isShippingCampaignActiveAt(c, instant))
    .filter((c) => matchesShippingCampaignScope(c, context))
    .filter((c) => hasShippingCampaignCapacity(c));
  if (eligible.length === 0) return null;
  return [...eligible].sort(compareShippingCampaignsForPrecedence)[0];
}
