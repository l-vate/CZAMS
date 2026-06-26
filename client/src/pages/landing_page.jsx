import { useState } from 'react';

function LandingPage() {
  const [current, setCurrent] = useState(0);

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
          <input type="text" placeholder="Search..." className="search" />
          <nav className="nav-links">
            <a href="#home">HOME</a>
            <a href="#about">ABOUT US</a>
            <a href="#services">SERVICES</a>
          </nav>
          <button className="login-btn">LOG IN</button>
        </div>
      </header>

      {/* ============ HERO (Slider) ============ */}
      <section id="home" className="hero">
        <div className="slides">
          {/* Slide 1: main hero */}
          <div className={`slide slide-1 ${current === 0 ? 'active' : ''}`}>
            <div className="slide-content">
              <h1>Cool comfort, clean air, delivered to your door.</h1>
              <p>Trusted aircon maintenance since 2009.</p>
              <button className="cta">Book a Service</button>
            </div>
          </div>

          {/* Slide 2: announcement board */}
          <div className={`slide slide-2 ${current === 1 ? 'active' : ''}`}>
            <div className="slide-content">
              <h2>📢 Announcements</h2>
              <p>Now accepting bookings for the summer season!</p>
              <p>Open Monday – Saturday, 8:00 AM – 6:00 PM</p>
            </div>
          </div>
        </div>

        {/* Next button */}
        <button className="next-btn" onClick={nextSlide}>❯</button>
      </section>

      {/* ============ ABOUT US ============ */}
      <section id="about" className="about">
        <h2>About Us</h2>
        <p>
          Cooling Zone has been serving homes and businesses since 2009. With over
          15 years of experience, we deliver reliable aircon cleaning, repair,
          installation, and preventive maintenance services.
        </p>
        <div className="stats">
          <div className="stat">
            <h3>15+</h3>
            <p>Years of Experience</p>
          </div>
        </div>
      </section>

      {/* ============ SERVICES ============ */}
      <section id="services" className="services">
        <h2>Our Services</h2>
        <div className="cards">
          <div className="card"><h3>Aircon Cleaning</h3><p>Thorough cleaning for fresh, healthy air.</p></div>
          <div className="card"><h3>Repair & Diagnostics</h3><p>Fast diagnosis and reliable repairs.</p></div>
          <div className="card"><h3>New Installation</h3><p>Professional installation of new units.</p></div>
          <div className="card"><h3>Preventive Check-Up</h3><p>Regular check-ups to avoid breakdowns.</p></div>
        </div>
      </section>

      {/* ============ UNIT TYPES ============ */}
      <section className="units">
        <h2>All Major Unit Types Covered</h2>
        <div className="cards">
          <div className="card">Window Type</div>
          <div className="card">Split Type</div>
          <div className="card">Inverter</div>
          <div className="card">Cassette</div>
          <div className="card">Floor Mounted</div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="how">
        <h2>How It Works?</h2>
        <div className="steps">
          <div className="step"><h3>1. Book an Appointment</h3><p>Reach out and schedule a visit.</p></div>
          <div className="step"><h3>2. Onsite Assessment</h3><p>We inspect and recommend solutions.</p></div>
          <div className="step"><h3>3. Installation & Testing</h3><p>Service is done and tested.</p></div>
          <div className="step"><h3>4. Post-Service Support</h3><p>We stay available after the job.</p></div>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="footer">
        <div className="footer-grid">
          <div>
            <h4>Opening Hours</h4>
            <p>Mon – Sat: 8:00 AM – 6:00 PM</p>
            <p>Sunday: Closed</p>
          </div>
          <div>
            <h4>Contact Us</h4>
            <p>Phone: +63 900 000 0000</p>
            <p>Email: info@coolingzone.com</p>
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