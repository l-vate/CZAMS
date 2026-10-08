import { upload } from './apiClient';

// `proof` is the proof-of-payment File and `referenceNumber` the GCash or bank reference that goes
// with it. Both are optional here; the server requires them for GCash and Bank Transfer.
function proofForm(proof, referenceNumber) {
  const formData = new FormData();
  if (proof) formData.append('proof', proof);
  if (referenceNumber) formData.append('referenceNumber', referenceNumber);
  return formData;
}

// Customer: the down payment.
export function submitPayment(bookingId, proof, referenceNumber) {
  return upload(`/api/bookings/${bookingId}/pay`, proofForm(proof, referenceNumber), { method: 'PATCH' });
}

// Customer: the remaining balance.
export function submitBalancePayment(bookingId, proof, referenceNumber) {
  return upload(`/api/bookings/${bookingId}/pay-balance`, proofForm(proof, referenceNumber), { method: 'PATCH' });
}
