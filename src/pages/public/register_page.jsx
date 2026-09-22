import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiClipboard, FiMapPin, FiCreditCard, FiEye, FiEyeOff } from 'react-icons/fi';
import '../../css/public.css'

/* ── Static Content ─────────────────────────────────────── */
const FEATURES = [
  { icon: <FiClipboard />, text: 'Book services in minutes' },
  { icon: <FiMapPin />, text: 'Real-time service tracking' },
  { icon: <FiCreditCard />, text: 'Flexible payment options' },
];

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

const handleSubmit = async (e) => {
  e.preventDefault();
  if (formData.password !== formData.confirmPassword) {
    alert('Passwords do not match.');
    return;
  }

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.message || 'Registration failed');
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));

    if (data.user.role === 'staff') navigate('/staff/dashboard');
    else navigate('/customer/dashboard');

  } catch (err) {
    alert('Could not connect to server. Is the backend running?');
  }
};

  return (
    <div className="auth-split-page">

      {/* ── Left Panel ── */}
      <div className="auth-split-left auth-split-left--register">
        <Link to="/" className="auth-split-back">← Back to site</Link>

        <div className="auth-split-brand">
          <img src="/images/logo.png" alt="CZAMS Logo" className="auth-split-logo" />
          <span className="auth-split-brand-name">COOLING ZONE</span>
          <span className="auth-split-brand-sub">Aircon Maintenance Services</span>
        </div>

        <div className="auth-split-tagline">
          <h1>Join us today.</h1>
          <p>Create an account to book services, track your requests, and stay cool all year round.</p>
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
            <h2>Create your account</h2>
            <p>Fill in your details to get started.</p>
          </div>

          {/* ── Registration Form ── */}
          <form className="auth-form" onSubmit={handleSubmit}>

            {/* First + Last name */}
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="firstName">First Name</label>
                <input
                  type="text"
                  id="firstName"
                  name="firstName"
                  placeholder="Juan"
                  value={formData.firstName}
                  onChange={handleChange}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="lastName">Last Name</label>
                <input
                  type="text"
                  id="lastName"
                  name="lastName"
                  placeholder="Dela Cruz"
                  value={formData.lastName}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

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
              <label htmlFor="phone">Phone number</label>
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
                  {showPassword ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm password</label>
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
                  {showConfirm ? <FiEyeOff /> : <FiEye />}
                </button>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn">
              Create Account
            </button>

          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/register">Sign in here</Link>
          </p>

        </div>
      </div>
    </div>
  );
}

export default RegisterPage;