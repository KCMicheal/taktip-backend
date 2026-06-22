// KYC status for merchant onboarding
// Tracks the Know-Your-Customer verification state
export enum KycStatus {
  PENDING = 1,   // Not yet submitted or awaiting review
  APPROVED = 2,  // KYC documents verified and approved
  REJECTED = 3,  // KYC documents rejected
}
