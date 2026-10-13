import { useState, useEffect, useCallback } from 'react';
import { getPaymentSettings } from '../services/paymentSettingsService';


// Admin-managed payment methods (with per-method account details) and down
// payment percentage options - replaces the old hardcoded PAYMENT_MODES /
// DOWN_PAYMENT_OPTIONS constants in book_service.jsx. Used by both the
// self-service and walk-in booking flows, plus the admin Payment Settings editor.
//
// Nothing here is ever invented. `ready` is true once real settings have loaded. If a load fails,
// the last good values are kept; if there never were any, `failed` is true and the values stay
// empty (seniorPwdDiscountPercent is null), so a page must show "Could not load payment settings"
// and hold back every price, discount and down payment calculation until `ready`.
export function usePaymentSettings() {
  const [settings, setSettings] = useState(null); // the last good values, or null before the first load
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const refetch = useCallback(() => {
    setLoading(true);
    return getPaymentSettings()
      .then((data) => {
        // A reply that is not a real settings document counts as a failed load.
        if (!Array.isArray(data?.paymentMethods) || !Array.isArray(data?.downPaymentPercentages) || !Number.isFinite(Number(data?.seniorPwdDiscountPercent))) {
          throw new Error('Unexpected payment settings reply');
        }
        setSettings({
          paymentMethods: data.paymentMethods,
          downPaymentPercentages: data.downPaymentPercentages,
          seniorPwdDiscountPercent: Number(data.seniorPwdDiscountPercent),
        });
        setLoadFailed(false);
      })
      .catch(() => setLoadFailed(true)) // keep whatever was loaded before
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    paymentMethods: settings?.paymentMethods ?? [],
    downPaymentPercentages: settings?.downPaymentPercentages ?? [],
    seniorPwdDiscountPercent: settings?.seniorPwdDiscountPercent ?? null,
    loading,
    ready: settings !== null,
    failed: loadFailed && settings === null,
    refetch,
  };
}

// The down payment to assume when a booking or form has none recorded: the first
// (lowest) configured option, or null when there is none (settings not loaded): callers show
// "Not set" or wait, they never get an invented number.
export function getDefaultDownPaymentPercent(percentages) {
  const sorted = (percentages || []).filter((p) => Number.isFinite(p) && p > 0).sort((a, b) => a - b);
  return sorted.length > 0 ? sorted[0] : null;
}

// Customer Classification Module perk: a "Return" customer sees an extra
// no-down-payment option up front. This 0% option is intentionally NOT part of
// the admin-editable percentage list - it's tied to that separate module's own
// business rule, not general payment config, and 0 is rejected as an admin-added
// value server-side for the same reason (it would collide with this perk's meaning
// for customers who aren't actually Return customers).
export function getDownPaymentOptions(isReturnCustomer, percentages) {
  const base = (percentages || [])
    .slice()
    .sort((a, b) => a - b)
    .map((value) => ({
      value,
      label: value === 100 ? 'Full Payment (100%)' : `${value}% Down Payment`,
    }));

  if (!isReturnCustomer) return base;
  return [{ label: 'No Down Payment (Return Customer)', value: 0 }, ...base];
}
