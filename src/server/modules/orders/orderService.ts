import { getDb } from '../../../db/index.js';
import {
  orders,
  orderItems,
  orderStatusHistory,
  products,
  productVariants,
  warehouses,
  shipments,
  trackingEvents,
  carts,
  cartItems,
  addresses,
  sellers,
  stores,
  escrowAccounts,
  disputes,
  purchaseGroups,
  payments,
} from '../../../db/schema.js';
import { eq, and, desc, asc, inArray } from 'drizzle-orm';
import { logger } from '../../infra/logger.js';
import { broadcastToUser } from '../../infra/websocket.js';
import { ShipmentService } from '../logistics/shipmentService.js';
import { InventoryService } from '../inventory/inventoryService.js';
import { ShippingCalculatorService, resolveShippingPayerPolicy } from '../shipping/shippingCalculatorService.js';
import { categories, platformSettings, countries } from '../../../db/schema.js';
import { isProductAvailableForCountry, eligibilityReason } from '../catalog/productEligibilityService.js';
import { userProfiles } from '../../../db/schema.js';
import { updateBuyerTaxId } from '../buyer/buyerProfileService.js';
import { resolveCarrierNames, pickCarrierName } from '../logistics/carrierResolver.js';
// FASE D16-F2 — fundação geográfica do endereço de entrega do comprador.
// Reaproveita a MESMA validação já usada pela origem operacional do seller
// (D15-C2/D16-E3/E4) — nunca uma segunda regra de setor/região divergente.
import { validateAddressSectorAssignment, countryHasActiveShippingSectors } from '../shipping/shippingGeographyService.js';
// FASE D16-F6.2 — smart fulfillment (F4 planeja a melhor origem por custo
// real de frete, F5 reserva com lock+revalidação sob a MESMA transação).
// FASE D16-I2 — usados SEMPRE agora, para TODO checkout (inclusive
// single-seller), independente de multiSellerCheckoutEnabled — a flag
// passou a controlar SOMENTE se um carrinho com MAIS DE 1 vendedor
// distinto é permitido (ver MULTI_SELLER_CHECKOUT_DISABLED, mais abaixo).
// O caminho legado (split cego + frete país/zona) permanece definido no
// arquivo como código morto — nunca mais alcançado — removido fisicamente
// só em D16-I5 (ver auditoria D16-I1).
import { resolveFulfillmentCandidates } from '../shipping/fulfillmentCandidateResolverService.js';
import { reserveFulfillmentInventory } from '../inventory/fulfillmentReservationService.js';

export interface CreateOrderRequestDTO {
  userId: string;
  shippingAddress?: any;
  addressId?: string;
  // FASE D16-H1.1 — separa a autoridade geográfica do endereço (sempre
  // resolvida do banco quando addressId é usado, ou do objeto inline
  // quando é um endereço novo específico deste pedido) do destinatário
  // escolhido PARA ESTE pedido em particular (o próprio comprador, ou
  // outra pessoa). Aplicado como override final, DEPOIS que
  // targetAddress já foi resolvido — nunca substitui/adiciona nenhum
  // campo geográfico (street/city/shippingSectorId/countryCode/...),
  // somente recipientName/phone.
  recipientOverride?: { name: string; phone: string; document?: string } | null;
  paymentMethod: string;
  notes?: string;
  currency?: string;
  countryCode?: string;
}

// Fase M1-D1 — contrato explícito de createOrderFromCart. `CreatedOrder` é
// exatamente o objeto que buildCreatedOrderResult() já retornava (nenhum
// campo novo, nenhum removido) — só nomeado e exportado para que o
// contrato de resposta pare de ser um objeto anônimo `any`.
export interface CreatedOrderItem {
  productId: string;
  variantId: string | null;
  productTitle: string;
  productSku: string | null;
  variantTitle: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  sellerId: string | null;
  storeId: string | null;
  productImage: string | null;
  inventoryId: string;
  warehouseId: string | null;
  fulfillmentMode: string;
}

export interface CreatedOrder {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string | null;
  subtotal: number;
  shippingFee: number;
  shippingCost: number;
  shippingSellerSubsidy: number;
  shippingMarketplaceSubsidy: number;
  marketplaceCommission: number;
  sellerNetAmount: number;
  totalAmount: number;
  currency: string;
  status: string;
  paymentMethod: string | null;
  paymentStatus: string;
  escrowStatus: string;
  shippingAddress: any;
  items: CreatedOrderItem[];
  purchaseGroupId: string | null;
  createdAt: string;
}

export interface CreatedPurchaseGroupSummary {
  id: string;
  buyerId: string;
  currency: string;
  totalAmount: number;
  status: string;
}

// Discriminante `mode` reaproveita o MESMO nome/valores já usados em
// paymentService.ts (resolveFundingPaymentForOrder: `mode: 'legacy' |
// 'purchase_group'`) para a idêntica distinção — nenhum nome novo
// inventado. Contrato ADITIVO: todo campo de `CreatedOrder` no nível raiz
// (id, totalAmount, currency, purchaseGroupId=null, etc.) continua presente
// em AMBOS os modos, exatamente como antes desta fase — nenhum consumidor
// legado que ainda lê `result.id`/`result.totalAmount` direto quebra.
// `purchaseGroup`/`orders` só existem no modo 'purchase_group' — nenhum
// consumidor novo deve usar `orders[0].id` como identidade financeira do
// group; a identidade real é `purchaseGroup.id` (== `purchaseGroupId`).
export type CreateOrderFromCartResult =
  | (CreatedOrder & { mode: 'legacy' })
  | (CreatedOrder & { mode: 'purchase_group'; purchaseGroup: CreatedPurchaseGroupSummary; orders: CreatedOrder[] });

/**
 * Fase M1-D3 — deriva o status logístico consolidado de um pedido a partir
 * dos status dos seus shipments. Extraída (sem mudança de comportamento) de
 * buildEnrichedOrder para ser reaproveitada por getPurchaseGroupById — a
 * tela de confirmação multi-seller precisa do MESMO status de entrega por
 * child order, e uma segunda cópia divergente da regra seria pior. É pura,
 * READ-ONLY, sem nenhum efeito financeiro.
 */
export function deriveLogisticsStatus(
  shipmentStatuses: (string | null | undefined)[],
  fallbackOrderStatus: string | null | undefined
): string {
  const statuses = shipmentStatuses.map((s) => (s || '').toUpperCase());
  if (statuses.length === 0) {
    return (fallbackOrderStatus || 'PREPARING').toUpperCase();
  }
  if (statuses.length === 1) {
    return (statuses[0] || fallbackOrderStatus || 'PREPARING').toUpperCase();
  }
  if (statuses.every((s) => s === 'DELIVERED')) return 'DELIVERED';
  if (statuses.some((s) => s === 'OUT_FOR_DELIVERY')) return 'OUT_FOR_DELIVERY';
  if (statuses.some((s) => s === 'IN_TRANSIT')) return 'IN_TRANSIT';
  if (statuses.some((s) => s === 'SHIPPED')) return 'SHIPPED';
  return 'READY_TO_SHIP';
}

