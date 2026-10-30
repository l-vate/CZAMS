import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { routeScrollAction, resetScroll, scrollToHash } from '../utils/scrollReset';

// Mounted once inside the router: a page opened from another one starts at the top instead of keeping the old scroll position.
// A query string change alone (filters, sort, tabs) and the Back and Forward buttons are left alone; a #section goes to its element.
function ScrollToTop() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const previous = useRef(location);

  useEffect(() => {
    const prev = previous.current;
    previous.current = location;
    if (prev === location) return;
    const action = routeScrollAction(prev, location, navigationType);
    if (action === 'top') resetScroll();
    // the page may draw its sections a moment after the route changes, so wait one frame before looking for the element
    if (action === 'hash') requestAnimationFrame(() => { if (!scrollToHash(location.hash)) resetScroll(); });
  }, [location, navigationType]);

  return null;
}

export default ScrollToTop;
