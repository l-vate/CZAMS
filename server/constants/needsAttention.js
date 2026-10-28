// The "Needs attention" panel on the admin dashboard (utils/needsAttention.js, routes/adminNeedsAttentionRoutes.js). The one place for the
// numbers the owner may want to change. Nothing here is stored per booking: the panel is worked out live from the bookings, the back job
// claims and the services, every time it is asked for.

// "Today" means the Manila calendar day the request is made on, and this many days after it (1 = today and tomorrow).
const TODAY_WINDOW_DAYS = 1;

// How many items each group shows. The count in the header is always the full number.
const ITEMS_PER_GROUP = 5;

// An item turns "soon" once it has been waiting this many working days. A working day is a Manila calendar day that is not a Sunday
// (the shop is closed on Sundays), so a request made on a Saturday does not age over the Sunday. 0 means "soon" from the first day.
const SOON_AFTER_WORKING_DAYS = Object.freeze({
  today_pending: 1,
  today_unstaffed: 0,
  today_proof: 0,
  pending_approval: 1,
  unit_confirmation: 1,
  cannot_supply: 3,
  discount_review: 1,
  back_job_review: 2,
  extension_request: 0,
  disruption_report: 0,
  payment_proof: 1,
  refund_waiting: 2,
});

// The groups, in the order the panel shows them, and the kinds that belong to each.
const GROUPS = Object.freeze({
  today: Object.freeze(['today_pending', 'today_unstaffed', 'today_proof']),
  decision: Object.freeze(['pending_approval', 'unit_confirmation', 'cannot_supply', 'discount_review', 'back_job_review', 'extension_request', 'disruption_report']),
  money: Object.freeze(['payment_proof', 'refund_waiting']),
});
const GROUP_KEYS = Object.freeze(['today', 'decision', 'money']);

// urgency, most urgent first
const URGENCY_RANK = Object.freeze({ today: 0, soon: 1, waiting: 2 });

module.exports = { TODAY_WINDOW_DAYS, ITEMS_PER_GROUP, SOON_AFTER_WORKING_DAYS, GROUPS, GROUP_KEYS, URGENCY_RANK };
