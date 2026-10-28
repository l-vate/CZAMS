import { request } from './apiClient';

// Admin only: what needs the admin's attention right now, in three groups (today, decision, money). Worked out live by the server on every
// call; nothing is cached or stored.
export function getNeedsAttention() {
  return request('/api/admin/needs-attention');
}
