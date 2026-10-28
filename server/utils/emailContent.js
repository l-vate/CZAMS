// What each kind of notification email says around the existing in-app sentence: the headline, the tone (the color of its status accent), a
// plain-text status label that still reads when images and colors are blocked, a short "what happens next" line where there is one, and the
// short preview text shown in the inbox. Subjects, recipients and triggers are not here: this only shapes the email's content.
const { NOTIFICATION_TYPE: T } = require('../constants/notificationTypes');

// tone: green (approved, paid, done), coral (cancelled, declined, refused), amber (pending, action needed), blue (information)
// [headline, tone, status label, what happens next or null, preheader]
const KINDS = {
  [T.BOOKING_CREATED]: ['Booking received', 'amber', 'PENDING CONFIRMATION', 'We will review your booking and confirm it. You will get another email when it is approved.', 'We received your booking and will confirm it soon.'],
  [T.BOOKING_NEW]: ['New booking', 'blue', 'NEW REQUEST', 'Review it, check the technicians, then approve it or contact the customer.', 'A new booking is waiting for review.'],
  [T.BOOKING_APPROVED]: ['Booking approved', 'green', 'APPROVED', 'Our technicians will arrive in the time block you booked. You can follow the status in the app.', 'Your booking is approved.'],
  [T.BOOKING_IN_PROGRESS]: ['Service in progress', 'blue', 'IN PROGRESS', 'We will let you know when the service is completed.', 'The service has started.'],
  [T.BOOKING_COMPLETED]: ['Service completed', 'green', 'COMPLETED', 'You can see your service report and leave feedback in the app.', 'Your service is completed.'],
  [T.BOOKING_CANCELLED]: ['Booking cancelled', 'coral', 'CANCELLED', 'Open the booking to see the details. If a down payment was verified, the refund is handled in the app and you will be told.', 'A booking was cancelled.'],
  [T.PAYMENT_SUBMITTED]: ['Payment proof received', 'amber', 'PAYMENT TO CHECK', 'Open the booking to see the proof and its status.', 'A payment proof was received.'],
  [T.PAYMENT_VERIFIED]: ['Payment verified', 'green', 'PAYMENT VERIFIED', null, 'Your payment was verified.'],
  [T.PAYMENT_REJECTED]: ['Payment needs attention', 'coral', 'PAYMENT REJECTED', 'Open the booking to see why, and send a new proof.', 'Your payment proof needs attention.'],
  [T.CHARGE_UPDATED]: ['Charges updated', 'amber', 'CHARGES UPDATED', 'Open the booking to see the updated total.', 'The charges on your booking changed.'],
  [T.SCOPE_UPDATED]: ['Scope of works updated', 'amber', 'SCOPE UPDATED', 'Open the booking to see the updated scope and total.', 'The scope of works on your booking changed.'],
  [T.QUOTATION_UPDATED]: ['Quotation updated', 'amber', 'QUOTATION UPDATED', 'Open the booking to read the updated terms.', 'The quotation on your booking changed.'],
  [T.UNIT_REQUEST_RESOLVED]: ['Your unit is confirmed', 'green', 'UNIT CONFIRMED', 'The unit price is now part of your total. Open the booking to see it.', 'The owner confirmed your unit.'],
  [T.UNIT_REQUEST_DECLINED]: ['We cannot supply this unit', 'coral', 'NOT AVAILABLE', 'Your booking has not been cancelled. You can cancel it in the app, or contact us to choose another unit.', 'We do not have the unit you chose.'],
  [T.DISCOUNT_REQUESTED]: ['Discount requested', 'amber', 'REVIEW NEEDED', 'Review the uploaded ID, then approve or reject the discount.', 'A discount request needs review.'],
  [T.DISCOUNT_APPROVED]: ['Discount approved', 'green', 'DISCOUNT APPROVED', 'The discount is applied to your total.', 'Your discount was approved.'],
  [T.DISCOUNT_REJECTED]: ['Discount not approved', 'coral', 'NOT APPROVED', 'Open the booking to see the reason.', 'Your discount was not approved.'],
  [T.REFUND_REQUESTED]: ['Refund requested', 'amber', 'REFUND REQUESTED', 'Open the booking to review and process the refund.', 'A refund request is waiting.'],
  [T.REFUND_FLAGGED]: ['Refund flagged', 'coral', 'REFUND FLAGGED', 'Open the booking to follow up.', 'A customer flagged a refund.'],
  [T.REFUND_PROCESSED]: ['Refund processed', 'green', 'REFUND SENT', 'Please confirm in the app once the money arrives.', 'Your refund was sent.'],
  [T.REFUND_REJECTED]: ['Refund not approved', 'coral', 'REFUND NOT APPROVED', 'Open the booking to see the reason. You can contact us if you think this is a mistake.', 'Your refund request was not approved.'],
  [T.REFUND_CONFIRMED]: ['Refund confirmed', 'green', 'REFUND CONFIRMED', null, 'A customer confirmed receiving the refund.'],
  [T.RESCHEDULE_REQUESTED]: ['Reschedule requested', 'amber', 'RESCHEDULE REQUESTED', 'Open the booking to approve or deny it.', 'A reschedule request is waiting.'],
  [T.RESCHEDULE_RECEIVED]: ['Reschedule request received', 'blue', 'REQUEST RECEIVED', 'We will review it and let you know.', 'We received your reschedule request.'],
  [T.RESCHEDULE_APPROVED]: ['Schedule changed', 'green', 'SCHEDULE CHANGED', 'Please note the new date and time.', 'Your schedule was changed.'],
  [T.RESCHEDULE_DENIED]: ['Reschedule not approved', 'coral', 'NOT APPROVED', 'Your booking stays on its current schedule.', 'Your reschedule request was not approved.'],
  [T.JOB_ASSIGNED]: ['New job assigned', 'blue', 'NEW JOB', 'Open the job to see the schedule and the details.', 'You were assigned to a job.'],
  [T.JOB_UNASSIGNED]: ['Job unassigned', 'amber', 'JOB REMOVED', 'You no longer need to attend this job.', 'You were taken off a job.'],
  [T.DISRUPTION_REPORTED]: ['Service disrupted', 'coral', 'SERVICE DISRUPTED', 'Open the booking to reschedule it.', 'A service was disrupted.'],
  [T.DISRUPTION_NOTICE]: ['Service disrupted', 'coral', 'SERVICE DISRUPTED', 'We will contact you with a new schedule.', 'Your service was disrupted.'],
  [T.DISRUPTION_RESCHEDULED]: ['Service rescheduled', 'blue', 'RESCHEDULED', 'Please note the new date and time.', 'Your service was rescheduled.'],
  [T.EXTENSION_REQUESTED]: ['Extra day requested', 'amber', 'EXTRA DAY REQUESTED', 'Open the booking to approve or deny it.', 'An extra day was requested.'],
  [T.EXTENSION_APPROVED]: ['Extra day approved', 'green', 'EXTRA DAY APPROVED', 'The job continues on the approved day.', 'An extra day was approved.'],
  [T.EXTENSION_DENIED]: ['Extra day not approved', 'coral', 'NOT APPROVED', null, 'An extra day was not approved.'],
  [T.BACKJOB_FILED]: ['Back job filed', 'amber', 'BACK JOB FILED', 'Open it to review the claim.', 'A back job was filed.'],
  [T.BACKJOB_RECEIVED]: ['Back job request received', 'blue', 'REQUEST RECEIVED', 'We will check your warranty and get back to you.', 'We received your back job request.'],
  [T.BACKJOB_DECIDED]: ['Back job decision', 'blue', 'DECISION MADE', 'Open the booking to see the decision.', 'A decision was made on your back job.'],
  [T.SERVICE_REMINDER]: ['Time for your next service', 'blue', 'REMINDER', 'You can book your next service in the app.', 'It is time for your next service.'],
  [T.CHAT_MESSAGE]: ['New message', 'blue', 'NEW MESSAGE', 'Open the app to read it and reply.', 'You have a new message.'],
  [T.INSTRUCTIONS_UPDATED]: ['Job instructions updated', 'blue', 'INSTRUCTIONS UPDATED', 'Open the job to read them.', 'The instructions for a job were updated.'],
  [T.REPORT_REMOVED]: ['Service report removed', 'amber', 'ACTION NEEDED', 'Open the booking to see what is needed.', 'A service report was removed.'],
  [T.TECHNICIAN_DEACTIVATED]: ['Technician deactivated', 'amber', 'ACTION NEEDED', 'Assign someone else to the affected jobs.', 'A technician was deactivated.'],
};

const FALLBACK = ['Update from CZAMS', 'blue', 'UPDATE', null, 'There is an update on your account.'];

function contentOf(type) {
  const [headline, tone, label, next, preheader] = KINDS[type] || FALLBACK;
  return { headline, tone, label, next, preheader };
}

module.exports = { KINDS, contentOf };
