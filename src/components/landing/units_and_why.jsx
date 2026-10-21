import { useState } from 'react';
import { FiWind } from 'react-icons/fi';
import { UNITS, WHY } from '../../config/landingContent';
import LandingIcon from './icons';
import SectionHeading from './section_heading';

// One unit type photo. All of them are shown in the same 4:3 frame (object-fit: cover) with the same soft overlay, so photos of mixed
// quality look like a set. If a photo does not load, a plain icon takes its place.
function UnitPhoto({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="lp-unit-fallback" role="img" aria-label={alt}><FiWind aria-hidden="true" /></span>;
  return <img src={src} alt={alt} width="400" height="300" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

export function UnitTypesSection() {
  return (
    <section id="unit-types" data-nav="services" className="lp-section lp-units" aria-labelledby="units-title">
      <SectionHeading eyebrow={UNITS.eyebrow} title={UNITS.title} id="units-title" />
      <ul className="lp-unit-grid">
        {UNITS.items.map((unit, i) => (
          <li className="lp-unit" key={unit.type} data-reveal style={{ '--reveal-i': i }}>
            <span className="lp-unit-frame"><UnitPhoto src={unit.src} alt={unit.alt} /></span>
            <span className="lp-unit-label">{unit.type}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhySection() {
  return (
    <section id="why" data-nav="services" className="lp-section lp-why" aria-labelledby="why-title">
      <SectionHeading eyebrow={WHY.eyebrow} title={WHY.title} id="why-title" />
      <ul className="lp-card-grid lp-card-grid--three">
        {WHY.items.map((item, i) => (
          <li className="lp-card lp-why-card" key={item.title} data-reveal style={{ '--reveal-i': i }}>
            <span className="lp-card-icon"><LandingIcon name={item.icon} /></span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
