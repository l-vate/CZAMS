import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import StaffLayout from './staff_layout';
import { FiClock, FiUser, FiMapPin } from 'react-icons/fi';
import SignaturePad from '../../components/signature_pad';
import BackButton from '../../components/back_button';
import LoadError from '../../components/load_error';
import { withFallback } from '../../services/apiClient';
import { listTechnicianJobs } from '../../services/bookingService';
import { listMyReports, submitReport } from '../../services/reportService';
import { PHOTO_MAX_BYTES, PHOTO_MIME_TYPES } from '../../constants/reportPhoto';
import { shrinkPhoto } from '../../utils/photoShrink';
import { BOOKING_STATUS } from '../../constants/bookingStatus';
import { addMonthsKey, BOOKING_MAX_MONTHS } from '../../utils/dateRules';
import { BackJobInfo } from '../../components/back_job_info';
import { LIMITS } from '../../constants/inputLimits';
import CharsLeft from '../../components/chars_left';
import FilePreview from '../../components/file_preview';
import { toReportItem } from '../../utils/reportItem';

// The Submit Service Report page (/staff/reports/:bookingId/submit): a whole page, not a pop-up. Only the primary lead of a job that is
// In Progress (or Completed with no report yet) can file it. Submitting returns to the Reports list.

// Today's date as YYYY-MM-DD in Philippine time, the same day the server compares against.
const todayKey = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

function SubmitReportForm({ reportItem, onCancel, onSubmit, submitting, serverError }) {
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
    if (form.followUpRequired && form.followUpDate > addMonthsKey(todayKey(), BOOKING_MAX_MONTHS)) {
      setError(`The follow-up date can be at most ${BOOKING_MAX_MONTHS} months ahead.`);
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
    <div className="report-page-card">
        <h2 className="report-page-title">Submit Service Report</h2>

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
            <textarea maxLength={LIMITS.reportText}
              id="workSummary"
              name="workSummary"
              className="tech-search-input staff-reports-x4"
              placeholder="Describe the work performed, diagnosis, and actions taken..."
              value={form.workSummary}
              onChange={handleChange}
            />
<CharsLeft value={form.workSummary} max={LIMITS.reportText} />
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
            <input maxLength={LIMITS.reportText}
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
                max={addMonthsKey(todayKey(), BOOKING_MAX_MONTHS)}
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
            <textarea maxLength={LIMITS.reportText}
              id="recommendations"
              name="recommendations"
              className="tech-search-input staff-reports-x10"
              placeholder="Preventive maintenance tips, safety notes..."
              value={form.recommendations}
              onChange={handleChange}
              disabled={form.recommendationsNone}
            />
<CharsLeft value={form.recommendations} max={LIMITS.reportText} />
            <label className="staff-reports-x9" htmlFor="recommendationsNone">
              <input type="checkbox" id="recommendationsNone" name="recommendationsNone" checked={form.recommendationsNone} onChange={handleChange} /> None, nothing to recommend
            </label>
          </div>

          {/* Additional Notes */}
          <div className="form-group">
            <label htmlFor="notes" className="tech-stat-label">
              Additional Notes <span className="staff-reports-x6">(Optional)</span>
            </label>
            <textarea maxLength={LIMITS.reportText}
              id="notes"
              name="notes"
              className="tech-search-input staff-reports-x10"
              placeholder="Any other relevant details..."
              value={form.notes}
              onChange={handleChange}
            />
<CharsLeft value={form.notes} max={LIMITS.reportText} />
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
              <textarea maxLength={LIMITS.reportShortText}
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
            <input maxLength={LIMITS.signedName}
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
            <input id="signed-form-photo" type="file" accept="image/jpeg,image/png" onClick={(e) => { e.target.value = ''; }} onChange={handlePhoto} />
            <FilePreview file={photo} label="Signed paper form" onRemove={() => setPhoto(null)} />
            {preparing && <p className="sdm-muted" role="status">Preparing photo...</p>}
          </div>

          {(error || serverError) && (
            <p className="staff-reports-x13" role="alert">{error || serverError}</p>
          )}

          <div className="staff-reports-x14">
            <button
              type="button"
              className="tech-sort-btn"
              onClick={onCancel}
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
  );
}

function SubmitReportPage() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | failed
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const backToList = () => navigate('/staff/reports');

  const load = async () => {
    setState('loading');
    try {
      const jobs = await listTechnicianJobs();
      if (!Array.isArray(jobs)) throw new Error('Unexpected jobs reply');
      const job = jobs.find((b) => b.bookingId === bookingId);
      const reportable = job && [BOOKING_STATUS.IN_PROGRESS, BOOKING_STATUS.COMPLETED].includes(job.status) && job.myRole === 'Lead' && job.isPrimaryLead !== false;
      if (!reportable) { setState('missing'); return; }
      if (job.status === BOOKING_STATUS.COMPLETED) {
        const mine = await listMyReports(); // a completed job that already has its report has nothing to file
        if (!Array.isArray(mine)) throw new Error('Unexpected reports reply');
        if (mine.some((r) => r.bookingId === bookingId)) { setState('missing'); return; }
      }
      setItem(toReportItem(job, null));
      setState('ready');
    } catch (err) {
      console.error('Failed to load the job for its report', err);
      setState('failed');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loads once for this booking
  }, [bookingId]);

  const handleSubmit = async (answers, photo) => {
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitReport({ bookingId, ...answers }, photo).catch(withFallback('Failed to submit report'));
      navigate('/staff/reports');
    } catch (err) {
      setSubmitError(err.message || 'Could not submit the report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <StaffLayout title="Reports">
      <BackButton label="Back to Reports" className="ma-back-link report-page-back" onClick={backToList} />
      {state === 'loading' && <p className="tech-job-empty">Loading the job...</p>}
      {state === 'failed' && <LoadError message="Could not load this job." onRetry={load} />}
      {state === 'missing' && (
        <p className="tech-job-empty">This job is not waiting for your report. It may already have one, or it is not yours to file.</p>
      )}
      {state === 'ready' && item && (
        <SubmitReportForm reportItem={item} onCancel={backToList} onSubmit={handleSubmit} submitting={submitting} serverError={submitError} />
      )}
    </StaffLayout>
  );
}

export default SubmitReportPage;
