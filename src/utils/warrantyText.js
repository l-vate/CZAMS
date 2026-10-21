import { manilaTodayKey } from './manilaTime';
import { BRAND_SHORT } from '../config/company';
import { formatClosureDate } from './closureDates';

// How a warranty window is worded everywhere it is shown: "In warranty until October 8, 2026" or "Expired on October 8, 2026".
// `expiresAt` is the end of the last covered day (an ISO string or a Date); the day is read in Manila time.
export function warrantyStatusText(active, expiresAt) {
  if (!expiresAt) return '';
  const day = formatClosureDate(manilaTodayKey(new Date(expiresAt)));
  return active ? `In warranty until ${day}` : `Expired on ${day}`;
}

// What an Installation unit source means for the customer, for the note shown when they pick their own unit.
export const CUSTOMER_UNIT_NOTE = `Warranty on the unit itself does not apply to units not bought from ${BRAND_SHORT}. Installation workmanship is covered for 3 months.`;

// The company short name or "Customer (own unit)" for an Installation booking's details, null for any other service.
export function unitSourceLabel(details) {
  if (details?.service?.serviceType !== 'Installation') return null;
  return details.clientSuppliedUnit ? 'Customer (own unit)' : BRAND_SHORT;
}

export const CLEANING_WARRANTY_NOTE = 'Cleaning warranty covers water leaks only';
