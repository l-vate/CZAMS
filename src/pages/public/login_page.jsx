import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  FiThermometer,
  FiCalendar,
  FiTool,
  FiEye,
  FiEyeOff,
  FiArrowLeft,
} from 'react-icons/fi';
import '../../css/public.css'
import { ApiError } from '../../services/apiClient';
import { login } from '../../services/authService';
import { ROLE } from '../../constants/roles';
import { takeSessionNotice } from '../../utils/session';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../../config/company';

/* ── Static Content ─────────────────────────────────────── */
const FEATURES = [
  { icon: <FiThermometer />, text: 'Cleaning, repair & installation' },
  { icon: <FiCalendar />, text: 'Easy online scheduling' },
  { icon: <FiTool />, text: 'Trusted technicians since 2009' },
];

function LoginPage() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  // a forced sign-out (expired session, deactivated account) leaves a short message to show here
  const [error, setError] = useState(() => takeSessionNotice());
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const locationState = useLocation().state;
  const justRegistered = locationState?.registered === true;
  const passwordWasReset = locationState?.passwordReset === true;

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const data = await login(formData);

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      if (data.user.role === ROLE.ADMIN) navigate('/admin/dashboard');
      else if (data.user.role === ROLE.STAFF) navigate('/staff/dashboard');
      else navigate('/customer/dashboard');

    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Login failed' : 'Could not connect to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-split-page">

      {/* ── Left Panel ── */}
      <div className="auth-split-left">
        <Link to="/" className="auth-split-back"><FiArrowLeft aria-hidden="true" /> Back to site</Link>

        <div className="auth-split-brand">
          <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="auth-split-logo" />
          <span className="auth-split-brand-name">{BRAND_SHORT.toUpperCase()}</span>
          <span className="auth-split-brand-sub">{BRAND_SUB}</span>
        </div>

        <div className="auth-split-tagline">
          <h1>Cool comfort,<br />at your service.</h1>
          <p>Book, manage, and track your aircon maintenance - all in one place.</p>
        </div>

        <div className="auth-split-features">
          {FEATURES.map((feature) => (
            <div className="auth-feature-item" key={feature.text}>
              <span>{feature.icon}</span> {feature.text}
            </div>
          ))}
        </div>

        <p className="auth-split-copy">© 2009 {BRAND_SHORT}. All Rights Reserved.</p>
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
                <Link to="/forgot-password" className="forgot-link">Forgot password?</Link>
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

            {justRegistered && !error && <p className="auth-success" role="status">Your account was created. Please sign in to continue.</p>}
            {passwordWasReset && !justRegistered && !error && <p className="auth-success" role="status">Your password was changed. Please sign in with your new password.</p>}
            {error && <p className="auth-error public-login-page-x1">{error}</p>}

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