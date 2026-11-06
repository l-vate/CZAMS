// The most characters a text box takes, kept in constants/inputLimits.json (the forms read the same file, so a box stops where the
// server refuses). These checks run on what is sent now; text already stored is never cut or refused for its length.
const limits = require('../constants/inputLimits.json');
const { invalid } = require('./validation');

// null when the value is not text, or is short enough; otherwise { status, message }. `key` is a name in inputLimits.json.
function lengthProblem(value, key, label) {
  if (typeof value !== 'string') return null;
  const max = limits[key];
  return value.trim().length > max ? invalid(`${label} must be ${max} characters or fewer.`) : null;
}

module.exports = { limits, lengthProblem };
