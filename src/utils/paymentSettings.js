import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../config/api';


// Admin-managed payment methods (with per-method account details) and down
// payment percentage options - replaces the old hardcoded PAYMENT_MODES /
// DOWN_PAYMENT_OPTIONS constants in book_service.jsx. Used by both the
// self-service and walk-in booking flows, plus the admin Payment Settings editor.
export function usePaymentSettings() {
  const [settings, setSettings] = useState({ paymentMethods: [], downPaymentPercentages: [], seniorPwdDiscountPercent: 20 });
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
          seniorPwdDiscountPercent: Number.isFinite(Number(data.seniorPwdDiscountPercent)) ? Number(data.seniorPwdDiscountPercent) : 20,
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

// The down payment to assume when a booking or form has none recorded: the first
// (lowest) configured option, or the PaymentSettings seed default (30) if the
// settings haven't loaded yet. Replaces the old hardcoded 10% fallback.
const SEED_DEFAULT_DOWN_PAYMENT = 30;
export function getDefaultDownPaymentPercent(percentages) {
  const sorted = (percentages || []).filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[0] : SEED_DEFAULT_DOWN_PAYMENT;
}

// Customer Classification Module perk: a "Return" customer sees an extra
// no-down-payment option up front. This 0% option is intentionally NOT part of
// the admin-editable percentage list - it's tied to that separate module's own
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
