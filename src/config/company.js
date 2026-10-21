// Company details shown on the public site.
//
// The official business name, and the short form for where space is tight. Every visible name and logo alt text reads these two.
export const BRAND_NAME = 'Cooling Zone Aircon Maintenance Services';
export const BRAND_SHORT = 'Cooling Zone';
export const BRAND_SUB = 'Aircon Maintenance Services'; // BRAND_NAME without the short form: the second line under BRAND_SHORT

// The company phone, as it is shown. Every page, invoice, receipt and statement reads it from here.
export const COMPANY_PHONE = '0918 499 3509';

// The same number as a tel: link (international format), worked out from COMPANY_PHONE so there is one number to edit.
export const COMPANY_PHONE_TEL = `tel:+63${COMPANY_PHONE.replace(/\D/g, '').replace(/^0/, '')}`;
