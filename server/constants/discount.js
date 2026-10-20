// The Senior Citizen and PWD discount: the owner's answer, one value in one place. It is taken off the service charge only (the units),
// never off distance or mobilization fees, and only when the customer asks for it and the owner has checked the ID in person.
// Read by routes/bookingRoutes.js (apply, walk-in) and routes/paymentSettingsRoutes.js (what the screens show).
// The browser shows the percent it gets from the payment settings answer, so it never keeps its own copy.
const SENIOR_PWD_DISCOUNT_RATE = 0.20;
const SENIOR_PWD_DISCOUNT_PERCENT = Math.round(SENIOR_PWD_DISCOUNT_RATE * 100);

// The Senior/PWD ID photo is kept only so the owner can check it. The retention job (jobs/idPhotoRetentionJob.js) deletes the file this many
// days after the booking is completed or cancelled, or after the discount request is rejected. The discount record itself stays.
const ID_PHOTO_RETENTION_DAYS = 30;

// What the customer agrees to when they upload an ID photo (shown next to the upload).
const ID_PHOTO_CONSENT_TEXT = 'I agree that Cooling Zone may view my ID only to verify my Senior Citizen or PWD discount.';

module.exports = { SENIOR_PWD_DISCOUNT_RATE, SENIOR_PWD_DISCOUNT_PERCENT, ID_PHOTO_RETENTION_DAYS, ID_PHOTO_CONSENT_TEXT };
