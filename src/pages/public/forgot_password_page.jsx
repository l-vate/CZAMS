import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/auth_shell';
import { ApiError } from '../../services/apiClient';
import { requestPasswordReset } from '../../services/authService';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // The server's answer is the same for every email; it is shown as it comes.
  const [done, setDone] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await requestPasswordReset(email);
      setDone(data.message || 'If that email has an account, we sent a link.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Something went wrong. Please try again.' : 'Could not connect to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email address and we will send you a link to choose a new one.">
      {done ? (
        <>
          <p className="auth-success" role="status">{done}</p>
          <p className="auth-switch">The link expires in 30 minutes. <Link to="/login">Back to sign in</Link></p>
        </>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input type="email" id="email" name="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit" className="auth-submit-btn" disabled={loading}>{loading ? 'Sending...' : 'Send reset link'}</button>
          <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

export default ForgotPasswordPage;
