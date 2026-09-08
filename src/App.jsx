import { BrowserRouter, Routes, Route } from 'react-router-dom';

import LandingPage from './pages/public/landing_page';
import LoginPage from './pages/public/login_page';
import RegisterPage from './pages/public/register_page';

import CustomerDashboard from './pages/customer/dashboard';
import CustomerBook from './pages/customer/book';
import CustomerBookings from './pages/customer/bookings';
import CustomerBillings from './pages/customer/billings';
import CustomerProfile from './pages/customer/profile';

import StaffDashboard from './pages/staff/dashboard';
import StaffJobs from './pages/staff/jobs';
import StaffCalendar from './pages/staff/calendar';
import StaffReports from './pages/staff/reports';
import StaffProfile from './pages/staff/profile';

import AdminDashboard from './pages/admin/dashboard';
import AdminManageAccounts from './pages/admin/manage_accounts';
import AdminCalendar from './pages/admin/calendar';
import AdminManageServices from './pages/admin/manage/services';
import AdminManageRequests from './pages/admin/manage/requests';
import AdminManageReports from './pages/admin/manage/reports';
import AdminPayments from './pages/admin/payments';
import AdminAnalytics from './pages/admin/analytics';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer Pages */}
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/book" element={<CustomerBook />} />
        <Route path="/customer/bookings" element={<CustomerBookings />} />
        <Route path="/customer/billings" element={<CustomerBillings />} />
        <Route path="/customer/profile" element={<CustomerProfile />} />

        {/* Staff Pages */}
        <Route path="/staff/dashboard" element={<StaffDashboard />} />
        <Route path="/staff/jobs" element={<StaffJobs />} />
        <Route path="/staff/calendar" element={<StaffCalendar />} />
        <Route path="/staff/reports" element={<StaffReports />} />
        <Route path="/staff/profile" element={<StaffProfile />} />

        {/* Admin Pages */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/manage_accounts" element={<AdminManageAccounts />} />
        <Route path="/admin/calendar" element={<AdminCalendar />} />
        <Route path="/admin/services/manage" element={<AdminManageServices />} />
        <Route path="/admin/services/requests" element={<AdminManageRequests />} />
        <Route path="/admin/services/reports" element={<AdminManageReports />} />
        <Route path="/admin/payments" element={<AdminPayments />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;