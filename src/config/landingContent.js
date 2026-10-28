// Everything the public landing page says, in one place, so the owner can change the words without touching a component.
// Rules for this file:
//   - only facts that are true and checked against the system: no customer counts, ratings, reviews, awards, licenses, client names,
//     response-time promises, discounts or statistics;
//   - the warranty numbers are NOT typed here: they are read from server/constants/warrantyWindows.json, the same file the server uses;
//   - the phone and the business name come from config/company.js.
import { BRAND_NAME, BRAND_SHORT, COMPANY_PHONE, COMPANY_PHONE_TEL, COMPANY_EMAIL, COMPANY_ADDRESS } from './company';
import { getBusinessHoursText } from './timeBlocks';
import { CANCEL_POLICY_NOTE } from './cancellation';
import warranty from '../../server/constants/warrantyWindows.json';
import { UNIT_TYPE } from '../constants/unitTypes';

// ---- switches the owner may change -------------------------------------------------------------------------------------------------
// Show a "From PHP X" price on the service cards. Keep false until the real price list is entered in the admin pages.
export const SHOW_PUBLIC_PRICES = false;

// A real photo for the hero. A path under /public (for example '/images/landing/hero.webp') replaces the illustration. null keeps it.
export const HERO_IMAGE = null;
export const HERO_IMAGE_ALT = 'An aircon technician at work';

// ---- plain facts ---------------------------------------------------------------------------------------------------------------------
// Bookings need at least this many days of notice. HAND-SYNCED with MIN_LEAD_DAYS in server/constants/scheduling.js.
export const BOOKING_LEAD_DAYS = 3;

export const EMAIL = COMPANY_EMAIL;
export const ADDRESS = COMPANY_ADDRESS;
export const MAP_EMBED_URL = 'https://www.google.com/maps?q=N.S.+Amoranto+corner+Cadig+St.,+Quezon+City,+Metro+Manila&output=embed';
export const SINCE_YEAR = 2009;
export const AREA_SERVED = 'Metro Manila and nearby areas';
export const HOURS_TEXT = `Mon to Sat, ${getBusinessHoursText()}`;

export { BRAND_NAME, BRAND_SHORT, COMPANY_PHONE, COMPANY_PHONE_TEL };

// ---- warranty wording, built from the shared numbers ------------------------------------------------------------------------------
const months = (n) => `${n} ${n === 1 ? 'month' : 'months'}`;
export const WARRANTY = {
  cleaning: `${warranty.cleaning.days} days after the job, for water leaks only`,
  installationCompanyUnit: `${months(warranty.installationCompanyUnit.months)} on installation workmanship for a unit bought from ${BRAND_SHORT}`,
  installationCustomerUnit: `${months(warranty.installationCustomerUnit.months)} on installation workmanship for a unit you supply, with no warranty on the unit itself`,
  leakRepair: `${months(warranty.leakRepair.months)} on a leak repair`,
};

// ---- navigation (the section ids are on the page; the order here is the order of the links) ------------------------------------------
export const NAV_LINKS = [
  { id: 'home', label: 'HOME' },
  { id: 'about', label: 'ABOUT US' },
  { id: 'services', label: 'SERVICES' },
  { id: 'availability', label: 'AVAILABLE DATES' },
];

// ---- hero ------------------------------------------------------------------------------------------------------------------------------
export const HERO = {
  eyebrow: `Serving ${AREA_SERVED} since ${SINCE_YEAR}`,
  headline: ['Cool comfort, clean air,', 'delivered to your door.'],
  subline: 'Professional aircon cleaning, repair, and installation.',
  primaryCta: 'Book a Service',
  secondaryCta: 'Check Available Dates',
};

// ---- trust strip: four facts, nothing else -----------------------------------------------------------------------------------------
export const TRUST_ITEMS = [
  { icon: 'calendar', title: `Since ${SINCE_YEAR}`, text: `Serving ${AREA_SERVED}` },
  { icon: 'home', title: 'Homes and businesses', text: 'Residential and commercial clients' },
  { icon: 'shield', title: 'Workmanship warranty', text: 'Shown on your booking after the job' },
  { icon: 'clock', title: HOURS_TEXT, text: 'Closed on Sundays' },
];

// ---- about -----------------------------------------------------------------------------------------------------------------------------
export const ABOUT = {
  eyebrow: 'Who We Are',
  title: 'About Us',
  paragraphs: [
    `${BRAND_NAME} has been serving ${AREA_SERVED} since ${SINCE_YEAR}.`,
    'We clean, repair, install and check aircon units for homes and businesses.',
  ],
  // A real photo of the team at work: { src: '/images/landing/team.webp', alt: '...', width: 800, height: 600 }. null shows an illustration.
  photo: null,
};

