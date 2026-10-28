import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../../css/public.css'
import { ApiError } from '../../services/apiClient';
import { login } from '../../services/authService';
import { ROLE } from '../../constants/roles';
import { takeSessionNotice } from '../../utils/session';
import AuthShell from '../../components/auth_shell';

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
    <AuthShell title="Welcome back" subtitle="Sign in to your account to continue." backTo="/" backLabel="Back to site">
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
    </AuthShell>
  );
}

export default LoginPage;