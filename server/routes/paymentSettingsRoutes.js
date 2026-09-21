const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const PaymentSettings = require('../models/PaymentSettings');

const SETTINGS_ID = 'default';

// Seeded only if nothing exists yet (first deploy / fresh DB) — matches today's
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
};

async function getOrCreateSettings() {
  let settings = await PaymentSettings.findById(SETTINGS_ID);
  if (!settings) settings = await PaymentSettings.create(DEFAULT_SETTINGS);
  return settings;
}

// Any logged-in role — customer/walk-in booking flows need this to render
// payment mode options and down payment choices, not just the admin editor.
router.get('/', auth, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Replaces the whole document — same pattern as Service's PUT. Rejects a save
// that would leave zero payment methods or zero down payment percentages, since
// that would silently lock the entire booking flow (no selectable options) for
// every customer and walk-in booking until someone noticed and fixed it back.
router.put('/', auth, async (req, res) => {
  try {
    if (req.userRole !== 'admin') {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const { paymentMethods, downPaymentPercentages } = req.body;

    if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
      return res.status(400).json({ message: 'At least one payment method is required.' });
    }
    if (!Array.isArray(downPaymentPercentages) || downPaymentPercentages.length === 0) {
      return res.status(400).json({ message: 'At least one down payment percentage is required.' });
    }

    const cleanedMethods = paymentMethods.map((m) => ({
      name: (m.name || '').trim(),
      accountDetails: Array.isArray(m.accountDetails)
        ? m.accountDetails
            .map((d) => ({ label: (d.label || '').trim(), value: (d.value || '').trim() }))
            .filter((d) => d.label && d.value)
        : [],
    }));
    if (cleanedMethods.some((m) => !m.name)) {
      return res.status(400).json({ message: 'Every payment method needs a name.' });
    }
    const methodNames = cleanedMethods.map((m) => m.name.toLowerCase());
    if (new Set(methodNames).size !== methodNames.length) {
      return res.status(400).json({ message: 'Payment method names must be unique.' });
    }

    const cleanedPercentages = downPaymentPercentages.map(Number);
    if (cleanedPercentages.some((p) => !Number.isFinite(p) || p <= 0 || p > 100)) {
      return res.status(400).json({ message: 'Down payment percentages must be numbers greater than 0 and no more than 100.' });
    }
    if (new Set(cleanedPercentages).size !== cleanedPercentages.length) {
      return res.status(400).json({ message: 'Down payment percentages must be unique.' });
    }

    const settings = await PaymentSettings.findByIdAndUpdate(
      SETTINGS_ID,
      { paymentMethods: cleanedMethods, downPaymentPercentages: cleanedPercentages },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
