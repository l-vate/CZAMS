// The payment modes the rules below know by name, exactly as an admin spells them in Payment
// Settings. Any other mode the admin adds is treated as a mode that needs no reference number.
const PAYMENT_MODE = Object.freeze({
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank Transfer',
});

// A payment in one of these modes needs a proof file and a reference number.
const REFERENCE_REQUIRED_MODES = Object.freeze([PAYMENT_MODE.GCASH, PAYMENT_MODE.BANK_TRANSFER]);

// The paper: cash and cheque are not offered for the first payment made through the system, because they cannot be
// sent remotely. An admin recording a walk-in on the spot may still use them.
const FIRST_PAYMENT_BLOCKED_MODES = Object.freeze([PAYMENT_MODE.CASH, PAYMENT_MODE.CHEQUE]);

// The only ways a customer can pay online, for every payment they submit (the down payment and the remaining balance). Cash and cheque
// are recorded by the admin on site (PATCH /:bookingId/record-payment), which accepts every mode in PAYMENT_MODE.
const ONLINE_PAYMENT_MODES = Object.freeze([PAYMENT_MODE.GCASH, PAYMENT_MODE.BANK_TRANSFER]);

// The admin names the methods in Payment Settings, so a bank account is often "Bank Transfer (BDO)" or "Bank Transfer - BPI". Any name that starts with
// "Bank Transfer" is a bank transfer, and "GCash" is GCash: these two are the ways a customer can pay online (proof and reference number). The compare ignores
// letter case and spaces around the name.
const modeText = (mode) => String(mode || '').trim().toLowerCase();
const isGcashMode = (mode) => modeText(mode) === 'gcash';
const isBankTransferMode = (mode) => /^bank transfer(?:$|[\s(:-])/.test(modeText(mode));
const isOnlinePaymentMode = (mode) => isGcashMode(mode) || isBankTransferMode(mode);

module.exports = { PAYMENT_MODE, REFERENCE_REQUIRED_MODES, FIRST_PAYMENT_BLOCKED_MODES, ONLINE_PAYMENT_MODES, isGcashMode, isBankTransferMode, isOnlinePaymentMode };
