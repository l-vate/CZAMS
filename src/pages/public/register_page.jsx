import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import '../../css/public.css'
import { ApiError } from '../../services/apiClient';
import { COMPANY_NAME_MAX, REPRESENTATIVE_NAME_MAX } from '../../constants/profileFields';
import { register } from '../../services/authService';
import AuthShell from '../../components/auth_shell';
import { passwordChecks, passwordIsAcceptable } from '../../utils/passwordChecks';

function RegisterPage() {
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    clientType: 'Residential',
    companyName: '',
    representativeName: '',
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
  if (!passwordIsAcceptable(formData.password)) {
    alert('Use a password of at least 8 characters with at least 1 number and 1 special character.');
    return;
  }

  try {
    await register(formData);

    // The new customer is not signed in by registering: they sign in with the account they just made.
    navigate('/login', { state: { registered: true } });

  } catch (err) {
    alert(err instanceof ApiError ? err.message || 'Registration failed' : 'Could not connect to server. Is the backend running?');
  }
};

  return (
    <AuthShell title="Create your account" subtitle="Fill in your details to get started." backTo="/" backLabel="Back to site" wide>
          {/* ── Registration Form ── */}
          <form className="auth-form auth-form--two" onSubmit={handleSubmit}>

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
                placeholder="e.g. 0917 123 4567"
                value={formData.phone}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="clientType">Client type</label>
              <select
                id="clientType"
                name="clientType"
                value={formData.clientType}
                onChange={handleChange}
                className="form-select"
              >
                <option value="Residential">Residential</option>
                <option value="Commercial">Commercial</option>
              </select>
            </div>

            {formData.clientType === 'Commercial' && (
              <>
                <div className="form-group">
                  <label htmlFor="companyName">Company name</label>
                  <input
                    type="text"
                    id="companyName"
                    name="companyName"
                    maxLength={COMPANY_NAME_MAX}
                    value={formData.companyName}
                    onChange={handleChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="representativeName">Representative name</label>
                  <input
                    type="text"
                    id="representativeName"
                    name="representativeName"
                    maxLength={REPRESENTATIVE_NAME_MAX}
                    value={formData.representativeName}
                    onChange={handleChange}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  placeholder="Create a password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  minLength={8}
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

            <ul className="password-rules" aria-live="polite">
              {passwordChecks(formData.password).map((check) => (
                <li key={check.id} className={check.met ? 'password-rule password-rule--met' : 'password-rule'}>
                  {check.met ? '✓' : '•'} {check.label}
                </li>
              ))}
            </ul>

            <button type="submit" className="auth-submit-btn">
              Create Account
            </button>

          </form>

          <p className="auth-switch">
            Already have an account?{' '}
            <Link to="/login">Sign in here</Link>
          </p>
    </AuthShell>
  );
}

export default RegisterPage;