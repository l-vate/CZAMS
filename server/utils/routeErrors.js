// One place that turns a failure inside a route into the right answer. A request the database refuses because of what
// the person sent (a missing required field, a value of the wrong kind) is the person's to fix: it is a 400 with a
// message that names the field, never a 500 "Server error". Anything else is logged and answered with a 500.
const FIELD_LABELS = Object.freeze({
  address: 'Address', contactNumber: 'Contact number', service: 'Service', date: 'Date', time: 'Time', units: 'Units',
  name: 'Name', email: 'Email', phone: 'Phone number', password: 'Password', customer: 'Customer', issueDescription: 'Issue description',
  downPaymentPercent: 'Down payment', paymentMode: 'Payment mode', bookingId: 'Booking',
});

const labelFor = (path) => FIELD_LABELS[String(path).split('.')[0]] || String(path).split('.').pop();

// The message to show for a Mongoose ValidationError: one short sentence per field.
function describeValidationError(err) {
  const messages = Object.values(err.errors || {}).map((e) => {
    if (e.kind === 'required') return `${labelFor(e.path)} is required.`;
    if (e.name === 'CastError') return `${labelFor(e.path)} is not valid.`;
    if (e.kind === 'enum') return `${labelFor(e.path)} is not one of the allowed values.`;
    if (e.kind === 'min' || e.kind === 'max') return `${labelFor(e.path)} is out of range.`;
    if (e.kind === 'maxlength') return `${labelFor(e.path)} is too long.`;
    return e.message || `${labelFor(e.path)} is not valid.`;
  });
  return messages.length > 0 ? messages.join(' ') : 'Some of the information is not valid.';
}

// Sends the answer for `err`. `log` is how a real server error is recorded (console.error by default).
function sendRouteError(res, err, log = console.error) {
  if (err && err.name === 'ValidationError') return res.status(400).json({ message: describeValidationError(err) });
  // a value that must be unique is already taken (an email, a date): the person's to change, not a server fault
  if (err && err.code === 11000) return res.status(409).json({ message: 'That already exists. Choose a different value.' });
  // another request changed the same record between this one's read and its save
  if (err && err.name === 'VersionError') return res.status(409).json({ message: 'This was just changed by someone else. Reload and try again.' });
  if (err && err.name === 'CastError') return res.status(400).json({ message: `${labelFor(err.path)} is not valid.` });
  log(err);
  return res.status(500).json({ message: 'Server error' });
}

module.exports = { sendRouteError, describeValidationError };
