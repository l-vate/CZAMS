import { useState, useEffect, useRef } from 'react';
import StaffLayout from './staff_layout';
import { FiClock, FiFileText, FiX, FiUser, FiMapPin } from 'react-icons/fi';
import SignaturePad from '../../components/signature_pad';
import ServiceReportPdfModal from '../../components/service_report_pdf_modal';
import { getFilterPillStyle } from '../../utils/statusColors';
import { withFallback } from '../../services/apiClient';
import LoadError from '../../components/load_error';
import { listTechnicianJobs } from '../../services/bookingService';
import { listMyReports, submitReport } from '../../services/reportService';
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from '../../constants/reportPhoto';
import { shrinkPhoto } from '../../utils/photoShrink';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { ProofLink, ProofImage } from '../../components/proof_file';
import { BackJobBadge, BackJobInfo } from '../../components/back_job_info';


// Today's date as YYYY-MM-DD in Philippine time, the same day the server compares against.
const todayKey = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function SubmitReportModal({ reportItem, onClose, onSubmit, submitting, serverError }) {
  const [form, setForm] = useState({
    workSummary: '',
    partsUsed: '',
    partsNone: false, // the lead confirms no parts were used
    recommendations: '',
    recommendationsNone: false, // the lead confirms there are no recommendations
    laborHours: '',
    issueResolution: '', // no default: the lead chooses how it ended
    followUpRequired: null, // no default: Yes or No must be chosen
    followUpDate: '',
    notes: '',
    preExistingIssueFlagged: false,
    preExistingIssueDescription: '',
    clientConsentSignedName: '',
    clientConsentSignatureDataUrl: null,
  });
  const [photo, setPhoto] = useState(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  // set at once on the first click, before React re-renders, so a fast double click sends one report
  const sendingRef = useRef(false);

  const handlePhoto = async (e) => {
    const input = e.target;
    const picked = input.files[0] || null;
    if (picked && !PHOTO_MIME_TYPES.includes(picked.type)) {
      setError('The photo must be a JPG or PNG image.');
      input.value = '';
      return;
    }
    // A phone photo is shrunk first (JPEG, longest side 2000 px), so it fits the 5 MB limit.
    let file = picked;
    if (picked) {
      setPreparing(true);
      file = await shrinkPhoto(picked);
      setPreparing(false);
    }
    if (file && file.size > PHOTO_MAX_BYTES) {
      setError('The photo must be 5 MB or smaller.');
      input.value = '';
      return;
    }
    setError('');
    setPhoto(file);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const next = { ...form, [name]: type === 'checkbox' ? checked : value };
    if (name === 'partsNone' && checked) next.partsUsed = '';
    if (name === 'recommendationsNone' && checked) next.recommendations = '';
    setForm(next);
    setError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.workSummary.trim()) {
      setError('Please provide a summary of the work done.');
      return;
    }
    if (!form.issueResolution) {
      setError('Choose how the issue was resolved: Complete, Partial or Unresolved.');
      return;
    }
    if (form.laborHours === '') {
      setError('Labor hours are required: a number from 0 to 24 in steps of 0.5.');
      return;
    }
    const hours = Number(form.laborHours);
    if (!(hours >= 0 && hours <= 24)) {
      setError('Labor hours must be a number from 0 to 24.');
      return;
    }
    if (Math.round(hours * 2) !== hours * 2) {
      setError('Labor hours must be in steps of 0.5 (for example 1.5).');
      return;
    }
    if (form.followUpRequired === null) {
      setError('Say whether a follow-up service is needed (Yes or No).');
      return;
    }
    if (form.followUpRequired && !form.followUpDate) {
      setError('Please specify a follow-up date if follow-up is required.');
      return;
    }
    if (form.followUpRequired && form.followUpDate < todayKey()) {
      setError('The follow-up date cannot be in the past.');
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
    // What is sent: "None" where the lead ticked it, and no follow-up date unless the follow-up is Yes.
    const { partsNone, recommendationsNone, ...answers } = form;
    const payload = {
      ...answers,
      partsUsed: partsNone ? 'None' : form.partsUsed,
      recommendations: recommendationsNone ? 'None' : form.recommendations,
      followUpDate: form.followUpRequired ? form.followUpDate : '',
    };
    Promise.resolve(onSubmit(payload, photo)).finally(() => { sendingRef.current = false; });
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

        {reportItem.isBackJob && (
          <div className="report-booking-info staff-reports-x1">
            <BackJobInfo backJob={reportItem.backJob} showReport />
          </div>
        )}

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

          {/* Labor Hours & Resolution: both required */}
          <div className="staff-reports-x5">
            <div className="form-group">
              <label htmlFor="laborHours" className="tech-stat-label">
                Labor Hours <span className="staff-reports-x3">*</span>
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
                Resolution <span className="staff-reports-x3">*</span>
              </label>
              <select
                id="issueResolution"
                name="issueResolution"
                className="tech-search-input"
                value={form.issueResolution}
                onChange={handleChange}
              >
                <option value="">Choose...</option>
                <option value="Complete">Complete</option>
                <option value="Partial">Partial</option>
                <option value="Unresolved">Unresolved</option>
              </select>
            </div>
          </div>

          {/* Parts Used: optional, with a tick to confirm there were none */}
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
              disabled={form.partsNone}
            />
            <label className="staff-reports-x9" htmlFor="partsNone">
              <input type="checkbox" id="partsNone" name="partsNone" checked={form.partsNone} onChange={handleChange} /> None, no parts were used
            </label>
          </div>

          {/* Follow-up: Yes or No must be chosen */}
          <fieldset className="form-group">
            <legend className="tech-stat-label">
              Follow-up service needed? <span className="staff-reports-x3">*</span>
            </legend>
            <label className="staff-reports-x9" htmlFor="followUpYes">
              <input
                type="radio"
                id="followUpYes"
                name="followUpRequired"
                checked={form.followUpRequired === true}
                onChange={() => { setForm({ ...form, followUpRequired: true }); setError(''); }}
              /> Yes
            </label>
            {' '}
            <label className="staff-reports-x9" htmlFor="followUpNo">
              <input
                type="radio"
                id="followUpNo"
                name="followUpRequired"
                checked={form.followUpRequired === false}
                onChange={() => { setForm({ ...form, followUpRequired: false, followUpDate: '' }); setError(''); }}
              /> No
            </label>
          </fieldset>

          {/* Follow-up date: only when the answer is Yes */}
          {form.followUpRequired === true && (
            <div className="form-group">
              <label htmlFor="followUpDate" className="tech-stat-label">
                Follow-up Date <span className="staff-reports-x3">*</span>
              </label>
              <input
                type="date"
                id="followUpDate"
                name="followUpDate"
                className="tech-search-input"
                min={todayKey()}
                value={form.followUpDate}
                onChange={handleChange}
              />
            </div>
          )}

          {/* Recommendations: optional, with a tick to confirm there were none */}
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
              disabled={form.recommendationsNone}
            />
            <label className="staff-reports-x9" htmlFor="recommendationsNone">
              <input type="checkbox" id="recommendationsNone" name="recommendationsNone" checked={form.recommendationsNone} onChange={handleChange} /> None, nothing to recommend
            </label>
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
            {preparing && <p className="sdm-muted" role="status">Preparing photo...</p>}
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
              disabled={submitting || preparing}
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
          {report.backJob?.originalBookingId && (
            <div className="tech-job-detail-cell tech-job-detail-full">
              <div>
                <p className="confirmation-detail-label">Back job</p>
                <p className="confirmation-detail-value">Follows booking {report.backJob.originalBookingId}{report.backJob.originalReportId ? ' and its original report' : ''}</p>
              </div>
            </div>
          )}

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
                  <p className="confirmation-detail-value">Yes</p>
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
                <ProofLink path={report.signedFormPhoto}>
                  <ProofImage path={report.signedFormPhoto} alt="Signed paper form" className="report-signed-photo" />
                </ProofLink>
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
    isBackJob: !!booking.isBackJob,
    backJob: booking.backJob || null,
  };
}

// A completed job whose report could not be loaded. It is neither Pending nor Completed: the technician
// must never be offered "Submit Report" for a job that may already have one.
const UNKNOWN_STATUS = 'Could not check';

function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Pending');
  const [activeReport, setActiveReport] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [reportsFailed, setReportsFailed] = useState(false);

  const loadReports = async () => {
    try {
      // First, get all bookings assigned to the technician
      const bookingsData = await listTechnicianJobs();
      if (!Array.isArray(bookingsData)) throw new Error('Unexpected jobs reply');

      // A job is waiting for its report while it is In Progress (filing the report is what
      // completes it). Completed jobs are listed too, so ones finished before this rule
      // existed that still have no report can get one.
      // Only the primary lead (the lead of the first pair) files the report, so only their jobs are listed here.
      const reportableBookings = bookingsData.filter(b => [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(b.status) && b.myRole === 'Lead' && b.isPrimaryLead !== false);

      // One request for every report, instead of one per completed job.
      let reportsByBooking = null;
      try {
        const mine = await listMyReports();
        if (!Array.isArray(mine)) throw new Error('Unexpected reports reply');
        reportsByBooking = new Map(mine.map((r) => [r.bookingId, r]));
      } catch (err) {
        console.error('Failed to load reports', err);
        setReportsFailed(true);
      }

      setReports(reportableBookings.map((booking) => {
        // An In Progress job cannot have a report yet.
        if (booking.status === BOOKING_STATUS.IN_PROGRESS) return toReportItem(booking, null);
        // Reports could not be loaded: we do not know, so it is not shown as Pending.
        if (!reportsByBooking) return { ...toReportItem(booking, null), status: UNKNOWN_STATUS };
        return toReportItem(booking, reportsByBooking.get(booking.bookingId) || null);
      }));
    } catch (err) {
      // a failed load is an error state with a Retry, never "No reports in this category"
      console.error('Failed to load jobs', err);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  };

  const retryLoad = () => {
    setLoadFailed(false);
    setReportsFailed(false);
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

      {!loading && !loadFailed && reportsFailed && (
        <LoadError message="Could not load your service reports, so some jobs cannot be checked." onRetry={retryLoad} />
      )}

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
                  {r.isBackJob && <BackJobBadge />}
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
                <button type="button" className="view-details-btn" onClick={retryLoad}>
                  <FiFileText size={14} /> Retry
                </button>
              ) : (
                <button
                  type="button"
                  className={r.status === 'Pending' ? 'tech-job-primary-btn' : 'view-details-btn'}
                  onClick={() => handleOpenReport(r)}
                >
                  <FiFileText size={14} /> {r.status === 'Pending' ? 'Submit Report' : 'View Report'}
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