import { Router, Request, Response } from 'express';
import {
  generatePixBrCode,
  renderPixQrCode,
  convertToBRL,
  generatePixEndToEndId,
  PixTransaction,
} from '../utils/pixEngine.js';
import { fetchLiveDailyRates } from './ratesRoutes.js';
import { buyerDataStore } from './buyerRoutes.js';
import { CurrencyCode } from '../types.js';
import { getDb } from '../db/index.js';
import { orders } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const pixRouter = Router();

// In-memory ledger of Pix transactions (persists during container runtime)
const pixTransactionsStore = new Map<string, PixTransaction>();

// Default Official Merchant Pix Key for Mercado Nusali (CNPJ or random key)
const OFFICIAL_NUSALI_PIX_KEY = '48.291.042/0001-89';
const OFFICIAL_MERCHANT_NAME = 'MERCADO NUSALI LTDA';
const OFFICIAL_MERCHANT_CITY = 'SAO PAULO';

/**
 * 1. POST /api/pix/create
 * Creates a new official PIX charge with BR Code, QR code and expiration
 */
pixRouter.post('/create', async (req: Request, res: Response) => {
  try {
    const {
      orderId,
      amount,
      currency = 'BRL',
      buyerName = 'Cliente Nusali',
      buyerCpf = '123.456.789-00',
      description,
    } = req.body;

    const rawAmount = Number(amount) || 100;
    
    // Fetch and calculate using live daily international exchange rates
    const ratesData = await fetchLiveDailyRates();
    const rates = ratesData.rates;
    const fromRate = rates[String(currency).toUpperCase()] || 1;
    const toBrlRate = rates['BRL'] || 5.48;

    let amountBrl: number;
    if (String(currency).toUpperCase() === 'BRL') {
      amountBrl = Math.max(0.01, Number(rawAmount.toFixed(2)));
    } else {
      const amountUSD = rawAmount / fromRate;
      amountBrl = Math.max(0.5, Number((amountUSD * toBrlRate).toFixed(2)));
    }

    const txid = `NSL${Date.now().toString(36).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`;
    const id = `pix_tx_${Date.now()}`;

    const desc = description || (orderId ? `Pedido Mercado Nusali #${orderId}` : 'Compra Mercado Nusali');

    const brCode = generatePixBrCode({
      pixKey: OFFICIAL_NUSALI_PIX_KEY,
      merchantName: OFFICIAL_MERCHANT_NAME,
      merchantCity: OFFICIAL_MERCHANT_CITY,
      amountBrl,
      txid,
      description: desc,
    });

    const qrCodeDataUrl = await renderPixQrCode(brCode);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // 15 minutes expiration

    const transaction: PixTransaction = {
      id,
      txid,
      orderId: orderId || `NSL-${Math.floor(1000000 + Math.random() * 9000000)}`,
      amountBrl,
      originalAmount: rawAmount,
      originalCurrency: currency as CurrencyCode,
      pixKey: OFFICIAL_NUSALI_PIX_KEY,
      merchantName: OFFICIAL_MERCHANT_NAME,
      merchantCity: OFFICIAL_MERCHANT_CITY,
      description: desc,
      brCode,
      qrCodeDataUrl,
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt,
      payerName: buyerName,
      payerCpfOrTaxId: buyerCpf,
    };

    pixTransactionsStore.set(txid, transaction);
    pixTransactionsStore.set(id, transaction);

    return res.json({
      success: true,
      message: 'Cobrança Pix gerada com sucesso!',
      data: transaction,
    });
  } catch (error: any) {
    console.error('Error generating PIX charge:', error);
    return res.status(500).json({
      success: false,
      message: 'Falha ao gerar cobrança Pix: ' + (error?.message || 'Erro interno'),
    });
  }
});

/**
 * 2. GET /api/pix/status/:txid
 * Checks real-time status of a PIX charge (supports polling)
 */
pixRouter.get('/status/:txid', (req: Request, res: Response) => {
  const { txid } = req.params;
  const transaction = pixTransactionsStore.get(txid);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transação Pix não encontrada.',
    });
  }

  // Auto-check expiration
  if (transaction.status === 'pending' && new Date() > new Date(transaction.expiresAt)) {
    transaction.status = 'expired';
  }

  return res.json({
    success: true,
    data: transaction,
  });
});

