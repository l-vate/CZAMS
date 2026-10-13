import AdminLayout from './admin_layout';
import PaymentSettingsPanel from '../../components/payment_settings_panel';

// Promoted out of Manage Services' "Payment Settings" sub-tab to its own
// top-level nav item - was previously nested there as a System Configuration
// tab alongside per-service pricing.
function ManagePaymentSettings() {
  return (
    <AdminLayout title="Manage Payment Settings">
      <h1 className="dashboard-welcome">Manage Payment Settings</h1>
      <PaymentSettingsPanel />
    </AdminLayout>
  );
}

export default ManagePaymentSettings;
