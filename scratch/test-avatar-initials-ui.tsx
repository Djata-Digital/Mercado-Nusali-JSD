/**
 * Foto de perfil simplificada — regras puras (iniciais, validacao, assinatura do arquivo, URL de foto real), componentes (SSR),
 * foto do cadastro guardada e enviada so apos verificar o e-mail, e travas no codigo das telas. Sem banco, sem rede.
 */
import React from 'react';
import fs from 'fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { AVATAR_MAX_BYTES, avatarColorClass, getInitials, isUploadedAvatarUrl, resolveAvatarUrl, sniffImageMime, validateAvatarFile } from '../src/utils/avatar.js';
import { UserAvatar } from '../src/components/UserAvatar.js';
import { AvatarUploadField } from '../src/components/AvatarUploadField.js';
import { SIGNUP_AVATAR_KEY, flushSignupAvatar, stashSignupAvatar } from '../src/services/signupAvatar.js';

let pass = 0, fail = 0;
const report = (n: string, ok: boolean, d?: unknown) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  => ' + JSON.stringify(d ?? null).slice(0, 400)}`); };
const src = (p: string) => fs.readFileSync(p, 'utf8');
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const UNSPLASH = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80';
const REAL = 'https://pub-abc.r2.dev/profiles/usr_123/avatar?v=1730000000';

// ---------- A. iniciais
report('A1 João Djata → JD', getInitials('João Djata') === 'JD', getInitials('João Djata'));
report('A2 Djata Digital → DD', getInitials('Djata Digital') === 'DD');
report('A3 Maria → M', getInitials('Maria') === 'M');
report('A4 Maria da Silva → MS (primeiro + último)', getInitials('Maria da Silva') === 'MS');
report('A5 espaços extras, minúsculas e acentos: "  álvaro   émile " → ÁÉ', getInitials('  álvaro   émile ') === 'ÁÉ', getInitials('  álvaro   émile '));
report('A6 vazio/nulo/indefinido → ""', getInitials('') === '' && getInitials(null) === '' && getInitials(undefined) === '' && getInitials('   ') === '');
report('A7 muda o nome, mudam as iniciais', getInitials('João Djata') !== getInitials('Maria Pereira') && getInitials('Maria Pereira') === 'MP');
report('A8 cor estável por nome', avatarColorClass('João Djata') === avatarColorClass('João Djata') && /^bg-/.test(avatarColorClass('')));

// ---------- B. validação do arquivo (tipo, tamanho)
report('B1 jpeg/png/webp válidos', ['image/jpeg', 'image/png', 'image/webp'].every((t) => validateAvatarFile({ type: t, size: 1000 }) === null));
report('B2 gif/svg/pdf recusados com mensagem', ['image/gif', 'image/svg+xml', 'application/pdf', ''].every((t) => !!validateAvatarFile({ type: t, size: 1000 })));
report('B3 acima de 5 MB recusado; exatamente 5 MB aceito', !!validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES + 1 }) && validateAvatarFile({ type: 'image/jpeg', size: AVATAR_MAX_BYTES }) === null);
report('B4 vazio e nulo recusados', !!validateAvatarFile({ type: 'image/png', size: 0 }) && !!validateAvatarFile(null));

