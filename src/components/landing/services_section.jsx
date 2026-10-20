import { Link } from 'react-router-dom';
import { SERVICES, SHOWCASE, SHOW_PUBLIC_PRICES } from '../../config/landingContent';
import LandingIcon from './icons';
import PhotoSlot from './photo_slot';
import SectionHeading from './section_heading';

// The lowest public price among the bookable services of one type, or null. Only used when SHOW_PUBLIC_PRICES is on.
function lowestPrice(services, serviceType) {
  const prices = services
    .filter((s) => s.serviceType === serviceType && !s.hiddenFromDirectSelection && Number(s.price) > 0)
    .map((s) => Number(s.price));
  return prices.length > 0 ? Math.min(...prices) : null;
}

// Four service cards, each with its own icon and a link into the booking flow (Log In first: booking needs an account).
// The booking form cannot be opened with a service already chosen, so the link goes to the normal entry.
function ServicesSection({ services }) {
  return (
    <section id="services" data-nav="services" className="lp-section lp-services" aria-labelledby="services-title">
      <SectionHeading eyebrow={SERVICES.eyebrow} title={SERVICES.title} subtitle={SERVICES.note} id="services-title" />
      <ul className="lp-card-grid lp-card-grid--four">
        {SERVICES.items.map((item, i) => {
          const price = SHOW_PUBLIC_PRICES ? lowestPrice(services, item.serviceType) : null;
          return (
            <li className="lp-card lp-service-card" key={item.key} data-reveal style={{ '--reveal-i': i }}>
              <span className="lp-card-icon"><LandingIcon name={item.icon} /></span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
              {price !== null && <span className="lp-price">From PHP {price.toLocaleString()}</span>}
              <Link className="lp-card-link" to="/login">{SERVICES.linkLabel}<span aria-hidden="true"> &rarr;</span></Link>
            </li>
          );
        })}
      </ul>

      {SHOWCASE.slots.some((slot) => slot.src) && (
        <div className="lp-showcase">
          <h3 className="lp-showcase-title" data-reveal>{SHOWCASE.title}</h3>
          <div className="lp-showcase-grid">
            {SHOWCASE.slots.filter((slot) => slot.src).map((slot) => (
              <figure className="lp-showcase-item" key={slot.key} data-reveal>
                <PhotoSlot photo={slot} className="lp-showcase-photo" />
                <figcaption>{slot.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

    </section>
  );
}

export default ServicesSection;
