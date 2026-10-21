import { useLayoutEffect } from 'react';

// Scroll reveal for the landing page: one IntersectionObserver for every element marked data-reveal inside `rootRef`.
//
// Nothing is hidden by default. An element is only given the "reveal-armed" (hidden, shifted down 16px) state here, in JavaScript, and
// only when it is below the fold, so the content is visible without JavaScript and never flashes invisible: whatever is already on screen
// is shown at once, before the first paint. With prefers-reduced-motion, or a browser without IntersectionObserver, nothing is armed.
// Elements in a group get a small stagger through the --reveal-i custom property (set in the markup).
export function useReveal(rootRef) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof window.IntersectionObserver !== 'function') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const items = [...root.querySelectorAll('[data-reveal]')];
    const below = items.filter((el) => el.getBoundingClientRect().top > window.innerHeight * 0.92);
    below.forEach((el) => el.classList.add('reveal-armed'));

    // Once an element has faded in, its reveal classes are removed again after the transition, so the card's own hover styles and
    // transitions are the only ones left on it.
    const timers = [];
    const observer = new window.IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        el.classList.remove('reveal-armed');
        el.classList.add('reveal-in');
        timers.push(setTimeout(() => el.classList.remove('reveal-in'), 1200));
        observer.unobserve(el);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    below.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
      below.forEach((el) => el.classList.remove('reveal-armed', 'reveal-in'));
    };
  }, [rootRef]);
}
