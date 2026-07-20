import { useState, useEffect } from 'react';
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
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const filters = ['All', 'Paid', 'Unpaid'];

  const fetchBookings = () => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/bookings/mine', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map((b) => ({
          id: b.bookingId,
          service: b.service?.name || b.service?.category || '—',
          customerName: storedUser.name || '—',
          address: b.address,
          contactNumber: storedUser.phone || '—',
          paymentMode: b.paymentMode,
          paymentStatus: b.paymentStatus,
          downPaymentPercent: b.downPaymentPercent,
          createdAt: b.createdAt,
          paid: b.paymentStatus === 'Paid',
          status: b.paymentStatus === 'Paid' ? 'Fully Paid' : 'To Verify',
          date: new Date(b.createdAt).toLocaleDateString('en-US'),
          raw: b,
        }));
        setBills(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
  }, []);

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

  const handlePaymentSubmit = async ({ proof }) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${selectedBill.id}/pay`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proofFile: proof?.name || null }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Failed to submit payment');
        return;
      }

      setShowPayment(false);
      fetchBookings(); // refresh list so status updates
    } catch (err) {
      alert('Could not connect to server.');
    }
  };

  return (
    <CustomerLayout title="Billings">

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

      <div className="billing-list">
        {loading ? (
          <p className="billing-empty">Loading bills...</p>
        ) : filteredBills.length === 0 ? (
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

                <h3 className="billing-card-title">{bill.service.toUpperCase()}</h3>
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

      {showPayment && selectedBill && (
        <PaymentModal
          form={selectedBill}
          onClose={() => setShowPayment(false)}
          onSubmit={handlePaymentSubmit}
        />
      )}

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