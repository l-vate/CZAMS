// Turns bad service report input, or an error thrown while saving one, into the answer the
// technician should see. Pure, so it can be tested without a database.
// Both functions return { status, message }, or null when there is nothing to say.

const RESOLUTIONS = Object.freeze(['Complete', 'Partial', 'Unresolved']);
const LABOR_HOURS_MAX = 24;

const bad = (message) => ({ status: 400, message });

// The day a follow-up date falls on, as "YYYY-MM-DD" in the same terms as `today`, or null if it is not a date.
// A plain "YYYY-MM-DD" (what the date field sends) is taken as it is, so no timezone can move it a day.
function dayKey(value) {
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    // a real calendar day: "2026-02-31" must not roll over into March
    const [y, m, d] = text.split('-').map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d ? text : null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

// The optional fields of a report, checked before anything is saved. A field left empty is fine.
// `followUpDate` is only looked at when a follow-up is required, as the route does: it must be a real
// date and not before `today` ("YYYY-MM-DD", Philippine time). Today itself is allowed.
function validateReportInput({ laborHours, issueResolution, followUpRequired, followUpDate, today }) {
  const hasHours = laborHours !== undefined && laborHours !== null && String(laborHours).trim() !== '';
  if (hasHours) {
    const hours = Number(laborHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > LABOR_HOURS_MAX) {
      return bad(`Labor hours must be a number from 0 to ${LABOR_HOURS_MAX}.`);
    }
  }

  const hasResolution = issueResolution !== undefined && issueResolution !== null && issueResolution !== '';
  if (hasResolution && !RESOLUTIONS.includes(issueResolution)) {
    return bad(`Resolution must be one of ${RESOLUTIONS.join(', ')}.`);
  }

  if (followUpRequired && followUpDate) {
    const day = dayKey(followUpDate);
    if (!day) return bad('The follow-up date must be a valid date.');
    if (today && day < today) return bad('The follow-up date cannot be in the past.');
  }
  return null;
}

// A second report for the same booking, caught by the unique index on reports.bookingId.
function isDuplicateKey(err) {
  return !!err && (err.code === 11000 || err.code === 11001);
}

// What the model itself rejected, in the same plain words as validateReportInput.
const FIELD_MESSAGES = Object.freeze({
  laborHours: `Labor hours must be a number from 0 to ${LABOR_HOURS_MAX}.`,
  issueResolution: `Resolution must be one of ${RESOLUTIONS.join(', ')}.`,
  followUpDate: 'The follow-up date must be a valid date.',
  workSummary: 'Work summary is required.',
});

function reportErrorResponse(err) {
  if (isDuplicateKey(err)) return bad('A report already exists for this job.');

  if (err && (err.name === 'ValidationError' || err.name === 'CastError')) {
    const field = err.name === 'CastError' ? err.path : Object.keys(err.errors || {})[0];
    return bad(FIELD_MESSAGES[field] || 'Some of the report details are not valid. Please check them and try again.');
  }
  return null;
}

module.exports = { validateReportInput, reportErrorResponse, isDuplicateKey, RESOLUTIONS, LABOR_HOURS_MAX };
