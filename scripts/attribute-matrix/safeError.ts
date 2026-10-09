/**
 * FASE 8C.3 — diagnóstico SEGURO de erros do carregador: percorre a cadeia `cause` (o drizzle embrulha o erro do PostgreSQL em
 * "Failed query: …" e esconde o motivo real), extrai SQLSTATE/mensagem/severidade e devolve um texto sem credenciais, URLs, senhas nem
 * parâmetros de consulta. Puro e testável.
 */
export interface ErrorLink { name?: string; code?: string; severity?: string; message: string; detail?: string; hint?: string; routine?: string; syscall?: string; address?: string; port?: number }

const REDACTED = '<oculto>';

/** Remove URLs de conexão, senhas e o sufixo de projeto do pooler (`papel.<ref>`). `secrets` = trechos exatos a ocultar (senha, URL). */
export function redact(text: string, secrets: string[] = []): string {
  let t = String(text ?? '');
  for (const s of secrets) if (s && s.length >= 3) t = t.split(s).join(REDACTED);
  t = t.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgres://<url oculta>');
  t = t.replace(/(password|senha|pwd)\s*[=:]\s*[^\s,;'"]+/gi, '$1=<oculto>');
  t = t.replace(/\b(attr_loader_8c3)\.[a-z0-9]{6,}\b/gi, '$1.<ref>');
  t = t.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '<ip>'); // endereços IPv4 de infraestrutura
  return t;
}

export function errorChain(e: unknown, maxDepth = 5): ErrorLink[] {
  const chain: ErrorLink[] = [];
  const seen = new Set<unknown>();
  let cur: any = e;
  while (cur && typeof cur === 'object' && !seen.has(cur) && chain.length < maxDepth) {
    seen.add(cur);
    chain.push({
      name: cur.name, code: cur.code !== undefined ? String(cur.code) : undefined, severity: cur.severity, message: String(cur.message ?? ''),
      detail: cur.detail, hint: cur.hint, routine: cur.routine, syscall: cur.syscall, address: cur.address, port: cur.port,
    });
    cur = cur.cause ?? (Array.isArray(cur.errors) ? cur.errors[0] : undefined); // AggregateError (ex.: várias tentativas de rede)
  }
  return chain;
}

/** Dica objetiva a partir do SQLSTATE / código de rede / mensagem do pooler. */
export function hintFor(link: ErrorLink | undefined): string | undefined {
  if (!link) return undefined;
  const code = link.code ?? '';
  const msg = link.message.toLowerCase();
  if (code === '28P01' || msg.includes('password authentication failed')) return 'Senha recusada para o papel: confira a senha digitada e se o papel ainda existe (SQLSTATE 28P01).';
  if (code === '28000' || msg.includes('no pg_hba') || msg.includes('role') && msg.includes('does not exist')) return 'Autenticação/usuário recusado (SQLSTATE 28000): confira o nome do usuário.';
  if (msg.includes('tenant or user not found') || msg.includes('user not found')) return 'O pooler não reconhece o usuário: no pooler do Supabase o usuário deve ser "attr_loader_8c3.<ref-do-projeto>" (mesmo sufixo do usuário postgres.<ref>).';
  if (code === '3D000') return 'Banco inexistente (SQLSTATE 3D000): confira o nome do banco na URL.';
  if (code === '42501') return 'Permissão negada (SQLSTATE 42501): o papel não tem privilégio para esta consulta.';
  if (code === '57P01' || code === '57P03' || code === '53300') return 'Servidor indisponível ou limite de conexões atingido (SQLSTATE ' + code + ').';
  if (code === '57014') return 'Consulta cancelada por tempo limite (statement_timeout do papel = 60 s).';
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'EAI_AGAIN') return `Falha de rede (${code}): confira host, porta e conectividade.`;
  if (msg.includes('ssl') || msg.includes('certificate')) return 'Falha de SSL/TLS na conexão.';
  if (msg.includes('startup parameter') || msg.includes('unsupported')) return 'O pooler recusou um parâmetro de inicialização da sessão (ex.: "options").';
  if (msg.includes('timeout') || msg.includes('terminated')) return 'A conexão expirou ou foi encerrada pelo servidor/pooler.';
  return undefined;
}

/** Texto seguro e curto: primeira linha da mensagem de topo + a causa raiz com SQLSTATE e dica. Nunca inclui os parâmetros da consulta. */
export function describeError(e: unknown, secrets: string[] = []): string {
  const chain = errorChain(e);
  if (chain.length === 0) return redact(String(e), secrets);
  const top = chain[0];
  const topLine = redact(top.message.split('\n')[0], secrets).slice(0, 220);
  const root = chain.length > 1 ? chain[chain.length - 1] : undefined;
  // a causa "real" é o último elo que traz SQLSTATE/código de rede; senão, o último elo
  const real = [...chain].reverse().find((l) => l.code) ?? root;
  const parts = [topLine];
  if (real && real !== top) {
    const bits = [real.code ? `[${real.code}]` : '', real.severity ?? '', redact(real.message, secrets).split('\n')[0].slice(0, 220)].filter(Boolean);
    parts.push(`causa: ${bits.join(' ')}`);
    if (real.detail) parts.push(`detalhe: ${redact(real.detail, secrets).slice(0, 160)}`);
    if (real.syscall || real.address) parts.push(`rede: ${[real.syscall, real.address && real.address.replace(/\d+$/, 'x'), real.port].filter(Boolean).join(' ')}`);
  } else if (real?.code) {
    parts.push(`código: [${real.code}]`);
  }
  const hint = hintFor(real) ?? hintFor(top);
  if (hint) parts.push(`dica: ${hint}`);
  return parts.join(' | ');
}

/** Segredos a ocultar a partir de uma URL de conexão: a URL inteira, a senha (crua e codificada) e o usuário completo com sufixo. */
export function secretsFromUrl(rawUrl: string | undefined): string[] {
  if (!rawUrl) return [];
  const out = [rawUrl];
  try {
    const u = new URL(rawUrl);
    if (u.password) { out.push(u.password); try { out.push(decodeURIComponent(u.password)); } catch { /* */ } }
  } catch { /* URL inválida: só a string inteira */ }
  return out;
}