// ---- services (four cards). `serviceType` is how the optional price is looked up in the public services list. ---------------------
export const SERVICES = {
  eyebrow: 'What We Offer',
  title: 'Our Services',
  note: 'Base price only. The final cost may vary depending on scope and materials.',
  items: [
    { key: 'cleaning', icon: 'sparkle', serviceType: 'Cleaning', title: 'Aircon Cleaning', text: 'Cleaning for healthier, more efficient air circulation.' },
    { key: 'repair', icon: 'wrench', serviceType: 'Repair', title: 'Repair & Diagnostics', text: 'Diagnosis and repair for aircon units.' },
    { key: 'installation', icon: 'install', serviceType: 'Installation', title: 'New Installation', text: 'Installation of a new unit, set up for your home or business.' },
    { key: 'checkup', icon: 'check', serviceType: 'Check-up', title: 'Preventive Check-Up', text: 'A scheduled check-up to catch problems early.' },
  ],
  linkLabel: 'Book this service',
};

// Optional photo slots under the services. A slot with no `src` is not shown at all. Suggested files: see the report of the E12 batch.
export const SHOWCASE = {
  title: 'See the work',
  slots: [
    { key: 'before-after', src: null, alt: 'An aircon unit before and after cleaning', caption: 'Before and after a cleaning', width: 800, height: 600 },
    { key: 'installation', src: null, alt: 'A newly installed split-type aircon', caption: 'A finished installation', width: 800, height: 600 },
  ],
};

// The company's own square photos for the unit types section (public/images/units, resized from the originals in public/images).
const LANDING_UNIT_PHOTOS = {
  [UNIT_TYPE.WINDOW]: '/images/units/window.webp',
  [UNIT_TYPE.SPLIT]: '/images/units/split.webp',
  [UNIT_TYPE.FLOOR_MOUNTED]: '/images/units/floor-mounted.webp',
  [UNIT_TYPE.CASSETTE]: '/images/units/cassette.webp',
  [UNIT_TYPE.PORTABLE]: '/images/units/portable.webp',
};

// ---- unit types -------------------------------------------------------------------------------------------------------------------------
export const UNITS = {
  eyebrow: 'Coverage',
  title: 'Unit Types We Service',
  items: [
    { type: UNIT_TYPE.WINDOW, alt: 'A window-type aircon unit' },
    { type: UNIT_TYPE.SPLIT, alt: 'A split-type aircon indoor unit mounted on a wall' },
    { type: UNIT_TYPE.FLOOR_MOUNTED, alt: 'A floor-mounted aircon unit' },
    { type: UNIT_TYPE.CASSETTE, alt: 'A ceiling cassette-type aircon unit' },
    { type: UNIT_TYPE.PORTABLE, alt: 'A portable aircon unit' },
  ].map((item) => ({ ...item, src: LANDING_UNIT_PHOTOS[item.type] })),
};

// ---- why choose us: four cards, each backed by something the system really does ----------------------------------------------------
export const WHY = {
  eyebrow: 'Why Choose Us',
  title: 'What you can count on',
  items: [
    { icon: 'shield', title: 'A workmanship warranty', text: `Cleaning is covered ${WARRANTY.cleaning}. Installation is covered for ${months(warranty.installationCompanyUnit.months)} (${months(warranty.installationCustomerUnit.months)} if you supply the unit).` },
    { icon: 'calendar', title: 'Clear booking rules', text: `Book at least ${BOOKING_LEAD_DAYS} days ahead. Morning and Afternoon are booked separately, and you can see the open dates before you book.` },
    { icon: 'home', title: 'Homes and businesses', text: 'Residential and commercial clients are both welcome. Commercial accounts can add a purchase order number to a booking.' },
  ],
};

// ---- availability section --------------------------------------------------------------------------------------------------------------
export const AVAILABILITY = {
  eyebrow: 'Plan Ahead',
  title: 'Available Dates',
  subtitle: `Bookings need at least ${BOOKING_LEAD_DAYS} days notice. Morning and Afternoon are booked separately.`,
  errorTitle: 'We could not load the dates right now.',
  errorText: 'Please check your connection and try again.',
  retry: 'Try again',
  // The legend: five entries. Closed covers both Sundays and dates the shop closed (both are hatched); a day nobody can work (every
  // technician is away) has its own dotted look; days that cannot be booked (past, or under the notice period) are plain grey and are
  // explained when tapped.
  legend: [
    { status: 'open', label: 'Available' },
    { status: 'limited', label: 'Limited' },
    { status: 'full', label: 'Fully booked' },
    { status: 'no-technicians', label: 'No technicians available' },
    { status: 'closed', label: 'Closed' },
  ],
};

