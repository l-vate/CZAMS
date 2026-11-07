// How many characters each text box takes. The numbers live in server/constants/inputLimits.json, which the server checks against too,
// so a box stops accepting characters at the same number the server refuses at. A limit only applies to what is typed from now on:
// something already saved is never cut or refused for its length.
import limits from '../../server/constants/inputLimits.json';

export const LIMITS = limits;

// The small "N left" hint under a long notes box: how many characters can still be typed (never below 0).
export const charactersLeft = (value, max) => Math.max(0, max - String(value ?? '').length);
