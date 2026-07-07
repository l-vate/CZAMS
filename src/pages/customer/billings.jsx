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
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredBills = bills
    .filter((bill) =>
      activeFilter === 'All' ? true : activeFilter === 'Paid' ? bill.paid : !bill.paid
    )
    .filter((bill) => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        bill.id.toLowerCase().includes(term) ||
        bill.service.toLowerCase().includes(term) ||
        bill.customerName.toLowerCase().includes(term) ||
        bill.address.toLowerCase().includes(term)
      );
    });

  const handlePaymentSubmit = ({ proof, senior }) => {
    console.log('Payment submitted:', proof, senior);
    setShowPayment(false);
  };

  return (
    <CustomerLayout title="Billings">
      <h1 className="dashboard-welcome">Payment & Billing</h1>

      {/* Filters */}
      <div className="billing-toolbar">
        <div className="billing-filter-group">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`billing-filter-pill ${activeFilter === filter ? 'active' : ''}`}
            >
              {filter}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search by ID, service, customer, or address..."
          className="billing-search-input"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Billing Cards */}
      <div className="billing-list">
        {filteredBills.length === 0 ? (
          <p className="billing-empty">No matching bills found.</p>
        ) : (
          filteredBills.map((bill) => (
            <div key={bill.id} className="billing-card">
              <div className="billing-card-main">
                <div className="billing-card-top-row">
                  <small className="billing-card-date-label">{bill.date}</small>
                  <span className={`billing-status-badge ${bill.paid ? 'paid' : 'unpaid'}`}>
                    {bill.status}
                  </span>
                </div>

                <h3 className="billing-card-title">{bill.service.toUpperCase()} TYPE</h3>
                <p className="billing-card-subtext">Booking ID: {bill.id}</p>
                <small>Customer: {bill.customerName}</small>
              </div>

              <div className="billing-card-meta">
                <FiMapPin /> {bill.address}
              </div>

              <div className="billing-card-meta">
                <FiClock /> {bill.date}
              </div>

              <div className="billing-card-invoice">
                {bill.paid && (
                  <button
                    className="invoice-link-btn"
                    onClick={() => {
                      setSelectedBill(bill);
                      setShowReceipt(true);
                    }}
                  >
                    <FiFileText /> Invoice
                  </button>
                )}
              </div>

              <div className="billing-card-action">
                {!bill.paid && (
                  <button
                    className="settle-btn"
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
          ))
        )}
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