const PaymentSettings = require('../models/PaymentSettings');

const SETTINGS_ID = 'default';

// Seeded only if nothing exists yet (first deploy / fresh DB) - matches today's
// hardcoded constants exactly, so switching over changes nothing until an admin
// actually edits something.
const DEFAULT_SETTINGS = {
  _id: SETTINGS_ID,
  paymentMethods: [
    { name: 'Cash', accountDetails: [] },
    { name: 'GCash', accountDetails: [] },
    { name: 'Cheque', accountDetails: [] },
    { name: 'Bank Transfer', accountDetails: [] },
  ],
  downPaymentPercentages: [30, 50, 100],
  seniorPwdDiscountPercent: 20,
};

async function getOrCreateSettings() {
  let settings = await PaymentSettings.findById(SETTINGS_ID);
  if (!settings) settings = await PaymentSettings.create(DEFAULT_SETTINGS);
  return settings;
}

module.exports = { SETTINGS_ID, DEFAULT_SETTINGS, getOrCreateSettings };
