import { charactersLeft } from '../constants/inputLimits';

// "123 characters left" under a long notes box. Quiet until the box is getting full, then it is easier to see.
function CharsLeft({ value, max }) {
  const left = charactersLeft(value, max);
  return (
    <small className={`chars-left${left <= Math.round(max * 0.1) ? ' chars-left--low' : ''}`} aria-live="polite">
      {left} {left === 1 ? 'character' : 'characters'} left
    </small>
  );
}

export default CharsLeft;
