import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/public/landing_page';
import LoginPage from './pages/public/login_page';
import RegisterPage from './pages/public/register_page';
import ForgotPasswordPage from './pages/public/forgot_password_page';
import ResetPasswordPage from './pages/public/reset_password_page';

import CustomerDashboard from './pages/customer/dashboard';
import CustomerBookService from './pages/customer/book_service';
import CustomerBookings from './pages/customer/my_bookings';
import CustomerBillings from './pages/customer/billings';
import CustomerProfile from './pages/customer/profile';
import CustomerBookDetails from './pages/customer/book_details';
import CustomerChat from './pages/customer/chat';

import StaffDashboard from './pages/staff/dashboard';
import StaffMyJobs from './pages/staff/my_jobs';
import StaffCalendar from './pages/staff/calendar';
import StaffReports from './pages/staff/reports';
import StaffProfile from './pages/staff/profile';
import StaffChat from './pages/staff/chat';

import AdminDashboard from './pages/admin/dashboard';
import AdminManageAccounts from './pages/admin/manage_accounts';
import AdminCalendar from './pages/admin/calendar';
import AdminServices from './pages/admin/services';
import AdminServiceManage from './pages/admin/service_manage';
import AdminManagePaymentSettings from './pages/admin/manage_payment_settings';
import AdminServiceRequests from './pages/admin/service_requests';
import AdminBookingDetails from './pages/admin/booking_details_page';
import AdminSuppliedUnits from './pages/admin/supplied_units';
import AdminWalkInBooking from './pages/admin/walk_in_booking';
import AdminServiceReports from './pages/admin/service_reports';
import AdminPayments from './pages/admin/payments';
import AdminBackJobs from './pages/admin/back_jobs';
import AdminAnalytics from './pages/admin/analytics';
import AdminReports from './pages/admin/reports';
import AdminAuditLog from './pages/admin/audit_log';
import AdminPromotions from './pages/admin/promotions';
import AdminAnnouncements from './pages/admin/announcements';
import AdminChat from './pages/admin/chat';
import NotificationsPage from './pages/notifications';

import RequireRole from './components/require_role';
import { ROLE } from './constants/roles';
import { refreshSession } from './services/sessionService';

function App() {
  // On start, compare the saved user with the server's, so a role changed while the browser was closed is
  // picked up before the person lands on a page that is no longer theirs.
  useEffect(() => {
    refreshSession({ force: true });
  }, []);

  return (
    <BrowserRouter>
      <Routes>

        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Customer Pages */}
        <Route element={<RequireRole role={ROLE.CUSTOMER} />}>
          <Route path="/customer/dashboard" element={<CustomerDashboard />} />
          <Route path="/customer/book_service" element={<CustomerBookService />} />
          <Route path="/customer/bookings" element={<CustomerBookings />} />
          <Route path="/customer/billings" element={<CustomerBillings />} />
          <Route path="/customer/profile" element={<CustomerProfile />} />
          <Route path="/customer/book_details/:bookingId" element={<CustomerBookDetails />} />
          <Route path="/customer/chat" element={<CustomerChat />} />
          <Route path="/customer/notifications" element={<NotificationsPage />} />
        </Route>

        {/* Staff Pages */}
        <Route element={<RequireRole role={ROLE.STAFF} />}>
          <Route path="/staff/dashboard" element={<StaffDashboard />} />
          <Route path="/staff/my_jobs" element={<StaffMyJobs />} />
          <Route path="/staff/calendar" element={<StaffCalendar />} />
          <Route path="/staff/reports" element={<StaffReports />} />
          <Route path="/staff/profile" element={<StaffProfile />} />
          <Route path="/staff/chat" element={<StaffChat />} />
          <Route path="/staff/notifications" element={<NotificationsPage />} />
        </Route>

        {/* Admin Pages */}
        <Route element={<RequireRole role={ROLE.ADMIN} />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/manage_accounts" element={<AdminManageAccounts />} />
          <Route path="/admin/calendar" element={<AdminCalendar />} />
          <Route path="/admin/services" element={<AdminServices />} />
          <Route path="/admin/services/manage" element={<AdminServiceManage />} />
          <Route path="/admin/services/units" element={<AdminSuppliedUnits />} />
          <Route path="/admin/payment-settings" element={<AdminManagePaymentSettings />} />
          <Route path="/admin/services/requests" element={<AdminServiceRequests />} />
          <Route path="/admin/services/requests/new" element={<AdminWalkInBooking />} />
          <Route path="/admin/services/requests/:bookingId" element={<AdminBookingDetails />} />
          <Route path="/admin/services/reports" element={<AdminServiceReports />} />
          <Route path="/admin/payments" element={<AdminPayments />} />
          {/* Refunds is now a filter pill on the Payments tab, not its own page. */}
          <Route path="/admin/refunds" element={<Navigate to="/admin/payments" replace />} />
          <Route path="/admin/back-jobs" element={<AdminBackJobs />} />
          <Route path="/admin/analytics" element={<AdminAnalytics />} />
          <Route path="/admin/reports" element={<AdminReports />} />
          <Route path="/admin/audit-log" element={<AdminAuditLog />} />
          <Route path="/admin/promotions" element={<AdminPromotions />} />
          <Route path="/admin/announcements" element={<AdminAnnouncements />} />
          <Route path="/admin/chat" element={<AdminChat />} />
          <Route path="/admin/notifications" element={<NotificationsPage />} />
        </Route>

      </Routes>
    </BrowserRouter>
  );
}

export default App;