import { request } from './apiClient';

// Admin: the audit log, newest first. `filters` may hold from, to (YYYY-MM-DD, Manila days), actor, action, entityType,
// entityId, page and limit.
export function listAuditLog(filters = {}) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') query.set(key, String(value).trim());
  });
  const text = query.toString();
  return request(`/api/audit-log${text ? `?${text}` : ''}`);
}
