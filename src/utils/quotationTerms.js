// The quotation details of an Installation as the pages show them: the estimated duration, what the price does not cover, the warranty
// terms and whether the prices include VAT. A saved booking carries them (quotationTerms, worked out by the server); a booking still
// being made shows the standard ones, read from the same files the server uses, so the numbers are never typed twice.
// Server mirror: server/utils/quotation.js.
import quotationDefaults from '../../server/constants/quotationDefaults.json';
import warrantyWindows from '../../server/constants/warrantyWindows.json';

// "1 to 2 days", "1 day", "3 days"
export function formatDays(days) {
  if (!days || !Number.isFinite(days.min)) return '';
  const max = Number.isFinite(days.max) ? days.max : days.min;
  if (max === days.min) return `${days.min} ${days.min === 1 ? 'day' : 'days'}`;
  return `${days.min} to ${max} days`;
}

// "6 months", "1 month"
export const formatMonths = (months) => `${months} ${months === 1 ? 'month' : 'months'}`;

// The standard terms of an Installation that is being booked (nothing saved yet). Compressor and minor parts years are the ones the
// warranty text on the server uses.
export function standardTerms({ clientSuppliedUnit }) {
  const months = clientSuppliedUnit ? warrantyWindows.installationCustomerUnit.months : warrantyWindows.installationCompanyUnit.months;
  return {
    estimatedDays: quotationDefaults.durationDays.Installation || null,
    exclusions: quotationDefaults.exclusions.Installation || null,
    warranty: {
      workmanshipMonths: months,
      unitText: clientSuppliedUnit ? null : 'Compressor 5 years, minor parts 1 year (remote control not included).',
    },
    taxInclusive: false,
  };
}

// The portion of a price that is VAT when the price already includes 12% VAT.
export const vatInside = (amount) => Math.round((amount * 12) / 112);

// The lines of a booking's site details that have a value: [['Building', 'Tower A'], ...].
export function siteLines(site) {
  return [['Building', site?.building], ['Floor or room', site?.floorRoom], ['Attention', site?.attention]].filter(([, value]) => value);
}
