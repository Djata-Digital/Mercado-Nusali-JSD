import React from 'react';
import { LegalDocumentPage } from '../components/legal/LegalDocumentPage';
import { PRIVACY_INTRO, PRIVACY_SECTIONS } from '../content/legal/privacyPolicy';
import { LEGAL_TERMS_PATH } from '../content/legal/legalTypes';

export const PrivacyPolicyPage: React.FC = () => (
  <LegalDocumentPage
    kind="privacy"
    title="Política de Privacidade"
    intro={PRIVACY_INTRO}
    sections={PRIVACY_SECTIONS}
    other={{ to: LEGAL_TERMS_PATH, label: 'Ler os Termos de Uso' }}
  />
);
