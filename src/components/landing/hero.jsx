import { useState } from 'react';
import { HERO, HERO_IMAGE, HERO_IMAGE_ALT } from '../../config/landingContent';
import HeroIllustration from './hero_illustration';

const CATEGORY_LABEL = {
  Holiday: 'Holiday',
  Closure: 'Closure',
  Maintenance: 'Maintenance',
  General: 'Announcement',
};

// The top of the page: the headline, two buttons and the picture. Announcements an admin published (real data) show as one small
// card under the buttons, one at a time, so the headline (the page's only h1) is always there.
function Hero({ announcements, onBook }) {
  const [current, setCurrent] = useState(0);
  const total = announcements.length;
  const announcement = total > 0 ? announcements[current % total] : null;

  return (
    <section id="home" data-nav="home" className="lp-hero">
      <span className="lp-hero-shape lp-hero-shape--one" aria-hidden="true" />
      <span className="lp-hero-shape lp-hero-shape--two" aria-hidden="true" />
      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <span className="lp-pill">{HERO.eyebrow}</span>
          <h1>{HERO.headline[0]}<br />{HERO.headline[1]}</h1>
          <p className="lp-hero-sub">{HERO.subline}</p>
          <div className="lp-hero-actions">
            <button type="button" className="lp-btn lp-btn--primary" onClick={onBook}>{HERO.primaryCta}</button>
            <a className="lp-btn lp-btn--outline" href="#availability">{HERO.secondaryCta}</a>
          </div>

          {announcement && (
            <div className="lp-announce" aria-live="polite">
              <span className="lp-announce-kind">
                {CATEGORY_LABEL[announcement.category] || announcement.category}
                {announcement.displayDate ? ` · ${announcement.displayDate}` : ''}
              </span>
              <strong>{announcement.title}</strong>
              <p>{announcement.message}</p>
              {total > 1 && (
                <button type="button" className="lp-announce-next" onClick={() => setCurrent((c) => (c + 1) % total)}>
                  Next announcement ({(current % total) + 1} of {total})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="lp-hero-visual">
          {HERO_IMAGE ? (
            <img className="lp-hero-photo" src={HERO_IMAGE} alt={HERO_IMAGE_ALT} width="640" height="480" decoding="async" />
          ) : (
            <HeroIllustration />
          )}
        </div>
      </div>
    </section>
  );
}

export default Hero;
