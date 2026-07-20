import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  FiThermometer,
  FiCalendar,
  FiTool,
  FiEye,
  FiEyeOff,
  FiUser,
  FiShield,
} from 'react-icons/fi';


/* ── Static Content ─────────────────────────────────────── */
const FEATURES = [
  { icon: <FiThermometer />, text: 'Cleaning, repair & installation' },
  { icon: <FiCalendar />, text: 'Easy online scheduling' },
  { icon: <FiTool />, text: 'Trusted technicians since 2009' },
];

const ROLE_BUTTONS = [
  { icon: <FiUser />, label: 'Client', path: '/customer/dashboard' },
  { icon: <FiTool />, label: 'Technician', path: '/staff/dashboard' },
  { icon: <FiShield />, label: 'Admin', path: '/admin/dashboard' },
];

function LoginPage() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('http://localhost:5000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'Login failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.role === 'admin') navigate('/admin/dashboard');
      else if (data.user.role === 'staff') navigate('/staff/dashboard');
      else navigate('/customer/dashboard');

    } catch (err) {
      setError('Could not connect to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-page">

      {/* ── Left Panel ── */}
      <div className="auth-split-left">
        <Link to="/" className="auth-split-back">← Back to site</Link>

        <div className="auth-split-brand">
          <img src="/images/logo.png" alt="CZAMS Logo" className="auth-split-logo" />
          <span className="auth-split-brand-name">COOLING ZONE</span>
          <span className="auth-split-brand-sub">Aircon Maintenance Services</span>
        </div>

        <div className="auth-split-tagline">
          <h1>Cool comfort,<br />at your service.</h1>
          <p>Book, manage, and track your aircon maintenance — all in one place.</p>
        </div>

        <div className="auth-split-features">
          {FEATURES.map((feature) => (
            <div className="auth-feature-item" key={feature.text}>
              <span>{feature.icon}</span> {feature.text}
            </div>
          ))}
        </div>

        <p className="auth-split-copy">© 2009 Cooling Zone. All Rights Reserved.</p>
      </div>

      {/* ── Right Panel ── */}
      <div className="auth-split-right">
        <div className="auth-split-form-box">

          <div className="auth-split-header">
            <h2>Welcome back</h2>
            <p>Sign in to your account to continue.</p>
          </div>

          {/* ── Login Form ── */}
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="email">Email address</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="password">Password</label>
                <a href="#" className="forgot-link">Forgot password?</a>
              </div>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={handleChange}
                  required
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            {error && <p className="auth-error" style={{ color: 'red', fontSize: '0.9rem' }}>{error}</p>}

            <button
              type="submit"
              className="auth-submit-btn"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/register">Create one here</Link>
          </p>

        </div>
      </div>
    </div>
  );
}

export default LoginPage;