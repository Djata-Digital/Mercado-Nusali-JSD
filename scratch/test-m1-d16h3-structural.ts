/**
 * FASE D16-H3 — Destino de Entrega Antecipado e Compartilhado.
 * Verificações estruturais (fs.readFileSync + regex), mesmo padrão já usado
 * em fases anteriores (D16-G3/D16-H2) para propriedades verificáveis
 * diretamente no código-fonte sem precisar renderizar React (projeto não
 * tem runner de teste de renderização): A-F, H, K, L, M, N, O, P, Q.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let passed = 0, total = 0;
function report(label: string, ok: boolean, detail?: any) {
  total++; if (ok) passed++;
  console.log(`[${ok ? 'PASS' : 'FAIL'}] ${label}${detail !== undefined ? ' -> ' + JSON.stringify(detail) : ''}`);
}

const contextSrc = fs.readFileSync(path.join(ROOT, 'src/context/DeliveryDestinationContext.tsx'), 'utf8');
// Remove comentários de bloco/linha antes de checar "nunca referencia X" —
// o próprio arquivo documenta em prosa o que NÃO fazer (auto-referência
// inofensiva, mesmo padrão de falso-positivo já visto em fases anteriores:
// D16-G1.1/G1.3/G1.5/G1.6/G3). Só o CÓDIGO real importa para estas checagens.
const contextCodeOnly = contextSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const modalSrc = fs.readFileSync(path.join(ROOT, 'src/components/DeliveryDestinationModal.tsx'), 'utf8');
const productDetailSrc = fs.readFileSync(path.join(ROOT, 'src/components/ProductDetailView.tsx'), 'utf8');
const cartViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/CartView.tsx'), 'utf8');
const checkoutViewSrc = fs.readFileSync(path.join(ROOT, 'src/components/CheckoutView.tsx'), 'utf8');
const orderServiceSrc = fs.readFileSync(path.join(ROOT, 'src/server/modules/orders/orderService.ts'), 'utf8');
const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
const preferencesSrc = fs.readFileSync(path.join(ROOT, 'src/context/PreferencesContext.tsx'), 'utf8');

// ===========================================================================
// Provider montado corretamente em App.tsx (depois de PreferencesProvider,
// nunca dentro/dependente de MarketplaceProvider legado).
// ===========================================================================
report(
  'SETUP. App.tsx monta DeliveryDestinationProvider depois de PreferencesProvider',
  /<PreferencesProvider>[\s\S]*<DeliveryDestinationProvider>/.test(appSrc)
);
report(
  'SETUP. DeliveryDestinationProvider NÃO está aninhado dentro de MarketplaceProvider (é o inverso: Marketplace fica dentro dele)',
  /<DeliveryDestinationProvider>[\s\S]*<MarketplaceProvider>/.test(appSrc)
);

// ===========================================================================
// A/B — fallback para endereço padrão quando não há destination intent.
// ===========================================================================
report(
  'A/B. ProductDetailView: destinationShippingSectorId cai no defaultDeliveryAddress quando não há intenção (fallback preservado)',
  /deliveryDestinationIntent\?\.shippingSectorId \|\| defaultDeliveryAddress\?\.shippingSectorId \|\| null/.test(productDetailSrc)
);
report(
  'A/B. CartView: mesma prioridade/fallback (intenção > endereço padrão > null)',
  /deliveryDestinationIntent\?\.shippingSectorId \|\| defaultDeliveryAddress\?\.shippingSectorId \|\| null/.test(cartViewSrc)
);

// ===========================================================================
// C/D — sector intent Gabú: ProductDetail e Cart LEEM do context (não
// recalculam nem duplicam a lógica de resolução).
// ===========================================================================
report('C. ProductDetailView usa useDeliveryDestination()', /useDeliveryDestination\(\)/.test(productDetailSrc));
report('D. CartView usa useDeliveryDestination()', /useDeliveryDestination\(\)/.test(cartViewSrc));

// ===========================================================================
// E — Checkout inicia addressMode='new' + Região/Setor quando a intenção é
// mode='sector'.
// ===========================================================================
report(
  'E. CheckoutView: intenção mode=\'sector\' -> setAddressMode(\'new\') + regionId/sectorId pré-preenchidos a partir do context',
  /deliveryDestinationIntent\?\.mode === 'sector'\) \{\s*setAddressMode\('new'\);\s*setNewAddress\(\(prev\) => \(\{\s*\.\.\.prev,\s*regionId: deliveryDestinationIntent\.shippingRegionId,\s*sectorId: deliveryDestinationIntent\.shippingSectorId,/.test(checkoutViewSrc)
);
report(
  'E2. CheckoutView mostra aviso "Você selecionou entrega em..." quando Região/Setor vieram da intenção mode=\'sector\'',
  /Você selecionou entrega em/.test(checkoutViewSrc)
);

// ===========================================================================
// F — saved intent -> Checkout seleciona o addressId correto, SÓ se o
// endereço ainda existir/pertencer ao buyer/tiver setor (nunca confia cegamente).
// ===========================================================================
report(
  'F. CheckoutView: intenção mode=\'saved\' é revalidada contra a lista REAL de endereços do buyer (find + checagem de shippingSectorId) antes de aceitar',
  /stillOwnedAndUsable = res\.data\.find\(\s*\(a: any\) => a\.id === deliveryDestinationIntent\.addressId && !!a\.shippingSectorId\s*\)/.test(checkoutViewSrc)
);
report(
  'F2. Só aplica addressMode/selectedSavedAddressId quando a revalidação (stillOwnedAndUsable) passou',
  /if \(stillOwnedAndUsable\) \{\s*setAddressMode\('saved'\);\s*setSelectedSavedAddressId\(stillOwnedAndUsable\.id\);/.test(checkoutViewSrc)
);

// ===========================================================================
// H — catalogOriginFilter é um conceito TOTALMENTE separado, nunca tocado
// pelo novo context (nem o contrário).
// ===========================================================================
report(
  'H. DeliveryDestinationContext NUNCA referencia catalogOriginFilter/setCatalogOriginFilter no código real (só em comentário explicativo)',
  !/catalogOriginFilter/.test(contextCodeOnly)
);
report(
  'H2. DeliveryDestinationContext NUNCA escreve em nusali_display_country/nusali_catalog_origin_filter no código real (só lê selectedCountry via usePreferences, nunca localStorage.setItem dessas chaves)',
  !/nusali_display_country|nusali_catalog_origin_filter/.test(contextCodeOnly)
);
report(
  'H3. DeliveryDestinationContext usa uma chave de localStorage PRÓPRIA (nusali_delivery_destination)',
  /STORAGE_KEY = 'nusali_delivery_destination'/.test(contextSrc)
);
report(
  'H4. PreferencesContext.tsx (arquivo já existente) não foi alterado para conhecer o novo context (nenhuma referência cruzada)',
  !/DeliveryDestination/.test(preferencesSrc)
);

// ===========================================================================
// K — sector intent nunca contém street/number/recipient (garantia também
// no nível de código, além do teste puro do parser).
// ===========================================================================
report(
  'K. DeliveryDestinationContext: interface SectorDestinationIntent não tem campos de endereço postal (street/number/neighborhood/recipient/document)',
  !/interface SectorDestinationIntent[\s\S]*?\n\}/.test(contextSrc) ||
    !/street|number:|neighborhood|recipientName|document/.test(
      contextSrc.match(/interface SectorDestinationIntent[\s\S]*?\n\}/)?.[0] || ''
    )
);
report(
  'K2. DeliveryDestinationModal: modo "Outro destino" só coleta Região/Setor (setSectorIntent nunca recebe street/number/recipient/document)',
  /setSectorIntent\(\{\s*shippingSectorId: sector\.id,\s*shippingSectorName: sector\.name,\s*shippingRegionId: region\.id,\s*shippingRegionName: region\.name,\s*countryCode: selectedCountry,\s*\}\);/.test(modalSrc) &&
    !/setSectorIntent\(\{[^}]*street/.test(modalSrc)
);
report(
  'K3. DeliveryDestinationModal: modo "Outro destino" NUNCA renderiza inputs de cidade/rua/número/bairro/referência/destinatário/telefone/documento',
  !/(Cidade|Rua|Número|Bairro|Referência|Destinatário|Telefone|Documento)/.test(
    modalSrc.slice(modalSrc.indexOf("mode === 'sector' && ("), modalSrc.lastIndexOf('</div>\n        </div>\n      </div>\n    </div>\n  );'))
  )
);

// ===========================================================================
// L — cart items NUNCA recebem o destino (nenhuma escrita em cartItems/
// updateQuantity/addItem com shippingSectorId/destination).
// ===========================================================================
report(
  'L. CartView NUNCA passa destinationShippingSectorId/destination para updateCartQuantity/applyCartQuantity (só para o preview de frete)',
  !/applyCartQuantity\([^)]*destination/.test(cartViewSrc) && !/updateCartQuantity\([^)]*destination/.test(cartViewSrc)
);
report(
  'L2. orderService.ts (snapshot real do pedido) não foi tocado nesta fase — F6.2 continua intocado',
  /shippingAddressJson: targetAddress/.test(orderServiceSrc)
);

// ===========================================================================
// M — mudança de setor recalcula o preview (dependency arrays já existentes
// continuam incluindo destinationShippingSectorId).
// ===========================================================================
report(
  'M. ProductDetailView: efeito de preview depende de destinationShippingSectorId (recalcula ao trocar de setor, inclusive via a nova intenção)',
  /destinationShippingSectorId, needsVariantSelection, isUnavailableForDestination\]/.test(productDetailSrc)
);
report(
  'M2. CartView: efeito de preview depende de destinationShippingSectorId (junto com shippingItemsKey, D16-H2.1)',
  /\}, \[shippingItemsKey, destinationShippingSectorId\]/.test(cartViewSrc)
);

// ===========================================================================
// N/O/P — nenhum algoritmo novo: ProductDetail continua GET /shipping/preview
// (F3/F4), Cart continua POST /shipping/preview-cart, Checkout continua
// preview-cart + F6.2 na confirmação.
// ===========================================================================
report('N. ProductDetailView consulta a cotação do servidor (F3/F4) pela MESMA API por serviço do carrinho/checkout (getCartPreview) — atualizado: antes usava o preview de um só serviço', /ShippingService\.getCartPreview\(/.test(productDetailSrc) && !/ShippingService\.getPreview\(/.test(productDetailSrc));
report('O. CartView continua chamando ShippingService.getCartPreview (F3/F4, D16-G3 intocado)', /ShippingService\.getCartPreview\(/.test(cartViewSrc));
report('P. CheckoutView continua chamando ShippingService.getCartPreview (D16-G3 intocado)', /ShippingService\.getCartPreview\(/.test(checkoutViewSrc));
report('P2. orderService.ts continua chamando resolveFulfillmentCandidates (F4) e reserveFulfillmentInventory (F5) na confirmação — nenhum algoritmo novo', /resolveFulfillmentCandidates\(/.test(orderServiceSrc) && /reserveFulfillmentInventory\(/.test(orderServiceSrc));

// ===========================================================================
// Q — nenhuma área protegida referenciada pelos arquivos novos/tocados.
// ===========================================================================
const touchedFiles = [
  ['DeliveryDestinationContext.tsx', contextSrc],
  ['DeliveryDestinationModal.tsx', modalSrc],
  ['ProductDetailView.tsx', productDetailSrc],
  ['CartView.tsx', cartViewSrc],
  ['CheckoutView.tsx', checkoutViewSrc],
] as const;
for (const [name, src] of touchedFiles) {
  report(`Q. ${name} não importa/referencia PaymentService/EscrowService/RefundService (nenhuma mudança financeira)`, !/PaymentService|EscrowService|RefundService/.test(src));
  report(`Q2. ${name} não importa/referencia reserveFulfillmentInventory/resolveFulfillmentCandidates (F4/F5 continuam exclusivos do checkout real)`, !/reserveFulfillmentInventory|resolveFulfillmentCandidates/.test(src));
}

// Server authority — cliente nunca é autoridade de shipping rate/origin/etc:
// nenhum destes arquivos frontend calcula ou envia uma tarifa/rota, sempre
// delegam a GET/POST /shipping/preview* (F3/F4).
for (const [name, src] of touchedFiles) {
  if (name === 'CheckoutView.tsx') continue; // já validado em outras fases (M/N/O/P do D16-G3)
  report(`SERVER_AUTHORITY. ${name} nunca calcula shippingAmount/shippingRate localmente (sempre via ShippingService)`, !/shippingAmount\s*=\s*\d|shippingRate\s*=\s*\d/.test(src));
}

console.log(`\n${passed}/${total} testes passaram.`);
process.exit(passed === total ? 0 : 1);
