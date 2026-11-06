// The shared rule for the admin search boxes: the words typed (any letter case) are looked for in every field a page offers. A phone number
// also matches when only its digits are typed, so "0917 123" finds "+63 917-123-4567" and "(0917) 123 4567".
export const normalizeSearch = (value) => String(value ?? '').trim().toLowerCase();

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

// true when `query` is empty or appears in any of the `parts` (strings, numbers, or nothing).
export function matchesSearch(query, parts) {
  const term = normalizeSearch(query);
  if (!term) return true;
  const texts = (parts || []).filter((p) => p !== null && p !== undefined && p !== '').map((p) => String(p).toLowerCase());
  if (texts.some((t) => t.includes(term))) return true;
  const termDigits = digitsOf(term);
  // digits are compared only when most of what was typed is digits (a phone number), and never across two fields
  if (termDigits.length >= 3 && termDigits.length >= term.replace(/[\s()+-]/g, '').length) {
    return texts.some((t) => digitsOf(t).includes(termDigits));
  }
  return false;
}

// What a page can search about a customer record: name, email and phone (a deleted customer or a plain id has none of them).
export function customerSearchParts(customer) {
  return customer && typeof customer === 'object' ? [customer.name, customer.email, customer.phone] : [];
}
