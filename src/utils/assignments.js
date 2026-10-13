import { SERVICE_TYPE } from '../constants/serviceTypes';
// Who is assigned to a booking, for display and for the same staffing rule the server
// enforces (server/utils/assignments.js). A booking that only has `technician` (made before
// teams existed) is read as a solo assignment: nothing is migrated.

const idOf = (x) => (x ? String(x._id || x) : null);
const nameOf = (x) => (x && typeof x === 'object' ? x.name : null);

// [{ team: name|null, lead: {_id,name}, helper: {_id,name}|null }]
export function getAssignments(booking) {
  const list = (booking?.assignments || [])
    .filter((a) => a.lead)
    .map((a) => ({
      team: nameOf(a.team),
      lead: { _id: idOf(a.lead), name: nameOf(a.lead) || 'Technician' },
      helper: a.helper ? { _id: idOf(a.helper), name: nameOf(a.helper) || 'Technician' } : null,
    }));
  if (list.length > 0) return list;
  if (booking?.technician) {
    return [{ team: null, lead: { _id: idOf(booking.technician), name: nameOf(booking.technician) || 'Technician' }, helper: null }];
  }
  return [];
}

// [{ _id, name }] for every technician on the booking (every member of every team).
export function getMembers(booking) {
  const seen = new Map();
  getAssignments(booking).forEach((a) => {
    seen.set(a.lead._id, a.lead.name);
    if (a.helper) seen.set(a.helper._id, a.helper.name);
  });
  return [...seen].map(([_id, name]) => ({ _id, name }));
}

export function getMemberIds(booking) {
  return [...new Set(getAssignments(booking).flatMap((a) => [a.lead._id, a.helper?._id].filter(Boolean)))];
}

// "Tech One (lead), Tech Two (helper)" across every assigned team, or `fallback` when nobody is assigned.
export function getAssignedNames(booking, fallback = 'To be assigned') {
  const assignments = getAssignments(booking);
  if (assignments.length === 0) return fallback;
  return assignments
    .map((a) => (a.helper ? `${a.lead.name} (lead), ${a.helper.name} (helper)` : a.lead.name))
    .join('; ');
}

// Every technician name on the booking, comma separated (for compact lists and calendars).
export function getMemberNames(booking, fallback = 'Unassigned') {
  const names = getAssignments(booking).flatMap((a) => [a.lead.name, a.helper?.name].filter(Boolean));
  return names.length > 0 ? [...new Set(names)].join(', ') : fallback;
}

// How many technicians a service needs: the explicit value, else 1 for a Check-up, else 2.
export function getMinTechnicians(service) {
  if (service?.minTechnicians === 1 || service?.minTechnicians === 2) return service.minTechnicians;
  return service?.serviceType === SERVICE_TYPE.CHECK_UP ? 1 : 2;
}
