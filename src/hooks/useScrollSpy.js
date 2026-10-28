import { useEffect, useState } from 'react';

// Which navigation link is "current" while the visitor scrolls: the last section whose top has passed a line a third of the way down the
// screen wins, so a short section (like About Us) is picked up as soon as it reaches that line, and a section that is already in view when
// the page opens or reloads is picked too. Every section inside `rootRef` that carries data-nav="<link id>" is watched; a section that
// has no link of its own (like Why Choose Us) names the link it belongs to. Returns the link id, or `initial` above the first section.
export function useScrollSpy(rootRef, initial = 'home') {
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const sections = Array.from(root.querySelectorAll('[data-nav]'));
    let frame = 0;

    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.35;
      let current = initial;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= line) current = section.dataset.nav;
      }
      // the very bottom of the page always counts as the last section, even when that section is too short to reach the line
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      if (atBottom && sections.length > 0) current = sections[sections.length - 1].dataset.nav;
      setActive(current);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [rootRef, initial]);

  return active;
}
