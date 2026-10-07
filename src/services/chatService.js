import { request } from './apiClient';

// Admin inbox.
export function listConversations() {
  return request('/api/chat/conversations');
}

// An admin reads a customer's conversation by id; a customer reads their own ('mine').
const conversationPath = (conversationId) => `/api/chat/conversations/${conversationId ?? 'mine'}`;

export function listMessages(conversationId) {
  return request(`${conversationPath(conversationId)}/messages`);
}

export function sendMessage(conversationId, text) {
  return request(`${conversationPath(conversationId)}/messages`, { method: 'POST', body: { text } });
}
