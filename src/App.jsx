import { BrowserRouter, Routes, Route } from 'react-router-dom';

import LandingPage from './pages/public/landing_page';
import LoginPage from './pages/public/login_page';
import RegisterPage from './pages/public/register_page';

import Dashboard from './pages/customer/dashboard';
import Book from './pages/customer/book_service';

function App() {
  return (
    <BrowserRouter>
      <Routes>

        {/* Public Pages */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Customer Pages */}
        <Route
          path="/customer/dashboard"
          element={<Dashboard />}
        />

        <Route
          path="/customer/book_service"
          element={<Book />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;
