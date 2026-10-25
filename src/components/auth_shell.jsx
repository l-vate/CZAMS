import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../css/public.css';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../config/company';

// The split sign-in layout (brand panel on the left, the form on the right) for the pages around signing in: forgot and reset password.
function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth-split-page">
      <div className="auth-split-left">
        <Link to="/login" className="auth-split-back"><FiArrowLeft aria-hidden="true" /> Back to sign in</Link>
        <div className="auth-split-brand">
          <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="auth-split-logo" />
          <span className="auth-split-brand-name">{BRAND_SHORT.toUpperCase()}</span>
          <span className="auth-split-brand-sub">{BRAND_SUB}</span>
        </div>
        <p className="auth-split-copy">© 2009 {BRAND_SHORT}. All Rights Reserved.</p>
      </div>
      <div className="auth-split-right">
        <div className="auth-split-form-box">
          <div className="auth-split-header">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export default AuthShell;
