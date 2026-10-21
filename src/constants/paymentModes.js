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
