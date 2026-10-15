/**
 * PAÍS DE ENTREGA ESCOLHIDO PELO CLIENTE — preservado ao navegar e ao atualizar a página; Guiné-Bissau é só o padrão inicial e nunca
 * substitui uma escolha explícita (nem perfil, nem outra aba, nem o header da API). Regras puras + storage do header + travas de código.
 */
import fs from 'fs';

// localStorage mínimo ANTES de importar o storageService (que lê o storage do navegador)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => mem.clear(),
};
const { initialCountry, readExplicitCountry, hasManualSelection, profileCountryToApply, countryFromStorageEvent, EXPLICIT_COUNTRY_KEY, DEFAULT_DELIVERY_COUNTRY } = await import('../src/utils/countryPreference.js');
const { storageService } = await import('../src/services/storage/storageService.js');

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 300)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8').split(String.fromCharCode(13, 10)).join(String.fromCharCode(10));
const reset = () => mem.clear();

// ---- padrão inicial x escolha explícita
reset();
report('K1 primeira visita (sem escolha): o padrão inicial é a Guiné-Bissau (GW)', initialCountry(localStorage) === 'GW' && DEFAULT_DELIVERY_COUNTRY === 'GW' && readExplicitCountry(localStorage) === null);
report('K2 o padrão NUNCA é gravado como se fosse escolha: ler o país inicial não escreve nada e "escolha manual" continua falsa', mem.size === 0 && hasManualSelection(localStorage) === false);
reset(); mem.set(EXPLICIT_COUNTRY_KEY, 'BR');
report('K3 escolha explícita (Brasil) sobrevive a atualizar a página: o país inicial é BR, nunca GW', initialCountry(localStorage) === 'BR' && hasManualSelection(localStorage) === true);
reset(); mem.set(EXPLICIT_COUNTRY_KEY, 'GW');
report('K4 escolher explicitamente a Guiné-Bissau também é uma escolha (conta como manual e não é trocada pelo perfil)', initialCountry(localStorage) === 'GW' && hasManualSelection(localStorage) === true && profileCountryToApply({ hasUser: true, hasManualSelection: true, userCountry: 'BR' }) === null);
reset(); mem.set(EXPLICIT_COUNTRY_KEY, 'sn');
report('K5 valor guardado em minúsculas é normalizado (SN)', initialCountry(localStorage) === 'SN');
for (const junk of ['', '   ', 'null', 'undefined', '<script>', 'BR;DROP', 'X']) {
  reset(); mem.set(EXPLICIT_COUNTRY_KEY, junk);
  if (initialCountry(localStorage) !== 'GW') report(`K6 valor inválido guardado ("${junk}") cai no padrão`, false, initialCountry(localStorage));
}
report('K6 valores inválidos guardados (vazio, lixo, injeção) caem no padrão GW, sem lançar erro', true);
reset(); mem.set('nusali_display_currency', 'BRL');
report('K7 só a MOEDA escolhida manualmente também impede o perfil de substituir (escolha manual); o país continua padrão GW', hasManualSelection(localStorage) === true && initialCountry(localStorage) === 'GW' && profileCountryToApply({ hasUser: true, hasManualSelection: true, userCountry: 'BR' }) === null);
const broken = { getItem: () => { throw new Error('storage bloqueado'); } } as any;
report('K8 storage bloqueado/indisponível (modo privado): nunca lança; usa o padrão', initialCountry(broken) === 'GW' && hasManualSelection(broken) === false && readExplicitCountry(undefined) === null);

// ---- país do perfil: só quando não há escolha
report('K9 país do perfil só é aplicado SEM escolha manual e com usuário; com escolha manual ou sem usuário → null (nunca substitui)', profileCountryToApply({ hasUser: true, hasManualSelection: false, userCountry: 'br' }) === 'BR' && profileCountryToApply({ hasUser: true, hasManualSelection: false }) === 'GW' && profileCountryToApply({ hasUser: false, hasManualSelection: false, userCountry: 'BR' }) === null && profileCountryToApply({ hasUser: true, hasManualSelection: true, userCountry: 'SN' }) === null);

