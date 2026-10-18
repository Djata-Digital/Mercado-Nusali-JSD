/**
 * E8b — FORMULÁRIO DE SAQUE (SellerPayouts): o servidor exige idempotencyKey e aceita no máximo 2 casas decimais. Sem rede/banco: regra pura + travas de código.
 * Achado: o formulário NUNCA enviava idempotencyKey (o servidor responde 400 IDEMPOTENCY_KEY_REQUIRED) — corrigido aqui, com a chave estável em reenvios e renovada só após o sucesso.
 */
import fs from 'fs';
let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const form = src('src/components/seller/SellerPayouts.tsx');
const api = src('src/api/clients/SellerApi.ts');
const fnText = form.match(/export const hasAtMostTwoDecimals = ([^;]+);/)?.[1];
const hasAtMostTwoDecimals = new Function(`return (${String(fnText).replace(': number', '')})`)() as (v: number) => boolean;
report('F1 regra de casas decimais: 100, 100.5, 100.10, 0.01 e 1234.56 passam; 10.005, 0.001, NaN e Infinity não', [100, 100.5, 100.1, 0.01, 1234.56, 0.1 + 0.2 === 0.30000000000000004 ? 0.3 : 0.3].every(hasAtMostTwoDecimals) && ![10.005, 0.001, NaN, Infinity].some(hasAtMostTwoDecimals));
report('F2 o formulário envia a idempotencyKey em cada solicitação (o servidor a exige), usando a MESMA chave em reenvios', form.includes('idempotencyKey: payoutKeyRef.current') && form.includes('const payoutKeyRef = useRef<string>(newPayoutKey())'));
report('F3 a chave só é renovada depois do SUCESSO (falha/erro de rede mantém a chave: o reenvio nunca reserva o saldo duas vezes)', /if \(res\.success && res\.data\) \{\n\s+payoutKeyRef\.current = newPayoutKey\(\);/.test(form) && form.split('payoutKeyRef.current = newPayoutKey()').length === 2);
report('F4 o campo de valor aceita centavos (step 0,01) e o botão "Avançar" fica desabilitado com mais de 2 casas, com mensagem clara', form.includes('step="0.01"') && form.includes('!hasAtMostTwoDecimals(amount)') && form.includes('no máximo 2 casas decimais'));
report('F5 o contrato da API do cliente aceita idempotencyKey (campo opcional tipado) e o endpoint continua o mesmo', /idempotencyKey\?: string;\n\s+\}\): Promise<ApiResponse<any>> \{\n\s+return apiClient\.post\('\/seller\/payouts\/request', data\);/.test(api));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