// ---------- C. assinatura real do arquivo
const bytes = (...b: number[]) => Uint8Array.from([...b, ...new Array(Math.max(0, 16 - b.length)).fill(0)]);
const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
report('C1 JPEG/PNG/WEBP reconhecidos pelos bytes', sniffImageMime(bytes(0xff, 0xd8, 0xff, 0xe0)) === 'image/jpeg' && sniffImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) === 'image/png' && sniffImageMime(webp) === 'image/webp');
report('C2 texto/HTML/SVG/GIF/curto → null (mesmo declarado como imagem)', sniffImageMime(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')) === null && sniffImageMime(new TextEncoder().encode('GIF89a......')) === null && sniffImageMime(new Uint8Array(3)) === null && sniffImageMime(null) === null);

// ---------- D. o que conta como foto real
report('D1 foto carregada (profiles/<id>/avatar?v=) é aceita', isUploadedAvatarUrl(REAL) && resolveAvatarUrl(REAL) === REAL);
report('D2 avatar predefinido antigo (Unsplash) NÃO é foto → iniciais', !isUploadedAvatarUrl(UNSPLASH) && resolveAvatarUrl(UNSPLASH) === null);
report('D3 links colados/outros sites/vazio/ícone → iniciais', ['https://example.com/me.png', 'http://x.com/a.jpg', '', null, undefined, 42, 'javascript:alert(1)', 'ftp://h/profiles/u/avatar'].every((u) => resolveAvatarUrl(u) === null));
report('D4 prévia local (blob:/data:image) aceita; data:text/html e data:svg não', resolveAvatarUrl('blob:http://localhost/abc') !== null && resolveAvatarUrl('data:image/jpeg;base64,AAAA') !== null && resolveAvatarUrl('data:text/html;base64,AAAA') === null && resolveAvatarUrl('data:image/svg+xml;base64,AAAA') === null);
report('D5 "profiles" só no domínio/consulta não conta', resolveAvatarUrl('https://evil.com/x?next=profiles/u/avatar') === null);

// ---------- E. UserAvatar (SSR)
const aJD = html(<UserAvatar name="João Djata" />);
report('E1 sem foto: círculo com JD', aJD.includes('data-testid="user-avatar-initials"') && aJD.includes('>JD<') && aJD.includes('rounded-full') && !aJD.includes('<img'), aJD);
report('E2 "Djata Digital" → DD e "Maria" → M', html(<UserAvatar name="Djata Digital" />).includes('>DD<') && html(<UserAvatar name="Maria" />).includes('>M<'));
report('E3 as iniciais acompanham o nome (mesmo componente, nome novo)', html(<UserAvatar name="Maria" />).includes('>M<') && html(<UserAvatar name="Maria Pereira" />).includes('>MP<'));
const aPhoto = html(<UserAvatar name="João Djata" src={REAL} />);
report('E4 com foto real: <img> da foto, sem iniciais', aPhoto.includes('data-testid="user-avatar-photo"') && aPhoto.includes(REAL.replace(/&/g, '&amp;')) && !aPhoto.includes('>JD<'), aPhoto);
const aOld = html(<UserAvatar name="João Djata" src={UNSPLASH} />);
report('E5 avatar artificial antigo guardado no perfil → iniciais, sem <img>', aOld.includes('>JD<') && !aOld.includes('<img') && !aOld.includes('unsplash'), aOld);
report('E6 sem nome e sem foto → ícone neutro (sem texto)', html(<UserAvatar />).includes('data-testid="user-avatar-initials"') && html(<UserAvatar />).includes('<svg'));
report('E7 tamanho/forma configuráveis (móvel: w-8 h-8; admin: arredondado)', html(<UserAvatar name="A B" className="w-8 h-8 text-xs" />).includes('w-8 h-8 text-xs') && html(<UserAvatar name="A B" shape="rounded" />).includes('rounded-xl'));
report('E8 acessível: rótulo com o nome', aJD.includes('role="img"') && aJD.includes('aria-label="Iniciais de João Djata: JD"'), aJD);

// ---------- F. AvatarUploadField (SSR)
const f = html(<AvatarUploadField name="João Djata" src={null} onFile={() => {}} />);
report('F1 UM botão "Carregar Foto" e nenhum botão extra', (f.match(/<button/g) || []).length === 1 && f.includes('Carregar Foto'), f);
report('F2 sem campo de link/URL, sem "Colar Link", sem avatares predefinidos', !/Colar Link/i.test(f) && !/type="url"/.test(f) && !/type="text"/.test(f) && !/unsplash/i.test(f) && !f.includes('<img'), f);
report('F3 seletor de arquivo só com jpeg/png/webp (computador e telemóvel)', f.includes('type="file"') && f.includes('accept="image/jpeg,image/png,image/webp"'));
report('F4 prévia com as iniciais do nome digitado', f.includes('>JD<'));
report('F5 erro visível e anunciado', html(<AvatarUploadField name="A" onFile={() => {}} error="Formato não aceito." />).includes('role="alert"'));
report('F6 ocupado → botão desabilitado', html(<AvatarUploadField name="A" onFile={() => {}} busy />).includes('disabled'));

// ---------- G. foto do cadastro: guardada e enviada só depois de verificar o e-mail
const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, _m: m }; };
const fakeFile = (type = 'image/jpeg', size = 2000) => ({ type, size, name: 'a.jpg' }) as unknown as File;
(async () => {
  let t = 1_000_000;
  const shrink = async () => 'data:image/jpeg;base64,AAAA';
  const upl = { calls: 0, fail: false, saved: '' as string };
  const deps = (st: ReturnType<typeof mem>) => ({
    storage: st, now: () => t,
    toFile: async () => fakeFile(),
    upload: async () => { upl.calls++; if (upl.fail) throw new Error('boom'); return { url: REAL }; },
    save: async (u: string) => { upl.saved = u; },
  });
  let st = mem();
  report('G1 foto inválida no cadastro é recusada e nada é guardado', !!(await stashSignupAvatar(fakeFile('image/gif'), 'a@b.com', { storage: st, shrink, now: () => t })) && st._m.size === 0);
  report('G2 foto válida é guardada (reduzida) para aquele e-mail', (await stashSignupAvatar(fakeFile(), 'A@b.com', { storage: st, shrink, now: () => t })) === null && st._m.has(SIGNUP_AVATAR_KEY));
  let r = await flushSignupAvatar('a@B.com', deps(st));
  report('G3 após verificar o e-mail (mesmo e-mail, sem diferenciar maiúsculas) envia e salva a foto; limpa o armazenamento', r.status === 'uploaded' && r.url === REAL && upl.saved === REAL && upl.calls === 1 && st._m.size === 0, r);
  report('G4 sem foto escolhida → nada a enviar (cadastro sem foto)', (await flushSignupAvatar('a@b.com', deps(mem()))).status === 'none');
  st = mem(); await stashSignupAvatar(fakeFile(), 'a@b.com', { storage: st, shrink, now: () => t }); upl.calls = 0;
  r = await flushSignupAvatar('outra@pessoa.com', deps(st));
  report('G5 foto de OUTRO e-mail nunca é enviada (e é descartada)', r.status === 'none' && upl.calls === 0 && st._m.size === 0, r);
  st = mem(); await stashSignupAvatar(fakeFile(), 'a@b.com', { storage: st, shrink, now: () => t });
  t += 7 * 60 * 60 * 1000;
  r = await flushSignupAvatar('a@b.com', deps(st));
  report('G6 foto guardada há mais de 6 h expira', r.status === 'none' && upl.calls === 0 && st._m.size === 0, r);
  st = mem(); t = 2_000_000; await stashSignupAvatar(fakeFile(), 'a@b.com', { storage: st, shrink, now: () => t }); upl.fail = true;
  r = await flushSignupAvatar('a@b.com', deps(st));
  report('G7 falha no envio não bloqueia a verificação: status failed (ficam as iniciais) e nada fica guardado', r.status === 'failed' && st._m.size === 0, r);
  st = mem(); st.setItem(SIGNUP_AVATAR_KEY, '{lixo');
  report('G8 armazenamento corrompido é ignorado e limpo', (await flushSignupAvatar('a@b.com', deps(st))).status === 'none' && st._m.size === 0);
  st = mem(); upl.fail = false; await stashSignupAvatar(fakeFile(), 'a@b.com', { storage: st, shrink, now: () => t });
  const bad = { ...deps(st), toFile: async () => fakeFile('image/svg+xml') };
  report('G9 arquivo reconstruído inválido não é enviado', (await flushSignupAvatar('a@b.com', bad)).status === 'failed');

  // ---------- H. travas no código das telas
  const reg = src('src/pages/RegisterPage.tsx'), prof = src('src/components/ProfileView.tsx'), sel = src('src/components/seller/SellerAccount.tsx');
  const bad2 = /PRESET_AVATARS|Colar Link|customAvatarUrl|showCustomUrlInput|images\.unsplash\.com/i;
  report('H1 cadastro/perfil/vendedor sem avatares predefinidos nem "Colar Link"/URL', [reg, prof, sel].every((s) => !bad2.test(s)), [reg, prof, sel].map((s) => bad2.test(s)));
  report('H2 as três telas usam o campo único AvatarUploadField', [reg, prof, sel].every((s) => s.includes('<AvatarUploadField')));
  report('H3 cadastro não envia mais "avatar" no register e guarda a foto para depois da verificação', !/avatar:\s*(avatar|selectedAvatar|customAvatarUrl)/.test(reg) && reg.includes('stashSignupAvatar'));
  report('H4 verificação do e-mail envia a foto guardada pelo upload existente', src('src/pages/VerifyEmailPage.tsx').includes('flushSignupAvatar') && src('src/pages/VerifyEmailPage.tsx').includes('uploadService.uploadProfile'));
  const hdr = src('src/components/Header.tsx'), sb = src('src/components/seller/SellerSidebar.tsx'), adm = src('src/components/admin/AdminCountryRepresentatives.tsx');
  report('H5 cabeçalho, painel do vendedor e representantes usam UserAvatar (sem círculo de iniciais próprio)', hdr.includes('<UserAvatar') && sb.includes('<UserAvatar') && adm.includes('<UserAvatar') && !hdr.includes("slice(0, 2).toUpperCase()") && !/substring\(0, 2\)/.test(adm) && !/const getInitials/.test(sb));
  report('H6 perfil e vendedor mostram iniciais do nome em edição (acompanham o campo)', prof.includes('name={isEditing ? editName') && sel.includes('name={fullName}'));
  report('H7 telemóvel: seletor aceita imagens (galeria/câmera) e o campo não força largura fixa', f.includes('accept="image/jpeg,image/png,image/webp"') && !/\bw-\[\d{3,}px\]/.test(f) && f.includes('min-w-0'));
  const buyer = src('src/server/buyerRoutes.ts'), upr = src('src/server/uploadRoutes.ts');
  report('H8 servidor: perfil só aceita foto do próprio upload e upload de perfil confere o conteúdo real', buyer.includes('isOwnProfileAvatarUrl') && buyer.includes('AVATAR_NOT_ALLOWED') && upr.includes('sniffImageMime') && upr.includes('INVALID_IMAGE_CONTENT'));
  const kyc = ['src/utils/sellerKycRules.ts', 'src/utils/kycClient.ts'].every((p) => fs.existsSync(p));
  report('H9 KYC intocado por este trabalho (arquivos presentes; sem referência a avatar)', kyc && !/avatar/i.test(src('src/utils/sellerKycRules.ts')) && !/avatar/i.test(src('src/components/seller/SellerKyc.tsx')));

  console.log(`\n${pass}/${pass + fail} passaram`);
  process.exit(fail ? 1 : 0);
})();
