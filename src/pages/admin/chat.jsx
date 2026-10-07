import { useEffect, useState } from 'react';
import AdminLayout from './admin_layout';
import ChatPanel from '../../components/chat_panel';
import { API_BASE } from '../../config/api';
import { ROLE } from '../../constants/roles';


function AdminChat() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    const fetchConversations = () => {
      const token = localStorage.getItem('token');
      fetch(`${API_BASE}/api/chat/conversations`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setConversations(Array.isArray(data) ? data : []))
        .catch(() => setConversations([]))
        .finally(() => setLoading(false));
    };
    fetchConversations();
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSelect = (id) => {
    setSelectedId(id);
    // Clear the unread dot locally right away - the panel's own message fetch
    // marks it read server-side; this just avoids a stale badge until next poll.
    setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, unread: false } : c)));
  };

  const selectedConversation = conversations.find((c) => c._id === selectedId);

  return (
    <AdminLayout title="Chat">
      <div className="chat-admin-layout">
        <div className="chat-inbox">
          {loading ? (
            <p className="chat-empty">Loading conversations...</p>
          ) : conversations.length === 0 ? (
            <p className="chat-empty">No conversations yet.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c._id}
                type="button"
                className={`chat-inbox-item${selectedId === c._id ? ' chat-inbox-item--active' : ''}`}
                onClick={() => handleSelect(c._id)}
              >
                <div className="chat-inbox-item-top">
                  <span className="chat-inbox-name">{c.participant?.name || 'Unknown'}</span>
                  {c.unread && <span className="chat-inbox-dot" />}
                </div>
                <span className="chat-inbox-role">{c.participantRole === ROLE.STAFF ? 'Technician' : 'Customer'}</span>
                <span className="chat-inbox-preview">{c.lastMessageText || 'No messages yet'}</span>
              </button>
            ))
          )}
        </div>
        <div className="chat-admin-panel">
          <ChatPanel
            conversationId={selectedId}
            partnerName={selectedConversation?.participant?.name || 'Unknown'}
            partnerSubtitle={selectedConversation?.participantRole === ROLE.STAFF ? 'Technician' : 'Customer'}
          />
        </div>
      </div>
    </AdminLayout>
  );
}

export default AdminChat;
