import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch } from 'react-icons/fi';
import { UNIT_TYPE_IMAGES } from '../../utils/unitTypeImages';
import { usePublicPromos, describeDiscount } from '../../utils/promos';
import AvailabilityCalendar from '../../components/availability_calendar';
import '../../css/public.css';
import '../../css/landing.css';
import '../../css/landing_extras.css';
import { orFallback } from '../../services/apiClient';
import { listPublicTechnicians } from '../../services/authService';
import { getPublicFeedbackSummary } from '../../services/bookingService';
import { listPublicServices } from '../../services/serviceCatalogService';
import { listPublicAnnouncements } from '../../services/announcementService';
import { SERVICE_TYPE } from '../../constants/serviceTypes';
import { UNIT_TYPES } from '../../constants/unitTypes';
import PublicNavbar from '../../components/public_navbar';
import { pluralize } from '../../utils/pluralize';
import { JSON_LD, AVAILABILITY } from '../../config/landingContent';
import { useReveal } from '../../hooks/useReveal';
import { useScrollSpy } from '../../hooks/useScrollSpy';
import Hero from '../../components/landing/hero';
import Snowfall from '../../components/landing/snowfall';
import { TrustStrip, AboutSection } from '../../components/landing/trust_and_about';
import ServicesSection from '../../components/landing/services_section';
import { UnitTypesSection, WhySection } from '../../components/landing/units_and_why';
import { HowSection, FaqSection, CtaBand } from '../../components/landing/how_faq_cta';
import LandingFooter from '../../components/landing/landing_footer';
import SectionHeading from '../../components/landing/section_heading';

const NAV_SEARCH_RESULTS_LIMIT = 8;


// Mirrors src/utils/bookingPricing.js getUnitPrice: a per-unit-type override if the
// admin set one for this service, otherwise the flat base price.
function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

// Generic terms a visitor might type without knowing a specific service or
// technician name - "what do you offer" / "how much" style searches. Matching
// these surfaces every service/technician instead of coming back empty just
// because the query isn't literally a name substring.
const GENERIC_SERVICE_TERMS = ['service', 'services', 'price', 'prices', 'pricing', 'cost', 'costs', 'rate', 'rates'];
const GENERIC_TECH_TERMS = ['technician', 'technicians', 'staff', 'team', 'tech'];

// Service.category accent - same idea as the announcement/status accents used
// elsewhere in the app, just for the categories this model actually has.
const SERVICE_CATEGORY_ACCENT = {
  Cleaning: 'nav-search-badge--cleaning',
  Installation: 'nav-search-badge--installation',
  Maintenance: 'nav-search-badge--maintenance',
  Repair: 'nav-search-badge--repair',
};

/* ── Landing Page Module: public data hooks ─────────────────
   Everything on this page that states a service, a price or a rating comes from
   the database through public (no auth) endpoints; nothing is hardcoded. */
function usePublicServices() {
  const [services, setServices] = useState([]);

  useEffect(() => {
    orFallback(listPublicServices(), [])
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]));
  }, []);

  return { services };
}

/* ── Landing Page Module: navbar search ─────────────────────
   A single text input in the navbar that matches service and technician names
   (there is no date or availability search). Data is real (GET /api/services/public,
   GET /api/auth/technicians, GET /api/bookings/public/feedback-summary - all
   public, no auth) and browse-only for an unauthenticated visitor.

   Results open in a larger popup. A service match shows that service's
   description and a full per-unit-type price breakdown. A technician match
   deliberately does NOT show that person's own schedule, rating or reviews: this
   is a small field team and an individual public profile is a privacy concern the
   client wants to avoid. It shows the matched name(s) plus one shared,
   company-wide review aggregate instead (same aggregate no matter which or how
   many technicians matched). */
