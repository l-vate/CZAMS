// The optional "I may need these works" checklist on a booking: feeder line, carpentry, masonry, electrical, and Other with a short text. It is
// a heads-up for the owner, who answers with a quotation. It never changes the price by itself, and it is never required.
const { invalid } = require('./validation');

const WORK_KEYS = ['feederLine', 'carpentry', 'masonry', 'electrical'];
const LABELS = { feederLine: 'feeder line', carpentry: 'carpentry', masonry: 'masonry', electrical: 'electrical' };
const OTHER_TEXT_MAX = 80;

// `raw` is what came with the booking: nothing, a JSON string (the form is multipart), or an object. Returns { problem, value } where value is
// undefined when nothing is ticked, so a booking without the checklist stores nothing.
function readMayNeedWorks(raw) {
  if (raw === undefined || raw === null || raw === '') return { problem: null, value: undefined };
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); } catch { return { problem: invalid('The works you may need could not be read.') }; }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { problem: invalid('The works you may need could not be read.') };
  const value = {};
  WORK_KEYS.forEach((key) => { if (data[key] === true || data[key] === 'true') value[key] = true; });
  const otherText = typeof data.otherText === 'string' ? data.otherText.trim() : '';
  if (data.other === true || data.other === 'true') {
    if (!otherText) return { problem: invalid('Say what the other work is, or untick Other.') };
    if (otherText.length > OTHER_TEXT_MAX) return { problem: invalid(`Keep the other work to ${OTHER_TEXT_MAX} characters or fewer.`) };
    value.other = true;
    value.otherText = otherText;
  }
  return { problem: null, value: Object.keys(value).length > 0 ? value : undefined };
}

// "feeder line, masonry, and other: a new outlet", or '' when nothing is ticked.
function describeMayNeedWorks(value) {
  if (!value) return '';
  const parts = WORK_KEYS.filter((key) => value[key]).map((key) => LABELS[key]);
  if (value.other && value.otherText) parts.push(`other: ${value.otherText}`);
  return parts.join(', ');
}

module.exports = { readMayNeedWorks, describeMayNeedWorks, WORK_KEYS, OTHER_TEXT_MAX };
