// A date the booking rules accept whatever day the tests run on: the first day that is not a Sunday, at least `extra` days after the earliest
// bookable day (3 days ahead, utils/dateRules.js). Tests that move or book a service to a date use this instead of a date typed in.
const { bookingWindow } = require('../../utils/dateRules');

function bookableDay(extra = 0, now = new Date()) {
  let key = bookingWindow(now).min;
  let left = extra;
  for (let i = 0; i < 400; i += 1) {
    const sunday = new Date(`${key}T00:00:00Z`).getUTCDay() === 0;
    if (!sunday) {
      if (left === 0) return key;
      left -= 1;
    }
    key = new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  }
  throw new Error('no bookable day found');
}

module.exports = { bookableDay };
