/**
 * Documentos legais do Mercado Nusali (LEGAL-1). O texto vive em dados tipados (não em JSX) para poder ser renderizado,
 * versionado e auditado automaticamente (ex.: varredura de promessas absolutas nos testes).
 *
 * Links internos dentro do texto: {{/caminho|Texto do link}} (renderizado pelo LegalDocumentPage).
 */
export type LegalBlock = { type: 'p'; text: string } | { type: 'ul'; items: string[] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

/** Versão dos documentos legais exibidos. Mudou o texto de forma relevante: incremente e atualize a data. */
export const LEGAL_VERSION = '1.0';
/**
 * Versões VIGENTES de cada documento. O SERVIDOR grava estas constantes ao registrar o aceite (LEGAL-2): o cliente nunca informa
 * a versão. Hoje os dois documentos andam juntos; ao versionar separadamente, basta separar estas duas constantes.
 */
export const LEGAL_TERMS_VERSION = LEGAL_VERSION;
export const LEGAL_PRIVACY_VERSION = LEGAL_VERSION;
export const LEGAL_UPDATED_AT_ISO = '2026-10-07';
export const LEGAL_UPDATED_AT_LABEL = '7 de outubro de 2026';

export const LEGAL_TERMS_PATH = '/termos-de-uso';
export const LEGAL_PRIVACY_PATH = '/politica-de-privacidade';
