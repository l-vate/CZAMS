import { FiPhone, FiMail } from 'react-icons/fi';
import {
  BRAND_NAME, BRAND_SHORT, COMPANY_PHONE, COMPANY_PHONE_TEL, EMAIL, ADDRESS, MAP_EMBED_URL, HOURS_TEXT, AREA_SERVED, SINCE_YEAR, FOOTER_LINKS,
} from '../../config/landingContent';

function LandingFooter({ onLogin }) {
  return (
    <footer className="footer lp-footer">
      <div className="footer-grid lp-footer-grid">
        <div>
          <div className="footer-brand-row">
            <img src="/images/logo.png" alt="" width="32" height="32" className="footer-logo" />
            <span className="footer-brand-name">{BRAND_SHORT.toUpperCase()}</span>
          </div>
          <p className="footer-brand-desc">Serving {AREA_SERVED} since {SINCE_YEAR}.</p>
          <nav aria-label="Footer" className="lp-footer-links">
            {FOOTER_LINKS.map((link) => <a key={link.id} href={`#${link.id}`}>{link.label}</a>)}
            <button type="button" onClick={onLogin}>Log In</button>
          </nav>
        </div>

        <div>
          <h3>Opening Hours</h3>
          <p>{HOURS_TEXT}</p>
          <p>Sunday: Closed</p>
        </div>

        <div>
          <h3>Contact Us</h3>
          <p><FiPhone aria-hidden="true" /> <a href={COMPANY_PHONE_TEL}>{COMPANY_PHONE}</a></p>
          <p><FiMail aria-hidden="true" /> <a href={`mailto:${EMAIL}`}>{EMAIL}</a></p>
        </div>

        <div>
          <h3>Location</h3>
          <p>{ADDRESS}</p>
          <iframe src={MAP_EMBED_URL} className="map" loading="lazy" title={`Map of ${BRAND_SHORT} at ${ADDRESS}`} referrerPolicy="no-referrer-when-downgrade" />
        </div>
      </div>

      <p className="copy">&copy; {SINCE_YEAR} {BRAND_NAME}. All Rights Reserved.</p>
    </footer>
  );
}

export default LandingFooter;
