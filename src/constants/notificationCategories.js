// The category every notification kind belongs to, for the tabs on the notifications page. One kind, one category. A kind that is not
// listed here (a new one sent by the server before this file is updated) falls under Other, and server/test/notificationCategories.test.js
// fails until it is listed, so none slips through unnoticed.
export const CATEGORY = Object.freeze({
  BOOKINGS: 'bookings',
  PAYMENTS: 'payments',
  REFUNDS: 'refunds',
  UNITS: 'units',
  JOBS: 'jobs',
  CHAT: 'chat',
  ACCOUNT: 'account',
  OTHER: 'other',
});

// In the order the tabs are shown.
export const CATEGORY_ORDER = Object.freeze([
  CATEGORY.BOOKINGS, CATEGORY.PAYMENTS, CATEGORY.REFUNDS, CATEGORY.UNITS, CATEGORY.JOBS, CATEGORY.CHAT, CATEGORY.ACCOUNT, CATEGORY.OTHER,
]);

export const CATEGORY_LABEL = Object.freeze({
  [CATEGORY.BOOKINGS]: 'Bookings',
  [CATEGORY.PAYMENTS]: 'Payments',
  [CATEGORY.REFUNDS]: 'Refunds',
  [CATEGORY.UNITS]: 'Units',
  [CATEGORY.JOBS]: 'Jobs and reports',
  [CATEGORY.CHAT]: 'Chat',
  [CATEGORY.ACCOUNT]: 'Account',
  [CATEGORY.OTHER]: 'Other',
});

export const NOTIFICATION_CATEGORY = Object.freeze({
  // Bookings: a booking is made, decided, started, finished, cancelled or moved
  booking_created: CATEGORY.BOOKINGS,
  booking_new: CATEGORY.BOOKINGS,
  booking_approved: CATEGORY.BOOKINGS,
  booking_cancelled: CATEGORY.BOOKINGS,
  booking_in_progress: CATEGORY.BOOKINGS,
  booking_expired: CATEGORY.BOOKINGS,
  no_show_confirmed: CATEGORY.BOOKINGS,
  no_show_rejected: CATEGORY.BOOKINGS,
  booking_completed: CATEGORY.BOOKINGS,
  reschedule_requested: CATEGORY.BOOKINGS,
  reschedule_received: CATEGORY.BOOKINGS,
  reschedule_approved: CATEGORY.BOOKINGS,
  reschedule_denied: CATEGORY.BOOKINGS,
  scope_updated: CATEGORY.BOOKINGS,
  service_reminder: CATEGORY.BOOKINGS,
  // Payments: money in, and what the price is made of
  payment_submitted: CATEGORY.PAYMENTS,
  payment_verified: CATEGORY.PAYMENTS,
  payment_rejected: CATEGORY.PAYMENTS,
  charge_updated: CATEGORY.PAYMENTS,
  quotation_updated: CATEGORY.PAYMENTS,
  discount_requested: CATEGORY.PAYMENTS,
  discount_approved: CATEGORY.PAYMENTS,
  discount_rejected: CATEGORY.PAYMENTS,
  // Refunds: money back
  refund_flagged: CATEGORY.REFUNDS,
  refund_requested: CATEGORY.REFUNDS,
  refund_processed: CATEGORY.REFUNDS,
  refund_rejected: CATEGORY.REFUNDS,
  refund_confirmed: CATEGORY.REFUNDS,
  // Units: the air conditioner a customer asked for
  unit_request_resolved: CATEGORY.UNITS,
  unit_request_declined: CATEGORY.UNITS,
  // Jobs and reports: the work itself, from assignment to the service report and back jobs
  job_assigned: CATEGORY.JOBS,
  job_unassigned: CATEGORY.JOBS,
  instructions_updated: CATEGORY.JOBS,
  report_removed: CATEGORY.JOBS,
  no_show_reported: CATEGORY.JOBS,
  disruption_reported: CATEGORY.JOBS,
  disruption_notice: CATEGORY.JOBS,
  disruption_rescheduled: CATEGORY.JOBS,
  extension_requested: CATEGORY.JOBS,
  extension_approved: CATEGORY.JOBS,
  extension_denied: CATEGORY.JOBS,
  backjob_filed: CATEGORY.JOBS,
  backjob_received: CATEGORY.JOBS,
  backjob_decided: CATEGORY.JOBS,
  // Chat
  chat_message: CATEGORY.CHAT,
  // Account: about a person's account rather than a booking
  technician_deactivated: CATEGORY.ACCOUNT,
});

export function categoryOf(type) {
  return NOTIFICATION_CATEGORY[type] || CATEGORY.OTHER;
}

// The kinds in a category. For Other this is empty: Other is "every kind not listed", which the server is told with `exceptTypes`.
export function typesInCategory(category) {
  return Object.keys(NOTIFICATION_CATEGORY).filter((type) => NOTIFICATION_CATEGORY[type] === category);
}

// What to send the server so it marks only one category read: { types } for a listed one, { exceptTypes } for Other, nothing for All.
export function readFilterFor(category) {
  if (!category) return undefined;
  if (category === CATEGORY.OTHER) return { exceptTypes: Object.keys(NOTIFICATION_CATEGORY) };
  return { types: typesInCategory(category) };
}
