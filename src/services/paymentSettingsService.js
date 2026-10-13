import { request } from './apiClient';

// Payment methods, down payment options and the Senior/PWD discount percent.
export function getPaymentSettings() {
  return request('/api/payment-settings');
}

export function updatePaymentSettings(settings) {
  return request('/api/payment-settings', { method: 'PUT', body: settings });
}
