// Which old charge rows the admin payment panel still shows. The old "Distance Based Charge" field is no longer edited: a distance charge is a
// "distance" line in the Scope of works, the one place for it. A booking that already holds a value in the old field and has no distance line
// shows that value as a read-only row (its total does not change); a booking with a distance line shows the charge once, in the scope.
export function legacyDistanceAmount(booking) {
  const amount = Number(booking?.distanceAdjustment) || 0;
  const hasDistanceLine = (booking?.scopeLines || []).some((l) => l.kind === 'distance');
  return amount > 0 && !hasDistanceLine ? amount : null;
}
