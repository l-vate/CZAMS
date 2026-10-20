// The Senior Citizen and PWD discount: the owner's answer, one value in one place. It is taken off the service charge only (the units),
// never off distance or mobilization fees, and only when the customer asks for it and the owner has checked the ID in person.
// Read by routes/bookingRoutes.js (apply, walk-in) and routes/paymentSettingsRoutes.js (what the screens show).
// The browser shows the percent it gets from the payment settings answer, so it never keeps its own copy.
const SENIOR_PWD_DISCOUNT_RATE = 0.20;
const SENIOR_PWD_DISCOUNT_PERCENT = Math.round(SENIOR_PWD_DISCOUNT_RATE * 100);

module.exports = { SENIOR_PWD_DISCOUNT_RATE, SENIOR_PWD_DISCOUNT_PERCENT };
