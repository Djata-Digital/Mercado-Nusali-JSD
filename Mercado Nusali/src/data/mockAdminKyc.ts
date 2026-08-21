export interface KycReviewRecord {
  id: string;
  sellerName: string;
  companyName: string;
  country: string;
  accountType: 'Pessoa Física' | 'Pessoa Jurídica' | 'Empresa Exportadora';
  documentType: 'Bilhete de Identidade' | 'Passaporte CPLP' | 'Certidão Comercial' | 'NIF / CNPJ';
  documentNumber: string;
  submittedAt: string;
  status: 'nova' | 'under_review' | 'info_requested' | 'verified' | 'rejected' | 'fraud_suspect';
  docFrontUrl: string;
  docBackUrl?: string;
  selfieUrl: string;
  proofAddressUrl: string;
  businessLicenseUrl?: string;
  riskScore: 'baixo' | 'medio' | 'alto' | 'critico';
  notes?: string;
}

export const mockKycReviewList: KycReviewRecord[] = [
  {
    id: 'KYC-901',
    sellerName: 'Carlos Biai',
    companyName: 'Bissau Tech Store',
    country: 'GW',
    accountType: 'Pessoa Jurídica',
    documentType: 'Bilhete de Identidade',
    documentNumber: 'BI-GW-982109',
    submittedAt: '30/07/2026 às 14:10',
    status: 'under_review',
    docFrontUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
    selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
    businessLicenseUrl: 'https://images.unsplash.com/photo-1450133064473-71024230f91b?auto=format&fit=crop&w=400&q=80',
    riskScore: 'baixo',
    notes: 'Documentos do Ministério da Justiça de Bissau válidos.'
  },
  {
    id: 'KYC-902',
    sellerName: 'Bacai Sanhá',
    companyName: 'Energia Solar Bissau',
    country: 'GW',
    accountType: 'Pessoa Jurídica',
    documentType: 'Certidão Comercial',
    documentNumber: 'NIF-55210981',
    submittedAt: '31/07/2026 às 09:30',
    status: 'nova',
    docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
    selfieUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
    proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
    riskScore: 'baixo'
  },
  {
    id: 'KYC-903',
    sellerName: 'EletroBissau Ltda',
    companyName: 'EletroBissau Comercial',
    country: 'GW',
    accountType: 'Pessoa Jurídica',
    documentType: 'NIF / CNPJ',
    documentNumber: 'NIF-11002233',
    submittedAt: '28/07/2026 às 16:20',
    status: 'info_requested',
    docFrontUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=400&q=80',
    selfieUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80',
    proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
    riskScore: 'medio',
    notes: 'Solicitada nova selfie com o documento legível em mãos.'
  },
  {
    id: 'KYC-904',
    sellerName: 'Importadora Caxito',
    companyName: 'Caxito Vendas',
    country: 'AO',
    accountType: 'Pessoa Física',
    documentType: 'Passaporte CPLP',
    documentNumber: 'NIF-AO-992102',
    submittedAt: '25/07/2026 às 11:00',
    status: 'fraud_suspect',
    docFrontUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=400&q=80',
    selfieUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
    proofAddressUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=400&q=80',
    riskScore: 'critico',
    notes: 'Inconsistência identificada entre a foto do passaporte e selfie.'
  }
];

export const mockAdminKycList = mockKycReviewList;

