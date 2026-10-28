import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError } from '../../services/apiClient';
import { COMPANY_NAME_MAX, REPRESENTATIVE_NAME_MAX } from '../../constants/profileFields';
import { register } from '../../services/authService';
import AuthShell from '../../components/auth_shell';
import { TextField, SelectField, PasswordField, PasswordRules, FormAlert, SubmitButton } from '../../components/auth_fields';
import { passwordIsAcceptable } from '../../utils/passwordChecks';

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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (!passwordIsAcceptable(formData.password)) {
      setError('Use a password of at least 8 characters with at least 1 number and 1 special character.');
      return;
    }

    setLoading(true);
    try {
      await register(formData);

      // The new customer is not signed in by registering: they sign in with the account they just made.
      navigate('/login', { state: { registered: true } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message || 'Registration failed' : 'Could not connect to server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Fill in your details to get started." backTo={null} wide>
      <form className="ap-form ap-form--two" onSubmit={handleSubmit}>
        <TextField
          id="firstName"
          name="firstName"
          label="First Name"
          placeholder="Juan"
          autoComplete="given-name"
          value={formData.firstName}
          onChange={handleChange}
          required
        />
        <TextField
          id="lastName"
          name="lastName"
          label="Last Name"
          placeholder="Dela Cruz"
          autoComplete="family-name"
          value={formData.lastName}
          onChange={handleChange}
          required
        />

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
        <TextField
          id="phone"
          name="phone"
          type="tel"
          label="Phone number"
          placeholder="e.g. 0917 123 4567"
          autoComplete="tel"
          inputMode="tel"
          value={formData.phone}
          onChange={handleChange}
          required
        />

        <SelectField
          id="clientType"
          name="clientType"
          label="Client type"
          className="ap-span-2"
          autoComplete="off"
          value={formData.clientType}
          onChange={handleChange}
        >
          <option value="Residential">Residential</option>
          <option value="Commercial">Commercial</option>
        </SelectField>

        {/* always on the page, hidden for a Residential client, so choosing a client type never changes the size of the card */}
        <div className={`ap-reserve ap-span-2${formData.clientType === 'Commercial' ? '' : ' ap-reserve--off'}`} aria-hidden={formData.clientType !== 'Commercial'}>
          <TextField
            id="companyName"
            name="companyName"
            label="Company name"
            autoComplete="organization"
            maxLength={COMPANY_NAME_MAX}
            value={formData.companyName}
            onChange={handleChange}
            disabled={formData.clientType !== 'Commercial'}
          />
          <TextField
            id="representativeName"
            name="representativeName"
            label="Representative name"
            autoComplete="name"
            maxLength={REPRESENTATIVE_NAME_MAX}
            value={formData.representativeName}
            onChange={handleChange}
            disabled={formData.clientType !== 'Commercial'}
          />
        </div>

        <PasswordField
          id="password"
          name="password"
          label="Password"
          placeholder="Create a password"
          autoComplete="new-password"
          minLength={8}
          value={formData.password}
          onChange={handleChange}
          required
        />
        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          placeholder="Re-enter password"
          autoComplete="new-password"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
        />

        <PasswordRules password={formData.password} className="ap-span-2" />
        <FormAlert className="ap-span-2">{error}</FormAlert>
        <SubmitButton loading={loading} loadingText="Creating account..." className="ap-span-2">Create Account</SubmitButton>
      </form>

      <p className="ap-switch">
        Already have an account? <Link to="/login" className="ap-link">Sign in here</Link>
      </p>
    </AuthShell>
  );
}

export default RegisterPage;
