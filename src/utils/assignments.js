import { SERVICE_TYPE } from '../constants/serviceTypes.js';
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

// "Tech One, Tech Two" for every technician on the booking, or `fallback` when nobody is assigned.
export function getAssignedNames(booking, fallback = 'To be assigned') {
  return getMemberNames(booking, fallback);
}

// Every technician name on the booking, comma separated (for compact lists and calendars).
export function getMemberNames(booking, fallback = 'Unassigned') {
  const names = getAssignments(booking).flatMap((a) => [a.lead.name, a.helper?.name].filter(Boolean));
  return names.length > 0 ? [...new Set(names)].join(', ') : fallback;
}

// Mirrors getMinTechnicians in server/utils/assignments.js: solo only for a check-up, or a survey marked solo
// on a service of type Other; every other service needs a lead and a helper.
export function getMinTechnicians(service) {
  if (service?.minTechnicians === 2) return 2;
  const type = service?.serviceType;
  if (type === SERVICE_TYPE.CHECK_UP) return 1;
  if (service?.minTechnicians === 1 && type === SERVICE_TYPE.OTHER) return 1;
  return 2;
}

// ---- the editable list in the admin assignment panel

// A copy of `list` with the item at `from` moved to `to` (the first place is the primary technician). Out of range returns the list unchanged.
export function moveItem(list, from, to) {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

// Whether a technician can be taken off the list. Never the last one. Once a booking is past Pending, never below the service's minimum
// (the server refuses it: "choose another technician instead"); on a Pending booking the minimum is only checked at approval.
export function canRemoveTechnician({ count, service, status }) {
  if (count <= 1) return false;
  if (status === 'Pending') return true;
  return count > getMinTechnicians(service);
}
