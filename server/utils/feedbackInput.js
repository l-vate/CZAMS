// What a customer sends as feedback, checked on the server. The rating is a whole number from 1 to 5 (a number or the
// text of one, so "4" works and 4.5, 0, 6, "", true and "abc" do not) and the comment is optional text of at most 500
// characters. Pure, so it is tested without a database.
const { invalid } = require('./validation');

const COMMENT_MAX = 500;

// Returns { problem, values }: problem is null or { status, message }; values are { rating, text } to store.
function readFeedback({ rating, text } = {}) {
  let value = null;
  if (typeof rating === 'number') value = rating;
  else if (typeof rating === 'string' && /^\s*[1-5]\s*$/.test(rating)) value = Number(rating);
  if (value === null || !Number.isInteger(value) || value < 1 || value > 5) {
    return { problem: invalid('The rating must be a whole number from 1 to 5.') };
  }
  if (text !== undefined && text !== null && typeof text !== 'string') return { problem: invalid('The comment must be text.') };
  const comment = (text || '').trim();
  if (comment.length > COMMENT_MAX) return { problem: invalid(`The comment must be ${COMMENT_MAX} characters or fewer.`) };
  return { problem: null, values: { rating: value, text: comment } };
}

module.exports = { readFeedback, COMMENT_MAX };
