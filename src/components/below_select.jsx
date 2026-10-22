import { useEffect, useRef, useState } from 'react';

// A drop-down whose choices always open directly below the box. A browser's own select decides for itself where its list opens (and
// opens it upward near the bottom of the screen); this one is drawn by the page, so the list stays under the box and scrolls inside
// itself. Same look as .bs-select. Options are [{ value, label }]; the one with value '' is the empty choice shown as the placeholder.
// Keys: Arrow Up/Down move, Enter or Space choose, Escape closes, a letter jumps to the next choice that starts with it.
function BelowSelect({ value, options, onChange, ariaLabel, className = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    // eslint-disable-next-line no-restricted-syntax -- outside click: removed in this effect's cleanup
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  // keep the highlighted choice in view inside the list
  useEffect(() => {
    if (open) listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const openList = () => { setActive(selectedIndex); setOpen(true); };
  const choose = (i) => { onChange(options[i].value); setOpen(false); };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { openList(); return; }
      setActive((i) => Math.min(options.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1))));
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open) choose(active); else openList();
      return;
    }
    if (e.key.length === 1 && /\S/.test(e.key)) {
      const letter = e.key.toLowerCase();
      const from = open ? active + 1 : selectedIndex + 1;
      const next = [...options.keys()].map((n) => (n + from) % options.length).find((n) => options[n].label.toLowerCase().startsWith(letter));
      if (next === undefined) return;
      if (open) setActive(next); else onChange(options[next].value);
    }
  };

  return (
    <div className={`below-select ${className}`} ref={wrapRef}>
      <button
        type="button"
        className="bs-select below-select-box"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        {selected?.label}
      </button>
      {open && (
        <ul className="below-select-list" role="listbox" aria-label={ariaLabel} ref={listRef}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`below-select-option${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(i); }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BelowSelect;
