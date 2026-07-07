import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function LoginPage() {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // TODO: connect to Express backend
    console.log('Login submitted:', formData);
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
          <div className="auth-feature-item"><span>❄️</span> Cleaning, repair & installation</div>
          <div className="auth-feature-item"><span>📅</span> Easy online scheduling</div>
          <div className="auth-feature-item"><span>🔧</span> Trusted technicians since 2009</div>
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
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="auth-submit-btn"
              onClick={() => navigate('/customer/dashboard')}
            >
              Sign In
            </button>

          </form>

          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/register">Create one here</Link>
          </p>

          <div className="auth-divider"><span>or sign in as</span></div>

          <div className="auth-role-btns">
            <button
              className="role-btn"
              type="button"
              onClick={() => navigate('/customer/dashboard')}
            >
              👤 Client
            </button>
            <button
              className="role-btn"
              type="button"
              onClick={() => navigate('/staff/dashboard')}
            >
              🔧 Technician
            </button>
            <button
              className="role-btn"
              type="button"
              onClick={() => navigate('/admin/dashboard')}
            >
              🛡️ Admin
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}

export default LoginPage;