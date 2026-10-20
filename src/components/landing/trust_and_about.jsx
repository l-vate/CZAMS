import { TRUST_ITEMS, ABOUT } from '../../config/landingContent';
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

// A small branded picture shown while there is no real team photo.
function TeamIllustration() {
  return (
    <svg className="lp-about-art" viewBox="0 0 400 300" width="400" height="300" role="img" aria-label="Aircon service illustration">
      <rect width="400" height="300" rx="20" fill="#ddeef0" />
      <rect x="60" y="56" width="280" height="84" rx="18" fill="#ffffff" />
      <rect x="82" y="112" width="236" height="10" rx="5" fill="#b7d2dc" />
      <circle cx="292" cy="90" r="5" fill="#ff6b4a" />
      <circle cx="310" cy="90" r="5" fill="#0e8c8c" />
      <g fill="none" stroke="#0e8c8c" strokeWidth="3" strokeLinecap="round" opacity="0.7">
        <path d="M110 150 C 100 190, 130 210, 108 250" />
        <path d="M180 150 C 172 190, 204 214, 184 258" />
        <path d="M250 150 C 258 192, 226 212, 252 254" />
        <path d="M312 150 C 326 188, 294 210, 316 248" />
      </g>
    </svg>
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
          <PhotoSlot photo={ABOUT.photo} className="lp-about-photo" fallback={<TeamIllustration />} />
        </div>
      </div>
    </section>
  );
}
