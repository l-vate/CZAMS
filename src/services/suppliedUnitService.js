import { request } from './apiClient';

// The catalog of units the company can supply for an installation.

// Customers get the active items; the admin gets every item that has not been deleted. `type` and `hp` narrow the list.
export function listSuppliedUnits({ type, hp } = {}) {
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (hp) params.set('hp', hp);
  const query = params.toString();
  return request(`/api/supplied-units${query ? `?${query}` : ''}`);
}

// Admin: add a unit. { brand, model, type, hp, inverter, price }
export function addSuppliedUnit(unit) {
  return request('/api/supplied-units', { method: 'POST', body: unit });
}

// Admin: change a unit (send the fields that change).
export function updateSuppliedUnit(id, changes) {
  return request(`/api/supplied-units/${id}`, { method: 'PUT', body: changes });
}

// Admin: hide a unit from customers, or show it again.
export function setSuppliedUnitActive(id, isActive) {
  return request(`/api/supplied-units/${id}/active`, { method: 'PATCH', body: { isActive } });
}

// Admin: delete a unit. One a booking used is hidden instead (the answer says archived: true).
export function deleteSuppliedUnit(id) {
  return request(`/api/supplied-units/${id}`, { method: 'DELETE' });
}

// Admin: settle a "Not listed" request on a booking's unit entry: { catalogId }, { price, note } or { decline: true, reason }.
export function resolveUnitRequest(bookingId, index, body) {
  return request(`/api/bookings/${bookingId}/units/${index}/resolve`, { method: 'PATCH', body });
}
