// Shown on Bookings/Payments/Reports when Manage Accounts navigated in with a
// specific technician/client filter pre-applied (View Job History, View Bookings,
// Billing History, Reports). Lets the admin see the filter is active and drop
// back to the page's normal unfiltered view without leaving it.
function PersonFilterBanner({ filter, onClear }) {
  if (!filter) return null;
  const roleLabel = filter.type === 'technician' ? 'technician' : 'client';
  return (
    <div className="person-filter-banner">
      <span>
        Filtered by {roleLabel}: <strong>{filter.name}</strong>
      </span>
      <button type="button" className="person-filter-clear" onClick={onClear}>
        Clear filter
      </button>
    </div>
  );
}

export default PersonFilterBanner;
