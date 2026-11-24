// A Philippine mobile number, written one way: +63 then 10 digits starting with 9 (for example +63 917 123 4567). People type it as
// 0917 123 4567, 917 123 4567 or +63 917 123 4567; all three mean the same number. src/utils/philippinePhone.js is the same code for the
// screens: a test keeps the two equal. Pure, so it is tested on its own.
const PH_MOBILE = /^9\d{9}$/;

// The 10 local digits of what was typed, or '' when it cannot be a mobile number (a prefix 63 or 0 is taken off, anything that is not a digit is ignored).
function localDigits(raw) {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length >= 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  return digits;
}

// true for a valid Philippine mobile number in any of the usual ways of writing it.
function isPhMobile(raw) {
  return PH_MOBILE.test(localDigits(raw));
}

// "+63 917 123 4567" for a valid number, otherwise null.
function formatPhMobile(raw) {
  const d = localDigits(raw);
  return PH_MOBILE.test(d) ? `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : null;
}

const PH_MOBILE_MESSAGE = 'Enter a Philippine mobile number: 10 digits after +63, starting with 9 (for example +63 917 123 4567).';

module.exports = { localDigits, isPhMobile, formatPhMobile, PH_MOBILE_MESSAGE };