export class OrderService {
  // `executor` opcional: permite testar esta função contra um Postgres
  // Docker isolado (mesmo padrão já usado em payoutService/refundService),
  // sem depender do pool singleton getDb() (SSL fixo, incompatível com
  // Docker). Em produção, executor é sempre undefined e o comportamento é
  // idêntico ao anterior.
  static async createOrderFromCart(data: CreateOrderRequestDTO, executor?: any): Promise<CreateOrderFromCartResult> {
    const db = executor ?? getDb();
    if (!db) {
      throw new Error('Banco de dados indisponível.');
    }

    const { userId, paymentMethod, notes } = data;

    // 1. Resolve Shipping Address
    // FASE D16-H1.1 — endurece a resolução do endereço de entrega:
    //   - Quando data.addressId é fornecido explicitamente, ele é a ÚNICA
    //     fonte aceita para os campos geográficos — tem PRECEDÊNCIA sobre um
    //     data.shippingAddress inline eventualmente presente no MESMO
    //     payload (antes desta fase, um shippingAddress inline com .street
    //     preenchido "vencia" mesmo com um addressId válido também presente
    //     — um payload HTTP adulterado podia assim forjar rua/cidade/setor
    //     mesmo selecionando um endereço cadastrado real).
    //   - Se o addressId não existir ou não pertencer ao comprador
    //     autenticado, o pedido é REJEITADO explicitamente — NUNCA cai
    //     silenciosamente no endereço padrão do comprador (isso enviaria o
    //     pedido para um endereço diferente do que foi de fato selecionado,
    //     sem nenhum aviso ao comprador).
    let targetAddress = data.shippingAddress;
    if (data.addressId) {
      const addrRows = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.id, data.addressId), eq(addresses.userId, userId)))
        .limit(1);
      if (addrRows.length === 0) {
        throw new Error('ADDRESS_NOT_FOUND: O endereço selecionado não existe ou não pertence à sua conta.');
      }
      const a = addrRows[0];
      targetAddress = {
        recipientName: a.recipientName,
        street: a.street,
        number: a.number,
        complement: a.complement || '',
        neighborhood: a.neighborhood || '',
        city: a.city,
        state: a.state,
        countryCode: a.countryCode,
        country: a.countryCode,
        zipCode: a.zipCode || '',
        phone: a.phone,
        // FASE D16-F2 — fundação geográfica do endereço de entrega: o
        // objeto resolvido precisa manter shippingSectorId do endereço
        // persistido selecionado (addressId), nunca perdê-lo neste mapeamento.
        // Ainda NÃO usado para calcular frete nesta fase.
        shippingSectorId: a.shippingSectorId || null,
      };
    } else if (!targetAddress || !targetAddress.street) {
      // Nenhum addressId e nenhum endereço inline utilizável foram
      // fornecidos — único caso em que o fallback para o endereço padrão do
      // comprador se aplica (comportamento pré-existente, preservado).
      const defaultAddrs = await db
        .select()
        .from(addresses)
        .where(and(eq(addresses.userId, userId), eq(addresses.isDefault, true)))
        .limit(1);
      if (defaultAddrs.length > 0) {
        const a = defaultAddrs[0];
        targetAddress = {
          recipientName: a.recipientName,
          street: a.street,
          number: a.number,
          complement: a.complement || '',
          neighborhood: a.neighborhood || '',
          city: a.city,
          state: a.state,
          countryCode: a.countryCode,
          country: a.countryCode,
          zipCode: a.zipCode || '',
          phone: a.phone,
          // FASE D16-F2 — idem, para o endereço PADRÃO do comprador.
          shippingSectorId: a.shippingSectorId || null,
        };
      }
    }

    // FASE D16-H1.1 — override de destinatário, aplicado por ÚLTIMO, DEPOIS
    // que targetAddress já foi 100% resolvido (do banco via addressId, do
    // banco via endereço padrão, ou do objeto inline para um endereço novo
    // específico deste pedido). Nunca troca/adiciona nenhum campo
    // geográfico (street/city/state/countryCode/country/zipCode/
    // shippingSectorId) — só recipientName/phone. Isto separa a
    // AUTORIDADE GEOGRÁFICA do endereço (sempre do banco quando addressId é
    // usado — o cliente não pode falsificar setor/rua/cidade de um
    // endereço salvo) da escolha de "quem recebe" para este pedido em
    // particular (o próprio comprador, ou outra pessoa) — auditoria
    // D16-H1.1, que encontrou o gap: antes desta fase, escolher "outra
    // pessoa" para um endereço CADASTRADO exigia reconstruir o endereço
    // inteiro no frontend (shippingAddress inline), enfraquecendo a
    // validação de propriedade do addressId.
    if (targetAddress && data.recipientOverride?.name && data.recipientOverride?.phone) {
      targetAddress = {
        ...targetAddress,
        recipientName: data.recipientOverride.name,
        phone: data.recipientOverride.phone,
        // FASE D16-H1.1 — cpfOrTaxId só chega aqui quando o chamador (o
        // pure function do frontend) já determinou que o destinatário É o
        // próprio comprador; para "outra pessoa" o documento nunca é
        // repassado, então a sincronização best-effort com
        // userProfiles.taxId logo abaixo simplesmente não roda — nunca
        // atribui ao comprador um documento que pertence a outra pessoa.
        ...(data.recipientOverride.document ? { cpfOrTaxId: data.recipientOverride.document } : {}),
      };
    }

    if (!targetAddress || !targetAddress.street || !targetAddress.recipientName) {
      throw new Error('Endereço de entrega completo é obrigatório para finalizar a compra.');
    }

    // 2. Execute Atomic Transaction
    return await db.transaction(async (tx: any) => {
      // Fetch active user cart
      const userCarts = await tx.select().from(carts).where(eq(carts.userId, userId)).limit(1);
      if (userCarts.length === 0) {
        throw new Error('Carrinho de compras não encontrado.');
      }
      const userCart = userCarts[0];

      // Fetch cart items
      const itemsInCart = await tx.select().from(cartItems).where(eq(cartItems.cartId, userCart.id));
      if (itemsInCart.length === 0) {
        throw new Error('Seu carrinho está vazio. Adicione produtos antes de finalizar o pedido.');
      }

      // Correção crítica de checkout: o destino de entrega precisa estar
      // resolvido ANTES de qualquer validação por item (elegibilidade,
      // frete) — antes esse cálculo só existia mais abaixo, depois do loop
      // de itens, então a checagem de elegibilidade usava
      // targetAddress.countryCode diretamente. Quando o frontend envia
      // shippingAddress inline (objeto do formulário, campo `country`, não
      // `countryCode` — ver types.ts DeliveryAddress), esse campo sempre foi
      // undefined nesse caminho específico, e só "funcionava" por acidente
      // quando o endereço vinha de addressId/endereço padrão (único lugar
      // que já preenchia as duas chaves). Mesma prioridade de sempre —
      // endereço real primeiro, nunca Bissau/Brasil como fallback — só
      // resolvida cedo o bastante para todo o resto do fluxo (elegibilidade
      // por item, frete, e a própria linha do pedido) usar uma ÚNICA fonte.
      const destinationCountry = (targetAddress?.countryCode || targetAddress?.country || data.countryCode || '').trim().toUpperCase();
      if (!destinationCountry) {
        throw new Error('DESTINATION_COUNTRY_REQUIRED: O endereço de entrega não possui país de destino definido. Informe o país do endereço de entrega.');
      }
      const [destinationCountryRow] = await tx.select().from(countries).where(eq(countries.code, destinationCountry)).limit(1);
      if (!destinationCountryRow) {
        throw new Error(`DESTINATION_COUNTRY_NOT_FOUND: País de destino "${destinationCountry}" não é reconhecido pelo Mercado Nusali.`);
      }
      if (destinationCountryRow.isActive !== true) {
        throw new Error(`DESTINATION_COUNTRY_INACTIVE: O Mercado Nusali ainda não está disponível para entregas em ${destinationCountryRow.name}.`);
      }

      // FASE D16-F2 — fundação geográfica do endereço de entrega. Ainda NÃO
      // usado para calcular frete/selecionar inventory nesta fase — só
      // fecha o bypass de validação: se ALGUM shippingSectorId chegou no
      // objeto resolvido (persistido via addressId/padrão, OU inline —
      // "Precisamos evitar bypass", D16-F2 seção 6), ele precisa
      // corresponder de verdade a um setor real, ativo, do MESMO país do
      // destino — nunca aceito sem checagem só porque veio de um endereço
      // "selecionado". Endereço sem setor continua 100% válido (opt-in,
      // nunca exigido aqui — exigir/usar para frete é fase futura).
      if (targetAddress?.shippingSectorId) {
        const sectorValidation = await validateAddressSectorAssignment(tx, {
          countryCode: destinationCountry,
          shippingSectorId: String(targetAddress.shippingSectorId),
        });
        if (!('ok' in sectorValidation)) {
          throw new Error(`SHIPPING_SECTOR_INVALID: ${sectorValidation.error}`);
        }
      }

      // Correção crítica (CPF/CNPJ não chega ao Asaas): o checkout captura o
      // documento em shippingAddress.cpfOrTaxId (campo do ENDEREÇO de
      // entrega), mas o pagamento (AsaasPaymentProvider.getOrCreateCustomer)
      // sempre leu exclusivamente userProfiles.taxId — um campo do PERFIL da
      // conta, preenchido só por uma tela de configurações separada. As duas
      // fontes nunca eram sincronizadas: o comprador digitava um CPF válido
      // no checkout e o Asaas mesmo assim recusava por "documento ausente".
      // Nesta arquitetura (compra para si mesmo, sem fluxo de presentear
      // terceiro) o documento do destinatário do checkout É o documento
      // fiscal do comprador — então, para destino BR, se o perfil ainda não
      // tem um documento registrado, aproveitamos o que o comprador acabou
      // de digitar para preenchê-lo, usando o MESMO validador/normalizador
      // já usado pela tela de perfil (updateBuyerTaxId), nunca um segundo
      // critério divergente. Nunca sobrescreve um documento já registrado no
      // perfil (esse continua sendo a fonte mais estável/autoritativa).
      // Best-effort: um documento ausente/inválido aqui NUNCA bloqueia a
      // criação do pedido — quem decide se o pagamento pode prosseguir é o
      // AsaasPaymentProvider, no momento da cobrança.
      if (destinationCountry === 'BR' && targetAddress?.cpfOrTaxId) {
        try {
          const existingProfile = await tx.select({ taxId: userProfiles.taxId }).from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
          const hasRegisteredTaxId = Boolean(existingProfile[0]?.taxId && String(existingProfile[0].taxId).trim());
          if (!hasRegisteredTaxId) {
            await updateBuyerTaxId({ userId, taxId: String(targetAddress.cpfOrTaxId), effectiveCountryCode: 'BR' }, tx);
          }
        } catch (syncErr: any) {
          // Documento estruturalmente inválido (ex.: checksum de CPF errado)
          // ou qualquer outra falha aqui não deve impedir o pedido — só não
          // preenchemos o perfil, e o pagamento (se PIX) vai reportar o
          // problema de forma clara na hora certa, sem expor o CPF no log.
          logger.warn({ userId, code: syncErr?.code || 'UNKNOWN' }, 'Não foi possível sincronizar documento do checkout com o perfil do comprador');
        }
      }

      // Correção crítica (PAYMENT_CURRENCY_MISMATCH): moeda autoritativa do
      // pedido é a do carrinho (userCart.currency — já sincronizada a cada
      // item adicionado, ver addItemToCartForUser em buyerRoutes.ts), nunca
      // a preferência visual do comprador nem nada vindo do request de
      // pagamento. Resolvida cedo para poder revalidar por item abaixo —
      // defesa extra: addItemToCartForUser já impede misturar moedas no
      // momento de adicionar (CART_MIXED_CURRENCY_NOT_ALLOWED), isto aqui é
      // o portão final antes de criar o pedido de verdade.
      const orderCurrency = (userCart.currency || data.currency || '').trim().toUpperCase();
      if (!orderCurrency) {
        throw new Error('SHIPPING_CURRENCY_REQUIRED: A moeda do pedido é obrigatória para o cálculo de frete.');
      }

      // FASE D16-F6.2 — feature flag lida AQUI (movida de mais abaixo, antes
      // do único lugar que decidia só "1 order vs N orders") porque agora
      // TAMBÉM decide COMO cada cart line escolhe sua origem de estoque
      // (split cego legado vs. F4/F5 smart fulfillment) — decisão que
      // precisa estar disponível já no loop de itens abaixo. MESMO padrão
      // fail-closed de sempre (autoReleaseEnabled): ausência ou qualquer
      // valor diferente do boolean literal `true` = DESATIVADO. Com a flag
      // desligada, o restante desta função continua bit-a-bit idêntico ao
      // comportamento anterior a esta fase.
      const multiSellerSettingRows = await tx
        .select({ valueJson: platformSettings.valueJson })
        .from(platformSettings)
        .where(eq(platformSettings.key, 'multiSellerCheckoutEnabled'))
        .limit(1);
      const multiSellerCheckoutEnabled = multiSellerSettingRows.length > 0 && multiSellerSettingRows[0].valueJson === true;

      // FASE D16-F6.2, seção 2 — destino para F4/F3: EXCLUSIVAMENTE
      // targetAddress.shippingSectorId (já resolvido do endereço
      // selecionado/addressId/padrão acima, e já validado — real, ativo, do
      // país certo — pela checagem de validateAddressSectorAssignment mais
      // abaixo antes deste ponto seria ideal, mas F2 já valida no momento em
      // que o setor é ATRIBUÍDO ao endereço, não aqui; esta função nunca
      // infere setor por cidade nem cai para o endereço padrão se outro foi
      // selecionado — targetAddress já É o endereço final escolhido).
      // Fail-closed: sem setor, o fluxo novo não pode chamar F4 (que exige
      // destinationShippingSectorId) — nunca inventa fallback geográfico.
      //
      // FASE D16-I2 — auditoria D16-I1 confirmou que multiSellerCheckoutEnabled
      // controlava simultaneamente 4 coisas (motor de frete, resolução de
      // estoque, mecanismo de reserva, estrutura order/purchase_group), não
      // só a permissão de múltiplos vendedores. A partir desta fase, a
      // resolução/validação do destino é SEMPRE feita aqui — para TODO
      // checkout, inclusive single-seller com a flag desligada — nunca mais
      // condicionada a multiSellerCheckoutEnabled. O fail-closed (erro
      // explícito, nunca fallback para shipping_rates/shipping_zones) é
      // preservado exatamente como estava.
      let destinationShippingSectorId: string | null = targetAddress?.shippingSectorId || null;
      if (!destinationShippingSectorId) {
        const countryRequiresGeography = await countryHasActiveShippingSectors(tx, destinationCountry);
        throw new Error(
          countryRequiresGeography
            ? `DESTINATION_SHIPPING_SECTOR_REQUIRED: O endereço de entrega selecionado não tem um setor de frete definido, e "${destinationCountry}" exige geografia por setor para o checkout inteligente. Selecione/edite o endereço com um setor válido.`
            : `DESTINATION_SHIPPING_SECTOR_REQUIRED: Não há geografia de frete por setor configurada para "${destinationCountry}" ainda — o checkout inteligente (F4/F5) não pode operar nesta região.`
        );
      }

      const verifiedItems: Array<{
        productId: string;
        variantId: string | null;
        productTitle: string;
        productSku: string | null;
        variantTitle: string | null;
        quantity: number;
        unitPrice: number;
        subtotal: number;
        sellerId: string | null;
        storeId: string | null;
        productImage: string | null;
        attributesJson: any;
        inventoryId: string;
        warehouseId: string | null;
        fulfillmentMode: string;
        weightKg: number;
        dimensionsCm?: { length: number; width: number; height: number };
        categoryId: string | null;
        originCountry?: string;
        // FASE D16-F6.2 — snapshots logísticos (0029), preenchidos SOMENTE
        // pelo caminho novo (F4/F3); permanecem undefined (-> NULL no
        // insert) no caminho legado, exatamente como a fase F6.1 exigiu.
        fulfillmentLocationId?: string | null;
        originShippingSectorId?: string | null;
        shippingRouteId?: string | null;
        shippingServiceId?: string | null;
        shippingServiceCode?: string | null;
        shippingRateId?: string | null;
        unitWeightKg?: number | null;
        totalWeightKg?: number | null;
        shippingAmount?: number | null;
      }> = [];

      let primarySellerId: string | null = null;
      let primaryStoreId: string | null = null;

      const whRows: any[] = await tx.select().from(warehouses);
      const whMap = new Map<string, any>(whRows.map((w) => [w.id, w]));

      // Validate products, DB unit prices, and INVENTORY table stock
      for (const ci of itemsInCart) {
        const prodRows = await tx.select().from(products).where(eq(products.id, ci.productId)).limit(1);
        if (prodRows.length === 0) {
          throw new Error(`Produto com ID "${ci.productId}" não foi encontrado no catálogo.`);
        }
        const prod = prodRows[0];

        // Melhoria pré-piloto (elegibilidade por país): portão definitivo,
        // não contornável pelo frontend — usa destinationCountry (já
        // resolvido e validado acima, nunca undefined a partir daqui), não o
        // destino "de navegação" do marketplace. Produto nacional só entrega
        // no próprio país; internacional só nos países que o vendedor
        // autorizou explicitamente. Bloqueia o pedido inteiro (nenhum
        // pedido parcial).
        if (!isProductAvailableForCountry(prod, destinationCountry)) {
          throw new Error(`PRODUCT_NOT_AVAILABLE_FOR_DESTINATION: "${prod.title}" não pode ser entregue em ${destinationCountry}. ${eligibilityReason(prod, destinationCountry)}`);
        }

        // Correção crítica (PAYMENT_CURRENCY_MISMATCH): defesa extra — o
        // marketplace ainda não tem câmbio (FX) autoritativo aprovado, então
        // um pedido só pode ter UMA moeda. addItemToCartForUser já impede
        // misturar moedas no momento de adicionar (CART_MIXED_CURRENCY_NOT_ALLOWED);
        // isto é o portão final, para nunca criar um pedido com item cuja
        // moeda real diverge da moeda do carrinho/pedido.
        if (prod.currency && prod.currency.toUpperCase() !== orderCurrency) {
          throw new Error(`CART_CURRENCY_MISMATCH: O produto "${prod.title}" está em ${prod.currency}, mas o pedido está sendo criado em ${orderCurrency}. O Mercado Nusali ainda não converte moedas — produtos de moedas diferentes não podem ser pagos juntos.`);
        }

        let unitPrice = Number(prod.price);
        let variantTitle: string | null = null;
        let variantSku: string | null = null;
        let itemWeightKg = 0;
        let itemDimensionsCm: { length: number; width: number; height: number } | undefined;

        if ((prod as any).weight) {
          itemWeightKg = Number((prod as any).weight);
        } else if (prod.shippingJson && typeof prod.shippingJson === 'object' && (prod.shippingJson as any).weightKg) {
          itemWeightKg = Number((prod.shippingJson as any).weightKg);
        }
        if (prod.shippingJson && typeof prod.shippingJson === 'object') {
          const sj = prod.shippingJson as any;
          if (sj.lengthCm && sj.widthCm && sj.heightCm) {
            itemDimensionsCm = { length: Number(sj.lengthCm), width: Number(sj.widthCm), height: Number(sj.heightCm) };
          }
        }

        if (ci.variantId) {
          const varRows = await tx.select().from(productVariants).where(eq(productVariants.id, ci.variantId)).limit(1);
          if (varRows.length > 0) {
            const v = varRows[0];
            if (v.price) unitPrice = Number(v.price);
            if (v.weight) itemWeightKg = Number(v.weight);
            variantTitle = v.title || null;
            variantSku = v.sku || null;
          }
        }

        // Requirement 1: Mandatory product weight check (NO 0.5kg fallback)
        if (!itemWeightKg || itemWeightKg <= 0) {
          throw new Error(`PRODUCT_WEIGHT_REQUIRED: O peso do produto "${prod.title}" não foi cadastrado e é obrigatório para cálculo de frete.`);
        }

        const reqQty = Number(ci.quantity) || 1;

        // ==========================================================
        // FASE D16-F6.2 — F4 escolhe UMA ÚNICA origem capaz de atender a
        // quantidade INTEIRA da linha do carrinho (nunca split) por CUSTO
        // REAL de frete (F3), nunca por preferência HUB/STORE. Nenhuma
        // reserva acontece aqui — F4 é só planejamento; a reserva real
        // (F5) só ocorre depois que TODAS as linhas do carrinho já
        // tiverem um plano, em ordem global de lock (seção 5, mais
        // abaixo).
        //
        // FASE D16-I2/D16-I5 — este é o ÚNICO caminho de resolução de
        // item, para TODO checkout, inclusive single-seller com
        // multiSellerCheckoutEnabled desligada. O antigo "caminho legado"
        // (split cego HUB>STORE, sem F4/F3) foi removido fisicamente nesta
        // fase — ficou inalcançável desde D16-I2, confirmado por auditoria
        // (D16-I1) e testado com 0 chamadas ao motor legado (D16-I2/I3).
        // ==========================================================
        if (!prod.sellerId) {
          throw new Error(`ORDER_ITEM_SELLER_REQUIRED: O produto "${prod.title}" não possui vendedor associado — o checkout inteligente exige que todo item tenha um vendedor real.`);
        }

        const f4Result = await resolveFulfillmentCandidates({
          sellerId: prod.sellerId,
          productId: prod.id,
          variantId: ci.variantId || null,
          quantity: reqQty,
          destinationShippingSectorId: destinationShippingSectorId as string,
          countryCode: destinationCountry,
        }, tx);

        if (f4Result.ok === false) {
          const failureCode: string = f4Result.code;
          const failureMessage: string = f4Result.message;
          throw new Error(`FULFILLMENT_RESOLUTION_FAILED: ${failureCode} - ${failureMessage}`);
        }
        const bestCandidate = f4Result.bestCandidate;
        if (!bestCandidate) {
          throw new Error(
            `INSUFFICIENT_AVAILABLE_STOCK: Nenhuma origem de estoque consegue sozinha atender a quantidade solicitada (${reqQty}) do produto "${prod.title}" para o destino selecionado (sem combinar origens nesta fase).`
          );
        }

        const itemSubtotal = unitPrice * reqQty;

        if (!primarySellerId && prod.sellerId) primarySellerId = prod.sellerId;
        if (!primaryStoreId && bestCandidate.storeId) primaryStoreId = bestCandidate.storeId;

        verifiedItems.push({
          productId: prod.id,
          variantId: ci.variantId || null,
          productTitle: prod.title,
          productSku: variantSku || prod.id || null,
          variantTitle,
          quantity: reqQty,
          unitPrice,
          subtotal: itemSubtotal,
          sellerId: prod.sellerId || null,
          storeId: bestCandidate.storeId || null,
          productImage: prod.image || null,
          attributesJson: ci.selectedAttributesJson || null,
          inventoryId: bestCandidate.inventoryId,
          warehouseId: bestCandidate.warehouseId || null,
          fulfillmentMode: bestCandidate.locationType === 'NUSALI_HUB' ? 'NUSALI_FULFILLMENT' : 'SELLER_FULFILLMENT',
          weightKg: itemWeightKg,
          dimensionsCm: itemDimensionsCm,
          categoryId: prod.categoryId || null,
          fulfillmentLocationId: bestCandidate.fulfillmentLocationId,
          originShippingSectorId: bestCandidate.originShippingSectorId,
          shippingRouteId: bestCandidate.routeId,
          shippingServiceId: bestCandidate.serviceId,
          shippingServiceCode: bestCandidate.serviceCode,
          shippingRateId: bestCandidate.rateId,
          unitWeightKg: bestCandidate.unitWeightKg,
          totalWeightKg: bestCandidate.totalWeightKg,
          shippingAmount: bestCandidate.shippingAmount,
        });
      }

      // Fase "Comissão percentual + logística real" (correção pós-relatório):
      // comissão é SEMPRE percentual e calculada POR ITEM — nunca um valor
      // fixo em dinheiro, e o fallback hardcoded de 10% foi REMOVIDO. Cadeia
      // de fallback, do mais específico ao mais genérico:
      //   1) categories.commissionRate (por categoria, GLOBAL_ADMIN)
      //   2) sellers.commissionRate (real, já existente — ver ressalva abaixo)
      //   3) platformSettings.defaultSellerCommissionPercent (GLOBAL_ADMIN,
      //      já existia como configuração exibida no admin, nunca lida por
      //      nenhum cálculo real até a fase anterior — agora é autoridade)
      // Se NENHUM dos três existir para um item: bloqueia o pedido com
      // COMMISSION_NOT_CONFIGURED. Nunca um percentual inventado.
      //
      // CORREÇÃO (Fase 1 Operacional, item 2 — comentário estava desatualizado):
      // um relatório anterior desta mesma fase citou esta ressalva para
      // afirmar que sellers.commissionRate ainda era gravado como '8.00' no
      // cadastro — isso foi verificado (git log -S) e é FALSO desde o commit
      // ae3b4bd ("Corrige comissao percentual e logistica com frete
      // gratis"): tanto authService.ts (cadastro público como SELLER) quanto
      // sellerRoutes.ts (onboarding) já gravam commissionRate: null no
      // INSERT — nenhum default técnico é copiado para o vendedor na
      // criação. sellers.commissionRate só é preenchido quando alguém
      // explicitamente grava um valor ali depois (hoje não há tela
      // admin/seller para isso — se uma for construída no futuro, vazio deve
      // continuar significando NULL, nunca um percentual "de fábrica").
      //
      // FASE B (multi-vendedor) — o bloco abaixo (config compartilhada) é
      // lido UMA VEZ só, independente de quantos vendedores o carrinho tiver
      // — nunca duplicado por seller. O cálculo de comissão/frete/financials
      // em si (que PRECISA ser por vendedor) foi extraído para
      // computeGroupFinancials, reaproveitada tanto pelo caminho legado
      // (1 grupo = o carrinho inteiro) quanto pelo caminho novo (1 grupo por
      // vendedor) — garante que o resultado para 1 vendedor é idêntico,
      // centavo por centavo, nos dois caminhos.
      let globalDefaultCommissionRate: number | null = null;
      const defaultCommissionRows = await tx.select().from(platformSettings).where(eq(platformSettings.key, 'defaultSellerCommissionPercent')).limit(1);
      if (defaultCommissionRows.length > 0) {
        const parsed = Number(defaultCommissionRows[0].valueJson);
        if (!isNaN(parsed) && parsed >= 0) globalDefaultCommissionRate = parsed;
      }

      const categoryIdsInOrder = Array.from(new Set(verifiedItems.map((i) => i.categoryId).filter((c): c is string => Boolean(c))));
      const categoryCommissionMap = new Map<string, number>();
      if (categoryIdsInOrder.length > 0) {
        const catRows = await tx.select().from(categories).where(inArray(categories.id, categoryIdsInOrder));
        for (const c of catRows) {
          if (c.commissionRate !== null && c.commissionRate !== undefined) {
            categoryCommissionMap.set(c.id, Number(c.commissionRate));
          }
        }
      }

      // orderCurrency já foi resolvida e validada no início da transação —
      // reaproveitada aqui (mesmo nome curto usado no resto da função).
      const currency = orderCurrency;

      // Requirement 2: Determine origin from actual inventory allocation (Warehouse/Store) and detect multi-origin
      // FASE B: esta checagem continua sendo feita sobre TODOS os itens do
      // carrinho, independente de vendedor — nunca relaxada. Um checkout
      // multi-vendedor cujos vendedores despacham de países diferentes
      // continua bloqueado exatamente como hoje.
      const itemOrigins = new Set<string>();
      for (const item of verifiedItems) {
        let itemOrigin: string | null = null;
        if (item.warehouseId) {
          const wh = whMap.get(item.warehouseId);
          if (wh?.countryCode) itemOrigin = wh.countryCode.toUpperCase();
        }
        if (!itemOrigin && item.storeId) {
          const stRows = await tx.select().from(stores).where(eq(stores.id, item.storeId)).limit(1);
          if (stRows.length > 0 && stRows[0].countryCode) {
            itemOrigin = stRows[0].countryCode.toUpperCase();
          }
        }
        if (!itemOrigin && item.sellerId) {
          const selRows = await tx.select().from(sellers).where(eq(sellers.id, item.sellerId)).limit(1);
          if (selRows.length > 0 && selRows[0].countryCode) {
            itemOrigin = selRows[0].countryCode.toUpperCase();
          }
        }

        if (!itemOrigin) {
          throw new Error('SHIPPING_ORIGIN_REQUIRED: Não foi possível determinar o país de origem real da mercadoria.');
        }

        item.originCountry = itemOrigin;
        itemOrigins.add(itemOrigin);
      }

      if (itemOrigins.size > 1) {
        throw new Error(
          'MULTI_ORIGIN_SHIPPING_NOT_SUPPORTED: O pedido contém produtos com expedição de múltiplos locais/países de origem diferentes.'
        );
      }

      // multiSellerCheckoutEnabled já foi lida mais acima (antes do loop de
      // itens — FASE D16-F6.2), reaproveitada aqui sem re-consultar.
      // Com a flag desativada, um carrinho com mais de 1 vendedor distinto é
      // rejeitado AQUI — antes de qualquer escrita (nenhum INSERT/UPDATE
      // aconteceu até este ponto) — nunca dividido silenciosamente pelo
      // caminho legado.
      const distinctSellerIds = Array.from(new Set(verifiedItems.map((i) => i.sellerId).filter((s): s is string => Boolean(s))));
      if (!multiSellerCheckoutEnabled && distinctSellerIds.length > 1) {
        throw new Error('MULTI_SELLER_CHECKOUT_DISABLED: Este carrinho contém produtos de mais de um vendedor, e o checkout multi-vendedor ainda não está habilitado nesta plataforma.');
      }

      /**
       * Calcula subtotal/peso/comissão/financials de UM grupo de itens (1
       * vendedor) — NUNCA escreve nada, só lê (sellers.commissionRate). O
       * frete em si (freightRes) já vem PRONTO de
       * computeSmartFulfillmentFreightRes (soma de cotações F3 reais já
       * resolvidas por item via F4 + resolveShippingPayerPolicy) — nunca
       * recalculado aqui.
       *
       * FASE D16-I5 — simplificada: `freightRes` deixou de ser opcional. O
       * fallback ao motor legado (ShippingCalculatorService.calculateFreight
       * via shipping_rates/shipping_zones) foi removido fisicamente — desde
       * D16-I2 o único chamador desta função já sempre fornecia o resultado
       * smart, tornando o fallback inalcançável (confirmado por auditoria
       * D16-I1 e testes D16-I2/I3 com 0 chamadas ao motor legado).
       */
      async function computeGroupFinancials(
        items: typeof verifiedItems,
        groupSellerId: string | null,
        freightRes: Awaited<ReturnType<typeof computeSmartFulfillmentFreightRes>>
      ) {
        const groupSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
        const groupStoreId = items.find((i) => i.storeId)?.storeId || null;

        let groupSellerCommissionRate: number | null = null;
        if (groupSellerId) {
          const sellerRows = await tx.select().from(sellers).where(eq(sellers.id, groupSellerId)).limit(1);
          if (sellerRows.length > 0 && sellerRows[0].commissionRate !== null && sellerRows[0].commissionRate !== undefined) {
            groupSellerCommissionRate = Number(sellerRows[0].commissionRate);
          }
        }
        // Autoridade do seller, na ausência de comissão específica por categoria.
        const groupFallbackRate = groupSellerCommissionRate ?? globalDefaultCommissionRate;

        let groupCommission = 0;
        for (const item of items) {
          const categoryRate = item.categoryId ? categoryCommissionMap.get(item.categoryId) : undefined;
          const effectiveRate = categoryRate !== undefined ? categoryRate : groupFallbackRate;
          if (effectiveRate === null || effectiveRate === undefined) {
            throw new Error(
              `COMMISSION_NOT_CONFIGURED: Não há comissão configurada (nem por categoria, nem por vendedor, nem padrão da plataforma) para o produto "${item.productTitle}". Pedido bloqueado — configure a comissão antes de vender este item.`
            );
          }
          groupCommission += Math.round((item.subtotal * (effectiveRate / 100)) * 100) / 100;
        }
        groupCommission = Math.round(groupCommission * 100) / 100;

        const groupFreightRes = freightRes;

        if (!groupFreightRes.available) {
          throw new Error(
            `SHIPPING_RATE_NOT_AVAILABLE: ${groupFreightRes.errorMessage || 'Frete indisponível para esta localização. Pedido cancelado.'}`
          );
        }

        const groupFinancials = ShippingCalculatorService.calculateOrderFinancials({
          productSubtotal: groupSubtotal,
          shippingCost: groupFreightRes.shippingCost,
          shippingChargedToBuyer: groupFreightRes.shippingChargedToBuyer,
          shippingSellerSubsidy: groupFreightRes.shippingSellerSubsidy,
          shippingMarketplaceSubsidy: groupFreightRes.shippingMarketplaceSubsidy,
          // Nunca usado de fato: precomputedCommissionAmount abaixo já é o
          // valor real (por item, validado — pedido teria sido bloqueado por
          // COMMISSION_NOT_CONFIGURED se algum item não tivesse comissão).
          // Só serve de fallback teórico se commissionBase for <= 0.
          commissionRatePercent: groupFallbackRate ?? 0,
          precomputedCommissionAmount: groupCommission,
          customsDuty: 0,
          buyerDiscounts: 0,
        });

        return { financials: groupFinancials, freightRes: groupFreightRes, storeId: groupStoreId };
      }

      /**
       * FASE D16-F6.2 — RATE SOURCE = F3 (soma das cotações reais já
       * resolvidas por item pelo F4, cada uma na origem efetivamente
       * escolhida), PAYER POLICY = a MESMA regra existente
       * (resolveShippingPayerPolicy, reaproveitada de shippingCalculatorService.ts
       * sem nenhuma alteração de comportamento) — nunca uma segunda política
       * divergente. Produz o objeto que computeGroupFinancials/insertOrderRow
       * consomem, sem precisarem saber a origem (tipo inferido pelo próprio
       * `return` abaixo — FASE D16-I5: já não existe mais um segundo formato
       * legado, ShippingCalculatorService.calculateFreight, para espelhar).
       */
      async function computeSmartFulfillmentFreightRes(
        items: typeof verifiedItems,
        groupStoreId: string | null,
        groupSellerId: string | null
      ) {
        const shippingCost = Math.round(items.reduce((s, i) => s + (Number(i.shippingAmount) || 0), 0) * 100) / 100;
        const policy = await resolveShippingPayerPolicy(shippingCost, { storeId: groupStoreId, sellerId: groupSellerId }, tx);
        return {
          shippingCost,
          shippingChargedToBuyer: policy.shippingChargedToBuyer,
          shippingSellerSubsidy: policy.shippingSellerSubsidy,
          shippingMarketplaceSubsidy: policy.shippingMarketplaceSubsidy,
          shippingPayer: policy.shippingPayer,
          policyMode: policy.policyMode,
          estimatedMinDays: 0,
          estimatedMaxDays: 0,
          // Distinto de qualquer rateSource legado ('ZONE_SPECIFIC'/'INTERNAL_ZONE')
          // de propósito — nunca usar orders.shippingRateId legado para
          // representar F3 (o rastro real por item vive em
          // order_items.shippingRateId, um por origem).
          rateSource: 'F3_SECTOR_ROUTE',
          rateId: undefined,
          currency,
          available: true,
          // Nunca de fato undefined (available é sempre true aqui) — só para
          // que o tipo inferido tenha o mesmo formato de campo opcional que
          // o guard de computeGroupFinancials (`groupFreightRes.errorMessage`)
          // já espera, sem precisar de um segundo tipo/interface só para isso.
          errorMessage: undefined as string | undefined,
        };
      }

      /** Insere APENAS a linha de `orders` do grupo — nunca decide valores, só persiste. */
      async function insertOrderRow(
        groupSellerId: string | null,
        groupStoreId: string | null,
        financials: ReturnType<typeof ShippingCalculatorService.calculateOrderFinancials>,
        freightRes: Awaited<ReturnType<typeof computeSmartFulfillmentFreightRes>>,
        purchaseGroupId: string | null
      ): Promise<{ orderId: string; orderNumber: string }> {
        const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const orderNumber = `NSL-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

        await tx.insert(orders).values({
          id: orderId,
          orderNumber,
          buyerId: userId,
          sellerId: groupSellerId,
          storeId: groupStoreId,
          purchaseGroupId,
          subtotal: String(financials.productSubtotal),
          shippingFee: String(financials.shippingChargedToBuyer),
          shippingCost: String(financials.shippingCost),
          shippingChargedToBuyer: String(financials.shippingChargedToBuyer),
          shippingSellerSubsidy: String(financials.shippingSellerSubsidy),
          shippingMarketplaceSubsidy: String(financials.shippingMarketplaceSubsidy),
          shippingPayer: freightRes.shippingPayer,
          shippingRateSource: freightRes.rateSource,
          shippingRateId: freightRes.rateId || null,
          commissionRateSnapshot: String(financials.commissionRateSnapshot),
          commissionBase: String(financials.commissionBase),
          marketplaceCommission: String(financials.marketplaceCommission),
          sellerNetAmount: String(financials.sellerNetAmount),
          discountAmount: '0.00',
          customsDuty: '0.00',
          totalAmount: String(financials.buyerPaidTotal),
          currency,
          status: 'pending_payment',
          paymentMethod: paymentMethod || null,
          paymentStatus: 'pending',
          escrowStatus: 'pending',
          shippingAddressJson: targetAddress,
          billingAddressJson: targetAddress,
          countryCode: destinationCountry,
          notes: notes || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        return { orderId, orderNumber };
      }

      /**
       * Insere order_items do grupo — SOMENTE os itens deste grupo (nunca de
       * outro vendedor). Os 9 campos de snapshot logístico (D16-F6.1) vêm do
       * próprio `item` (preenchidos pelo F4/F5 no caminho novo; `undefined`
       * -> NULL no caminho legado, exatamente como F6.1 exigiu — nenhum
       * reread de catálogo/tarifa depois do fato).
       */
      async function insertOrderItemsForGroup(orderId: string, items: typeof verifiedItems) {
        for (const item of items) {
          if (!item.inventoryId || !item.fulfillmentMode) {
            throw new Error(`ALLOCATION_FAILED: Origem de estoque (inventory_id) não alocada para o item "${item.productTitle}".`);
          }

          await tx.insert(orderItems).values({
            id: `oi_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            orderId,
            productId: item.productId,
            variantId: item.variantId,
            productTitle: item.productTitle,
            productSku: item.productSku,
            variantTitle: item.variantTitle,
            quantity: item.quantity,
            unitPrice: String(item.unitPrice),
            subtotal: String(item.subtotal),
            sellerId: item.sellerId,
            storeId: item.storeId,
            productImage: item.productImage,
            attributesJson: item.attributesJson,
            inventoryId: item.inventoryId,
            warehouseId: item.warehouseId,
            fulfillmentMode: item.fulfillmentMode,
            status: 'pending_preparation',
            createdAt: new Date(),
            fulfillmentLocationId: item.fulfillmentLocationId ?? null,
            originShippingSectorId: item.originShippingSectorId ?? null,
            shippingRouteId: item.shippingRouteId ?? null,
            shippingServiceId: item.shippingServiceId ?? null,
            shippingServiceCode: item.shippingServiceCode ?? null,
            shippingRateId: item.shippingRateId ?? null,
            unitWeightKg: item.unitWeightKg != null ? String(item.unitWeightKg) : null,
            totalWeightKg: item.totalWeightKg != null ? String(item.totalWeightKg) : null,
            shippingAmount: item.shippingAmount != null ? String(item.shippingAmount) : null,
          } as any);
        }
      }

      /** Insere a linha única de orderStatusHistory de criação do pedido. */
      async function insertOrderStatusHistoryRow(orderId: string) {
        await tx.insert(orderStatusHistory).values({
          id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          orderId,
          previousStatus: null,
          newStatus: 'pending_payment',
          reason: 'Pedido criado no checkout aguardando pagamento.',
          changedBy: userId,
          createdAt: new Date(),
        });
      }

      /** Monta o objeto de retorno de UM order filho — nunca decide valores, só projeta. */
      function buildCreatedOrderResult(
        orderId: string,
        orderNumber: string,
        groupSellerId: string | null,
        financials: ReturnType<typeof ShippingCalculatorService.calculateOrderFinancials>,
        items: typeof verifiedItems,
        purchaseGroupId: string | null
      ) {
        return {
          id: orderId,
          orderNumber,
          buyerId: userId,
          sellerId: groupSellerId,
          subtotal: financials.productSubtotal,
          shippingFee: financials.shippingChargedToBuyer,
          shippingCost: financials.shippingCost,
          shippingSellerSubsidy: financials.shippingSellerSubsidy,
          shippingMarketplaceSubsidy: financials.shippingMarketplaceSubsidy,
          marketplaceCommission: financials.marketplaceCommission,
          sellerNetAmount: financials.sellerNetAmount,
          totalAmount: financials.buyerPaidTotal,
          currency,
          status: 'pending_payment',
          paymentMethod: paymentMethod || null,
          paymentStatus: 'pending',
          escrowStatus: 'pending',
          shippingAddress: targetAddress,
          items,
          purchaseGroupId,
          createdAt: new Date().toISOString(),
        };
      }

      let createdOrders: any[];
      let purchaseGroupResult: { id: string; buyerId: string; currency: string; totalAmount: number; status: string } | null = null;

      // FASE D16-I2 — o pipeline smart (F4/F5 + purchase_group) é usado
      // para TODO checkout, inclusive single-seller com
      // multiSellerCheckoutEnabled desligada — "1 purchase_group +
      // exatamente 1 order por vendedor distinto, mesmo quando há só 1
      // vendedor", nunca uma terceira estrutura. O único papel da flag é a
      // checagem MULTI_SELLER_CHECKOUT_DISABLED já feita mais acima, antes
      // de qualquer escrita.
      // FASE D16-I5 — o branch legado (single order, sem purchase_group,
      // motor de frete país/zona) foi removido fisicamente: estava
      // inalcançável desde D16-I2 (auditoria D16-I1, testado com 0
      // chamadas ao motor legado em D16-I2/I3).
      {
        const missingSeller = verifiedItems.find((i) => !i.sellerId);
        if (missingSeller) {
          throw new Error(`ORDER_ITEM_SELLER_REQUIRED: O produto "${missingSeller.productTitle}" não possui vendedor associado — checkout multi-vendedor exige que todo item tenha um vendedor real.`);
        }

        const bySeller = new Map<string, typeof verifiedItems>();
        for (const item of verifiedItems) {
          const key = item.sellerId as string;
          if (!bySeller.has(key)) bySeller.set(key, []);
          bySeller.get(key)!.push(item);
        }

        // Fase 1: calcula (somente leitura) o financeiro de CADA vendedor
        // ANTES de qualquer escrita — precisamos da soma para criar o
        // purchase_group já com o total certo. FASE D16-F6.2: quando o
        // fluxo é smart fulfillment (todo item já carrega .shippingAmount
        // do F4), o frete do grupo é a SOMA das cotações F3 reais + a
        // MESMA política de pagador de sempre — nunca o motor legado.
        const groupComputations: Array<{
          sellerId: string;
          items: typeof verifiedItems;
          storeId: string | null;
          financials: ReturnType<typeof ShippingCalculatorService.calculateOrderFinancials>;
          freightRes: Awaited<ReturnType<typeof computeSmartFulfillmentFreightRes>>;
        }> = [];
        for (const [sellerId, items] of bySeller) {
          const groupStoreId = items.find((i) => i.storeId)?.storeId || null;
          const smartFreightRes = await computeSmartFulfillmentFreightRes(items, groupStoreId, sellerId);
          const { financials, freightRes, storeId } = await computeGroupFinancials(items, sellerId, smartFreightRes);
          groupComputations.push({ sellerId, items, storeId, financials, freightRes });
        }

        // SUM(order.totalAmount) = purchase_group.totalAmount por construção
        // (soma dos MESMOS valores já arredondados que viram cada order) —
        // arredondado de novo só para eliminar ruído de ponto flutuante da
        // soma em si (nunca recalcula nenhum valor de order).
        const purchaseGroupTotal = Math.round(groupComputations.reduce((s, g) => s + g.financials.buyerPaidTotal, 0) * 100) / 100;
        const purchaseGroupId = `pgrp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        await tx.insert(purchaseGroups).values({
          id: purchaseGroupId,
          buyerId: userId,
          currency,
          totalAmount: String(purchaseGroupTotal),
          status: 'pending_payment',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // ==========================================================
        // FASE D16-F6.2, seções 4/5/6/7/8 — sequência exigida:
        //   B. criar TODOS os child orders primeiro (F5 exige orderId
        //      real por FK em stock_reservations — auditado em F6.0).
        //   (dup) falha fechado se 2 linhas do MESMO order apontarem
        //      para o MESMO inventoryId — nunca combina silenciosamente.
        //   C. reservar via F5 em UMA lista GLOBAL (todos os vendedores
        //      juntos), ordenada por inventoryId ASC lexicográfico —
        //      evita deadlock entre 2 checkouts concorrentes com a MESMA
        //      dupla de inventories em ordem inversa no carrinho.
        //   D. se qualquer F5 falhar -> throw aqui propaga para fora do
        //      db.transaction() e reverte TUDO (orders inclusive, nunca
        //      commitados) — nunca split, nunca troca de candidate no
        //      meio de um plano já parcialmente reservado.
        //   E. só DEPOIS que TODAS as reservas tiverem sucesso, inserir
        //      order_items finais + orderStatusHistory.
        // ==========================================================
        const groupOrderRows: Array<{
          sellerId: string;
          items: typeof verifiedItems;
          financials: ReturnType<typeof ShippingCalculatorService.calculateOrderFinancials>;
          orderId: string;
          orderNumber: string;
        }> = [];
        for (const g of groupComputations) {
          const { orderId, orderNumber } = await insertOrderRow(g.sellerId, g.storeId, g.financials, g.freightRes, purchaseGroupId);
          groupOrderRows.push({ sellerId: g.sellerId, items: g.items, financials: g.financials, orderId, orderNumber });
        }

        type PlannedReservation = {
          orderId: string;
          sellerId: string;
          productId: string;
          variantId: string | null;
          inventoryId: string;
          fulfillmentLocationId: string;
          quantity: number;
        };
        const globalReservationPlan: PlannedReservation[] = [];
        for (const g of groupOrderRows) {
          const seenInventoryIds = new Set<string>();
          for (const item of g.items) {
            if (!item.inventoryId) {
              throw new Error(`ALLOCATION_FAILED: Origem de estoque (inventory_id) não alocada para o item "${item.productTitle}".`);
            }
            if (seenInventoryIds.has(item.inventoryId)) {
              throw new Error(
                `DUPLICATE_INVENTORY_IN_ORDER: Mais de uma linha deste pedido aponta para a mesma origem de estoque (inventoryId=${item.inventoryId}) — combinação automática de linhas não é suportada nesta implementação.`
              );
            }
            seenInventoryIds.add(item.inventoryId);
            if (!item.fulfillmentLocationId) {
              throw new Error(`ALLOCATION_FAILED: fulfillmentLocationId ausente para o item "${item.productTitle}" (esperado do planejamento F4).`);
            }
            globalReservationPlan.push({
              orderId: g.orderId,
              sellerId: item.sellerId as string,
              productId: item.productId,
              variantId: item.variantId,
              inventoryId: item.inventoryId,
              fulfillmentLocationId: item.fulfillmentLocationId,
              quantity: item.quantity,
            });
          }
        }

        // Ordem global de lock — mesma chave (inventoryId ASC) para
        // QUALQUER checkout concorrente, independentemente da ordem dos
        // itens no carrinho de cada comprador. Nunca reserva imediatamente
        // na ordem do carrinho (risco de deadlock documentado em F6.0).
        globalReservationPlan.sort((a, b) => (a.inventoryId < b.inventoryId ? -1 : a.inventoryId > b.inventoryId ? 1 : 0));

        for (const planned of globalReservationPlan) {
          // CRÍTICO: EXCLUSIVAMENTE o `tx` real desta transação — nunca
          // `db`/getDb() — para que F5 NUNCA abra sua própria transaction
          // durante o checkout (contrato já validado em F5/F5.1).
          const reservation = await reserveFulfillmentInventory({
            orderId: planned.orderId,
            sellerId: planned.sellerId,
            productId: planned.productId,
            variantId: planned.variantId,
            inventoryId: planned.inventoryId,
            fulfillmentLocationId: planned.fulfillmentLocationId,
            quantity: planned.quantity,
          }, tx);

          if (reservation.ok === false) {
            // Concorrência real: outra transação consumiu a candidate entre
            // o planejamento (F4) e a reserva (F5). Nunca continua com as
            // demais, nunca faz split, nunca troca de candidate no meio de
            // um plano já parcialmente reservado — propaga e deixa o
            // db.transaction() reverter TUDO (orders inclusive). O caller
            // pode tentar de novo do zero; F4 planejará com o estoque
            // já atualizado.
            const conflictCode: string = reservation.code;
            const conflictMessage: string = reservation.message;
            throw new Error(`FULFILLMENT_RESERVATION_CONFLICT: ${conflictCode} - ${conflictMessage}`);
          }
        }

        createdOrders = [];
        for (const g of groupOrderRows) {
          await insertOrderItemsForGroup(g.orderId, g.items);
          await insertOrderStatusHistoryRow(g.orderId);
          createdOrders.push(buildCreatedOrderResult(g.orderId, g.orderNumber, g.sellerId, g.financials, g.items, purchaseGroupId));
        }

        purchaseGroupResult = {
          id: purchaseGroupId,
          buyerId: userId,
          currency,
          totalAmount: purchaseGroupTotal,
          status: 'pending_payment',
        };
      }

      // Clear cart items AFTER all order(s) do checkout foram criados com sucesso.
      await tx.delete(cartItems).where(eq(cartItems.cartId, userCart.id));

      logger.info(
        { orderIds: createdOrders.map((o) => o.id), purchaseGroupId: purchaseGroupResult?.id || null, total: createdOrders.reduce((s, o) => s + o.totalAmount, 0) },
        'Order(s) created successfully in PostgreSQL'
      );

      if (!purchaseGroupResult) {
        // Caminho legado: MESMOS campos de sempre (nenhum removido, nenhum
        // consumidor existente quebra) + `mode: 'legacy'` ADICIONADO (Fase
        // M1-D1) — discriminante explícito puramente aditivo, para que um
        // consumidor NOVO nunca precise adivinhar pela ausência de
        // `purchaseGroup`/`orders`.
        return { ...createdOrders[0], mode: 'legacy' as const };
      }

      // Caminho novo: mantém compatibilidade retroativa (todos os campos do
      // PRIMEIRO order, no nível raiz, exatamente como no formato antigo) e
      // ADICIONA mode/purchaseGroup/orders — consumidores que ainda ignoram
      // esses campos extras continuam funcionando sem nenhuma alteração.
      return {
        ...createdOrders[0],
        mode: 'purchase_group' as const,
        purchaseGroup: purchaseGroupResult,
        orders: createdOrders,
      };
    });
  }

  private static async buildEnrichedOrder(db: any, ord: any) {
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, ord.id));
    const shpList = await db.select().from(shipments).where(eq(shipments.orderId, ord.id));

    // Correção (fechamento da fase de logística — item 2): a transportadora
    // persistente (carrierId -> carriers.name) nunca era resolvida aqui,
    // então GET /buyer/orders/:id e GET /orders/:id sempre mostravam o
    // texto legado (quase sempre null para shipments novos). Resolução
    // central via carrierResolver.ts — mesma regra usada por
    // shipmentService.ts, nunca reimplementada aqui.
    const carrierMap = await resolveCarrierNames(db, shpList.map((s: any) => s.carrierId));

    const shpWithEvents = await Promise.all(
      shpList.map(async (s: any) => {
        const events = await db
          .select()
          .from(trackingEvents)
          .where(eq(trackingEvents.shipmentId, s.id))
          .orderBy(asc(trackingEvents.eventTime));
        return {
          ...s,
          carrier: pickCarrierName(s.carrierId, s.carrier, carrierMap),
          trackingEvents: events,
        };
      })
    );

    // Fase "Experiência real do comprador pós-entrega": releaseEligibleAt é do
    // escrow do PEDIDO (nunca duplicado por shipment) — backend é a única
    // fonte de verdade, o frontend nunca calcula "deliveredAt + 48h" sozinho.
    // Só expõe o que já existe: nenhum valor é inventado se releaseEligibleAt
    // ainda for NULL (histórico ou pedido não inscrito no auto-release).
    const [escrowRow] = await db.select({
      status: escrowAccounts.status,
      releaseEligibleAt: escrowAccounts.releaseEligibleAt,
    }).from(escrowAccounts).where(eq(escrowAccounts.orderId, ord.id)).limit(1);

    // Disputa ativa (open/in_mediation) — mesma regra de bloqueio já usada por
    // releaseEscrowForOrder. Só os campos necessários para a UI acompanhar a
    // disputa; nunca expõe dados de outros usuários.
    const [activeDisputeRow] = await db.select({
      id: disputes.id,
      status: disputes.status,
      reason: disputes.reason,
      createdAt: disputes.createdAt,
    }).from(disputes).where(and(eq(disputes.orderId, ord.id), inArray(disputes.status, ['open', 'in_mediation']))).limit(1);

    const primaryShipment = shpWithEvents[0] || null;

    // Fase M1-D3 — regra idêntica à anterior, agora via helper compartilhado
    // deriveLogisticsStatus (reaproveitado por getPurchaseGroupById).
    const derivedLogisticsStatus = deriveLogisticsStatus(shpWithEvents.map((s) => s.status), ord.status);

    return {
      ...ord,
      totalAmount: Number(ord.totalAmount),
      total: Number(ord.totalAmount),
      subtotal: Number(ord.subtotal),
      shippingFee: Number(ord.shippingFee),
      shipment: primaryShipment,
      shipments: shpWithEvents,
      trackingCode: primaryShipment?.trackingNumber || ord.trackingCode || null,
      // primaryShipment.carrier já vem resolvido (carrierId -> carriers.name,
      // fallback texto legado) — ver bloco acima, nunca uma segunda lógica.
      carrier: primaryShipment?.carrier || null,
      carrierId: primaryShipment?.carrierId || null,
      logisticsStatus: derivedLogisticsStatus,
      // releaseEligibleAt é do escrow/pedido — nunca duplicado por shipment.
      // NULL continua sendo NULL (histórico ou não inscrito no auto-release);
      // o frontend nunca deve tratar NULL como "vencido" nem calcular um
      // prazo por conta própria.
      releaseEligibleAt: escrowRow?.releaseEligibleAt || null,
      activeDispute: activeDisputeRow
        ? {
            id: activeDisputeRow.id,
            status: activeDisputeRow.status,
            reason: activeDisputeRow.reason,
            createdAt: activeDisputeRow.createdAt,
          }
        : null,
      items: items.map((i: any) => ({
        ...i,
        unitPrice: Number(i.unitPrice),
        subtotal: Number(i.subtotal),
      })),
    };
  }

  static async getOrdersByBuyer(buyerId: string) {
    const db = getDb();
    if (!db) return [];

    const orderList = await db.select().from(orders).where(eq(orders.buyerId, buyerId)).orderBy(desc(orders.createdAt));

    const ordersWithDetails = await Promise.all(
      orderList.map((ord) => this.buildEnrichedOrder(db, ord))
    );

    return ordersWithDetails;
  }

  static async getOrderById(orderId: string) {
    const db = getDb();
    if (!db) return null;

    const orderRows = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (orderRows.length === 0) return null;

    return await this.buildEnrichedOrder(db, orderRows[0]);
  }

  /**
   * Fase M1-D1 — leitura READ-ONLY de um purchase_group para reload/recarregar
   * a tela de confirmação multi-seller (ex.: /purchase-groups/:id/confirmation).
   * Ownership NÃO é checada aqui (mesmo padrão de getOrderById/getOrderById
   * acima — quem chama decide o que fazer com `group.buyerId`; a rota
   * buyerRoutes.ts é quem recusa acesso a um group de outro buyer).
   *
   * Deliberadamente NUNCA inclui: providerRawResponse, idempotencyKey,
   * qrCode/qrCodeBase64/pix (esses só existem na resposta do PRÓPRIO
   * initiatePurchaseGroupPayment, que já é idempotente e re-chamável em caso
   * de reload — nenhuma duplicação de fonte de verdade aqui), nem qualquer
   * campo de wallet/escrow interno.
   */
  static async getPurchaseGroupById(purchaseGroupId: string) {
    const db = getDb();
    if (!db) return null;

    const groupRows = await db.select().from(purchaseGroups).where(eq(purchaseGroups.id, purchaseGroupId)).limit(1);
    const group = groupRows[0];
    if (!group) return null;

    const childOrders = await db.select().from(orders).where(eq(orders.purchaseGroupId, purchaseGroupId)).orderBy(asc(orders.createdAt));
    const orderIds = childOrders.map((o: any) => o.id);
    const sellerIds = [...new Set(childOrders.map((o: any) => o.sellerId).filter((id: any): id is string => !!id))];

    const [itemRows, sellerRows, paymentRows, shipmentRows, activeDisputeRows] = await Promise.all([
      orderIds.length > 0
        ? db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds))
        : Promise.resolve([]),
      sellerIds.length > 0
        ? db.select({ id: sellers.id, companyName: sellers.companyName, tradingName: sellers.tradingName }).from(sellers).where(inArray(sellers.id, sellerIds))
        : Promise.resolve([]),
      db.select().from(payments).where(eq(payments.purchaseGroupId, purchaseGroupId)).orderBy(desc(payments.createdAt)),
      // Fase M1-D3 — status de entrega POR child (cada pedido do group tem
      // shipments independentes). READ-ONLY, nenhum efeito financeiro.
      orderIds.length > 0
        ? db.select({ orderId: shipments.orderId, status: shipments.status, trackingNumber: shipments.trackingNumber }).from(shipments).where(inArray(shipments.orderId, orderIds))
        : Promise.resolve([]),
      orderIds.length > 0
        ? db.select({ orderId: disputes.orderId }).from(disputes).where(and(inArray(disputes.orderId, orderIds), inArray(disputes.status, ['open', 'in_mediation'])))
        : Promise.resolve([]),
    ]);

    const itemsByOrder = new Map<string, any[]>();
    for (const item of itemRows as any[]) {
      const list = itemsByOrder.get(item.orderId) || [];
      list.push({
        id: item.id,
        productId: item.productId,
        productTitle: item.productTitle,
        productImage: item.productImage,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
      });
      itemsByOrder.set(item.orderId, list);
    }
    const sellerNameById = new Map<string, string>((sellerRows as any[]).map((s) => [s.id, s.tradingName || s.companyName]));

    const shipmentsByOrder = new Map<string, { status: string | null; trackingNumber: string | null }[]>();
    for (const s of shipmentRows as any[]) {
      const list = shipmentsByOrder.get(s.orderId) || [];
      list.push({ status: s.status, trackingNumber: s.trackingNumber });
      shipmentsByOrder.set(s.orderId, list);
    }
    const orderIdsWithActiveDispute = new Set<string>((activeDisputeRows as any[]).map((d) => d.orderId));

    const ordersOut = (childOrders as any[]).map((o) => {
      const shp = shipmentsByOrder.get(o.id) || [];
      return {
        id: o.id,
        orderNumber: o.orderNumber,
        sellerId: o.sellerId,
        sellerName: o.sellerId ? sellerNameById.get(o.sellerId) || null : null,
        status: o.status,
        paymentStatus: o.paymentStatus,
        escrowStatus: o.escrowStatus,
        // Fase M1-D3 — status de entrega consolidado deste child (mesma
        // regra de buildEnrichedOrder) + rastreio + flag de disputa ativa.
        // A tela de confirmação NUNCA agrega esses status de forma
        // persistente nem os usa para dinheiro (só apresentação).
        logisticsStatus: deriveLogisticsStatus(shp.map((s) => s.status), o.status),
        trackingCode: shp.find((s) => s.trackingNumber)?.trackingNumber || o.trackingCode || null,
        hasActiveDispute: orderIdsWithActiveDispute.has(o.id),
        totalAmount: Number(o.totalAmount),
        currency: o.currency,
        createdAt: o.createdAt,
        items: itemsByOrder.get(o.id) || [],
      };
    });

    // Estado de pagamento MÍNIMO — nunca o provider raw response, nunca a
    // idempotencyKey, nunca o QR (ver nota da função). Prioriza o payment
    // 'primary' (financiamento real do group) sobre um 'candidate' antigo.
    const primaryPayment = (paymentRows as any[]).find((p) => p.settlementRole === 'primary') || (paymentRows as any[])[0] || null;
    const payment = primaryPayment
      ? {
          status: primaryPayment.status as string,
          provider: primaryPayment.provider as string | null,
          method: primaryPayment.method as string,
          processing: primaryPayment.provider === 'asaas' && !primaryPayment.transactionRef && primaryPayment.status === 'pending',
        }
      : null;

    return {
      id: group.id,
      buyerId: group.buyerId,
      currency: group.currency,
      totalAmount: Number(group.totalAmount),
      status: group.status,
      createdAt: group.createdAt,
      orders: ordersOut,
      payment,
    };
  }

  static async confirmDelivery(orderId: string, userId: string, shipmentId?: string) {
    await ShipmentService.confirmDeliveryByBuyer(orderId, userId, shipmentId);
    return this.getOrderById(orderId);
  }

  static async cancelOrder(orderId: string, userId: string, reason?: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const ordRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRes.length === 0) throw new Error('Pedido não encontrado.');

    const ord = ordRes[0];
    if (ord.buyerId !== userId) {
      throw new Error('Você não tem permissão para cancelar este pedido.');
    }

    if (ord.status === 'shipped' || ord.status === 'delivered') {
      throw new Error('Pedido entregue ou em transporte não pode ser cancelado.');
    }

    await db.transaction(async (tx) => {
      await tx
        .update(orders)
        .set({
          status: 'cancelled',
          escrowStatus: 'refunded',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId));

      await tx.insert(orderStatusHistory).values({
        id: `osh_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        orderId,
        previousStatus: ord.status,
        newStatus: 'cancelled',
        reason: reason || 'Pedido cancelado pelo comprador.',
        changedBy: userId,
        createdAt: new Date(),
      });

      // Libera as reservas ativas do pedido usando o inventoryId EXATO já
      // persistido em cada stockReservations row — nunca "qualquer
      // inventory" por productId/variantId (bug corrigido: quando o mesmo
      // produto tem mais de uma linha de inventory, ex.: SELLER_LOCATION +
      // NUSALI_HUB, buscar pelo par productId/variantId e pegar a primeira
      // linha podia liberar a reserva na localização física errada).
      // InventoryService.releaseStock() já é a implementação correta (usa
      // res.inventoryId diretamente) e aceita `tx` como executor, então
      // roda dentro desta mesma transação sem duplicar lógica.
      await InventoryService.releaseStock(orderId, tx);
    });

    return this.getOrderById(orderId);
  }

  static async trackOrder(orderId: string, userId: string) {
    const db = getDb();
    if (!db) throw new Error('Banco de dados indisponível.');

    const ordRes = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (ordRes.length === 0) throw new Error('Pedido não encontrado.');

    const ord = ordRes[0];
    if (ord.buyerId !== userId) {
      throw new Error('Você não tem permissão para rastrear este pedido.');
    }

    const [history, shipmentRows, items] = await Promise.all([
      db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, orderId))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db.select().from(shipments).where(eq(shipments.orderId, orderId)),
      db.select().from(orderItems).where(eq(orderItems.orderId, orderId)),
    ]);

    const shipmentIds = shipmentRows.map(s => s.id);
    let events: any[] = [];
    if (shipmentIds.length > 0) {
      events = await db
        .select()
        .from(trackingEvents)
        .where(inArray(trackingEvents.shipmentId, shipmentIds))
        .orderBy(desc(trackingEvents.eventTime));
    }

    const addressJson = (ord.shippingAddressJson as any) || {};
    const city = addressJson.city || null;
    const country = addressJson.country || addressJson.countryCode || null;
    const destination = city && country ? `${city}, ${country}` : city || country || null;

    // Correção (fechamento da fase de logística — item 3): mesma resolução
    // central de carrierResolver.ts — nunca uma segunda lógica divergente.
    // trackingEvents (events/shpEvents abaixo) não é tocado por esta correção.
    const carrierMap = await resolveCarrierNames(db, shipmentRows.map((s: any) => s.carrierId));

    const packages = shipmentRows.map(shp => {
      const shpEvents = events.filter(e => e.shipmentId === shp.id);
      const matchedItem = items.find(i => i.id === shp.orderItemId || i.shipmentId === shp.id);
      return {
        id: shp.id,
        trackingNumber: shp.trackingNumber,
        carrier: pickCarrierName(shp.carrierId, shp.carrier, carrierMap),
        carrierId: shp.carrierId || null,
        status: shp.status,
        fulfillmentMode: shp.fulfillmentMode,
        productTitle: matchedItem?.productTitle || null,
        quantity: matchedItem?.quantity || 1,
        shippedAt: shp.shippedAt,
        deliveredAt: shp.deliveredAt,
        events: shpEvents.map(e => ({
          status: e.status,
          description: e.description,
          location: e.location,
          eventTime: e.eventTime,
        })),
      };
    });

    return {
      orderId: ord.id,
      orderNumber: ord.orderNumber,
      status: ord.status,
      destination,
      packages,
      timeline: history.map((h) => ({
        status: h.newStatus,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
    };
  }

  static async syncOrderFulfillmentStatus(orderId: string, executor?: any) {
    return syncOrderFulfillmentStatus(orderId, executor);
  }
}

export async function syncOrderFulfillmentStatus(orderId: string, executor?: any) {
  const db = executor || getDb();
  if (!db) return;

  const currentOrder = await db
    .select({ id: orders.id, status: orders.status, paymentStatus: orders.paymentStatus })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (currentOrder.length === 0) return;
  const ord = currentOrder[0];

  const items = await db
    .select({ id: orderItems.id, status: orderItems.status })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  if (items.length === 0) return;

  const statuses = items.map((i) => i.status || 'pending_preparation');

  const allCancelled = statuses.every((s) => s === 'cancelled');
  const allShipped = statuses.every((s) => s === 'shipped');
  const anyShipped = statuses.some((s) => s === 'shipped');
  const nonCancelledStatuses = statuses.filter((s) => s !== 'cancelled');
  const allNonCancelledReady =
    nonCancelledStatuses.length > 0 && nonCancelledStatuses.every((s) => s === 'ready_to_ship');
  const anyPreparingOrReady = statuses.some((s) => s === 'preparing' || s === 'ready_to_ship');
  const allPending = statuses.every((s) => s === 'pending_preparation');

  let derivedStatus: string = ord.status;

  if (allCancelled) {
    derivedStatus = 'cancelled';
  } else if (ord.status === 'pending_payment' || ord.paymentStatus === 'pending') {
    derivedStatus = 'pending_payment';
  } else if (allShipped) {
    derivedStatus = 'shipped';
  } else if (anyShipped) {
    derivedStatus = 'partially_fulfilled';
  } else if (allNonCancelledReady) {
    derivedStatus = 'ready_to_ship';
  } else if (anyPreparingOrReady) {
    derivedStatus = 'processing';
  } else if (allPending) {
    if (ord.status !== 'pending_payment' && ord.status !== 'processing') {
      derivedStatus = 'processing';
    }
  }

  if (derivedStatus !== ord.status) {
    await db
      .update(orders)
      .set({
        status: derivedStatus,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));
  }
}
