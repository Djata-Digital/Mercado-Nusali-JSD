/**
 * FASE D16-H1 — Endereço de Entrega Selecionável + Destinatário do Pedido.
 * FASE D16-H1.1 — hardening: separa explicitamente a AUTORIDADE GEOGRÁFICA
 * do endereço da escolha de DESTINATÁRIO deste pedido.
 *
 * Função pura (sem React, sem chamada de rede) que resolve o payload final
 * a ser submetido a OrdersApi.create — agora com uma forma que NUNCA deixa
 * o modo "endereço cadastrado" reconstruir os campos geográficos no
 * frontend:
 *
 *   addressMode: 'saved' -> envia SOMENTE addressId (o servidor busca o
 *     endereço no banco, valida addresses.userId === buyer autenticado, e
 *     usa os campos geográficos/shippingSectorId REAIS de lá — o cliente
 *     não pode falsificar rua/cidade/setor de um endereço salvo, mesmo
 *     manipulando o payload HTTP).
 *   addressMode: 'new' -> envia os campos inline de um endereço ESPECÍFICO
 *     deste pedido (nunca salvo no perfil) + o shippingSectorId
 *     selecionado — a autoridade geográfica aqui é inerentemente o próprio
 *     cliente (é um endereço que só existe para este pedido), mas o
 *     BACKEND (F4, intocado) ainda valida que o setor é real, ativo, e
 *     pertence ao país informado (COUNTRY_MISMATCH/DESTINATION_SECTOR_
 *     INVALID) antes de aceitar qualquer coisa.
 *
 * `recipient` é SEMPRE enviado separadamente (recipientOverride no
 * backend) — nunca embutido nos campos geográficos, mesmo no modo
 * 'saved': mesmo "eu mesmo" explicitamente reafirma nome/telefone do
 * buyer, nunca depende do que o endereço salvo tinha registrado.
 *
 * A "região" nunca é enviada como campo próprio — é só um agrupamento de
 * UI para a cascata Região→Setor (GET /buyer/shipping/regions|sectors,
 * D16-F2, já existente); o único valor que de fato viaja é o
 * shippingSectorId, cuja região real (se necessária para exibição) é
 * sempre derivada no backend a partir do próprio setor, nunca de texto
 * livre do navegador.
 */

export interface SavedAddressLike {
  id: string;
  recipientName?: string | null;
  street: string;
  number: string;
  complement?: string | null;
  neighborhood?: string | null;
  city: string;
  state?: string | null;
  country?: string | null;
  countryCode?: string | null;
  zipCode?: string | null;
  phone?: string | null;
  isDefault?: boolean;
  shippingSectorId?: string | null;
  shippingSectorName?: string | null;
  shippingRegionId?: string | null;
  shippingRegionName?: string | null;
}

export interface NewAddressFormState {
  regionId: string | null;
  sectorId: string | null;
  city: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  zipCode: string;
}

export type CheckoutAddressMode = 'saved' | 'new';
export type CheckoutRecipientMode = 'self' | 'other';

export interface ResolveCheckoutAddressInput {
  addressMode: CheckoutAddressMode;
  selectedSavedAddress: SavedAddressLike | null;
  newAddress: NewAddressFormState;
  // País comercial de destino do pedido — já resolvido pelo checkout
  // existente (seletor de país no topo, D16-F2/D16-G1), nunca inferido
  // aqui de novo. Só usado no modo 'new' (o endereço salvo já tem seu
  // próprio countryCode real, vindo do banco).
  country: string;
  recipientMode: CheckoutRecipientMode;
  recipientName: string;
  recipientPhone: string;
  documentValue: string;
  buyerName: string;
  buyerPhone: string;
}

export interface InlineAddressFields {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  countryCode: string;
  zipCode: string;
  shippingSectorId: string;
}

export interface RecipientFields {
  name: string;
  phone: string;
  document: string;
}

// Exatamente UM de addressId/shippingAddress é preenchido — nunca os dois,
// nunca nenhum. `recipient` é sempre enviado, sempre separado.
export interface ResolvedCheckoutOrderPayload {
  addressId: string | null;
  shippingAddress: InlineAddressFields | null;
  recipient: RecipientFields;
}

export type ResolveCheckoutAddressResult =
  | { ok: true; payload: ResolvedCheckoutOrderPayload; displaySectorId: string | null }
  | { ok: false; code: string; message: string };

