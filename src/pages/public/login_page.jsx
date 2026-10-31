import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '../../services/apiClient';
import { login } from '../../services/authService';
import { ROLE } from '../../constants/roles';
import { takeSessionNotice } from '../../utils/session';
import AuthShell from '../../components/auth_shell';
import { TextField, PasswordField, FormAlert, FormNotice, SubmitButton } from '../../components/auth_fields';

function LoginPage() {
  const [formData, setFormData] = useState({ email: '', password: '' });
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
    <AuthShell title="Welcome back" subtitle="Sign in to your account to continue." backTo="/">
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
          value={formData.email}
          onChange={handleChange}
          required
        />

        <PasswordField
          id="password"
          name="password"
          label="Password"
          labelAside={<Link to="/forgot-password" className="ap-link ap-link--tap">Forgot password?</Link>}
          placeholder="Your password"
          autoComplete="current-password"
          value={formData.password}
          onChange={handleChange}
          required
        />

        {justRegistered && !error && <FormNotice>Your account was created. Please sign in to continue.</FormNotice>}
        {passwordWasReset && !justRegistered && !error && <FormNotice>Your password was changed. Please sign in with your new password.</FormNotice>}
        <FormAlert>{error}</FormAlert>

        <SubmitButton loading={loading} loadingText="Signing in...">Sign In</SubmitButton>
      </form>

      <p className="ap-switch">
        Don't have an account? <Link to="/register" className="ap-link">Create one here</Link>
      </p>
    </AuthShell>
  );
}

export default LoginPage;
