// Shown instead of a page's prices, discounts and down payment options when the Payment
// Settings could not be loaded. Nothing is calculated from guessed values; Try again reloads them.
function PaymentSettingsUnavailable({ onRetry }) {
  return (
    <div className="bs-card payment-settings-unavailable" role="alert">
      <p className="bs-card-sub">Could not load payment settings. Try again.</p>
      <button type="button" className="bs-next-btn" onClick={onRetry}>Try again</button>
    </div>
  );
}

export default PaymentSettingsUnavailable;
