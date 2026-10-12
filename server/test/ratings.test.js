const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeRatings } = require('../utils/ratings');

test('no jobs or no feedback: no average, never a made-up number', () => {
  assert.deepEqual(summarizeRatings([]), { averageRating: null, ratingCount: 0 });
  assert.deepEqual(summarizeRatings([{}, { feedback: {} }, { feedback: { text: 'ok' } }]), { averageRating: null, ratingCount: 0 });
});

test('averages the real ratings to one decimal', () => {
  const jobs = [{ feedback: { rating: 5 } }, { feedback: { rating: 4 } }, { feedback: { rating: 4 } }];
  assert.deepEqual(summarizeRatings(jobs), { averageRating: 4.3, ratingCount: 3 });
});

test('ignores ratings outside 1 to 5 and non-numbers', () => {
  const jobs = [{ feedback: { rating: 5 } }, { feedback: { rating: 0 } }, { feedback: { rating: 9 } }, { feedback: { rating: '5' } }];
  assert.deepEqual(summarizeRatings(jobs), { averageRating: 5, ratingCount: 1 });
});
