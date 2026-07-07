import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

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
          <div className="stat">
            <h3>15+</h3>
            <p>Years of Experience</p>
          </div>
          <div className="stat">
            <h3>2,000+</h3>
            <p>Units Serviced</p>
          </div>
          <div className="stat">
            <h3>500+</h3>
            <p>Happy Clients</p>
          </div>
          <div className="stat">
            <h3>4.9★</h3>
            <p>Average Rating</p>
          </div>
        </div>
      </section>

      <div className="vent-divider" />

      {/* ============ SERVICES ============ */}
      <section id="services" className="services">
        <span className="section-eyebrow">What We Offer</span>
        <h2 className="section-title">Our Services</h2>
        <p className="section-subtitle">Base price only — final cost may vary depending on scope and materials.</p>
        <div className="cards">
          <div className="card">
            <span className="card-icon">🧹</span>
            <h3>Aircon Cleaning</h3>
            <p>Thorough deep-cleaning for fresh, healthy, efficient air circulation.</p>
            <span className="card-price">From ₱650</span>
          </div>
          <div className="card">
            <span className="card-icon">🔧</span>
            <h3>Repair & Diagnostics</h3>
            <p>Fast diagnosis and dependable repairs for all unit types and brands.</p>
            <span className="card-price">From ₱1,200</span>
          </div>
          <div className="card">
            <span className="card-icon">❄️</span>
            <h3>New Installation</h3>
            <p>Professional installation with proper setup, testing, and cleanup.</p>
            <span className="card-price">From ₱3,500</span>
          </div>
          <div className="card">
            <span className="card-icon">🛡️</span>
            <h3>Preventive Check-Up</h3>
            <p>Scheduled maintenance to avoid costly breakdowns before they happen.</p>
            <span className="card-price">From ₱550</span>
          </div>
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
          <div className="card">🪟<br />Window Type</div>
          <div className="card">🔩<br />Split Type</div>
          <div className="card">⚡<br />Inverter</div>
          <div className="card">🟦<br />Cassette</div>
          <div className="card">🏢<br />Floor Mounted</div>
        </div>
      </section>

      <div className="vent-divider" />

      {/* ============ HOW IT WORKS ============ */}
      <section className="how">
        <span className="section-eyebrow">The Process</span>
        <h2 className="section-title">How It Works</h2>
        <p className="section-subtitle">From booking to post-service support — we've made it simple.</p>
        <div className="steps">
          <div className="step">
            <div className="step-number">01</div>
            <h3>Book an Appointment</h3>
            <p>Schedule online in minutes. Choose your service, date, time, and preferred technician.</p>
          </div>
          <div className="step">
            <div className="step-number">02</div>
            <h3>Onsite Assessment</h3>
            <p>Our technician arrives, inspects your unit, and recommends the right solution.</p>
          </div>
          <div className="step">
            <div className="step-number">03</div>
            <h3>Service & Testing</h3>
            <p>We complete the job professionally and test the unit before we leave.</p>
          </div>
          <div className="step">
            <div className="step-number">04</div>
            <h3>Post-Service Support</h3>
            <p>30-day service warranty. We stay available after the job is done.</p>
          </div>
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