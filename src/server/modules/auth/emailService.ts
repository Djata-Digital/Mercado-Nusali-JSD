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

/**
 * Recuperação de senha — envia o link de redefinição. O token só existe aqui (no
 * corpo do e-mail) e na URL; nunca é logado e o banco guarda apenas o hash dele.
 * Não loga o destinatário nem o link.
 */
export async function sendPasswordResetEmail(params: { to: string; name: string; link: string; expiresMinutes: number }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey) throw new Error('RESEND_API_KEY não configurada.');
  if (!from) throw new Error('EMAIL_FROM não configurado.');

  const name = escapeHtml(params.name || 'cliente');
  const link = escapeHtml(params.link);
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject: 'Redefinição de senha do Mercado Nusali',
      text:
        `Olá ${params.name || 'cliente'},\n\n` +
        `Recebemos um pedido para redefinir a senha da sua conta no Mercado Nusali.\n` +
        `Para criar uma nova senha, abra o link abaixo (válido por ${params.expiresMinutes} minutos e de uso único):\n\n${params.link}\n\n` +
        `Se você não fez esse pedido, ignore este e-mail: a sua senha continua a mesma.`,
      html:
        `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f4f7fb;padding:24px">` +
        `<div style="max-width:560px;margin:auto;background:#fff;border-radius:12px;padding:28px">` +
        `<h2 style="margin:0 0 12px;color:#0b1f4d">Redefinição de senha</h2>` +
        `<p style="color:#333">Olá ${name},</p>` +
        `<p style="color:#333">Recebemos um pedido para redefinir a senha da sua conta no Mercado Nusali.</p>` +
        `<p style="margin:24px 0"><a href="${link}" style="background:#0b1f4d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Criar nova senha</a></p>` +
        `<p style="color:#555;font-size:13px">O link vale por ${params.expiresMinutes} minutos e só pode ser usado uma vez.</p>` +
        `<p style="color:#555;font-size:13px">Se você não fez esse pedido, ignore este e-mail: a sua senha continua a mesma.</p>` +
        `</div></body></html>`,
    }),
  });

  const body = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    logger.error({ status: response.status }, 'Resend failed to send password reset email');
    throw new Error(body?.message || `Falha ao enviar e-mail de redefinição (HTTP ${response.status}).`);
  }
  logger.info({ resendId: body?.id }, 'Password reset email sent');
  return body;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char] || char));
}
