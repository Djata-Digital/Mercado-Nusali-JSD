import crypto from 'node:crypto';
import { logger } from '../../infra/logger.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

export function generateEmailVerificationCode(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function hashEmailVerificationCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function sendVerificationEmail(params: { to: string; name: string; code: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('EMAIL_FROM não configurado.');

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: `${params.code} é seu código de verificação do Mercado Nusali`,
      text: `Olá ${params.name || 'cliente'},\n\nSeu código de verificação do Mercado Nusali é: ${params.code}\n\nEste código expira em ${process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || '10'} minutos.\n\nSe você não solicitou este cadastro, ignore este e-mail.`,
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:32px"><h2 style="color:#172554">Mercado Nusali</h2><p>Olá ${escapeHtml(params.name || 'cliente')},</p><p>Use o código abaixo para verificar seu e-mail:</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#172554;padding:18px 0">${params.code}</div><p>O código expira em <strong>${process.env.EMAIL_VERIFICATION_EXPIRES_MINUTES || '10'} minutos</strong>.</p><p style="color:#64748b;font-size:13px">Se você não solicitou este cadastro, ignore este e-mail.</p></div></body></html>`,
    }),
  });

  const body = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    logger.error({ status: response.status, body }, 'Resend failed to send verification email');
    throw new Error(body?.message || `Falha ao enviar e-mail de verificação (HTTP ${response.status}).`);
  }
  logger.info({ to: params.to, resendId: body?.id }, 'Verification email sent');
  return body;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}
