// Run by test/manilaTime.test.js in its own Node process, with its own TZ and a frozen clock (NOW). It makes the real
// booking routes answer the date questions that depend on "today in Manila" and prints what they said as one JSON line.
const { mock } = require('node:test');

mock.timers.enable({ apis: ['Date'], now: new Date(process.env.NOW) });

const harness = require('./createBooking');
const { manilaToday, monthsAgoManilaKey, monthsAgoManila } = require('../../utils/manilaDate');
const { addDays } = require('../../utils/extensionDays');

(async () => {
  await harness.install();
  harness.reset({
    users: [{ _id: 'CUS1', role: 'customer', isActive: true, clientType: 'Residential', name: 'Customer One' }, { _id: 'ADM1', role: 'admin', isActive: true }],
    services: [{ _id: 'S-CLEAN', name: 'Cleaning', serviceType: 'Cleaning', price: 800, isActive: true }],
  });
  const today = manilaToday();
  const out = { today, monthsAgo3: monthsAgoManilaKey(3), monthsAgo12Instant: monthsAgoManila(12).toISOString() };

  // the 3-day rule on create: two days ahead is refused, three is accepted (a Sunday is skipped in the test data by
  // using a fixed offset and reporting the status, whatever weekday it falls on)
  out.createTwoAhead = (await harness.post({ date: addDays(today, 2) })).status;
  out.createThreeAhead = (await harness.post({ date: addDays(today, 3) })).status;

  // same-day cancellation: a booking dated today in Manila is same-day, one dated tomorrow is not
  const cancelWith = async (date) => {
    harness.state.bookings.length = 0;
    const made = await harness.post({ date: addDays(today, 5) });
    if (made.status !== 201) return `create ${made.status}`;
    Object.assign(harness.state.bookings[0], { date, status: 'Approved', paymentStatus: 'partially_paid', downPaymentPercent: 50 });
    const res = await harness.call('PATCH', `/${harness.state.bookings[0].bookingId}/cancel`);
    return { status: res.status, sameDay: res.body.refund && res.body.refund.isSameDay };
  };
  out.cancelToday = await cancelWith(today);
  out.cancelTomorrow = await cancelWith(addDays(today, 1));
  console.log(JSON.stringify(out));
  harness.close();
  // let the closing sockets finish before the process ends (an immediate exit trips a libuv assertion on Windows)
  setTimeout(() => process.exit(0), 100);
})().catch((e) => { console.error(e); process.exit(1); });
