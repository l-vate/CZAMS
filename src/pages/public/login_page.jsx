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
    <div className="auth-page">

      {/* Back link */}
      <Link to="/" className="auth-back-link">← Back</Link>

      <div className="auth-card">

        {/* Logo + Brand */}
        <div className="auth-brand">
          <img src="/images/logo.png" alt="CZAMS Logo" className="auth-logo" />
          <span className="auth-brand-name">CZAMS</span>
          <span className="auth-brand-sub">Cooling Zone Aircon Maintenance Services</span>
        </div>

        {/* Header */}
        <div className="auth-card-header">
          <h2>Welcome Back</h2>
          <p>Log in to your account to continue.</p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>

          <div className="form-group">
            <label htmlFor="email">Email</label>
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

          <button type="submit" className="auth-submit-btn" onClick={() => navigate('/customer/dashboard')}>Log In</button>

        </form>

        <p className="auth-switch">
          Don't have an account?{' '}
          <Link to="/register">Sign up here</Link>
        </p>

        <div className="auth-divider"><span>or continue as</span></div>

        <div className="auth-role-btns">
          <button className="role-btn">👤 Client</button>
          <button className="role-btn">🔧 Technician</button>
          <button className="role-btn">🛡️ Admin</button>
        </div>

      </div>
    </div>
  );
}

export default LoginPage;