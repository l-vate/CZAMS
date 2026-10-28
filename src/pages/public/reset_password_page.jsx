import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AuthShell from '../../components/auth_shell';
import { ApiError } from '../../services/apiClient';
import { resetPassword } from '../../services/authService';
import { passwordIsAcceptable } from '../../utils/passwordChecks';
import { PasswordField, PasswordRules, FormAlert, SubmitButton } from '../../components/auth_fields';

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
      <AuthShell centered title="Reset link needed" subtitle="Open the link from your email, or ask for a new one.">
        <p className="ap-switch"><Link to="/forgot-password" className="ap-link">Send me a new link</Link></p>
      </AuthShell>
    );
  }

  return (
    <AuthShell centered title="Choose a new password" subtitle="Pick a password you have not used here before.">
      <form className="ap-form" onSubmit={handleSubmit}>
        <PasswordField
          id="password"
          name="password"
          label="New password"
          placeholder="Create a password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordRules password={password} />
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          placeholder="Re-enter your password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        <FormAlert>
          {error && (
            <>
              {error} {/invalid or has expired/.test(error) && <Link to="/forgot-password">Ask for a new link</Link>}
            </>
          )}
        </FormAlert>
        <SubmitButton loading={loading} loadingText="Saving...">Change password</SubmitButton>
      </form>
    </AuthShell>
  );
}

export default ResetPasswordPage;
