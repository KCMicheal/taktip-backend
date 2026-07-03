export enum NotificationType {
  // Tips
  TIP_RECEIVED = 'tip_received',
  TIP_SENT = 'tip_sent',

  // Payouts
  PAYOUT_REQUESTED = 'payout_requested',
  PAYOUT_COMPLETED = 'payout_completed',
  PAYOUT_FAILED = 'payout_failed',
  PAYOUT_REJECTED = 'payout_rejected',

  // Shifts
  SHIFT_ASSIGNED = 'shift_assigned',

  // Merchant
  STAFF_INVITE = 'staff_invite',

  // Profile
  PROFILE_UPDATED = 'profile_updated',

  // System
  WELCOME = 'welcome',
  SYSTEM = 'system',
  MARKETING = 'marketing',
}
