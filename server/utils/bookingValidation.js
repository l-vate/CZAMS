// Checks that a booking request fits the service it is for. The rules that the booking form also applies (the
// cleaning tier, the unit types, the most units) come from constants/bookingRules.mjs, so the form and the server cannot
// drift apart. Pure apart from loading that file, so it is tested without a database.
const path = require('path');
const { pathToFileURL } = require('url');
const { SERVICE_TYPE } = require('../constants/serviceTypes');
const { invalid } = require('./validation');
const { getUnitPrice } = require('./pricing');

let rulesPromise;
// constants/bookingRules.mjs is an ES module (the form imports the same file), so the server loads it once with import().
const loadRules = () => {
  if (!rulesPromise) rulesPromise = import(pathToFileURL(path.join(__dirname, '..', 'constants', 'bookingRules.mjs')).href);
  return rulesPromise;
};

const asBool = (v) => v === true || v === 'true';
const isBoolAnswer = (v) => v === true || v === false || v === 'true' || v === 'false';

// null when the units are acceptable for this service, otherwise { status, message }.
async function unitsProblem(units, service) {
  const { UNIT_TYPES, MAX_UNIT_QUANTITY } = await loadRules();
  for (const u of units) {
    if (!UNIT_TYPES.includes(u.type)) return invalid(`Choose a unit type from the list: ${UNIT_TYPES.join(', ')}.`);
    if (!Number.isInteger(u.quantity) || u.quantity < 1 || u.quantity > MAX_UNIT_QUANTITY) {
      return invalid(`The number of units for each type must be a whole number from 1 to ${MAX_UNIT_QUANTITY}.`);
    }
    if (!(getUnitPrice(service, u.type) > 0)) return invalid(`${service.name || 'This service'} has no price for ${u.type}. Choose another unit type.`);
  }
  return null;
}

// null when the booking may be made for this service, otherwise { status, message }.
//   - the service must exist and be active;
//   - a customer may not book a hidden tier or the Leak Repair service directly (an admin booking for a walk-in may);
//   - for a Cleaning service a customer must answer both tier questions, and the service must be the one those
//     answers lead to.
// `cleaningServices` are the active Cleaning-type services.
async function serviceProblem({ service, cleaningServices, answers, isAdmin }) {
  if (!service) return invalid('That service does not exist. Choose a service from the list.');
  if (service.isActive === false || service.isArchived === true) return invalid('That service is not available right now. Choose another one.');
  if (isAdmin) return null;

  if (service.serviceType === SERVICE_TYPE.LEAK_REPAIR) {
    return invalid('Leak Repair is arranged by our team after a visit. Book a Cleaning or a Check-up and we will take it from there.');
  }
  if (service.serviceType !== SERVICE_TYPE.CLEANING) {
    return service.hiddenFromDirectSelection ? invalid('That service cannot be booked directly.') : null;
  }

  if (!isBoolAnswer(answers.lastCleanedOver6MonthsAgo) || !isBoolAnswer(answers.isActivelyLeaking)) {
    return invalid('Answer both cleaning questions (is the unit leaking, and when was it last cleaned) so we can choose the right cleaning service.');
  }
  const { resolveCleaningTier } = await loadRules();
  const expected = resolveCleaningTier(cleaningServices, asBool(answers.lastCleanedOver6MonthsAgo), asBool(answers.isActivelyLeaking));
  if (!expected || String(expected._id) !== String(service._id)) {
    return invalid(`With those answers the cleaning service is ${expected ? expected.name : 'not available'}, not ${service.name}. Go back and choose again.`);
  }
  return null;
}

module.exports = { loadRules, serviceProblem, unitsProblem };