function NavSearch({ navigate, services }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [technicians, setTechnicians] = useState([]);
  const [feedbackSummary, setFeedbackSummary] = useState(null);

  useEffect(() => {
    orFallback(listPublicTechnicians(), [])
      .then((data) => setTechnicians(Array.isArray(data) ? data : []))
      .catch(() => setTechnicians([]));

    orFallback(getPublicFeedbackSummary(), null)
      .then((data) => setFeedbackSummary(data))
      .catch(() => setFeedbackSummary(null));
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e) => { if (e.key === 'Escape') setOpen(false); };
    // eslint-disable-next-line no-restricted-syntax -- Escape key: removed in this effect's cleanup
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const serviceResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // A generic "services"/"prices" search, or a unit-type name ("window
    // type", "cassette"...), surfaces every service - there's no one service
    // that specific term should narrow down to, so treat it as "show me what
    // you've got" instead of coming back with no matches.
    const isGenericBrowse =
      GENERIC_SERVICE_TERMS.includes(q) || UNIT_TYPES.some((t) => t.toLowerCase().includes(q));
    const matches = isGenericBrowse
      ? services
      : services.filter(
          (s) =>
            s.name?.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q) ||
            s.serviceType?.toLowerCase().includes(q)
        );
    // Capped (unlike the technician list, small enough to just show in full) -
    // each match renders as a full card with a description and unit-type grid,
    // so an uncapped list could get very long in the popup.
    return matches.slice(0, NAV_SEARCH_RESULTS_LIMIT);
  }, [services, query]);

  const technicianResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    if (GENERIC_TECH_TERMS.includes(q)) return technicians;
    return technicians.filter((t) => t.name?.toLowerCase().includes(q));
  }, [technicians, query]);

  const totalResults = serviceResults.length + technicianResults.length;

  return (
    <div className="nav-search-wrapper">
      <div className="nav-search-box">
        <FiSearch className="nav-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="search"
          placeholder="Search services"
          aria-label="Search services or technicians"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        />
      </div>

      {open && query.trim() && createPortal(
        <div className="modal-overlay nav-search-modal-overlay" onClick={() => setOpen(false)}>
          <div className="nav-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              {/* A single input (the navbar's) that never unmounts, raised above this
                  overlay via z-index (see .nav-search-wrapper in public.css) so it
                  stays visible and editable while the modal is open. A second input
                  inside the modal used to steal and drop focus on every keystroke
                  that crossed the empty/non-empty boundary. */}
              <span className="nav-search-modal-title">
                {totalResults > 0 ? `Results for "${query.trim()}"` : 'Search'}
              </span>
              <button className="modal-close-btn" onClick={() => setOpen(false)}>✕</button>
            </div>

            <div className="nav-search-modal-body">
              {totalResults === 0 ? (
                <p className="nav-search-empty">No matches for "{query.trim()}".</p>
              ) : (
                <>
                  {serviceResults.length > 0 && (
                    <div className="nav-search-result-group">
                      <h4 className="nav-search-group-title">Services</h4>
                      {serviceResults.map((s) => (
                        <div className="nav-search-service-card" key={s._id}>
                          <div className="nav-search-service-header">
                            <div>
                              <span className="nav-search-service-name">{s.name}</span>
                              {s.category && (
                                <span className={`nav-search-badge ${SERVICE_CATEGORY_ACCENT[s.category] || ''}`}>
                                  {s.category}
                                </span>
                              )}
                            </div>
                            <span className="nav-search-service-base-price">
                              From ₱{Number(s.price).toLocaleString()}
                            </span>
                          </div>
                          {s.description && (
                            <p className="nav-search-service-desc">{s.description}</p>
                          )}

                          <p className="nav-search-unit-heading">Pricing by unit type</p>
                          <div className="nav-search-unit-grid">
                            {UNIT_TYPES.map((type) => (
                              <div className="nav-search-unit-item" key={type}>
                                <img
                                  src={UNIT_TYPE_IMAGES[type]}
                                  alt={type}
                                  className="nav-search-unit-photo"
                                />
                                <span className="nav-search-unit-label">{type}</span>
                                <span className="nav-search-unit-price">
                                  ₱{Number(getUnitPrice(s, type)).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {technicianResults.length > 0 && (
                    <div className="nav-search-result-group">
                      <h4 className="nav-search-group-title">Technicians</h4>
                      <div className="nav-search-reviews-card">
                        <div className="nav-search-reviews-card-header">
                          {technicianResults.map((t) => (
                            <span className="nav-search-tech-chip" key={t._id || t.name}>{t.name}</span>
                          ))}
                        </div>

                        <p className="nav-search-reviews-note">
                          Our technicians are reviewed as one team. Individual ratings are not published.
                        </p>

                        {feedbackSummary === null ? (
                          <p className="nav-search-reviews-note">Loading reviews...</p>
                        ) : feedbackSummary.totalReviews === 0 ? (
                          <p className="nav-search-reviews-stat nav-search-reviews-empty">No reviews yet.</p>
                        ) : (
                          <>
                            <span className="nav-search-reviews-stat">
                              ★ {feedbackSummary.averageRating} average from {feedbackSummary.totalReviews} {pluralize(feedbackSummary.totalReviews, 'review')}
                            </span>
                            <div className="nav-search-review-list">
                              {(feedbackSummary.recentReviews || []).map((r, i) => (
                                <div className="nav-search-review-item" key={i}>
                                  <span className="nav-search-review-stars">
                                    {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                                  </span>
                                  <p className="nav-search-review-text">"{r.text}"</p>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              <button className="cta nav-search-cta" onClick={() => navigate('/login')}>
                Log In to Book
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ── Landing Page Module: announcements-in-hero hook ─────────
   Real data from GET /api/announcements/public (Announcement model, managed by
   admin under Announcements), shown as one hero carousel slide per announcement
   after the static booking slide. */
function useAnnouncements() {
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    orFallback(listPublicAnnouncements(), [])
      .then((data) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]));
  }, []);

  return announcements;
}

function LandingPage() {
  const navigate = useNavigate();
  const announcements = useAnnouncements();
  const { services } = usePublicServices();
  const { promos } = usePublicPromos();
  // Customer-bookable services only: the hidden cleaning tiers and the admin-only Leak
  // Repair are not something a visitor picks from the menu.
  const serviceCards = services.filter((s) => !s.hiddenFromDirectSelection && s.serviceType !== SERVICE_TYPE.LEAK_REPAIR);

  const rootRef = useRef(null);
  useReveal(rootRef);
  const activeId = useScrollSpy(rootRef);
  const goLogin = () => navigate('/login');

  return (
    <div className="lp-root" ref={rootRef}>
      <a className="lp-skip" href="#main">Skip to content</a>
      {/* one backdrop for the whole page: it stays put while the sections scroll over it, so the background never restarts */}
      <div className="lp-backdrop" aria-hidden="true"><Snowfall /></div>
      <script type="application/ld+json">{JSON.stringify(JSON_LD)}</script>

      <PublicNavbar search={<NavSearch navigate={navigate} services={serviceCards} />} onLogin={goLogin} activeId={activeId} />

      <main id="main" tabIndex={-1}>
        <Hero announcements={announcements} onBook={goLogin} />
        <TrustStrip />
        <AboutSection />
        <ServicesSection services={serviceCards} />

        {/* current promos: real data from the admin pages, only shown when there are any */}
        {promos.length > 0 && (
          <section id="promos" data-nav="services" className="lp-section lp-promos" aria-labelledby="promos-title">
            <SectionHeading eyebrow="Current Promos" title="Promos right now" id="promos-title" />
            <ul className="lp-card-grid">
              {promos.map((promo, i) => (
                <li className="lp-card" key={promo._id} data-reveal style={{ '--reveal-i': i }}>
                  <h3>{promo.name}</h3>
                  <p>{describeDiscount(promo)}{promo.minUnits > 1 ? ` when you book ${promo.minUnits} or more units` : ''}{promo.serviceNames.length > 0 ? ` of ${promo.serviceNames.join(', ')}` : ''}.</p>
                  {promo.description && <p>{promo.description}</p>}
                  <span className="lp-price">Until {new Date(`${promo.endDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <UnitTypesSection />
        <WhySection />

        <section id="availability" data-nav="availability" className="lp-section lp-availability" aria-labelledby="availability-title">
          <SectionHeading eyebrow={AVAILABILITY.eyebrow} title={AVAILABILITY.title} subtitle={AVAILABILITY.subtitle} id="availability-title" />
          <AvailabilityCalendar />
        </section>

        <HowSection />
        <FaqSection />
        <CtaBand onBook={goLogin} />
      </main>

      <LandingFooter onLogin={goLogin} />
    </div>
  );
}

export default LandingPage;
