import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FiSearch, FiTool } from 'react-icons/fi';
import { UNIT_TYPE_IMAGES } from '../../utils/unitTypeImages';
import { COMPANY_PHONE } from '../../config/company';
import { getBusinessHoursText } from '../../config/timeBlocks';
import { usePublicPromos, describeDiscount } from '../../utils/promos';
import AvailabilityCalendar from '../../components/availability_calendar';
import '../../css/public.css'
import { API_BASE } from '../../config/api';
import { orFallback } from '../../services/apiClient';
import { listPublicTechnicians } from '../../services/authService';
import { SERVICE_TYPE } from '../../constants/serviceTypes';
import { UNIT_TYPES } from '../../constants/unitTypes';


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

const CATEGORY_LABEL = {
  Holiday: '🎉 Holiday',
  Closure: '🚧 Closure',
  Maintenance: '🛠️ Maintenance',
  General: '📢 Announcement',
};

/* ── Landing Page Module: public data hooks ─────────────────
   Everything on this page that states a service, a price or a rating comes from
   the database through public (no auth) endpoints; nothing is hardcoded. */
function usePublicServices() {
  const [services, setServices] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/services/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]))
      .finally(() => setLoaded(true));
  }, []);

  return { services, loaded };
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

    fetch(`${API_BASE}/api/bookings/public/feedback-summary`)
      .then((res) => (res.ok ? res.json() : null))
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
          placeholder="Search services or technicians..."
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
                            <span className="nav-search-tech-chip" key={t._id}>{t.name}</span>
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
                              ★ {feedbackSummary.averageRating} average from {feedbackSummary.totalReviews} review{feedbackSummary.totalReviews === 1 ? '' : 's'}
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
    fetch(`${API_BASE}/api/announcements/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]));
  }, []);

  return announcements;
}

/* ── Static Content ───────────────────────────────────────── */
// Shown only if the services API returns nothing (down, or no active services yet):
// plain cards with no prices, so the page never states a price the database doesn't back.
const FALLBACK_SERVICE_CARDS = [
  { title: 'Aircon Cleaning', desc: 'Cleaning for healthier, more efficient air circulation.' },
  { title: 'Repair & Diagnostics', desc: 'Diagnosis and repair for aircon units.' },
  { title: 'New Installation', desc: 'Installation with proper setup and testing.' },
  { title: 'Preventive Check-Up', desc: 'Scheduled maintenance to catch problems early.' },
];

const HOW_IT_WORKS_STEPS = [
  {
    number: '01',
    title: 'Book an Appointment',
    desc: 'Schedule online in minutes. Choose your service, date, time, and preferred technician.',
  },
  {
    number: '02',
    title: 'Onsite Assessment',
    desc: 'Our technician arrives, inspects your unit, and recommends the right solution.',
  },
  {
    number: '03',
    title: 'Service & Testing',
    desc: 'We complete the job professionally and test the unit before we leave.',
  },
  {
    number: '04',
    title: 'Post-Service Support',
    desc: 'Warranty coverage on completed work. We stay available after the job is done.',
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const announcements = useAnnouncements();
  const { services, loaded: servicesLoaded } = usePublicServices();
  const { promos } = usePublicPromos();
  // Customer-bookable services only: the hidden cleaning tiers and the admin-only Leak
  // Repair are not something a visitor picks from the menu.
  const serviceCards = services.filter((s) => !s.hiddenFromDirectSelection && s.serviceType !== SERVICE_TYPE.LEAK_REPAIR);
  const [current, setCurrent] = useState(0);
  const totalSlides = 1 + announcements.length;

  const nextSlide = () => {
    setCurrent((prev) => (prev + 1) % totalSlides);
  };

  return (
    <>
      {/* ============ NAVBAR ============ */}
      <header className="navbar">
        <div className="nav-left">
          <img src="/images/logo.png" alt="Cooling Zone Logo" className="logo" />
          <span className="brand">COOLING ZONE AIRCON MAINTENANCE SERVICES</span>
        </div>
        <div className="nav-right">
          <nav className="nav-links">
            <a href="#home">HOME</a>
            <a href="#about">ABOUT US</a>
            <a href="#services">SERVICES</a>
            <a href="#availability">AVAILABLE DATES</a>
          </nav>
          <NavSearch navigate={navigate} services={services} />
          <button className="login-btn" onClick={() => navigate('/login')}>LOG IN</button>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section id="home" className="hero landing-section">
        <div className="slides">
          <div className={`slide slide-1 ${current === 0 ? 'active' : ''}`}>
            <div className="slide-content">
              <span className="slide-eyebrow">Serving Metro Manila and nearby areas since 2009</span>
              <h1>Cool comfort, clean air,<br />delivered to your door.</h1>
              <p>Professional aircon cleaning, repair, and installation.</p>
              <div className="slide-cta-row">
                <button className="cta" onClick={() => navigate('/login')}>Book a Service</button>
              </div>
            </div>
          </div>

          {announcements.map((a, i) => (
            <div className={`slide slide-2 ${current === i + 1 ? 'active' : ''}`} key={a._id}>
              <div className="slide-content">
                <span className="slide-eyebrow">
                  {CATEGORY_LABEL[a.category] || a.category}
                  {a.displayDate ? ` · ${a.displayDate}` : ''}
                </span>
                <h2>{a.title}</h2>
                <p>{a.message}</p>
              </div>
            </div>
          ))}
        </div>

        {announcements.length > 0 && (
          <button className="next-btn" onClick={nextSlide}>❯</button>
        )}
      </section>

      <div className="vent-divider" />

      {/* ============ ABOUT US ============ */}
      <section id="about" className="about landing-section">
        <span className="section-eyebrow">Who We Are</span>
        <h2 className="section-title">About Us</h2>
        <p>
          Serving Metro Manila and nearby areas since 2009. We provide aircon cleaning,
          repair, installation, and preventive maintenance for homes and businesses.
        </p>
      </section>

      <div className="vent-divider" />

      {/* ============ SERVICES ============ */}
      <section id="services" className="services landing-section">
        <span className="section-eyebrow">What We Offer</span>
        <h2 className="section-title">Our Services</h2>
        <p className="section-subtitle">Base price only - final cost may vary depending on scope and materials.</p>

        <div className="cards">
          {serviceCards.length > 0
            ? serviceCards.map((service) => (
                <div className="card" key={service._id}>
                  <span className="card-icon"><FiTool /></span>
                  <h3>{service.name}</h3>
                  {service.description && <p>{service.description}</p>}
                  <span className="card-price">From ₱{Number(service.price).toLocaleString()}</span>
                </div>
              ))
            : servicesLoaded && FALLBACK_SERVICE_CARDS.map((service) => (
                <div className="card" key={service.title}>
                  <span className="card-icon"><FiTool /></span>
                  <h3>{service.title}</h3>
                  <p>{service.desc}</p>
                </div>
              ))}
        </div>

        <div className="services-cta">
          <button className="cta" onClick={() => navigate('/login')}>Book a Service Now</button>
        </div>
      </section>

      {/* ============ CURRENT PROMOS (real data, only shown when there are any) ============ */}
      {promos.length > 0 && (
        <section id="promos" className="services landing-section">
          <span className="section-eyebrow">Save More</span>
          <h2 className="section-title">Current Promos</h2>
          <div className="cards">
            {promos.map((promo) => (
              <div className="card" key={promo._id}>
                <h3>{promo.name}</h3>
                <p>{describeDiscount(promo)}{promo.minUnits > 1 ? ` when you book ${promo.minUnits} or more units` : ''}{promo.serviceNames.length > 0 ? ` of ${promo.serviceNames.join(', ')}` : ''}.</p>
                {promo.description && <p>{promo.description}</p>}
                <span className="card-price">Until {new Date(`${promo.endDate}T00:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ============ UNIT TYPES ============ */}
      <section className="units landing-section">
        <span className="section-eyebrow">Coverage</span>
        <h2 className="section-title">Unit Types We Service</h2>

        <div className="cards">
          {UNIT_TYPES.map((type) => (
            <div className="card" key={type}>
              <img src={UNIT_TYPE_IMAGES[type]} alt={type} className="card-photo card-photo--unit" />
              <p>{type}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="vent-divider" />

      {/* ============ AVAILABLE DATES ============ */}
      <section id="availability" className="services landing-section">
        <span className="section-eyebrow">Plan Ahead</span>
        <h2 className="section-title">Available Dates</h2>
        <p className="section-subtitle">Bookings need at least 3 days notice. Morning and Afternoon are booked separately.</p>
        <AvailabilityCalendar />
      </section>


      <div className="vent-divider" />

      {/* ============ HOW IT WORKS ============ */}
      <section className="how landing-section">
        <span className="section-eyebrow">The Process</span>
        <h2 className="section-title">How It Works</h2>
        <p className="section-subtitle">From booking to post-service support - we've made it simple.</p>

        <div className="steps">
          {HOW_IT_WORKS_STEPS.map((step) => (
            <div className="step" key={step.number}>
              <div className="step-number">{step.number}</div>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-row">
              <img src="/images/logo.png" alt="Logo" className="footer-logo" />
              <span className="footer-brand-name">COOLING ZONE</span>
            </div>
            <p className="footer-brand-desc">Serving Metro Manila and nearby areas since 2009.</p>
          </div>

          <div>
            <h4>Opening Hours</h4>
            <p>Mon to Sat: {getBusinessHoursText()}</p>
            <p>Sunday: Closed</p>
          </div>

          <div>
            <h4>Contact Us</h4>
            <p>📞 {COMPANY_PHONE}</p>
            <p>✉️ coolingzoneaircon@yahoo.com</p>
          </div>

          <div>
            <h4>Location</h4>
            <p>N.S. Amoranto corner Cadig St., Quezon City, Metro Manila</p>
            <iframe
              src="https://www.google.com/maps?q=N.S.+Amoranto+corner+Cadig+St.,+Quezon+City,+Metro+Manila&output=embed"
              className="map"
              loading="lazy"
              title="Cooling Zone Location Map"
            ></iframe>
          </div>
        </div>

        <p className="copy">© 2009 Cooling Zone Aircon Maintenance Services. All Rights Reserved.</p>
      </footer>
    </>
  );
}

export default LandingPage;