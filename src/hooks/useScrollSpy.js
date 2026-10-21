import { useEffect, useState } from 'react';

// Which navigation link is "current" while the visitor scrolls: the section crossing a thin band near the top of the screen wins.
// Every section inside `rootRef` that carries data-nav="<link id>" is watched; a section that has no link of its own (like Why Choose Us)
// names the link it belongs to. Returns the link id, or `initial` before anything has been seen.
export function useScrollSpy(rootRef, initial = 'home') {
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.IntersectionObserver !== 'function') return undefined;
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.target.dataset.nav) setActive(entry.target.dataset.nav);
      });
    }, { rootMargin: '-30% 0px -65% 0px', threshold: 0 });
    root.querySelectorAll('[data-nav]').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [rootRef]);

  return active;
}
