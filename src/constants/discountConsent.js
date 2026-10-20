import { BRAND_SHORT } from '../config/company';

// What a customer agrees to when they send an ID photo for the Senior Citizen or PWD discount. HAND-SYNCED with ID_PHOTO_CONSENT_TEXT in
// server/constants/discount.js (a test checks they match).
export const ID_PHOTO_CONSENT_TEXT = `I agree that ${BRAND_SHORT} may view my ID only to verify my Senior Citizen or PWD discount.`;
