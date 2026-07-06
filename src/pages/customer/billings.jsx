import CustomerLayout from './customer_layout';

function Billings() {
  const bills = [
    {
      id: 'CZ-2026-7395',
      service: 'Cleaning',
      date: '07/06/2026',
      status: 'Fully Paid',
      paid: true,
    },
    {
      id: 'CZ-2026-7401',
      service: 'Repair',
      date: '07/10/2026',
      status: 'To Verify',
      paid: false,
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

            <button className="invoice-btn">
              📄 Invoice
            </button>

            <button className="payment-btn">
              💳 Settle Payment
            </button>

            <span className={`status ${bill.paid ? 'paid' : 'verify'}`}>
              {bill.status}
            </span>

          </div>
        ))}
      </div>

    </CustomerLayout>
  );
}

export default Billings;