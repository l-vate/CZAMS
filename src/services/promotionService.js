import { request } from './apiClient';

// Admin: every promotion.
export function listPromos() {
  return request('/api/promos');
}

// Public: the promotions in force today.
export function listPublicPromos() {
  return request('/api/promos/public', { auth: false });
}

export function createPromo(promo) {
  return request('/api/promos', { method: 'POST', body: promo });
}

// `fields` can be the whole promo or just the changed part (e.g. { isActive }).
export function updatePromo(promoId, fields) {
  return request(`/api/promos/${promoId}`, { method: 'PUT', body: fields });
}

export function deletePromo(promoId) {
  return request(`/api/promos/${promoId}`, { method: 'DELETE' });
}
