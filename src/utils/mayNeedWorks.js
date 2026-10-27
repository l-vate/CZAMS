// The optional "I may need these works" checklist on the booking form. Ticking never changes the price: the owner answers with a quotation.
// Server mirror: server/utils/mayNeedWorks.js.
export const WORK_CHOICES = [
  ['feederLine', 'Feeder line'],
  ['carpentry', 'Carpentry'],
  ['masonry', 'Masonry'],
  ['electrical', 'Electrical'],
];
export const OTHER_WORK_MAX = 80;

export const EMPTY_WORKS = { feederLine: false, carpentry: false, masonry: false, electrical: false, other: false, otherText: '' };

// What the form sends: nothing when nothing is ticked, otherwise the ticked works (Other with its text).
export function worksToSend(works) {
  if (!works) return undefined;
  const ticked = WORK_CHOICES.some(([key]) => works[key]) || works.other;
  return ticked ? { ...works, otherText: (works.otherText || '').trim() } : undefined;
}

// True when Other is ticked but still has no text (the step cannot go on until it has, or Other is unticked).
export const worksIncomplete = (works) => Boolean(works?.other) && !(works.otherText || '').trim();

// "Feeder line, masonry, other: a new outlet", or '' when nothing is ticked (for the admin and the notification).
export function describeWorks(works) {
  if (!works) return '';
  const parts = WORK_CHOICES.filter(([key]) => works[key]).map(([, label]) => label.toLowerCase());
  if (works.other && works.otherText) parts.push(`other: ${works.otherText}`);
  const text = parts.join(', ');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}
