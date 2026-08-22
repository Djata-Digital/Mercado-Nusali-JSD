import QRCode from 'qrcode';
import { CurrencyCode } from '../types';
import { countriesConfig, convertCurrency, getLiveExchangeRate } from './currencyUtils';

export interface PixPayloadParams {
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  amountBrl: number;
  txid?: string;
  description?: string;
}

export interface PixTransaction {
  id: string;
  txid: string;
  orderId?: string;
  amountBrl: number;
  originalAmount: number;
  originalCurrency: CurrencyCode;
  pixKey: string;
  merchantName: string;
  merchantCity: string;
  description: string;
  brCode: string;
  qrCodeDataUrl: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  createdAt: string;
  expiresAt: string;
  paidAt?: string;
  endToEndId?: string;
  payerName?: string;
  payerCpfOrTaxId?: string;
}

/**
 * Calculates CRC16-CCITT (0xFFFF, polynomial 0x1021) for EMV / BR Code Pix Payload
 */
export function calculatePixCrc16(payload: string): string {
  let crc = 0xffff;
  const polynomial = 0x1021;

  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ polynomial) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }

  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Formats standard EMV TLV (Type-Length-Value) field
 */
export function formatEMVField(id: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}

/**
 * Normalizes text to strictly ASCII alphanumeric characters (removing accents, special chars)
 * as required by the Central Bank of Brazil (BACEN) Pix specs.
 */
export function sanitizePixText(text: string, maxLength: number): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[^a-zA-Z0-9 ]/g, '') // only ascii alphanumeric
    .trim()
    .slice(0, maxLength)
    .toUpperCase();
}

/**
 * Generates full official EMV standard BR Code (Pix Copia e Cola)
 */
export function generatePixBrCode(params: PixPayloadParams): string {
  const {
    pixKey,
    merchantName = 'MERCADO NUSALI LTDA',
    merchantCity = 'SAO PAULO',
    amountBrl,
    txid = 'NUSALI' + Math.floor(100000 + Math.random() * 900000),
    description = 'Mercado Nusali Compra',
  } = params;

  // 00: Payload Format Indicator (01)
  let emv = formatEMVField('00', '01');

  // 01: Point of Initiation Method (12 = Dynamic QR / 11 = Static QR)
  emv += formatEMVField('01', '12');

  // 26: Merchant Account Information
  const gui = formatEMVField('00', 'br.gov.bcb.pix');
  const key = formatEMVField('01', pixKey);
  const infoDesc = description ? formatEMVField('02', sanitizePixText(description, 40)) : '';
  const merchantAccountInfo = gui + key + infoDesc;
  emv += formatEMVField('26', merchantAccountInfo);

  // 52: Merchant Category Code (0000 = default)
  emv += formatEMVField('52', '0000');

  // 53: Transaction Currency (986 = BRL)
  emv += formatEMVField('53', '986');

  // 54: Transaction Amount (formatted e.g. "129.90")
  const formattedAmount = amountBrl.toFixed(2);
  emv += formatEMVField('54', formattedAmount);

  // 58: Country Code (BR)
  emv += formatEMVField('58', 'BR');

  // 59: Merchant Name (max 25 chars)
  const cleanName = sanitizePixText(merchantName, 25) || 'MERCADO NUSALI';
  emv += formatEMVField('59', cleanName);

  // 60: Merchant City (max 15 chars)
  const cleanCity = sanitizePixText(merchantCity, 15) || 'SAO PAULO';
  emv += formatEMVField('60', cleanCity);

  // 62: Additional Data Field Template (TxID / reference label)
  const cleanTxid = txid.replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || 'NUSALIPAY';
  const additionalDataField = formatEMVField('05', cleanTxid);
  emv += formatEMVField('62', additionalDataField);

  // 63: CRC16 template header
  const payloadToSign = emv + '6304';
  const crc16 = calculatePixCrc16(payloadToSign);

  return payloadToSign + crc16;
}

/**
 * Renders standard QR Code Data URL from BR Code string
 */
export async function renderPixQrCode(brCode: string): Promise<string> {
  try {
    return await QRCode.toDataURL(brCode, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400,
      color: {
        dark: '#0f172a', // Slate 900
        light: '#ffffff',
      },
    });
  } catch (err) {
    console.error('Failed to render Pix QR Code:', err);
    return '';
  }
}

/**
 * Converts any store currency (XOF, USD, EUR, AOA, CVE, etc.) to BRL (Real Brasileiro)
 * using the official daily international exchange rate.
 */
export function convertToBRL(amount: number, fromCurrency: CurrencyCode): number {
  if (fromCurrency === 'BRL') return Math.max(0.01, Number(amount.toFixed(2)));

  const convertedBrl = convertCurrency(amount, fromCurrency, 'BRL');
  return Math.max(0.5, Number(convertedBrl.toFixed(2)));
}

/**
 * Generates a realistic BACEN EndToEndId for Pix receipts
 * Format: E + ISPB (8 digits) + YYYYMMDDHHMM + 11 random alphanumeric
 */
export function generatePixEndToEndId(ispb: string = '00000000'): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const randomChars = Array.from({ length: 11 }, () =>
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 36)]
  ).join('');

  return `E${ispb}${year}${month}${day}${hour}${min}${randomChars}`;
}
