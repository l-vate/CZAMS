import { useEffect, useRef, useState } from 'react';
import { FiSend, FiUser, FiMessageCircle } from 'react-icons/fi';
import { API_BASE } from '../config/api';
import { ROLE } from '../constants/roles';

const POLL_INTERVAL_MS = 15000;

// Shared by the customer, technician, and admin chat pages - one thread model,
// just pointed at a different conversation depending on who's viewing it.
// Admin passes a conversationId (picked from their inbox); customer/staff always
// operate on "their" own conversation, created lazily on first message. Customer
// and staff only ever talk to admin, so partnerName/partnerSubtitle default to
// that; admin passes the actual participant's name/role from its inbox instead.
function ChatPanel({ conversationId, emptyText, partnerName = 'Admin Support', partnerSubtitle = 'Cooling Zone Aircon Services', initialMessage }) {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  const isAdmin = user?.role === ROLE.ADMIN;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  // Quick-question picker (customer chat.jsx) hands off a question to send as
  // the opening message - guarded so it only ever fires once, even though this
  // effect also depends on `loading`/`messages` ticking on the poll interval.
  const initialMessageSentRef = useRef(false);

  const base = isAdmin
    ? `${API_BASE}/api/chat/conversations/${conversationId}`
    : `${API_BASE}/api/chat/conversations/mine`;

  useEffect(() => {
    if (isAdmin && !conversationId) return;
    setLoading(true);
    const fetchMessages = () => {
      const token = localStorage.getItem('token');
      fetch(`${base}/messages`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setMessages(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchMessages();
    // No websockets anywhere in this codebase - poll only while this panel is
    // mounted (i.e. the chat tab is actually open), matching the rest of the app.
    const interval = setInterval(fetchMessages, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (messageText) => {
    if (!messageText.trim() || sending) return;
    setSending(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${base}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text: messageText.trim() }),
      });
      if (res.ok) {
        const created = await res.json();
        setMessages((prev) => [...prev, created]);
        setText('');
      }
    } catch (err) {
      console.error('Failed to send message', err);
    } finally {
      setSending(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(text);
  };

  useEffect(() => {
    if (!initialMessage || loading || sending || initialMessageSentRef.current) return;
    if (messages.length > 0) {
      // A conversation already existed by the time this mounted - don't
      // re-send the quick question on top of real history.
      initialMessageSentRef.current = true;
      return;
    }
    initialMessageSentRef.current = true;
    sendMessage(initialMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, messages]);

  if (isAdmin && !conversationId) {
    return <div className="chat-empty">Select a conversation to start chatting.</div>;
  }

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <div className="chat-panel-avatar"><FiUser /></div>
        <div>
          <div className="chat-panel-name">{partnerName}</div>
          {partnerSubtitle && <div className="chat-panel-subtitle">{partnerSubtitle}</div>}
        </div>
      </div>

      <div className="chat-messages">
        {loading ? (
          <p className="chat-empty">Loading messages...</p>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <FiMessageCircle className="chat-empty-icon" />
            <p>{emptyText || 'No messages yet. Say hello!'}</p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m._id} className={`chat-bubble-row${mine ? ' chat-bubble-row--mine' : ''}`}>
                <div className={`chat-bubble${mine ? ' chat-bubble--mine' : ''}`}>
                  <p className="chat-bubble-text">{m.text}</p>
                  <span className="chat-bubble-time">
                    {new Date(m.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form className="chat-input-row" onSubmit={handleSend}>
        <input
          className="chat-input"
          type="text"
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={sending}
        />
        <button className="chat-send-btn" type="submit" disabled={sending || !text.trim()}>
          <FiSend />
        </button>
      </form>
    </div>
  );
}

export default ChatPanel;
