import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LandingPage from './pages/landing_page';
import LoginPage from './pages/login_page';
import RegisterPage from './pages/register_page';
import ClientDashboard from './pages/client_dashboard';
import BookService from './pages/book_service';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/dashboard" element={<ClientDashboard />} />
        <Route path="/book_service" element={<BookService />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;