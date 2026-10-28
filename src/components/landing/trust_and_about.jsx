import { TRUST_ITEMS, ABOUT, BRAND_NAME } from '../../config/landingContent';
import GlassIcons from './glass_icons';
import LandingIcon from './icons';
import PhotoSlot from './photo_slot';
import SectionHeading from './section_heading';

// The quick facts about the company, shown under the About Us text, each with a glass icon.
function AboutFacts() {
  return (
    <ul className="lp-about-facts">
      {TRUST_ITEMS.map((item, i) => (
        <li className="lp-fact" key={item.title} data-reveal style={{ '--reveal-i': i }}>
          <span className="lp-fact-icon">
            <GlassIcons
              items={[{ icon: <LandingIcon name={item.icon} />, label: item.title }]}
              plate="none"
              size={56}
              gap={0}
              columns={1}
              labels="none"
              intro={false}
              theme="dark"
            />
          </span>
          <span>
            <strong>{item.title}</strong>
            <small>{item.text}</small>
          </span>
        </li>
      ))}
    </ul>
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
          <SectionHeading title={ABOUT.title} id="about-title" align="left" />
          {ABOUT.paragraphs.map((text) => <p key={text} data-reveal>{text}</p>)}
          <AboutFacts />
        </div>
        <div className="lp-about-visual" data-reveal>
          <PhotoSlot photo={ABOUT.photo} className="lp-about-photo" fallback={<LogoPanel />} />
        </div>
      </div>
    </section>
  );
}
