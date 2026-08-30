/**
 * Correção crítica (Fase 1 operacional — etiqueta única do shipment):
 * shippingLabels já é 1:1 com shipments (ver schema.ts) — esta é a ÚNICA
 * rota que lê essa entidade para exibição/impressão. Seller e logística
 * NUNCA geram uma segunda etiqueta — ambos só consultam esta mesma linha.
 */
import { Router, Response } from 'express';
import { requireAuth, AuthRequest, LOGISTICS_AUTHORIZED_ROLES } from '../auth/authMiddleware.js';
import { getDb } from '../../../db/index.js';
import { shipments, shippingLabels, sellers } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

export const shipmentRouter = Router();
shipmentRouter.use(requireAuth);

// GET /api/v1/shipments/:shipmentId/label
// RBAC: seller dono do shipment, logística/HUB/admin autorizados (mesmos
// papéis de requireLogisticsStaff). Comprador NUNCA acessa esta rota —
// dados operacionais internos, não a etiqueta pública de rastreio.
shipmentRouter.get('/:shipmentId/label', async (req: AuthRequest, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(503).json({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível.' } });

    const { shipmentId } = req.params;
    const shipmentRows = await db.select().from(shipments).where(eq(shipments.id, shipmentId)).limit(1);
    if (shipmentRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'SHIPMENT_NOT_FOUND', message: 'Envio não encontrado.' } });
    }
    const shipment = shipmentRows[0];

    const userRole = (req.user?.role || '').toUpperCase();
    const isLogisticsOrAdmin = LOGISTICS_AUTHORIZED_ROLES.some((r) => r.toUpperCase() === userRole);

    let isOwnerSeller = false;
    if (!isLogisticsOrAdmin && shipment.sellerId) {
      const sellerRows = await db.select({ id: sellers.id }).from(sellers).where(eq(sellers.userId, req.user!.id)).limit(1);
      isOwnerSeller = Boolean(sellerRows[0] && sellerRows[0].id === shipment.sellerId);
    }

    if (!isLogisticsOrAdmin && !isOwnerSeller) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN_LABEL_ACCESS', message: 'Você não tem permissão para acessar esta etiqueta.' },
      });
    }

    const labelRows = await db.select().from(shippingLabels).where(eq(shippingLabels.shipmentId, shipmentId)).limit(1);
    if (labelRows.length === 0) {
      return res.status(404).json({ success: false, error: { code: 'LABEL_NOT_FOUND', message: 'Etiqueta ainda não foi gerada para este envio.' } });
    }
    const label = labelRows[0];

    // Só dados operacionais necessários para imprimir/exibir a etiqueta —
    // nunca PII do comprador além do estritamente necessário para a entrega
    // física (já presente em shipments.recipientAddressJson, não duplicado aqui).
    return res.json({
      success: true,
      data: {
        shipmentId: shipment.id,
        orderId: shipment.orderId,
        orderItemId: shipment.orderItemId,
        fulfillmentMode: shipment.fulfillmentMode,
        shipmentStatus: shipment.status,
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        serviceType: shipment.serviceType,
        recipientName: shipment.recipientName,
        recipientAddress: shipment.recipientAddressJson,
        senderName: shipment.senderName,
        senderAddress: shipment.senderAddressJson,
        label: {
          id: label.id,
          trackingCode: label.trackingCode,
          labelDataUrl: label.labelDataUrl,
          qrCodeData: label.qrCodeData,
          format: label.format,
          createdAt: label.createdAt,
        },
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: err?.message } });
  }
});
