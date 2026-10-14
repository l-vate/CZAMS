import { useEffect, useRef, useState } from 'react';
import { FiSend, FiUser, FiMessageCircle } from 'react-icons/fi';
import { ApiError } from '../services/apiClient';
import { listMessages, sendMessage as postMessage } from '../services/chatService';
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
  // True while the last refresh failed. The next poll tries again and clears it when it works.
  const [connectionProblem, setConnectionProblem] = useState(false);
  const bottomRef = useRef(null);
  // Quick-question picker (customer chat.jsx) hands off a question to send as
  // the opening message - guarded so it only ever fires once, even though this
  // effect also depends on `loading`/`messages` ticking on the poll interval.
  const initialMessageSentRef = useRef(false);

  // An admin reads the conversation they picked; everyone else reads their own.
  const threadId = isAdmin ? conversationId : undefined;

  useEffect(() => {
    if (isAdmin && !conversationId) return;
    setLoading(true);
    const fetchMessages = () => {
      listMessages(threadId)
        .then((data) => {
          if (!Array.isArray(data)) throw new Error('Unexpected messages reply');
          setMessages(data);
          setConnectionProblem(false);
        })
        .catch(() => setConnectionProblem(true))
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
      const created = await postMessage(threadId, messageText.trim());
      setMessages((prev) => [...prev, created]);
      setText('');
    } catch (err) {
      if (!(err instanceof ApiError)) console.error('Failed to send message', err);
      setConnectionProblem(true); // the message was not sent; the indicator clears when the next refresh works
    } finally {
      setSending(false);
    }
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

  const handleSend = (e) => {
    e.preventDefault();
    sendMessage(text);
  };

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
        {connectionProblem && <p className="connection-problem" role="status">Connection problem. Trying again...</p>}
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
          aria-label="Type a message"
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
