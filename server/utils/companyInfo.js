// The company's name, phone, email, address and opening hours as the notification emails print them. Read from the same files the website
// reads (constants/company.json and constants/timeBlocks.json), never typed here, so an email can never disagree with the site.
const company = require('../constants/company.json');
const timeBlocks = require('../constants/timeBlocks.json');

function formatHour(hour) {
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}:00 ${hour < 12 ? 'AM' : 'PM'}`;
}

// "Monday to Saturday, 8:00 AM to 6:00 PM, closed Sundays": from the earliest block start to the latest block end (the same figures the
// website footer uses). Sunday is the closed day (constants/bookingRules.mjs SUNDAY_CLOSED).
function hoursText() {
  const blocks = Object.values(timeBlocks.blocks);
  const open = Math.min(...blocks.map((b) => b.startHour));
  const close = Math.max(...blocks.map((b) => b.endHour));
  return `Monday to Saturday, ${formatHour(open)} to ${formatHour(close)}, closed Sundays`;
}

module.exports = {
  name: company.name,
  short: company.short,
  sub: company.sub,
  phone: company.phone,
  email: company.email,
  address: company.address,
  hours: hoursText(),
};
