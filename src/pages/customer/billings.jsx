import { useState } from 'react';
import CustomerLayout from './customer_layout';
import PaymentModal from '../../components/payment_modal';
import ReceiptModal from '../../components/receipt_modal';
import { FiClock, FiMapPin, FiFileText, FiCreditCard } from 'react-icons/fi';

function Billings() {
  const [showPayment, setShowPayment] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', 'Paid', 'Unpaid'];

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

  const filteredBills =
    activeFilter === 'All'
      ? bills
      : bills.filter((bill) =>
          activeFilter === 'Paid' ? bill.paid : !bill.paid
        );

  const getStatusColor = (bill) => {
    if (bill.paid) return '#22c55e';
    return '#f59e0b';
  };

  const handlePaymentSubmit = ({ proof, senior }) => {
    console.log('Payment submitted:', proof, senior);
    setShowPayment(false);
  };

  return (
    <CustomerLayout title="Billings">
      <h1 className="dashboard-welcome">Payment & Billing</h1>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px'
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '12px',
            flexWrap: 'wrap'
          }}
        >
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              style={{
                padding: '10px 18px',
                borderRadius: '999px',
                border: '1px solid #1b9ce5',
                background:
                  activeFilter === filter ? '#1b9ce5' : '#fff',
                color:
                  activeFilter === filter ? '#fff' : '#333',
                cursor: 'pointer'
              }}
            >
              {filter}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search..."
          style={{
            padding: '10px 16px',
            borderRadius: '6px',
            border: '1px solid #d9d9d9'
          }}
        />
      </div>

      {/* Billing Cards */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}
      >
        {filteredBills.map((bill) => (
          <div
            key={bill.id}
            style={{
              background: '#fff',
              border: '1px solid #d9d9d9',
              borderRadius: '12px',
              padding: '18px 20px',
              display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr',
              alignItems: 'center'
            }}
          >
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '10px',
                  alignItems: 'center',
                  marginBottom: '8px'
                }}
              >
                <small style={{ color: '#888' }}>{bill.date}</small>

                <span
                  style={{
                    background: getStatusColor(bill),
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '999px',
                    fontSize: '11px'
                  }}
                >
                  {bill.status}
                </span>
              </div>

              <h3 style={{ margin: 0, fontSize: '18px' }}>
                {bill.service.toUpperCase()} TYPE
              </h3>

              <p style={{ margin: '4px 0', color: '#666' }}>
                Booking ID: {bill.id}
              </p>

              <small>Customer: {bill.customerName}</small>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiMapPin /> {bill.address}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <FiClock /> {bill.date}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                gap: '8px'
              }}
            >
              {bill.paid && (
              <button
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#333',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '13px'
                }}
                onClick={() => {
                  setSelectedBill(bill);
                  setShowReceipt(true);
                }}
              >
                <FiFileText /> Invoice
              </button>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end'
              }}
            >
              {!bill.paid && (
                <button
                  style={{
                    background: '#1b9ce5',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 10px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => {
                    setSelectedBill(bill);
                    setShowPayment(true);
                  }}
                >
                  <FiCreditCard size={13} /> Settle
                </button>
              )}
            </div>
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