// Turns an error thrown while saving a service report into the answer the technician should see.
// Pure, so it can be tested without a database. Returns { status, message }, or null when the error
// is not one the technician can fix (the route then answers 500).

// A second report for the same booking, caught by the unique index on reports.bookingId.
function isDuplicateKey(err) {
  return !!err && (err.code === 11000 || err.code === 11001);
}

function reportErrorResponse(err) {
  if (isDuplicateKey(err)) {
    return { status: 400, message: 'A report already exists for this job.' };
  }
  return null;
}

module.exports = { reportErrorResponse, isDuplicateKey };
