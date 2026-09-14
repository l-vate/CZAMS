import { BrowserRouter, Routes, Route } from 'react-router-dom';

import LandingPage from './pages/public/landing_page';
import LoginPage from './pages/public/login_page';
import RegisterPage from './pages/public/register_page';

import CustomerDashboard from './pages/customer/dashboard';
import CustomerBookService from './pages/customer/book_service';
import CustomerBookings from './pages/customer/my_bookings';
import CustomerBillings from './pages/customer/billings';
import CustomerProfile from './pages/customer/profile';
import CustomerBookDetails from './pages/customer/book_details';

import StaffDashboard from './pages/staff/dashboard';
import StaffMyJobs from './pages/staff/my_jobs';
import StaffCalendar from './pages/staff/calendar';
import StaffReports from './pages/staff/reports';
import StaffProfile from './pages/staff/profile';

import AdminDashboard from './pages/admin/dashboard';
import AdminManageAccounts from './pages/admin/manage_accounts';
import AdminCalendar from './pages/admin/calendar';
import AdminServices from './pages/admin/services';
import AdminServiceManage from './pages/admin/service_manage';
import AdminServiceRequests from './pages/admin/service_requests';
import AdminWalkInBooking from './pages/admin/walk_in_booking';
import AdminServiceReports from './pages/admin/service_reports';
import AdminPayments from './pages/admin/payments';
import AdminBackJobs from './pages/admin/back_jobs';
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
        <Route path="/customer/book_service" element={<CustomerBookService />} />
        <Route path="/customer/bookings" element={<CustomerBookings />} />
        <Route path="/customer/billings" element={<CustomerBillings />} />
        <Route path="/customer/profile" element={<CustomerProfile />} />
        <Route path="/customer/book_details/:bookingId" element={<CustomerBookDetails />} />

        {/* Staff Pages */}
        <Route path="/staff/dashboard" element={<StaffDashboard />} />
        <Route path="/staff/my_jobs" element={<StaffMyJobs />} />
        <Route path="/staff/calendar" element={<StaffCalendar />} />
        <Route path="/staff/reports" element={<StaffReports />} />
        <Route path="/staff/profile" element={<StaffProfile />} />

        {/* Admin Pages */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/manage_accounts" element={<AdminManageAccounts />} />
        <Route path="/admin/calendar" element={<AdminCalendar />} />
        <Route path="/admin/services" element={<AdminServices />} />
        <Route path="/admin/services/manage" element={<AdminServiceManage />} />
        <Route path="/admin/services/requests" element={<AdminServiceRequests />} />
        <Route path="/admin/services/requests/new" element={<AdminWalkInBooking />} />
        <Route path="/admin/services/reports" element={<AdminServiceReports />} />
        <Route path="/admin/payments" element={<AdminPayments />} />
        <Route path="/admin/back-jobs" element={<AdminBackJobs />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />

      </Routes>
    </BrowserRouter>
  );
}

export default App;