import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: 'client',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match.');
      return;
    }
    // TODO: connect to Express backend
    console.log('Register submitted:', formData);
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
          <h2>Create your account</h2>
          <p>Fill in your details to get started with CZAMS.</p>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={handleSubmit}>

          {/* First + Last name side by side */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="firstName">Full Name</label>
              <input
                type="text"
                id="firstName"
                name="firstName"
                placeholder="First"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="lastName">&nbsp;</label>
              <input
                type="text"
                id="lastName"
                name="lastName"
                placeholder="Last"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

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
            <label htmlFor="phone">Phone</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              placeholder="+63 900 000 0000"
              value={formData.phone}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="role">Register as</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="form-select"
            >
              <option value="client">Client</option>
              <option value="technician">Technician</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                placeholder="Min. 8 characters"
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

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="password-wrapper">
              <input
                type={showConfirm ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowConfirm(!showConfirm)}
              >
                {showConfirm ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button type="submit" className="auth-submit-btn">Create Account</button>

        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <Link to="/login">Sign in here</Link>
        </p>

      </div>
    </div>
  );
}

export default RegisterPage;