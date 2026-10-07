import StaffLayout from './staff_layout';
import ChatPanel from '../../components/chat_panel';

function StaffChat() {
  return (
    <StaffLayout title="Chat">
      <div className="chat-page">
        <ChatPanel emptyText="No messages yet. Send a message to reach admin." />
      </div>
    </StaffLayout>
  );
}

export default StaffChat;
