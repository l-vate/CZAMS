import { HERO, HERO_IMAGE, HERO_IMAGE_ALT } from '../../config/landingContent';
import HeroIllustration from './hero_illustration';
import AnnouncementCard from './announcement_card';

// The top of the page: the headline, one line of text and two buttons on the left and the picture on the right, then (only when an admin has
// published any) the announcements as one clean banner. The headline is the page's only h1. The background and snow behind it belong to
// the whole page (see .lp-backdrop in landing_page.jsx), so nothing here repeats further down.
function Hero({ announcements, onBook }) {
  return (
    <section id="home" data-nav="home" className="lp-hero">
      <span className="lp-hero-shape lp-hero-shape--one" aria-hidden="true" />
      <span className="lp-hero-shape lp-hero-shape--two" aria-hidden="true" />
      <div className="lp-hero-inner">
        <div className="lp-hero-copy">
          <h1>{HERO.headline[0]}<br /><span>{HERO.headline[1]}</span></h1>
          <p className="lp-hero-sub">{HERO.subline}</p>
          <div className="lp-hero-actions">
            <button type="button" className="lp-btn lp-btn--primary" onClick={onBook}>{HERO.primaryCta}</button>
            <a className="lp-btn lp-btn--outline" href="#availability">{HERO.secondaryCta}</a>
          </div>
        </div>

        <div className="lp-hero-visual">
          {HERO_IMAGE ? (
            <img className="lp-hero-photo" src={HERO_IMAGE} alt={HERO_IMAGE_ALT} width="640" height="480" decoding="async" />
          ) : (
            <HeroIllustration />
          )}
        </div>

        <AnnouncementCard announcements={announcements} />
      </div>
    </section>
  );
}

export default Hero;
