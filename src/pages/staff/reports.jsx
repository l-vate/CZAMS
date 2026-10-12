import { useState, useEffect, useRef } from 'react';
import StaffLayout from './staff_layout';
import { FiClock, FiFileText, FiX, FiUser, FiMapPin } from 'react-icons/fi';
import SignaturePad from '../../components/signature_pad';
import ServiceReportPdfModal from '../../components/service_report_pdf_modal';
import { getFilterPillStyle } from '../../utils/statusColors';
import { ApiError, withFallback } from '../../services/apiClient';
import LoadError from '../../components/load_error';
import { listTechnicianJobs } from '../../services/bookingService';
import { getReportForBooking, submitReport } from '../../services/reportService';
import { API_BASE } from '../../config/api';
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from '../../constants/reportPhoto';
import { BOOKING_STATUS } from '../../constants/bookingStatus';


function SubmitReportModal({ reportItem, onClose, onSubmit, submitting, serverError }) {
  const [form, setForm] = useState({
    workSummary: '',
    partsUsed: '',
    recommendations: '',
    laborHours: '',
    issueResolution: 'Partial',
    followUpRequired: false,
    followUpDate: '',
    notes: '',
    preExistingIssueFlagged: false,
    preExistingIssueDescription: '',
    clientConsentSignedName: '',
    clientConsentSignatureDataUrl: null,
  });
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  // set at once on the first click, before React re-renders, so a fast double click sends one report
  const sendingRef = useRef(false);

  const handlePhoto = (e) => {
    const file = e.target.files[0] || null;
    if (file && !PHOTO_MIME_TYPES.includes(file.type)) {
      setError('The photo must be a JPG or PNG image.');
      e.target.value = '';
      return;
    }
    if (file && file.size > PHOTO_MAX_BYTES) {
      setError('The photo must be 5 MB or smaller.');
      e.target.value = '';
      return;
    }
    setError('');
    setPhoto(file);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === 'checkbox' ? checked : value,
    });
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.workSummary.trim()) {
      setError('Please provide a summary of the work done.');
      return;
    }
    if (form.laborHours !== '' && !(Number(form.laborHours) >= 0 && Number(form.laborHours) <= 24)) {
      setError('Labor hours must be a number from 0 to 24.');
      return;
    }
    if (form.followUpRequired && !form.followUpDate) {
      setError('Please specify a follow-up date if follow-up is required.');
      return;
    }
    if (form.preExistingIssueFlagged && !form.preExistingIssueDescription.trim()) {
      setError('Please describe the pre-existing issue.');
      return;
    }
    // A photo of the signed paper form replaces the on-screen signature and name.
    if (!photo && !form.clientConsentSignedName.trim()) {
      setError("Please enter the client's full name, or attach a photo of the signed paper form.");
      return;
    }
    if (!photo && !form.clientConsentSignatureDataUrl) {
      setError("The client's signature is required to finalize this report, or attach a photo of the signed paper form.");
      return;
    }
    if (sendingRef.current) return;
    sendingRef.current = true;
    Promise.resolve(onSubmit(form, photo)).finally(() => { sendingRef.current = false; });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Submit Service Report</h4>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="report-booking-info staff-reports-x1">
          <p className="tech-job-detail-booking">
            {reportItem.service} · {reportItem.bookingId}
          </p>
          <div className="tech-job-detail-grid">
            {reportItem.customer && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiUser /></span>
                <div>
                  <p className="confirmation-detail-label">Customer</p>
                  <p className="confirmation-detail-value">{reportItem.customer}</p>
                </div>
              </div>
            )}
            {reportItem.address && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Location</p>
                  <p className="confirmation-detail-value">{reportItem.address}</p>
                </div>
              </div>
            )}
            {reportItem.bookingDate && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiClock /></span>
                <div>
                  <p className="confirmation-detail-label">Service Date</p>
                  <p className="confirmation-detail-value">{reportItem.bookingDate}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="tech-profile-edit-form staff-reports-x2">
          {/* Work Summary */}
          <div className="form-group">
            <label htmlFor="workSummary" className="tech-stat-label">
              Work Summary <span className="staff-reports-x3">*</span>
            </label>
            <textarea
              id="workSummary"
              name="workSummary"
              className="tech-search-input staff-reports-x4"
              placeholder="Describe the work performed, diagnosis, and actions taken..."
              value={form.workSummary}
              onChange={handleChange}
            />
          </div>

          {/* Labor Hours & Resolution */}
          <div className="staff-reports-x5">
            <div className="form-group">
              <label htmlFor="laborHours" className="tech-stat-label">
                Labor Hours <span className="staff-reports-x6">(Optional)</span>
              </label>
              <input
                type="number"
                id="laborHours"
                name="laborHours"
                className="tech-search-input"
                placeholder="e.g. 2.5"
                step="0.5"
                min="0"
                max="24"
                value={form.laborHours}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="issueResolution" className="tech-stat-label">
                Resolution
              </label>
              <select
                id="issueResolution"
                name="issueResolution"
                className="tech-search-input"
                value={form.issueResolution}
                onChange={handleChange}
              >
                <option value="Complete">Complete</option>
                <option value="Partial">Partial</option>
                <option value="Unresolved">Unresolved</option>
              </select>
            </div>
          </div>

          {/* Parts Used */}
          <div className="form-group">
            <label htmlFor="partsUsed" className="tech-stat-label">
              Parts Used <span className="staff-reports-x6">(Optional)</span>
            </label>
            <input
              type="text"
              id="partsUsed"
              name="partsUsed"
              className="tech-search-input"
              placeholder="e.g. 1x capacitor, refrigerant top-up"
              value={form.partsUsed}
              onChange={handleChange}
            />
          </div>

          {/* Follow-up Checkbox */}
          <div className="form-group staff-reports-x7">
            <input
              type="checkbox"
              id="followUpRequired"
              name="followUpRequired"
              checked={form.followUpRequired}
              onChange={handleChange}
              className="staff-reports-x8"
            />
            <label htmlFor="followUpRequired" className="tech-stat-label staff-reports-x9">
              Follow-up service required
            </label>
          </div>

          {/* Conditional Follow-up Date */}
          {form.followUpRequired && (
            <div className="form-group">
              <label htmlFor="followUpDate" className="tech-stat-label">
                Follow-up Date <span className="staff-reports-x3">*</span>
              </label>
              <input
                type="date"
                id="followUpDate"
                name="followUpDate"
                className="tech-search-input"
                value={form.followUpDate}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Recommendations */}
          <div className="form-group">
            <label htmlFor="recommendations" className="tech-stat-label">
              Recommendations <span className="staff-reports-x6">(Optional)</span>
            </label>
            <textarea
              id="recommendations"
              name="recommendations"
              className="tech-search-input staff-reports-x10"
              placeholder="Preventive maintenance tips, safety notes..."
              value={form.recommendations}
              onChange={handleChange}
            />
          </div>

          {/* Additional Notes */}
          <div className="form-group">
            <label htmlFor="notes" className="tech-stat-label">
              Additional Notes <span className="staff-reports-x6">(Optional)</span>
            </label>
            <textarea
              id="notes"
              name="notes"
              className="tech-search-input staff-reports-x10"
              placeholder="Any other relevant details..."
              value={form.notes}
              onChange={handleChange}
            />
          </div>

          {/* Pre-existing Issue Checkbox */}
          <div className="form-group staff-reports-x7">
            <input
              type="checkbox"
              id="preExistingIssueFlagged"
              name="preExistingIssueFlagged"
              checked={form.preExistingIssueFlagged}
              onChange={handleChange}
              className="staff-reports-x8"
            />
            <label htmlFor="preExistingIssueFlagged" className="tech-stat-label staff-reports-x9">
              Unit had a pre-existing issue or sign of a problem, unrelated to this job
            </label>
          </div>

          {/* Conditional Pre-existing Issue Description */}
          {form.preExistingIssueFlagged && (
            <div className="form-group">
              <label htmlFor="preExistingIssueDescription" className="tech-stat-label">
                Describe what you found <span className="staff-reports-x3">*</span>
              </label>
              <textarea
                id="preExistingIssueDescription"
                name="preExistingIssueDescription"
                className="tech-search-input staff-reports-x10"
                placeholder="e.g. Compressor already showing signs of wear before we started..."
                value={form.preExistingIssueDescription}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Client Consent + E-Signature */}
          <div className="form-group">
            <label className="tech-stat-label">
              Client Consent &amp; Signature <span className="staff-reports-x3">*</span>
            </label>
            <p className="staff-reports-x11">
              Have the client review this report and sign below before submitting.
            </p>
            <input
              type="text"
              name="clientConsentSignedName"
              className="tech-search-input staff-reports-x12"
              placeholder="Client's full name"
              value={form.clientConsentSignedName}
              onChange={handleChange}
            />
            <SignaturePad
              onChange={(dataUrl) => setForm({ ...form, clientConsentSignatureDataUrl: dataUrl })}
            />
          </div>

          <div className="form-group">
            <label className="tech-stat-label" htmlFor="signed-form-photo">
              Photo of signed paper form <span className="ma-label-hint">(Optional, JPG or PNG, up to 5 MB)</span>
            </label>
            <p className="staff-reports-x11">
              With a photo attached, the signature and name above are no longer required.
            </p>
            <input id="signed-form-photo" type="file" accept="image/jpeg,image/png" onChange={handlePhoto} />
          </div>

          {(error || serverError) && (
            <p className="staff-reports-x13" role="alert">{error || serverError}</p>
          )}

          <div className="staff-reports-x14">
            <button
              type="button"
              className="tech-sort-btn"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tech-sort-btn staff-reports-x15"
              disabled={submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ViewReportModal({ reportItem, onClose }) {
  const { report } = reportItem;
  const [showPdf, setShowPdf] = useState(false);

  const getResolutionStyle = (res) => {
    switch (res) {
      case 'Complete':
        return 'tech-status-completed';
      case 'Partial':
        return 'tech-status-in-progress';
      default:
        return 'tech-status-in-progress';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card tech-job-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Service Report</h4>
          <button className="modal-close-btn" onClick={onClose}><FiX /></button>
        </div>

        <div className="report-booking-info staff-reports-x1">
          <p className="tech-job-detail-booking">
            {reportItem.service} · {reportItem.bookingId}
          </p>
          <div className="tech-job-detail-grid">
            {reportItem.customer && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiUser /></span>
                <div>
                  <p className="confirmation-detail-label">Customer</p>
                  <p className="confirmation-detail-value">{reportItem.customer}</p>
                </div>
              </div>
            )}
            {reportItem.address && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiMapPin /></span>
                <div>
                  <p className="confirmation-detail-label">Location</p>
                  <p className="confirmation-detail-value">{reportItem.address}</p>
                </div>
              </div>
            )}
            {reportItem.bookingDate && (
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiClock /></span>
                <div>
                  <p className="confirmation-detail-label">Service Date</p>
                  <p className="confirmation-detail-value">{reportItem.bookingDate}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="tech-job-detail-grid staff-reports-x16">
          {/* Work Summary */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiFileText /></span>
            <div>
              <p className="confirmation-detail-label">Work Summary</p>
              <p className="confirmation-detail-value">{report.workSummary}</p>
            </div>
          </div>

          {/* Labor Hours */}
          {report.laborHours > 0 && (
            <div className="tech-job-detail-cell">
              <span className="confirmation-detail-icon"><FiClock /></span>
              <div>
                <p className="confirmation-detail-label">Labor Hours</p>
                <p className="confirmation-detail-value">{report.laborHours} hrs</p>
              </div>
            </div>
          )}

          {/* Issue Resolution */}
          {report.issueResolution && (
            <div className="tech-job-detail-cell">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Resolution</p>
                <span className={`tech-job-status-badge ${getResolutionStyle(report.issueResolution)}`}>
                  {report.issueResolution}
                </span>
              </div>
            </div>
          )}

          {/* Parts Used */}
          {report.partsUsed && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Parts Used</p>
                <p className="confirmation-detail-value">{report.partsUsed}</p>
              </div>
            </div>
          )}

          {/* Follow-up Required */}
          {report.followUpRequired && (
            <>
              <div className="tech-job-detail-cell">
                <span className="confirmation-detail-icon"><FiFileText /></span>
                <div>
                  <p className="confirmation-detail-label">Follow-up</p>
                  <p className="confirmation-detail-value">Yes Required</p>
                </div>
              </div>
              {report.followUpDate && (
                <div className="tech-job-detail-cell">
                  <span className="confirmation-detail-icon"><FiClock /></span>
                  <div>
                    <p className="confirmation-detail-label">Follow-up Date</p>
                    <p className="confirmation-detail-value">
                      {new Date(report.followUpDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Recommendations */}
          {report.recommendations && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Recommendations</p>
                <p className="confirmation-detail-value">{report.recommendations}</p>
              </div>
            </div>
          )}

          {/* Additional Notes */}
          {report.notes && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Additional Notes</p>
                <p className="confirmation-detail-value">{report.notes}</p>
              </div>
            </div>
          )}

          {/* Pre-existing Issue */}
          {report.preExistingIssue?.flagged && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiFileText /></span>
              <div>
                <p className="confirmation-detail-label">Pre-existing Issue Flagged</p>
                <p className="confirmation-detail-value">{report.preExistingIssue.description}</p>
              </div>
            </div>
          )}

          {/* Client Consent */}
          {report.clientConsent?.signedName && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <span className="confirmation-detail-icon"><FiUser /></span>
              <div>
                <p className="confirmation-detail-label">Client Consent</p>
                <p className="confirmation-detail-value">
                  Signed by {report.clientConsent.signedName}
                  {report.clientConsent.signedAt ? ` on ${new Date(report.clientConsent.signedAt).toLocaleDateString()}` : ''}
                </p>
              </div>
            </div>
          )}

          {report.signedFormPhoto && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <div>
                <p className="confirmation-detail-label">Photo of signed paper form</p>
                <a href={`${API_BASE}${report.signedFormPhoto}`} target="_blank" rel="noopener noreferrer">
                  <img src={`${API_BASE}${report.signedFormPhoto}`} alt="Signed paper form" className="report-signed-photo" />
                </a>
              </div>
            </div>
          )}

          {/* Submitted On */}
          <div className="tech-job-detail-cell tech-job-detail-full">
            <span className="confirmation-detail-icon"><FiClock /></span>
            <div>
              <p className="confirmation-detail-label">Submitted On</p>
              <p className="confirmation-detail-value">
                {report.submittedAt ? new Date(report.submittedAt).toLocaleDateString() : '-'}
              </p>
            </div>
          </div>
        </div>

        <div className="staff-reports-x17">
          <button
            className="tech-sort-btn staff-reports-x18"
            onClick={onClose}
          >
            Close
          </button>
          <button
            className="tech-sort-btn staff-reports-x19"
            onClick={() => setShowPdf(true)}
          >
            <FiFileText /> Export PDF
          </button>
        </div>
      </div>

      {showPdf && (
        <ServiceReportPdfModal
          report={report}
          reportItem={reportItem}
          onClose={() => setShowPdf(false)}
        />
      )}
    </div>
  );
}

function toReportItem(booking, reportData) {
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
  };
}

// A completed job whose report could not be looked up. It is neither Pending nor Completed: the
// technician must never be offered "Submit Report" for a job that may already have one.
const UNKNOWN_STATUS = 'Could not check';

// The report for one booking: the report, null when there is none (404), or throws for any other failure.
async function lookUpReport(bookingId) {
  try {
    return await getReportForBooking(bookingId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Pending');
  const [activeReport, setActiveReport] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);

  const loadReports = async () => {
    try {
      // First, get all bookings assigned to the technician
      const bookingsData = await listTechnicianJobs();
      if (!Array.isArray(bookingsData)) throw new Error('Unexpected jobs reply');

      // A job is waiting for its report while it is In Progress (filing the report is what
      // completes it). Completed jobs are listed too, so ones finished before this rule
      // existed that still have no report can get one.
      // Only the lead technician files the report, so only the lead's jobs are listed here.
      const reportableBookings = bookingsData.filter(b => [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(b.status) && b.myRole === 'Lead');

      // For each one, fetch its report from the reports collection
      const reportPromises = reportableBookings.map(async (booking) => {
        // An In Progress job cannot have a report yet.
        if (booking.status === BOOKING_STATUS.IN_PROGRESS) return toReportItem(booking, null);
        try {
          // No report found (404), but booking is completed: the item is listed without one.
          return toReportItem(booking, await lookUpReport(booking.bookingId));
        } catch (err) {
          // Any other failure: we do not know, so it is not shown as Pending.
          console.error(`Error fetching report for booking ${booking.bookingId}:`, err);
          return { ...toReportItem(booking, null), status: UNKNOWN_STATUS };
        }
      });

      setReports(await Promise.all(reportPromises));
    } catch (err) {
      // a failed load is an error state with a Retry, never "No reports in this category"
      console.error('Failed to load reports', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = () => {
    setLoadFailed(false);
    setLoading(true);
    loadReports();
  };

  useEffect(() => {
    loadReports();
  }, []);

  // A job that could not be checked needs attention, so it also shows under Pending (labelled as such).
  const visibleReports =
    filter === 'All'
      ? reports
      : reports.filter((r) => r.status === filter || (filter === 'Pending' && r.status === UNKNOWN_STATUS));

  // Look up one job's report again after "Could not check".
  const recheck = async (item) => {
    try {
      const data = await lookUpReport(item.bookingId);
      setReports((prev) => prev.map((r) => (r._id === item._id ? { ...r, status: data ? 'Completed' : 'Pending', report: data } : r)));
    } catch (err) {
      console.error(`Error fetching report for booking ${item.bookingId}:`, err);
    }
  };

  const handleOpenReport = (reportItem) => {
    setSubmitError('');
    setActiveReport(reportItem);
    setModalMode(reportItem.status === 'Pending' ? 'submit' : 'view');
  };

  const handleClose = () => {
    setActiveReport(null);
    setModalMode(null);
  };

  const handleSubmitReport = async (form, photo) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      // Create report in reports collection
      const data = await submitReport({
        bookingId: activeReport.bookingId,
        ...form,
        submittedAt: new Date().toISOString()
      }, photo).catch(withFallback('Failed to submit report'));

      // Update local state
      setReports((prev) =>
        prev.map((r) =>
          r._id === activeReport._id 
            ? { ...r, status: 'Completed', report: data } 
            : r
        )
      );
      handleClose();
    } catch (err) {
      setSubmitError(err.message || 'Could not submit the report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffLayout title="Reports">
      <div className="report-tabs">
        {['All', 'Pending', 'Completed'].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`filter-pill ${filter === tab ? 'filter-pill--active' : ''}`}
            style={getFilterPillStyle(tab, filter === tab)}
            onClick={() => setFilter(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="tech-job-list">
        {loading ? (
          <p className="tech-job-empty">Loading reports...</p>
        ) : loadFailed ? (
          <LoadError message="Could not load your reports." onRetry={retryLoad} />
        ) : visibleReports.length === 0 ? (
          <p className="tech-job-empty">No reports in this category.</p>
        ) : (
          visibleReports.map((r, i) => (
            <div className="tech-job-card tech-report-card" key={i}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <span className={`tech-job-status-badge ${r.status === 'Completed' ? 'tech-status-completed' : r.status === UNKNOWN_STATUS ? 'tech-status-cancelled' : 'tech-status-pending'}`}>
                    {r.status}
                  </span>
                </div>
                <div className="tech-job-service">{r.service}</div>
                <small className="tech-job-booking">{r.bookingId}</small>
                {r.customer && (
                  <small
                    className="tech-job-customer staff-reports-x20"
                  >
                    {r.customer}
                  </small>
                )}
              </div>

              <div className="tech-job-meta">
                <FiClock /> {r.bookingDate}
              </div>

              {r.status === UNKNOWN_STATUS ? (
                <button className="tech-job-view-link staff-reports-x21" onClick={() => recheck(r)}>
                  <FiFileText /> Retry
                </button>
              ) : (
                <button
                  className="tech-job-view-link staff-reports-x21"
                  onClick={() => handleOpenReport(r)}
                >
                  <FiFileText />{' '}
                  {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {modalMode === 'submit' && activeReport && (
        <SubmitReportModal
          reportItem={activeReport}
          onClose={handleClose}
          onSubmit={handleSubmitReport}
          submitting={submitting}
          serverError={submitError}
        />
      )}

      {modalMode === 'view' && activeReport && (
        <ViewReportModal reportItem={activeReport} onClose={handleClose} />
      )}
    </StaffLayout>
  );
}

export default Reports;