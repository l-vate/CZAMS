import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
  const [current, setCurrent] = useState(0);
  const navigate = useNavigate();
  const slides = ['slide-1', 'slide-2'];

  const nextSlide = () => {
    setCurrent((prev) => (prev + 1) % slides.length);
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

          <div className={`slide slide-2 ${current === 1 ? 'active' : ''}`}>
            <div className="slide-content">
              <span className="slide-eyebrow">📢 Announcements</span>
              <h2>Now accepting bookings<br />for the summer season!</h2>
              <p>Open Monday – Saturday, 8:00 AM – 6:00 PM</p>
              <button className="cta" onClick={() => navigate('/login')}>Book Now</button>
            </div>
          </div>
        </div>
        <button className="next-btn" onClick={nextSlide}>❯</button>
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
            <p>Metro Manila, Philippines</p>
            <iframe
              src="https://www.openstreetmap.org/export/embed.html?bbox=120.97%2C14.55%2C121.05%2C14.62&layer=mapnik"
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