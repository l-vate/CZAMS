import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiWind, FiThermometer, FiZap, FiGrid, FiHome, FiSearch } from 'react-icons/fi';
import { UNIT_TYPE_IMAGES } from '../../utils/unitTypeImages';
import '../../css/public.css'

const API_BASE = 'http://localhost:5000';

const NAV_SEARCH_RESULTS_LIMIT = 8;

// Same canonical list booking uses (book_service.jsx UNIT_TYPES) — duplicated
// here rather than imported since that module is customer/auth-flow code and
// this component is the fully public landing page. Named distinctly from the
// UNIT_TYPES below (that one's the "Coverage" section's icon list, a different,
// looser set of labels — this one has to match booking's real unit types
// exactly, since it's used to look up real per-type prices).
const SEARCH_UNIT_TYPES = ['Window Type', 'Split Type', 'Floor Mounted', 'Cassette Type', 'Portable'];

// Mirrors src/utils/bookingPricing.js getUnitPrice: a per-unit-type override if the
// admin set one for this service, otherwise the flat base price.
function getUnitPrice(service, unitType) {
  const override = service?.unitTypePricing?.find((p) => p.unitType === unitType);
  return override ? override.price : (service?.price || 0);
}

const CATEGORY_LABEL = {
  Holiday: '🎉 Holiday',
  Closure: '🚧 Closure',
  Maintenance: '🛠️ Maintenance',
  General: '📢 Announcement',
};

/* ── Landing Page Module: navbar search ─────────────────────
   Replaces the old dedicated "Search Before You Book" section (3 tabs incl. a
   date-availability check) with a single normal search input in the navbar —
   simple text match against service and technician names only. Date search was
   dropped: it doesn't fit a plain text box the way name matching does, and per
   the client this is better handled inside the actual booking flow later if it's
   ever needed. Still real data (GET /api/services/public, GET /api/auth/technicians,
   GET /api/bookings/public/feedback-summary — all public, no auth) and still
   browse-only for an unauthenticated visitor.

   Results open in a larger popup instead of a small inline list. A service
   match shows that service's description and a full per-unit-type price
   breakdown. A technician match deliberately does NOT show that person's own
   schedule/rating/profile — this is a 4-person field team and an individual
   public profile is a privacy concern the client specifically wants to avoid —
   so it shows the matched name plus one shared, company-wide review aggregate
   instead (same aggregate no matter which or how many technicians matched). */
