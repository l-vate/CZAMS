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
  const [paymentType, setPaymentType] = useState('downpayment'); // 'downpayment' | 'balance'

  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');

  const filters = ['All', 'Paid', 'Partially Paid', 'Unpaid'];

  const fetchBookings = () => {
    const token = localStorage.getItem('token');
    fetch('http://localhost:5000/api/bookings/mine', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map((b) => {
          const isFullyPaid = b.paymentStatus === 'Paid' && (b.downPaymentPercent === 100 || b.balancePaid);
          const isPartiallyPaid = b.paymentStatus === 'Paid' && b.downPaymentPercent < 100 && !b.balancePaid;

          let status = 'Unpaid';
          if (isFullyPaid) status = 'Fully Paid';
          else if (isPartiallyPaid) status = `${b.downPaymentPercent}% Paid`;

          const basePrice = b.service?.price || 0;
          const dpPercent = b.downPaymentPercent ?? 10;
          const toPayNow = Math.round(basePrice * (dpPercent / 100));
          const remaining = basePrice - toPayNow;

          return {
            id: b.bookingId,
            service: b.service?.name || b.service?.category || '—',
            customerName: storedUser.name || '—',
            address: b.address,
            contactNumber: storedUser.phone || '—',
            paymentMode: b.paymentMode,
            paymentStatus: b.paymentStatus,
            downPaymentPercent: dpPercent,
            balancePaid: b.balancePaid,
            createdAt: b.createdAt,
            paid: b.paymentStatus === 'Paid',
            isFullyPaid,
            isPartiallyPaid,
            status,
            date: new Date(b.createdAt).toLocaleDateString('en-US'),
            basePrice,
            toPayNow,
            remaining,
            raw: b,
          };
        });
        setBills(mapped);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchBookings();
  }, []);

  const filteredBills = bills
    .filter((bill) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Paid') return bill.isFullyPaid;
      if (activeFilter === 'Partially Paid') return bill.isPartiallyPaid;
      if (activeFilter === 'Unpaid') return !bill.paid;
      return true;
    })
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

    const BILL_STATUS_ORDER = { unpaid: 0, partial: 1, paid: 2 };
  const sortedBills = [...filteredBills].sort((a, b) => {
    const rankOf = (bill) => {
      if (bill.isFullyPaid) return BILL_STATUS_ORDER.paid;
      if (bill.isPartiallyPaid) return BILL_STATUS_ORDER.partial;
      return BILL_STATUS_ORDER.unpaid;
    };
    const rankA = rankOf(a);
    const rankB = rankOf(b);
    if (rankA !== rankB) return rankA - rankB;
    return new Date(b.createdAt) - new Date(a.createdAt); // newest first within same group
  });

  const getStatusColor = (bill) => {
    if (bill.isFullyPaid) return '#22c55e';
    if (bill.isPartiallyPaid) return '#f59e0b';
    return '#ef4444';
  };

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
      fetchBookings();
    } catch (err) {
      alert('Could not connect to server.');
    }
  };

  const handleBalancePaymentSubmit = async ({ proof }) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`http://localhost:5000/api/bookings/${selectedBill.id}/pay-balance`, {
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
      fetchBookings();
    } catch (err) {
      alert('Could not connect to server.');
    }
  };

  return (
    <CustomerLayout title="Billings">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              style={{
                padding: '10px 18px', borderRadius: '999px', border: '1px solid #1b9ce5',
                background: activeFilter === filter ? '#1b9ce5' : '#fff',
                color: activeFilter === filter ? '#fff' : '#333', cursor: 'pointer',
              }}
            >
              {filter}
            </button>
          ))}
        </div>

        <input
          type="search"
          placeholder="Search by ID, service, or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            padding: '10px 16px', borderRadius: '8px', border: '1px solid #d9d9d9',
            minWidth: '260px', fontSize: '14px',
          }}
        />
      </div>

      {loading ? (
        <p>Loading bills...</p>
      ) : sortedBills.length === 0 ? (
        <p style={{ color: '#666' }}>No matching bills found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredBills.map((bill) => (
            <div
              key={bill.id}
              style={{
                background: '#fff', border: '1px solid #d9d9d9', borderRadius: '12px',
                padding: '18px 20px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1.5fr 1.2fr',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '8px' }}>
                  <small style={{ color: '#888' }}>{bill.date}</small>
                  <span style={{ background: getStatusColor(bill), color: '#fff', padding: '2px 8px', borderRadius: '999px', fontSize: '11px' }}>
                    {bill.status}
                  </span>
                </div>

                <h3 style={{ margin: 0, fontSize: '18px' }}>{bill.service}</h3>
                <p style={{ margin: '4px 0', color: '#666' }}>{bill.id}</p>
                
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiMapPin /> {bill.address}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <FiClock /> {bill.date}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                {bill.isFullyPaid && (
                  <button
                    style={{ background: 'transparent', border: '1px solid #d0dde8', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', color: '#333', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      setSelectedBill(bill);
                      setShowReceipt(true);
                    }}
                  >
                    <FiFileText size={14} /> Invoice
                  </button>
                )}

                {!bill.paid && (
                  <button
                    style={{ background: '#1b9ce5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      setSelectedBill(bill);
                      setPaymentType('downpayment');
                      setShowPayment(true);
                    }}
                  >
                    <FiCreditCard size={14} /> Settle
                  </button>
                )}

                {bill.isPartiallyPaid && (
                  <button
                    style={{ background: '#1b9ce5', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}
                    onClick={() => {
                      setSelectedBill(bill);
                      setPaymentType('balance');
                      setShowPayment(true);
                    }}
                  >
                    <FiCreditCard size={14} /> Pay Balance
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPayment && selectedBill && (
        <PaymentModal
          form={selectedBill}
          paymentType={paymentType}
          onClose={() => setShowPayment(false)}
          onSubmit={paymentType === 'balance' ? handleBalancePaymentSubmit : handlePaymentSubmit}
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