// ---- how it works: every step checked against the booking flow ---------------------------------------------------------------------
export const HOW = {
  eyebrow: 'The Process',
  title: 'How It Works',
  subtitle: 'From booking to after-service support, in four steps.',
  steps: [
    { icon: 'calendar', title: 'Book an Appointment', text: 'Log in, then choose your service, date and time block. You can also ask for a preferred technician, subject to availability.' },
    { icon: 'check', title: 'We Confirm Your Booking', text: 'Our team reviews your request, verifies your down payment and confirms your schedule. You are notified in the app.' },
    { icon: 'wrench', title: 'Service Day', text: 'Our technicians arrive in your booked time block and do the work.' },
    { icon: 'shield', title: 'After-Service Support', text: 'If something is wrong after the job, report it from your booking. Work inside the warranty period gets a free repair visit.' },
  ],
};

// ---- FAQ -------------------------------------------------------------------------------------------------------------------------------
export const FAQ = {
  eyebrow: 'Questions',
  title: 'Frequently Asked Questions',
  items: [
    {
      q: 'How far ahead do I need to book?',
      a: `At least ${BOOKING_LEAD_DAYS} days ahead. Morning and Afternoon are booked separately, and the Available Dates calendar shows which days still have room.`,
    },
    {
      q: 'Are you open on Sundays?',
      a: `No. We are open ${HOURS_TEXT} and closed on Sundays. Days the shop is closed for a holiday show as closed on the calendar.`,
    },
    {
      q: 'How does the down payment work?',
      a: 'A down payment secures your booking request. You choose from the down payment options shown when you book and send your payment with proof, or pay later from your billing page. Our team verifies it and confirms your booking. The remaining balance is paid separately and shown on your billing page.',
    },
    {
      q: 'What happens if I cancel?',
      a: CANCEL_POLICY_NOTE, // the same words the customer sees when they press Cancel (config/cancellation.js)
    },
    {
      q: 'Is there a warranty?',
      a: `Yes, on workmanship. Cleaning: ${WARRANTY.cleaning}. Installation: ${WARRANTY.installationCompanyUnit}; ${WARRANTY.installationCustomerUnit}. Leak repair: ${WARRANTY.leakRepair}.`,
    },
    {
      q: 'What kinds of aircon do you service?',
      a: 'Window type, split type, floor mounted, cassette type and portable units, for homes and businesses.',
    },
    {
      q: 'How is the final price decided?',
      a: 'Each service has a base price. The final cost may vary depending on the scope of the work and the materials needed, and it is confirmed after the technicians inspect the unit.',
    },
  ],
};

// ---- call to action band ---------------------------------------------------------------------------------------------------------------
export const CTA_BAND = {
  title: 'Ready for cooler, cleaner air?',
  text: 'Book online, or call us during opening hours.',
  primary: 'Book a Service',
  secondary: 'Check Available Dates',
};

// ---- footer ----------------------------------------------------------------------------------------------------------------------------
export const FOOTER_LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'about', label: 'About' },
  { id: 'services', label: 'Services' },
  { id: 'availability', label: 'Available Dates' },
];

// ---- search engines and link previews ---------------------------------------------------------------------------------------------
export const SEO = {
  title: BRAND_NAME,
  description: `${BRAND_NAME}: aircon cleaning, repair, installation and check-ups for homes and businesses in ${AREA_SERVED}, since ${SINCE_YEAR}. ${HOURS_TEXT}.`,
  themeColor: '#0b2545',
};

// LocalBusiness structured data, from the facts above only.
export const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'HomeAndConstructionBusiness',
  name: BRAND_NAME,
  description: SEO.description,
  telephone: COMPANY_PHONE_TEL.replace('tel:', ''),
  email: EMAIL,
  foundingDate: String(SINCE_YEAR),
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'N.S. Amoranto corner Cadig St.',
    addressLocality: 'Quezon City',
    addressRegion: 'Metro Manila',
    addressCountry: 'PH',
  },
  areaServed: AREA_SERVED,
  openingHoursSpecification: [{
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '08:00',
    closes: '18:00',
  }],
};
