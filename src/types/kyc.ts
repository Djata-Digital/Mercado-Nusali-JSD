export interface KycReviewRecord {
  id: string;
  sellerId: string;
  sellerName: string;
  companyName: string;
  country: string;
  accountType: string;
  /** 'pf' | 'empresa' | null (cadastro antigo sem tipo guardado) */
  accountTypeKey?: 'pf' | 'empresa' | null;
  /** o que ainda falta, no banco, para poder aprovar (vazio = completo) */
  missingRequirements?: Array<{ field: string; label: string; message: string }>;
  documentType: string;
  documentNumber: string;
  submittedAt: string;
  status: 'pending' | 'under_review' | 'verified' | 'rejected';
  docFrontUrl?: string;
  docBackUrl?: string;
  selfieUrl?: string;
  proofAddressUrl?: string;
  businessLicenseUrl?: string;
  riskScore?: string;
  notes?: string;
}
