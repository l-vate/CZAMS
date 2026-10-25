// The steps of the customer booking form. A service that has a "Before you pay" block (an Installation: how long it takes, what the price
// does not cover, the warranty) gets a step of its own right before Payment; every other service keeps its steps as they were.
import { SERVICE_TYPE } from '../constants/serviceTypes';

export const STEP_ID = Object.freeze({ SERVICE: 'service', UNIT: 'unit', SCHEDULE: 'schedule', BEFORE_YOU_PAY: 'beforeYouPay', PAYMENT: 'payment', SUMMARY: 'summary' });

const LABELS = {
  [STEP_ID.SERVICE]: 'Choose Service',
  [STEP_ID.UNIT]: 'Unit Details',
  [STEP_ID.SCHEDULE]: 'Location & Schedule',
  [STEP_ID.BEFORE_YOU_PAY]: 'Before you pay',
  [STEP_ID.PAYMENT]: 'Payment',
  [STEP_ID.SUMMARY]: 'Booking Summary',
};

// Whether this service has the "Before you pay" block (the same condition that decides if the terms are shown).
export const hasBeforeYouPay = (service) => service?.serviceType === SERVICE_TYPE.INSTALLATION;

// [{ id, label }] in order for the chosen service.
export function bookingSteps(service) {
  const ids = [STEP_ID.SERVICE, STEP_ID.UNIT, STEP_ID.SCHEDULE, ...(hasBeforeYouPay(service) ? [STEP_ID.BEFORE_YOU_PAY] : []), STEP_ID.PAYMENT, STEP_ID.SUMMARY];
  return ids.map((id) => ({ id, label: LABELS[id] }));
}

// "Step 5 of 6 - Payment"
export const stepCounter = (steps, step) => `Step ${step} of ${steps.length} - ${steps[step - 1]?.label || ''}`;
