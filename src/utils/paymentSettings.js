import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:5000';

// Admin-managed payment methods (with per-method account details) and down
// payment percentage options — replaces the old hardcoded PAYMENT_MODES /
// DOWN_PAYMENT_OPTIONS constants in book_service.jsx. Used by both the
// self-service and walk-in booking flows, plus the admin Payment Settings editor.
export function usePaymentSettings() {
  const [settings, setSettings] = useState({ paymentMethods: [], downPaymentPercentages: [] });
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(() => {
    setLoading(true);
    const token = localStorage.getItem('token');
    return fetch(`${API_BASE}/api/payment-settings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          paymentMethods: Array.isArray(data.paymentMethods) ? data.paymentMethods : [],
          downPaymentPercentages: Array.isArray(data.downPaymentPercentages) ? data.downPaymentPercentages : [],
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...settings, loading, refetch };
}

// Customer Classification Module perk: a "Return" customer sees an extra
// no-down-payment option up front. This 0% option is intentionally NOT part of
// the admin-editable percentage list — it's tied to that separate module's own
// business rule, not general payment config, and 0 is rejected as an admin-added
// value server-side for the same reason (it would collide with this perk's meaning
// for customers who aren't actually Return customers).
export function getDownPaymentOptions(isReturnCustomer, percentages) {
  const base = (percentages && percentages.length > 0 ? percentages : [30, 50, 100])
    .slice()
    .sort((a, b) => a - b)
    .map((value) => ({
      value,
      label: value === 100 ? 'Full Payment (100%)' : `${value}% Down Payment`,
    }));

  if (!isReturnCustomer) return base;
  return [{ label: 'No Down Payment (Return Customer)', value: 0 }, ...base];
}
