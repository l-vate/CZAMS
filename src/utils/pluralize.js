// The singular or plural word for a count: pluralize(1, 'booking') is "booking", pluralize(2, 'booking') is "bookings".
// Pass the plural when it is not just an added "s": pluralize(2, 'child', 'children').
export function pluralize(count, singular, plural = `${singular}s`) {
  return Number(count) === 1 ? singular : plural;
}
