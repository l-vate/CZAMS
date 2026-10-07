import { upload } from './apiClient';

// `proof` is the proof-of-payment File (optional, as before).
function proofForm(proof) {
  const formData = new FormData();
  if (proof) formData.append('proof', proof);
  return formData;
}

// Customer: the down payment.
export function submitPayment(bookingId, proof) {
  return upload(`/api/bookings/${bookingId}/pay`, proofForm(proof), { method: 'PATCH' });
}

// Customer: the remaining balance.
export function submitBalancePayment(bookingId, proof) {
  return upload(`/api/bookings/${bookingId}/pay-balance`, proofForm(proof), { method: 'PATCH' });
}
