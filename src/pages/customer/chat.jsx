import { useState } from 'react';
import CustomerLayout from './customer_layout';
import ChatPanel from '../../components/chat_panel';
import { usePaymentSettings } from '../../utils/paymentSettings';
import { SERVICE_AREA_DISPLAY_NAMES } from '../../utils/serviceArea';
import { FiMessageCircle, FiArrowRight, FiCheckCircle } from 'react-icons/fi';

// Common questions customers actually ask support, each with an instant answer
// this app can already give without a human - most of these are just "where do
// I click," not something that needs admin's attention. Answer can be a plain
// string or a function(paymentMethods) for anything that pulls in live data.
function buildQuickQuestions(paymentMethods) {
  const methodNames = paymentMethods.length > 0
    ? paymentMethods.map((m) => m.name).join(', ')
    : 'the modes listed on the payment screen';

  return [
    {
      question: 'How do I check the status of my booking?',
      answer: 'Go to "My Bookings" in the sidebar - every booking you\'ve made is listed there with its current status (Pending, Approved, In Progress, Completed, or Cancelled), updated in real time.',
    },
    {
      question: 'How do I pay my down payment?',
      answer: `Open the booking in "Payment & Billing," tap "Pay Downpayment," pick a payment mode (${methodNames}), and upload a screenshot of your payment as proof. Admin verifies it shortly after.`,
    },
    {
      question: 'Can I reschedule my booking?',
      answer: 'Yes - open the booking from "My Bookings," then use the "Reschedule" option to request a new date and time. Depending on your booking\'s status, this may need admin approval before it\'s final.',
    },
    {
      question: 'Do you service my area?',
      answer: `CZA's confirmed service areas are: ${SERVICE_AREA_DISPLAY_NAMES.join(', ')}. Addresses outside Quezon City may incur a distance-based transportation charge. If your address isn't in this list, you can still book - it'll just be flagged for admin review.`,
    },
    {
      question: "What's included in a cleaning service?",
      answer: 'Standard cleaning covers a full unit wash (coils, filters, blower) and a performance check. If it\'s been over 6 months since your last cleaning or the unit is actively leaking, our tiered system automatically upgrades you to Deep Cleaning or Pull-down Deep Cleaning at booking time.',
    },
    {
      question: 'How do I cancel a booking?',
      answer: 'You can cancel before the service starts (not once it is In Progress). Open the booking from "My Bookings" and use the "Cancel" option there. If you had a verified down payment, a refund request opens automatically. Cancel before the booked date and your down payment is refunded in full; cancelling on or after the booked date may result in a transportation fee deducted from it.',
    },
  ];
}

function CustomerChat() {
  const { paymentMethods } = usePaymentSettings();
  const [selected, setSelected] = useState(null); // { question, answer } | null
  const [chatStarted, setChatStarted] = useState(false);

  const quickQuestions = buildQuickQuestions(paymentMethods);

  if (chatStarted) {
    return (
      <CustomerLayout title="Chat">
        <div className="chat-page">
          <ChatPanel
            emptyText="No messages yet. Send a message to reach the CZA team."
            initialMessage={selected?.question || null}
          />
        </div>
      </CustomerLayout>
    );
  }

  if (selected) {
    return (
      <CustomerLayout title="Chat">
        <div className="chat-page">
          <div className="chat-picker-card">
            <div className="chat-picker-icon"><FiCheckCircle /></div>
            <h3 className="chat-picker-title">{selected.question}</h3>
            <p className="chat-picker-answer">{selected.answer}</p>

            <div className="chat-picker-answer-actions">
              <button type="button" className="chat-picker-back-btn" onClick={() => setSelected(null)}>
                Back to questions
              </button>
              <button type="button" className="chat-picker-other-btn" onClick={() => setChatStarted(true)}>
                Still need help? Talk to us <FiArrowRight />
              </button>
            </div>
          </div>
        </div>
      </CustomerLayout>
    );
  }

  return (
    <CustomerLayout title="Chat">
      <div className="chat-page">
        <div className="chat-picker-card">
          <div className="chat-picker-icon"><FiMessageCircle /></div>
          <h3 className="chat-picker-title">How can we help?</h3>
          <p className="chat-picker-sub">
            Pick what you need help with, or start a conversation for anything else.
          </p>

          <div className="chat-picker-list">
            {quickQuestions.map((q) => (
              <button
                key={q.question}
                type="button"
                className="chat-picker-question"
                onClick={() => setSelected(q)}
              >
                {q.question}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="chat-picker-other-btn"
            onClick={() => setChatStarted(true)}
          >
            My concern isn't listed here <FiArrowRight />
          </button>
        </div>
      </div>
    </CustomerLayout>
  );
}

export default CustomerChat;
