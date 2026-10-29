import { request } from './apiClient';

// Admin only: what needs the admin's attention right now, in three groups (today, decision, money). Worked out live by the server on every
// call; nothing is cached or stored.
// Always with every item (?all=1): the dashboard shows the top few, the notifications tab merges and rolls up all of them.
export function getNeedsAttention() {
  return request('/api/admin/needs-attention?all=1');
}
