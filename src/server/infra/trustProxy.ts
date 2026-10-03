/**
 * Identificação do IP REAL do cliente atrás do Render (usado por `req.ip`, pelos limitadores de taxa
 * e pelo registro de sessões).
 *
 * TOPOLOGIA (Render): cliente → Cloudflare (borda do Render) → proxy do Render (rede privada, 10.x) → app.
 * Cada proxy ACRESCENTA ao `X-Forwarded-For` o endereço do qual recebeu a conexão, e o proxy do Render NÃO
 * filtra o que o cliente já enviou nesse header. Logo, o app vê:
 *   socket = proxy do Render (privado) ; XFF = [ ...valores forjados pelo cliente, IP REAL, borda Cloudflare ]
 *
 * Sem configuração, `req.ip` é sempre o do proxy: TODOS os clientes caem no MESMO balde dos limitadores
 * (ex.: 10 logins/min para a plataforma inteira — qualquer pessoa trava o login de todos).
 *
 * CONFIGURAÇÃO ESCOLHIDA — confiar SOMENTE em sub-redes conhecidas (não em `true`, nem em um número fixo de saltos):
 *   - loopback e `uniquelocal` (10/8, 172.16/12, 192.168/16, fc00::/7): o proxy do Render e a rede privada;
 *   - as faixas oficiais do Cloudflare (https://www.cloudflare.com/ips-v4 e /ips-v6).
 * O Express percorre o XFF da DIREITA para a ESQUERDA, descartando endereços confiáveis, e usa o primeiro NÃO
 * confiável: o IP real que o Cloudflare registrou. Valores forjados ficam à ESQUERDA dele e são ignorados — o
 * resultado não depende do tamanho da cadeia (um caminho mais curto não abre brecha, ao contrário de `trust proxy = N`)
 * e `true` (que confia no valor mais à esquerda, forjável) NUNCA é usado.
 *
 * FALHA SEGURA: se uma faixa do Cloudflare mudar e faltar aqui, aquele IP de borda passa a ser visto como "cliente"
 * (balde compartilhado por borda) — no pior caso, igual a antes; nunca abre bypass. Conferir a lista oficial de tempos
 * em tempos (as faixas mudam raramente).
 */
export const CLOUDFLARE_IPV4_RANGES: readonly string[] = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18',
  '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20', '197.234.240.0/22', '198.41.128.0/17',
  '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];

export const CLOUDFLARE_IPV6_RANGES: readonly string[] = [
  '2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32',
  '2a06:98c0::/29', '2c0f:f248::/32',
];

export const TRUSTED_PROXY_SUBNETS: readonly string[] = [
  'loopback',
  'uniquelocal',
  ...CLOUDFLARE_IPV4_RANGES,
  ...CLOUDFLARE_IPV6_RANGES,
];

/** Aplica a configuração ao app Express (chamar logo após `express()`, antes de qualquer middleware que use req.ip). */
export function configureTrustProxy(app: { set: (setting: string, value: any) => unknown }): void {
  app.set('trust proxy', [...TRUSTED_PROXY_SUBNETS]);
}
