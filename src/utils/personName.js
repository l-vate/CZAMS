// A person's name in two parts. The account keeps the two parts it was entered as (firstName, lastName) next to the full `name`; each
// is shown exactly as stored. An account made before the parts were kept has only `name`: one cannot tell where the first name ends in
// "Maria Dela Cruz" or "Macaroni 85 Reyes", so a name of exactly two words is split between them and any other is shown whole as the
// first name, with the last name left empty for the person to fill in. The surname is never guessed from the first name.
export function nameParts(user) {
  const full = String(user?.name || '').trim();
  const first = typeof user?.firstName === 'string' ? user.firstName.trim() : '';
  const last = typeof user?.lastName === 'string' ? user.lastName.trim() : '';
  // the saved parts count only while they still make up the full name (an admin may have changed the name since)
  if (first && last && (!full || `${first} ${last}` === full)) return { firstName: first, lastName: last };
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length === 2) return { firstName: words[0], lastName: words[1] };
  return { firstName: words.join(' '), lastName: '' };
}

// What the greeting calls the person: the first name.
export function greetingName(user, fallback = '') {
  return nameParts(user).firstName || fallback;
}

// The same rule the server applies (utils/accountInput.js): letters (accented ones too), spaces, hyphens, apostrophes and periods.
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u;

// '' when the name part is fine, otherwise the sentence to show. `label` is "First name" or "Last name".
export function namePartProblem(label, value) {
  const text = String(value ?? '').trim();
  if (!text) return `${label} is required.`;
  if (!NAME_PATTERN.test(text)) return `${label} can only have letters, spaces, hyphens, apostrophes and periods.`;
  return '';
}
