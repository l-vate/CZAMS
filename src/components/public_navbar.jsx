import { useEffect, useReducer, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FiMenu, FiX } from 'react-icons/fi';
import { navMenuReducer, isOutsideMenu } from '../utils/navMenu';
import { BRAND_NAME } from '../config/company';
import { NAV_LINKS } from '../config/landingContent';

// At this width and below the links, search and LOG IN fold into a menu opened by a hamburger button (public.css uses the same number).
const DESKTOP_QUERY = '(min-width: 1025px)';
const MENU_ID = 'public-nav-menu';

// The public top bar: logo, brand, the four section links, the search box and LOG IN. `search` is the search box element.
function PublicNavbar({ search, onLogin, initialOpen = false, activeId = '' }) {
  // a soft shadow only once the page has been scrolled
  const [scrolled, setScrolled] = useState(false);
  const [open, dispatch] = useReducer(navMenuReducer, initialOpen);
  const location = useLocation();
  const barRef = useRef(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const closedBy = useRef('');
  const wasOpen = useRef(initialOpen);

  const close = (reason) => { closedBy.current = reason; dispatch(reason); };

  // the route changed
  useEffect(() => { closedBy.current = 'route'; dispatch('route'); }, [location.pathname]);

  // the screen grew past the phone and tablet layout
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => { if (e.matches) { closedBy.current = 'resize'; dispatch('resize'); } };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Escape, and a press outside the menu
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close('escape'); };
    const onPress = (e) => { if (isOutsideMenu(e.target, barRef.current)) close('outside'); };
    // eslint-disable-next-line no-restricted-syntax -- Escape key and outside press: both removed in this effect's cleanup
    document.addEventListener('keydown', onKey);
    // eslint-disable-next-line no-restricted-syntax -- outside press: removed in this effect's cleanup
    document.addEventListener('pointerdown', onPress);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress);
    };
  }, [open]);

  // focus goes into the menu when it opens, and back to the button when the person closed it
  useEffect(() => {
    if (open === wasOpen.current) return undefined;
    wasOpen.current = open;
    if (open) {
      menuRef.current?.querySelector('a, input, button')?.focus();
      return undefined;
    }
    if (['toggle', 'escape', 'link'].includes(closedBy.current)) {
      // a moment later, so the browser's own focus move for a chosen #section link does not take it away again
      const timer = setTimeout(() => buttonRef.current?.focus(), 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toggle = () => { closedBy.current = 'toggle'; dispatch('toggle'); };

  return (
    <header className={`navbar${open ? ' nav-open' : ''}${scrolled ? ' navbar--scrolled' : ''}`} ref={barRef}>
      <div className="nav-left">
        <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="logo" />
        <span className="brand">{BRAND_NAME.toUpperCase()}</span>
      </div>
      <button
        type="button"
        ref={buttonRef}
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls={MENU_ID}
        onClick={toggle}
      >
        {open ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
      </button>
      <div className="nav-right" id={MENU_ID} ref={menuRef}>
        <nav className="nav-links" aria-label="Sections">
          {NAV_LINKS.map((link) => (
            <a
              key={link.id}
              href={`#${link.id}`}
              className={activeId === link.id ? 'is-active' : undefined}
              aria-current={activeId === link.id ? 'location' : undefined}
              onClick={() => close('link')}
            >
              {link.label}
            </a>
          ))}
        </nav>
        {search}
        <button type="button" className="login-btn" onClick={onLogin}>LOG IN</button>
      </div>
    </header>
  );
}

export default PublicNavbar;