/**
 * 3. POST /api/pix/confirm/:txid or /api/pix/simulate-payment
 * Simulates real bank payment confirmation or marks payment as received
 */
pixRouter.post('/confirm/:txid', (req: Request, res: Response) => {
  const { txid } = req.params;
  const transaction = pixTransactionsStore.get(txid);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transação Pix não encontrada.',
    });
  }

  if (transaction.status === 'paid') {
    return res.json({
      success: true,
      message: 'Esta cobrança já foi confirmada anteriormente.',
      data: transaction,
    });
  }

  const now = new Date();
  transaction.status = 'paid';
  transaction.paidAt = now.toISOString();
  transaction.endToEndId = generatePixEndToEndId('18236120'); // Mock Santander / BACEN ISPB

  // Update order status in DB if linked
  if (transaction.orderId) {
    const db = getDb();
    if (db) {
      db.update(orders)
        .set({ status: 'paid', paymentStatus: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, transaction.orderId))
        .catch(() => {});
    }
  }

  return res.json({
    success: true,
    message: 'Pagamento Pix confirmado e aprovado com sucesso!',
    data: transaction,
  });
});

/**
 * 4. POST /api/pix/simulate-payment
 * Generic simulation endpoint accepting txid or paymentId in body
 */
pixRouter.post('/simulate-payment', (req: Request, res: Response) => {
  const { txid, paymentId } = req.body;
  const targetId = txid || paymentId;
  const transaction = pixTransactionsStore.get(targetId);

  if (!transaction) {
    return res.status(404).json({
      success: false,
      message: 'Transação Pix não encontrada para simulação.',
    });
  }

  const now = new Date();
  transaction.status = 'paid';
  transaction.paidAt = now.toISOString();
  transaction.endToEndId = generatePixEndToEndId('18236120');

  if (transaction.orderId) {
    const db = getDb();
    if (db) {
      db.update(orders)
        .set({ status: 'paid', paymentStatus: 'paid', updatedAt: new Date() })
        .where(eq(orders.id, transaction.orderId))
        .catch(() => {});
    }
  }

  return res.json({
    success: true,
    message: 'Simulação bancária de Pix concluída! Pagamento aprovado instantaneamente.',
    data: transaction,
  });
});

/**
 * 5. POST /api/pix/webhook
 * Standard Gateway Webhook Receiver for real PSPs (Mercado Pago, Efí, Asaas, PagBank, etc.)
 */
pixRouter.post('/webhook', (req: Request, res: Response) => {
  try {
    const body = req.body || {};
    // Extract standard webhook parameters
    const txid = body.txid || body.data?.txid || body.pix?.[0]?.txid || body.reference_id;
    const endToEndId = body.endToEndId || body.pix?.[0]?.endToEndId || generatePixEndToEndId();
    const event = body.event || body.type || 'PAYMENT_RECEIVED';

    if (!txid) {
      return res.status(400).json({
        success: false,
        message: 'Webhook recebido mas parâmetro txid ausente.',
      });
    }

    const transaction = pixTransactionsStore.get(txid);
    if (transaction) {
      transaction.status = 'paid';
      transaction.paidAt = new Date().toISOString();
      transaction.endToEndId = endToEndId;

      if (transaction.orderId) {
        const db = getDb();
        if (db) {
          db.update(orders)
            .set({ status: 'paid', paymentStatus: 'paid', updatedAt: new Date() })
            .where(eq(orders.id, transaction.orderId))
            .catch(() => {});
        }
      }
    }

    return res.json({
      success: true,
      received: true,
      event,
      txid,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error processing Pix webhook:', err);
    return res.status(500).json({ success: false, message: 'Erro no processamento do webhook' });
  }
});

/**
 * 6. GET /api/pix/transactions
 * Returns all active Pix charges
 */
pixRouter.get('/transactions', (req: Request, res: Response) => {
  const uniqueList = Array.from(new Set(pixTransactionsStore.values()));
  return res.json({
    success: true,
    data: uniqueList,
  });
});
