import { useState } from 'react';
import { FiChevronDown, FiPhone } from 'react-icons/fi';
import { HOW, FAQ, CTA_BAND, COMPANY_PHONE, COMPANY_PHONE_TEL } from '../../config/landingContent';
import LandingIcon from './icons';
import SectionHeading from './section_heading';

export function HowSection() {
  return (
    <section id="how" data-nav="availability" className="lp-section lp-how" aria-labelledby="how-title">
      <SectionHeading eyebrow={HOW.eyebrow} title={HOW.title} subtitle={HOW.subtitle} id="how-title" />
      <ol className="lp-steps">
        {HOW.steps.map((step, i) => (
          <li className="lp-step" key={step.title} data-reveal style={{ '--reveal-i': i }}>
            <span className="lp-step-marker"><LandingIcon name={step.icon} /><span className="lp-step-number" aria-hidden="true">{i + 1}</span></span>
            <div className="lp-step-body">
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// Accessible accordion: each question is a real button with aria-expanded, operable with Enter and Space, and the answer is a region
// it controls. Several can be open at once.
export function FaqSection() {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (index) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return (
    <section id="faq" data-nav="availability" className="lp-section lp-faq" aria-labelledby="faq-title">
      <SectionHeading eyebrow={FAQ.eyebrow} title={FAQ.title} id="faq-title" />
      <div className="lp-faq-list">
        {FAQ.items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <div className={`lp-faq-item${isOpen ? ' lp-faq-item--open' : ''}`} key={item.q} data-reveal>
              <h3>
                <button
                  type="button"
                  className="lp-faq-q"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${i}`}
                  id={`faq-button-${i}`}
                  onClick={() => toggle(i)}
                >
                  <span>{item.q}</span>
                  <FiChevronDown className="lp-faq-chevron" aria-hidden="true" />
                </button>
              </h3>
              <div className="lp-faq-a" id={`faq-panel-${i}`} role="region" aria-labelledby={`faq-button-${i}`} hidden={!isOpen}>
                <p>{item.a}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function CtaBand({ onBook }) {
  return (
    <section className="lp-cta-band" aria-labelledby="cta-title" data-nav="availability">
      <div className="lp-cta-inner" data-reveal>
        <h2 id="cta-title">{CTA_BAND.title}</h2>
        <p>{CTA_BAND.text}</p>
        <div className="lp-hero-actions">
          <button type="button" className="lp-btn lp-btn--primary" onClick={onBook}>{CTA_BAND.primary}</button>
          <a className="lp-btn lp-btn--outline" href={COMPANY_PHONE_TEL}>
            <FiPhone aria-hidden="true" /> {COMPANY_PHONE}
          </a>
          <a className="lp-btn lp-btn--ghost" href="#availability">{CTA_BAND.secondary}</a>
        </div>
      </div>
    </section>
  );
}
