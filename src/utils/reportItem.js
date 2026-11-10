// What the Reports list and this page show about one job.
export function toReportItem(booking, reportData) {
  return {
    _id: booking._id,
    bookingId: booking.bookingId,
    service: booking.service?.name || 'Service',
    customer: booking.customer?.name || 'Customer',
    address: booking.address || 'Address not available',
    bookingDate: booking.date
      ? new Date(booking.date).toLocaleDateString()
      : 'Date not available',
    dueDate: booking.date,
    status: reportData ? 'Completed' : 'Pending',
    report: reportData || null,
    isBackJob: !!booking.isBackJob,
    backJob: booking.backJob || null,
  };
}
