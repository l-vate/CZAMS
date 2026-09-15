import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../../css/public.css'

const API_BASE = 'http://localhost:5000';

const SEARCH_TABS = [
  { key: 'service', label: 'By Service' },
  { key: 'technician', label: 'By Technician' },
  { key: 'date', label: 'By Available Date' },
];

const CATEGORY_LABEL = {
  Holiday: '🎉 Holiday',
  Closure: '🚧 Closure',
  Maintenance: '🛠️ Maintenance',
  General: '📢 Announcement',
};

/* ── Landing Page Module: public search ─────────────────────
   Unauthenticated visitors can browse services, technicians, and date
   availability without logging in. Reuses the same real data the logged-in
   booking flow uses (GET /api/services/public mirrors the service picker's
   data, GET /api/auth/technicians is the exact endpoint book_service.jsx
   already uses, GET /api/bookings/public/availability mirrors the private
   busy-technicians lookup) rather than a separate hardcoded dataset —
   this only browses, it doesn't book; booking still requires login. */
function PublicSearch({ navigate }) {
  const [activeTab, setActiveTab] = useState('service');
  const [services, setServices] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [serviceQuery, setServiceQuery] = useState('');
  const [technicianQuery, setTechnicianQuery] = useState('');
  const [dateQuery, setDateQuery] = useState('');
  const [busyTechIds, setBusyTechIds] = useState(null);
  const [checkingDate, setCheckingDate] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/services/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setServices(Array.isArray(data) ? data : []))
      .catch(() => setServices([]));

    fetch(`${API_BASE}/api/auth/technicians`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setTechnicians(Array.isArray(data) ? data : []))
      .catch(() => setTechnicians([]));
  }, []);

  const filteredServices = useMemo(() => {
    const q = serviceQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter(
      (s) => s.name?.toLowerCase().includes(q) || s.category?.toLowerCase().includes(q)
    );
  }, [services, serviceQuery]);

  const filteredTechnicians = useMemo(() => {
    const q = technicianQuery.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter((t) => t.name?.toLowerCase().includes(q));
  }, [technicians, technicianQuery]);

  const handleDateCheck = async (value) => {
    setDateQuery(value);
    setBusyTechIds(null);
    if (!value) return;

    setCheckingDate(true);
    try {
      const res = await fetch(`${API_BASE}/api/bookings/public/availability?date=${value}`);
      const data = res.ok ? await res.json() : { busyTechIds: [] };
      setBusyTechIds(Array.isArray(data.busyTechIds) ? data.busyTechIds : []);
    } catch (err) {
      setBusyTechIds([]);
    } finally {
      setCheckingDate(false);
    }
  };

  const availableTechnicians = busyTechIds
    ? technicians.filter((t) => !busyTechIds.includes(t._id))
    : [];

  return (
    <section id="search" className="public-search">
      <span className="section-eyebrow">Find What You Need</span>
      <h2 className="section-title">Search Before You Book</h2>
      <p className="section-subtitle">Browse our services, technicians, and open dates — no account needed.</p>

      <div className="public-search-tabs">
        {SEARCH_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`public-search-tab ${activeTab === tab.key ? 'public-search-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="public-search-panel">
        {activeTab === 'service' && (
          <>
            <input
              type="text"
              className="public-search-input"
              placeholder="Search services (e.g. cleaning, repair, installation)..."
              value={serviceQuery}
              onChange={(e) => setServiceQuery(e.target.value)}
            />
            <div className="public-search-results">
              {filteredServices.length === 0 ? (
                <p className="public-search-empty">No matching services.</p>
              ) : (
                filteredServices.map((s) => (
                  <div className="public-search-result" key={s._id}>
                    <div className="public-search-result-main">
                      <span className="public-search-result-title">{s.name}</span>
                      <span className="public-search-result-desc">{s.description}</span>
                    </div>
                    <span className="public-search-result-price">₱{Number(s.price).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'technician' && (
          <>
            <input
              type="text"
              className="public-search-input"
              placeholder="Search technicians by name..."
              value={technicianQuery}
              onChange={(e) => setTechnicianQuery(e.target.value)}
            />
            <div className="public-search-results">
              {filteredTechnicians.length === 0 ? (
                <p className="public-search-empty">No matching technicians.</p>
              ) : (
                filteredTechnicians.map((t) => (
                  <div className="public-search-result" key={t._id}>
                    <div className="public-search-result-main">
                      <span className="public-search-result-title">{t.name}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'date' && (
          <>
            <input
              type="date"
              className="public-search-input"
              value={dateQuery}
              onChange={(e) => handleDateCheck(e.target.value)}
            />
            <div className="public-search-results">
              {checkingDate && <p className="public-search-empty">Checking availability...</p>}
              {!checkingDate && dateQuery && busyTechIds !== null && (
                availableTechnicians.length === 0 ? (
                  <p className="public-search-empty">
                    {technicians.length === 0
                      ? 'No technicians on file yet.'
                      : 'Fully booked on this date — try another day.'}
                  </p>
                ) : (
                  <>
                    <p className="public-search-availability-summary">
                      {availableTechnicians.length} of {technicians.length} technicians available
                    </p>
                    {availableTechnicians.map((t) => (
                      <div className="public-search-result" key={t._id}>
                        <div className="public-search-result-main">
                          <span className="public-search-result-title">{t.name}</span>
                        </div>
                      </div>
                    ))}
                  </>
                )
              )}
            </div>
          </>
        )}

        <div className="public-search-cta">
          <button className="cta" onClick={() => navigate('/login')}>Log In to Book</button>
        </div>
      </div>
    </section>
  );
}

/* ── Landing Page Module: announcement board ─────────────────
   Real data from GET /api/announcements/public (Announcement model, managed by
   admin under Manage Services > ... > Announcements). Hidden entirely when there
   are none, rather than showing an empty "no announcements" box on a public
   marketing page. */
function AnnouncementBoard() {
  const [announcements, setAnnouncements] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/announcements/public`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAnnouncements(Array.isArray(data) ? data : []))
      .catch(() => setAnnouncements([]))
      .finally(() => setLoaded(true));
  }, []);

  if (!loaded || announcements.length === 0) return null;

  return (
    <section className="announcement-board">
      <span className="section-eyebrow">Stay Updated</span>
      <h2 className="section-title">Announcements</h2>

      <div className="announcement-board-list">
        {announcements.map((a) => (
          <div className="announcement-card" key={a._id}>
            <div className="announcement-card-topline">
              <span className={`announcement-card-category announcement-card-category--${a.category.toLowerCase()}`}>
                {CATEGORY_LABEL[a.category] || a.category}
              </span>
              {a.displayDate && <span className="announcement-card-date">{a.displayDate}</span>}
            </div>
            <h3>{a.title}</h3>
            <p>{a.message}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Static Content ─────────────────────────────────────── */
const STATS = [
  { value: '15+', label: 'Years of Experience' },
  { value: '2,000+', label: 'Units Serviced' },
  { value: '500+', label: 'Happy Clients' },
  { value: '4.9★', label: 'Average Rating' },
];

const SERVICES = [
  {
    image: '/images/services/cleaning.jpg',
    title: 'Aircon Cleaning',
    desc: 'Thorough deep-cleaning for fresh, healthy, efficient air circulation.',
    price: 'From ₱650',
  },
  {
    image: '/images/services/repair.jpg',
    title: 'Repair & Diagnostics',
    desc: 'Fast diagnosis and dependable repairs for all unit types and brands.',
    price: 'From ₱1,200',
  },
  {
    image: '/images/services/installation.jpg',
    title: 'New Installation',
    desc: 'Professional installation with proper setup, testing, and cleanup.',
    price: 'From ₱3,500',
  },
  {
    image: '/images/services/checkup.jpg',
    title: 'Preventive Check-Up',
    desc: 'Scheduled maintenance to avoid costly breakdowns before they happen.',
    price: 'From ₱550',
  },
];

const UNIT_TYPES = [
  { image: '/images/units/window-type.jpg', label: 'Window Type' },
  { image: '/images/units/split-type.jpg', label: 'Split Type' },
  { image: '/images/units/inverter.jpg', label: 'Inverter' },
  { image: '/images/units/cassette.jpg', label: 'Cassette' },
  { image: '/images/units/floor-mounted.jpg', label: 'Floor Mounted' },
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
          <button className="login-btn" onClick={() => navigate('/login')}>LOG IN</button>
        </div>
      </header>

      {/* ============ HERO ============ */}
      <section id="home" className="hero">
        <div className="slides">
          <div className="slide slide-1 active">
            <div className="slide-content">
              <span className="slide-eyebrow">Trusted since 2009</span>
              <h1>Cool comfort, clean air,<br />delivered to your door.</h1>
              <p>Professional aircon cleaning, repair, and installation — fast, reliable, and affordable.</p>
              <div className="slide-cta-row">
                <button className="cta" onClick={() => navigate('/login')}>Book a Service</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="vent-divider" />

      {/* ============ PUBLIC SEARCH ============ */}
      <PublicSearch navigate={navigate} />

      <div className="vent-divider" />

      {/* ============ ANNOUNCEMENT BOARD ============ */}
      <AnnouncementBoard />

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
              <img src={unit.image} alt={unit.label} className="card-photo card-photo--unit" />
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
            <p>✉️ info@coolingzone.com</p>
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