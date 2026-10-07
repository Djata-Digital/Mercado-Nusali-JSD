import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, ArrowRight } from 'lucide-react';
import type { LegalSection } from '../../content/legal/legalTypes';
import { LEGAL_UPDATED_AT_ISO, LEGAL_UPDATED_AT_LABEL, LEGAL_VERSION } from '../../content/legal/legalTypes';

// Links internos no texto: {{/caminho|Texto do link}}
const INLINE_LINK_RE = /\{\{(\/[^|}]+)\|([^}]+)\}\}/g;

const linkClass = 'font-semibold text-emerald-800 underline underline-offset-2 hover:text-emerald-950';

export function renderLegalText(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(INLINE_LINK_RE)) {
    const start = m.index ?? 0;
    if (start > last) nodes.push(text.slice(last, start));
    nodes.push(
      <Link key={`l${key++}`} to={m[1]} className={linkClass}>
        {m[2]}
      </Link>
    );
    last = start + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

interface LegalDocumentPageProps {
  kind: 'terms' | 'privacy';
  title: string;
  intro: string;
  sections: LegalSection[];
  other: { to: string; label: string };
}

export const LegalDocumentPage: React.FC<LegalDocumentPageProps> = ({ kind, title, intro, sections, other }) => {
  const Icon = kind === 'terms' ? FileText : ShieldCheck;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12" data-legal-document={kind}>
      <header className="bg-gradient-to-r from-blue-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-6 sm:p-10 shadow-lg mb-6">
        <div className="inline-flex items-center gap-2 bg-yellow-400 text-blue-950 px-3 py-1 rounded-full text-[11px] font-black uppercase mb-3">
          <Icon className="w-3.5 h-3.5" /> Documento legal
        </div>
        <h1 className="text-2xl sm:text-4xl font-black leading-tight mb-3 break-words">{title}</h1>
        <p className="text-sm sm:text-base text-gray-100 leading-relaxed">{intro}</p>
        <p className="mt-4 text-xs text-emerald-100/90">
          Versão {LEGAL_VERSION} · Última atualização: <time dateTime={LEGAL_UPDATED_AT_ISO}>{LEGAL_UPDATED_AT_LABEL}</time>
        </p>
      </header>

      <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl px-4 py-3 text-xs sm:text-sm leading-relaxed mb-6">
        Esta é a versão inicial do documento, publicada durante a fase de lançamento controlado do Mercado Nusali. Ela poderá ser
        atualizada à medida que a plataforma evoluir.
      </div>

      <nav aria-label="Índice do documento" className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-6 shadow-2xs mb-6">
        <h2 className="text-sm font-black text-gray-900 uppercase tracking-wide mb-3">Neste documento</h2>
        <ol className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
          {sections.map((s) => (
            <li key={s.id} className="min-w-0">
              <a href={`#${s.id}`} className="text-gray-700 hover:text-emerald-800 hover:underline break-words">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <article className="bg-white border border-gray-200 rounded-2xl p-5 sm:p-8 shadow-2xs space-y-8">
        {sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-t`} className="scroll-mt-24">
            <h2 id={`${s.id}-t`} className="text-lg sm:text-xl font-bold text-gray-900 mb-3 break-words">
              {s.title}
            </h2>
            <div className="space-y-3 text-sm sm:text-[15px] leading-relaxed text-gray-700">
              {s.blocks.map((b, i) =>
                b.type === 'p' ? (
                  <p key={i} className="break-words">
                    {renderLegalText(b.text)}
                  </p>
                ) : (
                  <ul key={i} className="list-disc pl-5 space-y-1.5 marker:text-emerald-700">
                    {b.items.map((item, j) => (
                      <li key={j} className="break-words">
                        {renderLegalText(item)}
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </section>
        ))}
      </article>

      <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
        <Link to={other.to} className="inline-flex items-center gap-1.5 font-bold text-emerald-800 hover:text-emerald-950">
          {other.label} <ArrowRight className="w-4 h-4" />
        </Link>
        <Link to="/" className="font-semibold text-gray-600 hover:text-gray-900">
          Voltar ao Mercado Nusali
        </Link>
      </div>
    </div>
  );
};
