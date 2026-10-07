import { getMembers } from './assignments';
import { BOOKING_STATUS } from '../constants/bookingStatus';

// Technician Performance Analytics: completedJobs + delays come from Booking
// (technician ref, status, disruption, extensionRequest); avgTime comes from
// Report.laborHours (a separate collection, joined here by technician id).
// "Delays" = booking.disruption.status !== 'None' OR
// booking.extensionRequest.status === 'Approved' (Service Disruption & Extension
// Module's existing fields). Missed assignments are intentionally omitted - there's
// no existing field that reliably tracks a technician failing to show up for an
// assignment, so this would have to be invented rather than computed.
export function buildTechnicianStats(bookings, reports) {
    // Rule used everywhere (analytics, reports, charts, reviews): a job counts for EVERY
    // technician on it, the lead and the helper of each team alike. So a completed job,
    // its delays and its feedback each count once for each member, and the labor hours the
    // lead entered on the service report are credited to every member for that job.
    const laborByBooking = {};
    reports.forEach((r) => {
        if (typeof r.laborHours === 'number') laborByBooking[r.bookingId] = r.laborHours;
    });

    const map = {};
    bookings.forEach((b) => {
        const hasDelay =
            (b.disruption?.status && b.disruption.status !== 'None') ||
            b.extensionRequest?.status === 'Approved';

        getMembers(b).forEach((tech) => {
            if (!map[tech._id]) {
                map[tech._id] = { id: tech._id, name: tech.name || 'Unknown', completedJobs: 0, delays: 0, laborHours: [] };
            }
            if (b.status === BOOKING_STATUS.COMPLETED) {
                map[tech._id].completedJobs += 1;
                if (laborByBooking[b.bookingId] !== undefined) map[tech._id].laborHours.push(laborByBooking[b.bookingId]);
            }
            if (hasDelay) map[tech._id].delays += 1;
        });
    });

    return Object.values(map)
        .map((t) => ({
            ...t,
            avgTime: t.laborHours.length
                ? t.laborHours.reduce((sum, h) => sum + h, 0) / t.laborHours.length
                : null,
        }))
        .sort((a, b) => b.completedJobs - a.completedJobs);
}
