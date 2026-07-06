import { useState } from 'react';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import ReceiptModal from '../../components/receipt_modal';

function Billings() {
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  const handlePaymentSubmit = ({ proof, senior }) => {
    console.log('Payment submitted:', proof, senior);

    setShowPayment(false);
  };

  const bills = [
    {
      id: 'CZ-2026-7395',
      service: 'cleaning',
      customerName: 'Juan Dela Cruz',
      address: 'San Fernando, Pampanga',
      contactNumber: '09123456789',
      paymentMode: 'GCash',
      paymentStatus: 'Paid',
      downPaymentPercent: 30,
      createdAt: '2026-07-06',
      paid: true,
      status: 'Fully Paid',
      date: '07/06/2026',
    },
    {
      id: 'CZ-2026-7401',
      service: 'repair',
      customerName: 'Maria Santos',
      address: 'Angeles City',
      contactNumber: '09998887777',
      paymentMode: 'Bank Transfer',
      paymentStatus: 'Unpaid',
      downPaymentPercent: 10,
      createdAt: '2026-07-10',
      paid: false,
      status: 'To Verify',
      date: '07/10/2026',
    },
  ];

  return (
    <CustomerLayout title="Billings">
      <h1 className="dashboard-welcome">Payment & Billing</h1>

      <div className="billing-header">
        <div className="billing-tools">
          <select>
            <option>Sort By</option>
            <option>Newest</option>
            <option>Oldest</option>
          </select>

          <input
            type="search"
            placeholder="Search..."
          />
        </div>
      </div>

      <div className="billing-list">
        {bills.map((bill) => (
          <div className="billing-card" key={bill.id}>

            <div className="billing-left">
              <h3>{bill.service.toUpperCase()} TYPE</h3>
              <p>Booking ID: {bill.id}</p>
            </div>

            <div className="billing-date">
              🕒 {bill.date}
            </div>

            <button
              className="invoice-btn"
              onClick={() => {
                setSelectedBill(bill);
                setShowReceipt(true);
              }}
            >
              📄 Invoice
            </button>

            <button
              className="payment-btn"
              onClick={() => {
                setSelectedBill(bill);
                setShowPayment(true);
              }}
            >
              💳 Settle Payment
            </button>

            <span className={`status ${bill.paid ? 'paid' : 'verify'}`}>
              {bill.status}
            </span>

          </div>
        ))}
      </div>
      {/* Payment Modal */}
      {showPayment && selectedBill && (
        <PaymentModal
          form={selectedBill}
          onClose={() => setShowPayment(false)}
          onSubmit={handlePaymentSubmit}
        />
      )}

      {/* Receipt Modal */}
      {showReceipt && selectedBill && (
        <ReceiptModal
          form={selectedBill}
          booking={selectedBill}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </CustomerLayout>
  );
}

export default Billings;