// The one way an amount of money is shown anywhere in the app: the peso sign, thousands separators and always two decimals ("₱1,500.00").
// A negative amount shows its minus before the sign ("-₱800.00"). Display only: it never changes a stored number or a calculation.
// Server mirror: server/utils/money.js (a test keeps the two the same).
const TWO_DECIMALS = { minimumFractionDigits: 2, maximumFractionDigits: 2 };

// "1,500.00": the number alone, for a table column or a CSV cell that has its own peso heading.
export function formatAmount(amount) {
  const n = Number(amount);
  return Math.abs(Number.isFinite(n) ? n : 0).toLocaleString('en-US', TWO_DECIMALS);
}

// "₱1,500.00", or "-₱800.00" for a negative amount.
export function formatMoney(amount) {
  const n = Number(amount);
  const value = Number.isFinite(n) ? n : 0;
  const text = formatAmount(value);
  return `${value < 0 && text !== '0.00' ? '-' : ''}₱${text}`;
}
