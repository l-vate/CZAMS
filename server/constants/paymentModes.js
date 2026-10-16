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

module.exports = { PAYMENT_MODE, REFERENCE_REQUIRED_MODES, FIRST_PAYMENT_BLOCKED_MODES };
