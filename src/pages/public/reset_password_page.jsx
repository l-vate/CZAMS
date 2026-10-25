import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import AuthShell from '../../components/auth_shell';
import { ApiError } from '../../services/apiClient';
import { resetPassword } from '../../services/authService';
import { passwordChecks, passwordIsAcceptable } from '../../utils/passwordChecks';

// The token is in the part of the link after #, which is never sent to a server. It is read once and then removed from the address bar.
function readTokenFromLink() {
  const token = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('token') || '';
  if (token) window.history.replaceState(null, '', window.location.pathname);
  return token;
}

function ResetPasswordPage() {
  const [token] = useState(readTokenFromLink);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Passwords do not match.');
    if (!passwordIsAcceptable(password)) return setError('Use a password of at least 8 characters with at least 1 number and 1 special character.');
    setLoading(true);
    try {
      await resetPassword({ token, password });
      navigate('/login', { state: { passwordReset: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Something went wrong. Please try again.' : 'Could not connect to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <AuthShell title="Reset link needed" subtitle="Open the link from your email, or ask for a new one.">
        <p className="auth-switch"><Link to="/forgot-password">Send me a new link</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Pick a password you have not used here before.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="password">New password</label>
          <div className="password-wrapper">
            <input type={showPassword ? 'text' : 'password'} id="password" name="password" placeholder="Create a password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="toggle-password" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
          <ul className="password-rules" aria-live="polite">
            {passwordChecks(password).map((check) => (
              <li key={check.id} className={check.met ? 'password-rule password-rule--met' : 'password-rule'}>
                {check.met ? '✓' : '•'} {check.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm password</label>
          <input type={showPassword ? 'text' : 'password'} id="confirmPassword" name="confirmPassword" placeholder="Re-enter your password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </div>
        {error && (
          <p className="auth-error">
            {error} {/invalid or has expired/.test(error) && <Link to="/forgot-password">Ask for a new link</Link>}
          </p>
        )}
        <button type="submit" className="auth-submit-btn" disabled={loading}>{loading ? 'Saving...' : 'Change password'}</button>
      </form>
    </AuthShell>
  );
}

export default ResetPasswordPage;
