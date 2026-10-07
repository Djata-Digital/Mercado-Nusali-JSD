import React from 'react';
import { LegalDocumentPage } from '../components/legal/LegalDocumentPage';
import { TERMS_INTRO, TERMS_SECTIONS } from '../content/legal/termsOfUse';
import { LEGAL_PRIVACY_PATH } from '../content/legal/legalTypes';

export const TermsOfUsePage: React.FC = () => (
  <LegalDocumentPage
    kind="terms"
    title="Termos de Uso"
    intro={TERMS_INTRO}
    sections={TERMS_SECTIONS}
    other={{ to: LEGAL_PRIVACY_PATH, label: 'Ler a Política de Privacidade' }}
  />
);