export function resolveCheckoutAddress(input: ResolveCheckoutAddressInput): ResolveCheckoutAddressResult {
  // 1. Destinatário — escolha independente do endereço. SEMPRE explícito
  // (mesmo "eu mesmo" reafirma nome/telefone do buyer autenticado, nunca
  // depende do que um endereço salvo tinha registrado).
  const effectiveRecipientName = (input.recipientMode === 'self' ? input.buyerName : input.recipientName).trim();
  const effectiveRecipientPhone = (input.recipientMode === 'self' ? input.buyerPhone : input.recipientPhone).trim();

  if (input.recipientMode === 'other') {
    if (!input.recipientName.trim()) {
      return { ok: false, code: 'RECIPIENT_NAME_REQUIRED', message: 'Informe o nome completo de quem vai receber o pedido.' };
    }
    if (!input.recipientPhone.trim()) {
      return { ok: false, code: 'RECIPIENT_PHONE_REQUIRED', message: 'Informe o telefone de quem vai receber o pedido.' };
    }
  }
  if (!effectiveRecipientName) {
    return { ok: false, code: 'RECIPIENT_NAME_REQUIRED', message: 'Informe o nome completo de quem vai receber o pedido.' };
  }
  if (!effectiveRecipientPhone) {
    return { ok: false, code: 'RECIPIENT_PHONE_REQUIRED', message: 'Informe o telefone de quem vai receber o pedido.' };
  }

  // O documento só é repassado como "documento fiscal do comprador" quando
  // o destinatário É o próprio comprador (recipientMode==='self') — para
  // "outra pessoa", o documento digitado pertence ao DESTINATÁRIO, nunca
  // deve ser usado para preencher userProfiles.taxId do buyer (ver
  // orderService.ts, sincronização best-effort de documento BR — auditoria
  // D16-H1.1). Ausente aqui = orderService simplesmente pula a
  // sincronização, nunca bloqueia o pedido.
  const recipient: RecipientFields = {
    name: effectiveRecipientName,
    phone: effectiveRecipientPhone,
    document: input.recipientMode === 'self' ? input.documentValue.trim() : '',
  };

  // 2. Endereço — escolha independente do destinatário.
  if (input.addressMode === 'saved') {
    const addr = input.selectedSavedAddress;
    if (!addr) {
      return { ok: false, code: 'SAVED_ADDRESS_REQUIRED', message: 'Selecione um endereço cadastrado para continuar.' };
    }
    if (!addr.shippingSectorId) {
      return {
        ok: false,
        code: 'DELIVERY_SECTOR_REQUIRED',
        message: 'Este endereço não tem um setor de entrega definido. Edite-o em "Meus Endereços" ou escolha outro endereço.',
      };
    }
    // FASE D16-H1.1 — CRÍTICO: nunca reconstrói os campos geográficos aqui.
    // O único dado enviado para o modo 'saved' é o addressId — o servidor
    // (orderService.ts, já protegido) busca o endereço no banco e valida
    // addresses.userId === buyer autenticado antes de usar QUALQUER campo
    // dele. Isto elimina a superfície de ataque de "editar o payload HTTP
    // para trocar rua/cidade/setor de um endereço que não é meu".
    return {
      ok: true,
      payload: { addressId: addr.id, shippingAddress: null, recipient },
      displaySectorId: addr.shippingSectorId,
    };
  }

  // addressMode === 'new' — endereço específico deste pedido, nunca salvo
  // no perfil. Aqui SIM os campos geográficos vêm inline do formulário
  // (não existe um addressId a resolver) — mas o backend (F4, intocado)
  // continua validando que o shippingSectorId é real, ativo, e pertence ao
  // país informado antes de aceitar qualquer coisa.
  const na = input.newAddress;
  if (!na.sectorId) {
    return { ok: false, code: 'DELIVERY_SECTOR_REQUIRED', message: 'Selecione a região e o setor de entrega deste endereço.' };
  }
  if (!na.city.trim() || !na.street.trim() || !na.number.trim()) {
    return { ok: false, code: 'ADDRESS_FIELDS_REQUIRED', message: 'Preencha cidade/localidade, rua/avenida e número deste endereço.' };
  }
  return {
    ok: true,
    payload: {
      addressId: null,
      shippingAddress: {
        street: na.street,
        number: na.number,
        complement: na.complement || '',
        neighborhood: na.neighborhood || '',
        city: na.city,
        state: '',
        country: input.country,
        countryCode: input.country,
        zipCode: na.zipCode || '',
        shippingSectorId: na.sectorId,
      },
      recipient,
    },
    displaySectorId: na.sectorId,
  };
}
