// A unit's capacity as it is shown anywhere: "0.75 HP", "10.0 HP". The stored value is a short text such as "1.5";
// nothing is rounded or cut. A value that already ends in HP is not given a second one, and no value gives no label.
export function hpLabel(hp) {
  const text = String(hp ?? '').trim();
  if (!text) return '';
  return /\bhp$/i.test(text) ? text : `${text} HP`;
}
