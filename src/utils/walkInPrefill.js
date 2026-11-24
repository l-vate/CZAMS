import { EMPTY_ADDRESS_PARTS, partsForForm } from '../constants/addressOptions';
import { buildAddress, isBlankParts } from './addressParts';

// What choosing a customer fills in on the Location & Schedule step of a walk-in booking: their contact number, and their address when the account has it as
// separate parts (house or block and lot, street, barangay, city, province, ZIP). An account that only has a one line address (an older one, or one made on the
// New Customer tab) gets empty boxes: the line is never guessed apart. No customer (the admin went back to change it) gives empty boxes too, so one client's
// address can never carry over to another client's booking. The boxes stay editable, and only what the admin finally leaves in them is saved.
export function prefillFromCustomer(customer) {
  const parts = partsForForm(customer && customer.addressParts);
  const addressParts = isBlankParts(parts) ? { ...EMPTY_ADDRESS_PARTS } : parts;
  return { contactNumber: (customer && customer.phone) || '', addressParts, address: isBlankParts(addressParts) ? '' : buildAddress(addressParts) };
}
