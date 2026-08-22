export interface KycReviewRecord {
  id: string;
  sellerId: string;
  sellerName: string;
  companyName: string;
  country: string;
  accountType: string;
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
