// When the chat list moves on its own. The list scrolls to the bottom for a new message only if the reader was already near the bottom (or
// they just sent a message); if they scrolled up to read, it stays where it is and a "New messages" button offers the way down.
export const NEAR_BOTTOM_PX = 80;

// True when the list is scrolled to within `threshold` pixels of its end.
export function isNearBottom(el, threshold = NEAR_BOTTOM_PX) {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
}

// What to do after the messages changed. `arrived`: the newest message is not the one shown before (a refresh with nothing new changes
// nothing). Returns 'bottom' (scroll down), 'notify' (show the New messages button) or 'none'.
export function scrollDecision({ arrived, wasNearBottom, sentByMe }) {
  if (sentByMe) return 'bottom';
  if (!arrived) return 'none';
  return wasNearBottom ? 'bottom' : 'notify';
}