function NavSearch({ navigate }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [services, setServices] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [feedbackSummary, setFeedbackSummary] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/services/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]));

    fetch(`${API_BASE}/api/auth/technicians`)
      .then((res) => (res.ok ? res.json() : []))
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  const serviceResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    // Capped (unlike the technician list, small enough to just show in full) —
    // each match renders as a full card with a description and unit-type grid,
    // so an uncapped list could get very long in the popup.
    return services.filter((s) => s.name?.toLowerCase().includes(q)).slice(0, NAV_SEARCH_RESULTS_LIMIT);
  }, [services, query]);

  const technicianResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
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
        />
      </div>

      {open && query.trim() && (
        <div className="modal-overlay nav-search-modal-overlay" onClick={() => setOpen(false)}>
          <div className="nav-search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="nav-search-modal-title">Search Results for "{query.trim()}"</span>
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
                            <span className="nav-search-service-name">{s.name}</span>
                            <span className="nav-search-service-base-price">
                              From ₱{Number(s.price).toLocaleString()}
                            </span>
                          </div>
                          {s.description && (
                            <p className="nav-search-service-desc">{s.description}</p>
                          )}

                          <p className="nav-search-unit-heading">Pricing by unit type</p>
                          <div className="nav-search-unit-grid">
                            {SEARCH_UNIT_TYPES.map((type) => (
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
                      <div className="nav-search-tech-names">
                        {technicianResults.map((t) => (
                          <span className="nav-search-tech-chip" key={t._id}>{t.name}</span>
                        ))}
                      </div>

                      {/* Company-wide aggregate only — never a per-technician score/profile. */}
                      <div className="nav-search-reviews-card">
                        <p className="nav-search-reviews-title">Customer Reviews</p>
                        {feedbackSummary?.totalReviews > 0 ? (
                          <p className="nav-search-reviews-stat">
                            ★ {feedbackSummary.averageRating} average from {feedbackSummary.totalReviews} review{feedbackSummary.totalReviews === 1 ? '' : 's'}
                          </p>
                        ) : (
                          <p className="nav-search-reviews-stat nav-search-reviews-empty">No reviews yet.</p>
                        )}
                        <p className="nav-search-reviews-note">
                          Reflects all completed jobs company-wide, not a single technician.
                        </p>
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
        </div>
      )}
    </div>
  );
}

/* ── Landing Page Module: announcements-in-hero hook ─────────
   Real data from GET /api/announcements/public (Announcement model, managed by
   admin under Announcements). Previously rendered as its own section below the
   hero; moved back into the hero carousel itself (one slide per announcement,
   after the static booking slide) so it actually shows in the main top banner. */
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

/* ── Static Content ─────────────────────────────────────── */
const STATS = [
  { value: '15+', label: 'Years of Experience' },
  { value: '2,000+', label: 'Units Serviced' },
  { value: '500+', label: 'Happy Clients' },
  { value: '4.9★', label: 'Average Rating' },
];

// Temporary placeholder photos (free Unsplash stock, aircon/HVAC-themed) —
// /images/services/*.jpg never existed on disk (confirmed: public/images/ only
// has logo.png), so these cards were rendering broken images. Swap for real CZA
// photography when available.
const SERVICES = [
  {
    image: 'https://images.unsplash.com/photo-1737012197886-7d5a52ded45b?auto=format&fit=crop&w=800&q=80',
    title: 'Aircon Cleaning',
    desc: 'Thorough deep-cleaning for fresh, healthy, efficient air circulation.',
    price: 'From ₱650',
  },
  {
    image: 'https://images.unsplash.com/photo-1642749776312-aa42ce20c9f5?auto=format&fit=crop&w=800&q=80',
    title: 'Repair & Diagnostics',
    desc: 'Fast diagnosis and dependable repairs for all unit types and brands.',
    price: 'From ₱1,200',
  },
  {
    image: 'https://images.unsplash.com/photo-1726614846573-c1ac2e6161d1?auto=format&fit=crop&w=800&q=80',
    title: 'New Installation',
    desc: 'Professional installation with proper setup, testing, and cleanup.',
    price: 'From ₱3,500',
  },
  {
    image: 'https://images.unsplash.com/photo-1759772238012-9d5ad59ae637?auto=format&fit=crop&w=800&q=80',
    title: 'Preventive Check-Up',
    desc: 'Scheduled maintenance to avoid costly breakdowns before they happen.',
    price: 'From ₱550',
  },
];

// Icon-based, not photo-based — /images/units/ never existed on disk (confirmed:
// only logo.png is present under public/images), so every box here was actually
// rendering a broken image icon. .card-icon already existed in public.css for
// exactly this treatment but had no consumer anywhere in the app.
const UNIT_TYPES = [
  { icon: <FiWind />, label: 'Window Type' },
  { icon: <FiThermometer />, label: 'Split Type' },
  { icon: <FiZap />, label: 'Inverter' },
  { icon: <FiGrid />, label: 'Cassette' },
  { icon: <FiHome />, label: 'Floor Mounted' },
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
    desc: '30-day service warranty. We stay available after the job is done.',
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const announcements = useAnnouncements();
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
          </nav>
          <NavSearch navigate={navigate} />
          <button className="login-btn" onClick={() => navigate('/login')}>LOG IN</button>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section id="home" className="hero">
        <div className="slides">
          <div className={`slide slide-1 ${current === 0 ? 'active' : ''}`}>
            <div className="slide-content">
              <span className="slide-eyebrow">Trusted since 2009</span>
              <h1>Cool comfort, clean air,<br />delivered to your door.</h1>
              <p>Professional aircon cleaning, repair, and installation — fast, reliable, and affordable.</p>
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
      <section id="about" className="about">
        <span className="section-eyebrow">Who We Are</span>
        <h2 className="section-title">About Us</h2>
        <p>
          Cooling Zone has been serving homes and businesses since 2009. With over
          15 years of experience, we deliver reliable aircon cleaning, repair,
          installation, and preventive maintenance services across Metro Manila.
        </p>

        <div className="stats">
          {STATS.map((stat) => (
            <div className="stat" key={stat.label}>
              <h3>{stat.value}</h3>
              <p>{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="vent-divider" />

      {/* ============ SERVICES ============ */}
      <section id="services" className="services">
        <span className="section-eyebrow">What We Offer</span>
        <h2 className="section-title">Our Services</h2>
        <p className="section-subtitle">Base price only — final cost may vary depending on scope and materials.</p>

        <div className="cards">
          {SERVICES.map((service) => (
            <div className="card" key={service.title}>
              <img src={service.image} alt={service.title} className="card-photo" />
              <h3>{service.title}</h3>
              <p>{service.desc}</p>
              <span className="card-price">{service.price}</span>
            </div>
          ))}
        </div>

        <div className="services-cta">
          <button className="cta" onClick={() => navigate('/login')}>Book a Service Now</button>
        </div>
      </section>

      {/* ============ UNIT TYPES ============ */}
      <section className="units">
        <span className="section-eyebrow">Coverage</span>
        <h2 className="section-title">All Major Unit Types Covered</h2>

        <div className="cards">
          {UNIT_TYPES.map((unit) => (
            <div className="card" key={unit.label}>
              <span className="card-icon">{unit.icon}</span>
              <p>{unit.label}</p>
            </div>
          ))}
        </div>
      </section>


      <div className="vent-divider" />

      {/* ============ HOW IT WORKS ============ */}
      <section className="how">
        <span className="section-eyebrow">The Process</span>
        <h2 className="section-title">How It Works</h2>
        <p className="section-subtitle">From booking to post-service support — we've made it simple.</p>

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
            <p className="footer-brand-desc">Trusted aircon maintenance services since 2009. Serving homes and businesses across Metro Manila.</p>
          </div>

          <div>
            <h4>Opening Hours</h4>
            <p>Mon – Sat: 8:00 AM – 6:00 PM</p>
            <p>Sunday: Closed</p>
          </div>

          <div>
            <h4>Contact Us</h4>
            <p>📞 +63 900 000 0000</p>
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