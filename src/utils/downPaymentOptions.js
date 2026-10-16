// The down payment options a customer is offered at booking. Plain functions, no framework, so tests load this file on its own.
//
// The 0% option is intentionally NOT part of the admin-editable percentage list: it is a perk with its own rule, and the server accepts
// 0 only for these two kinds of customer (routes/bookingRoutes.js, "No down payment is only available ..."):
//   - a Return customer (Customer Classification Module)
//   - a Commercial client whose account has agreed payment terms, set by an admin (7 to 10 days)
// Everyone else is never shown it, and the server refuses it for them.

// The agreed terms are 7 to 10 days, the same range the server checks. Hand-synced with User.agreedPaymentTermsDays.
export const MIN_AGREED_TERMS_DAYS = 7;
export const MAX_AGREED_TERMS_DAYS = 10;

// true for a signed-in account (as the API returns it) that is a Commercial client with agreed payment terms.
export function hasAgreedTerms(account) {
  const days = account?.agreedPaymentTermsDays;
  return account?.clientType === 'Commercial' && Number.isInteger(days) && days >= MIN_AGREED_TERMS_DAYS && days <= MAX_AGREED_TERMS_DAYS;
}

export function getDownPaymentOptions(isReturnCustomer, percentages, { onAgreedTerms = false } = {}) {
  const base = (percentages || [])
    .slice()
    .sort((a, b) => a - b)
    .map((value) => ({
      value,
      label: value === 100 ? 'Full Payment (100%)' : `${value}% Down Payment`,
    }));

  if (isReturnCustomer) return [{ label: 'No Down Payment (Return Customer)', value: 0 }, ...base];
  if (onAgreedTerms) return [{ label: 'No down payment (agreed terms)', value: 0 }, ...base];
  return base;
}