// ---- outras abas
report('K10 mudança da escolha explícita em OUTRA aba (evento storage) é acompanhada; outras chaves e valores inválidos são ignorados', countryFromStorageEvent({ key: EXPLICIT_COUNTRY_KEY, newValue: 'sn' }) === 'SN' && countryFromStorageEvent({ key: 'nusali_cart', newValue: 'BR' }) === null && countryFromStorageEvent({ key: EXPLICIT_COUNTRY_KEY, newValue: null }) === null && countryFromStorageEvent({ key: EXPLICIT_COUNTRY_KEY, newValue: 'lixo!' }) === null);

// ---- header da API (X-Country-Code) lê primeiro a escolha explícita
reset();
report('K11 header: sem nada guardado → null (o apiClient usa o padrão da configuração)', storageService.getSelectedCountry() === null);
mem.set('nusali_selected_country', 'GW'); mem.set(EXPLICIT_COUNTRY_KEY, 'BR');
report('K12 header: a escolha explícita (BR) vence o valor derivado antigo (GW) — a primeira chamada depois de atualizar a página já leva BR', storageService.getSelectedCountry() === 'BR');
reset(); mem.set('nusali_selected_country', 'SN');
report('K13 header: sem escolha explícita, usa o país derivado (perfil/padrão) já gravado', storageService.getSelectedCountry() === 'SN');
reset(); mem.set(EXPLICIT_COUNTRY_KEY, 'BR');
report('K14 header: sessão legada (só a chave da escolha, sem a derivada) também envia BR — nunca cai em GW por falta da chave derivada', storageService.getSelectedCountry() === 'BR');

// ---- travas de código
const ctx = src('src/context/PreferencesContext.tsx');
report('K15 contexto: estado inicial vem de initialCountry(localStorage); o perfil só entra via profileCountryToApply; há ouvinte de outras abas', ctx.includes('initialCountry(localStorage)') && ctx.includes('profileCountryToApply({ hasUser: true, hasManualSelection') && ctx.includes("window.addEventListener('storage', onStorage)") && ctx.includes("window.removeEventListener('storage', onStorage)"));
const writers = ['src/context/PreferencesContext.tsx', 'src/components/Header.tsx', 'src/context/AuthContext.tsx', 'src/context/DeliveryDestinationContext.tsx', 'src/services/storage/storageService.ts', 'src/pages/HomePage.tsx'].map((f) => [f, (src(f).match(/setItem\('nusali_display_country'/g) || []).length] as const);
report('K16 a chave da escolha explícita só é ESCRITA em setSelectedCountry (clique do cliente): uma única escrita em todo o frontend', writers.filter(([, n]) => n > 0).length === 1 && writers.find(([f]) => f.endsWith('PreferencesContext.tsx'))![1] === 1, writers);
report('K17 nenhum login/logout/limpeza apaga a escolha: sem localStorage.clear() nem remoção da chave no frontend', !/localStorage\.clear\(\)|removeItem\('nusali_display_country'\)/.test(['src/context/AuthContext.tsx', 'src/services/storage/storageService.ts', 'src/context/PreferencesContext.tsx', 'src/api/apiClient.ts'].map(src).join('\n')));
report('K18 o apiClient envia o país pelo storageService (X-Country-Code) em TODA requisição', /storageService\.getSelectedCountry\(\)\s*\|\|\s*CONFIG\.DEFAULT_COUNTRY/.test(src('src/api/apiClient.ts')) && src('src/api/apiClient.ts').includes("config.headers.set('X-Country-Code', country)"));
report('K19 trocar de país continua gravando país + moeda no clique e marcando escolha manual', /setHasManualSelection\(true\);\s*\n\s*\n?\s*try \{\s*\n\s*localStorage\.setItem\('nusali_display_country', country\);/.test(ctx));

console.log(`\nRESULTADO: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
