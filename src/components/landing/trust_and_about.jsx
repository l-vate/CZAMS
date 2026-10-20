import { TRUST_ITEMS, ABOUT, BRAND_NAME } from '../../config/landingContent';
import LandingIcon from './icons';
import PhotoSlot from './photo_slot';
import SectionHeading from './section_heading';

// Four facts directly under the hero.
export function TrustStrip() {
  return (
    <section className="lp-trust" aria-label="At a glance" data-nav="home">
      <ul className="lp-trust-list">
        {TRUST_ITEMS.map((item, i) => (
          <li className="lp-trust-item" key={item.title} data-reveal style={{ '--reveal-i': i }}>
            <span className="lp-trust-icon"><LandingIcon name={item.icon} /></span>
            <span>
              <strong>{item.title}</strong>
              <small>{item.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Shown while there is no real team photo: just the company logo, large, with no panel or caption around it.
function LogoPanel() {
  return (
    <div className="lp-about-logo">
      <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} width="484" height="251" decoding="async" />
    </div>
  );
}

export function AboutSection() {
  return (
    <section id="about" data-nav="about" className="lp-section lp-about" aria-labelledby="about-title">
      <div className="lp-about-grid">
        <div className="lp-about-copy">
          <SectionHeading eyebrow={ABOUT.eyebrow} title={ABOUT.title} id="about-title" align="left" />
          {ABOUT.paragraphs.map((text) => <p key={text} data-reveal>{text}</p>)}
        </div>
        <div className="lp-about-visual" data-reveal>
          <PhotoSlot photo={ABOUT.photo} className="lp-about-photo" fallback={<LogoPanel />} />
        </div>
      </div>
    </section>
  );
}
