import { useEffect, useRef, useState } from 'react';

// How the search box in the top bar of the admin and customer pages behaves (one place, so both layouts agree).
//   - Nothing is filtered until at least MIN_SEARCH_CHARS letters are typed, and only after a short pause (SEARCH_DELAY_MS), so a single letter, or each key of
//     a word as it is being typed, does not reshuffle the list. Going back under the minimum, or emptying the box, shows the whole list again at once.
//   - clear() empties the box AND the search the page is using, so closing the box or pressing Escape really leaves the search (it used to hide the box and
//     keep the list filtered).
// `searchValue` is what the page currently filters by; `onSearchChange` tells the page a new search. The page sees only the applied text.
export const MIN_SEARCH_CHARS = 2;
export const SEARCH_DELAY_MS = 300;

// What the page should filter by for what is typed: the trimmed text once it is long enough, otherwise nothing.
export function appliedSearch(text) {
  const trimmed = String(text || '').trim();
  return trimmed.length >= MIN_SEARCH_CHARS ? trimmed : '';
}

export function useTopbarSearch(searchValue, onSearchChange) {
  const [text, setText] = useState(searchValue || '');
  const applied = useRef(appliedSearch(searchValue));
  const latest = useRef(onSearchChange);
  useEffect(() => { latest.current = onSearchChange; });

  // the page changed the search itself (for example a "clear filters" button): the box follows
  useEffect(() => {
    const incoming = searchValue || '';
    if (incoming !== applied.current) {
      applied.current = incoming;
      setText(incoming);
    }
  }, [searchValue]);

  useEffect(() => {
    const next = appliedSearch(text);
    if (next === applied.current) return undefined;
    const id = setTimeout(() => {
      applied.current = next;
      latest.current?.(next);
    }, next === '' ? 0 : SEARCH_DELAY_MS);
    return () => clearTimeout(id);
  }, [text]);

  const clear = () => {
    setText('');
    if (applied.current !== '') {
      applied.current = '';
      latest.current?.('');
    }
  };

  return { text, setText, clear, hasText: text !== '' };
}
