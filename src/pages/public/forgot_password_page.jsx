import { useState } from 'react';
import { Link } from 'react-router-dom';
import AuthShell from '../../components/auth_shell';
import { TextField, FormAlert, FormNotice, SubmitButton } from '../../components/auth_fields';
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
    <AuthShell
      centered
      title={done ? 'Check your email' : 'Forgot your password?'}
      subtitle={done ? 'Open the link in the email to choose a new password.' : 'Enter your email address and we will send you a link to choose a new one.'}
    >
      {done ? (
        <>
          <FormNotice className="ap-notice-spaced">{done}</FormNotice>
          <p className="ap-switch">The link expires in 30 minutes.</p>
          <p className="ap-switch"><Link to="/login" className="ap-link">Back to sign in</Link></p>
        </>
      ) : (
        <form className="ap-form" onSubmit={handleSubmit}>
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email address"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FormAlert>{error}</FormAlert>
          <SubmitButton loading={loading} loadingText="Sending...">Send reset link</SubmitButton>
          <p className="ap-switch"><Link to="/login" className="ap-link">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

export default ForgotPasswordPage;
