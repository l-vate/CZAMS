// The payment modes the rules know by name, exactly as an admin spells them in Payment
// Settings. Any other mode the admin adds is treated as a mode that needs no reference number.
export const PAYMENT_MODE = Object.freeze({
  CASH: 'Cash',
  CHEQUE: 'Cheque',
  GCASH: 'GCash',
  BANK_TRANSFER: 'Bank Transfer',
});

// The only ways a customer can pay online. Cash and cheque are recorded by the admin on site.
export const ONLINE_PAYMENT_MODES = Object.freeze([PAYMENT_MODE.GCASH, PAYMENT_MODE.BANK_TRANSFER]);

// A payment in one of these modes needs a proof file and a reference number.
export const REFERENCE_REQUIRED_MODES = Object.freeze([PAYMENT_MODE.GCASH, PAYMENT_MODE.BANK_TRANSFER]);

// The admin names the methods in Payment Settings, so a bank account is often "Bank Transfer (BDO)" or "Bank Transfer - BPI". Any name that starts with
// "Bank Transfer" is a bank transfer, and "GCash" is GCash: these two are the ways a customer can pay online (proof and reference number). The compare ignores
// letter case and spaces around the name.
const modeText = (mode) => String(mode || '').trim().toLowerCase();
export const isGcashMode = (mode) => modeText(mode) === 'gcash';
export const isBankTransferMode = (mode) => /^bank transfer(?:$|[\s(:-])/.test(modeText(mode));
export const isOnlinePaymentMode = (mode) => isGcashMode(mode) || isBankTransferMode(mode);
