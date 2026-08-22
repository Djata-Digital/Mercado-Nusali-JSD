/**
 * Utility functions for centralizing Seller KYC status checks.
 * A seller's KYC is considered approved only if status is 'approved' or 'verified'.
 */
export function isSellerKycApproved(kycStatus?: string | null): boolean {
  if (!kycStatus) return false;
  const normalized = String(kycStatus).toLowerCase().trim();
  return normalized === 'approved' || normalized === 'verified';
}
