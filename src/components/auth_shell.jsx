import { Link } from 'react-router-dom';
import { FiArrowLeft } from 'react-icons/fi';
import '../css/public.css';
import Snowfall from './landing/snowfall';
import { BRAND_NAME, BRAND_SHORT, BRAND_SUB } from '../config/company';

// The layout shared by the pages around signing in (sign in, create account, forgot and reset password): one centered card on the same
// navy backdrop as the landing page, with the brand above it and a link back below the brand.
function AuthShell({ title, subtitle, children, backTo = '/login', backLabel = 'Back to sign in', wide = false, centered = false }) {
  return (
    <div className="auth-split-page">
      <div className="auth-backdrop" aria-hidden="true"><Snowfall /></div>
      <div className="auth-split-right">
        <Link to={backTo} className="auth-split-back"><FiArrowLeft aria-hidden="true" /> {backLabel}</Link>
        <div className="auth-split-brand">
          <span className="auth-split-logo-wrap"><img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="auth-split-logo" /></span>
          <span className="auth-split-brand-text">
            <span className="auth-split-brand-name">{BRAND_SHORT.toUpperCase()}</span>
            <span className="auth-split-brand-sub">{BRAND_SUB}</span>
          </span>
        </div>
        <div className={`auth-split-form-box${wide ? ' auth-split-form-box--wide' : ''}${centered ? ' auth-split-form-box--center' : ''}`}>
          <div className="auth-split-header">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          {children}
        </div>
        <p className="auth-split-copy">&copy; 2009 {BRAND_SHORT}. All Rights Reserved.</p>
      </div>
    </div>
  );
}

export default AuthShell;
