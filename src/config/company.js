// Company details shown on the public site. They are read from server/constants/company.json, the file the notification emails read too, so
// the name, phone, email and address are typed once.
import company from '../../server/constants/company.json';
//
// The official business name, and the short form for where space is tight. Every visible name and logo alt text reads these two.
export const BRAND_NAME = company.name;
export const BRAND_SHORT = company.short;
export const BRAND_SUB = company.sub; // BRAND_NAME without the short form: the second line under BRAND_SHORT

// The company phone, as it is shown. Every page, invoice, receipt and statement reads it from here.
export const COMPANY_PHONE = company.phone;

export const COMPANY_EMAIL = company.email;
export const COMPANY_ADDRESS = company.address;

// The same number as a tel: link (international format), worked out from COMPANY_PHONE so there is one number to edit.
export const COMPANY_PHONE_TEL = `tel:+63${COMPANY_PHONE.replace(/\D/g, '').replace(/^0/, '')}`;
