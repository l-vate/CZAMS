import { Link } from 'react-router-dom';
import { FiMapPin, FiHome, FiClock } from 'react-icons/fi';
import { HiOutlineArrowLongLeft } from 'react-icons/hi2';
import '../css/auth.css';
import Snowfall from './landing/snowfall';
import { BRAND_NAME } from '../config/company';
import { AREA_SERVED, SINCE_YEAR, HOURS_TEXT } from '../config/landingContent';

// The layout shared by the four pages around signing in (sign in, create account, forgot and reset password): the company on the left (logo,
// name, one line and three facts, all from the landing page config) and the form card on the right, on the same navy backdrop and snow as the
// landing page. Below a desktop width the brand sits above the card and only the logo and name stay.
const TAGLINE = 'Book, manage and track your aircon service in one place.';
const FACTS = [
  { icon: <FiMapPin />, text: `Serving ${AREA_SERVED} since ${SINCE_YEAR}` },
  { icon: <FiHome />, text: 'Aircon cleaning, repair and installation for homes and businesses' },
  { icon: <FiClock />, text: `Open ${HOURS_TEXT}` },
];

function AuthShell({ title, subtitle, children, backTo = '/login', backLabel = 'Back', wide = false, centered = false }) {
  return (
    <div className="ap-page">
      <div className="ap-backdrop" aria-hidden="true"><Snowfall /></div>

      {backTo && (
        <header className="ap-top">
          <Link to={backTo} className="ap-back" aria-label={backLabel} title={backLabel}><HiOutlineArrowLongLeft aria-hidden="true" /></Link>
        </header>
      )}

      <main className={`ap-main${wide ? ' ap-main--wide' : ''}`}>
        <section className="ap-brand" aria-label={BRAND_NAME}>
          <img className="ap-logo" src="/images/logo.png" width="484" height="251" alt={`${BRAND_NAME} logo`} />
          <p className="ap-brand-name">{BRAND_NAME}</p>
          <p className="ap-tagline">{TAGLINE}</p>
          <ul className="ap-facts">
            {FACTS.map((fact) => (
              <li className="ap-fact" key={fact.text}>
                <span className="ap-fact-icon" aria-hidden="true">{fact.icon}</span>
                <span>{fact.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={`ap-card${wide ? ' ap-card--wide' : ''}${centered ? ' ap-card--center' : ''}`}>
          <div className="ap-header">
            <h1 className="ap-title">{title}</h1>
            <p className="ap-subtitle">{subtitle}</p>
          </div>
          {children}
        </section>
      </main>
    </div>
  );
}

export default AuthShell;
