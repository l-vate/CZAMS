import { useState } from 'react';

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

// existingBackJob, when present, means the customer already reported an issue on
// this booking — shown read-only instead of the report form.
function BackJobModal({ booking, existingBackJob, onClose, onSubmit, submitting }) {
  const [issueDescription, setIssueDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
    if (!issueDescription.trim()) {
      setError('Please describe the issue.');
      return;
    }
    setError('');
    onSubmit({ issueDescription: issueDescription.trim() });
  };

  if (existingBackJob) {
    const isScheduled = existingBackJob.status === 'Scheduled';
    const isNotCovered = existingBackJob.status === 'Not Covered';

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <h4 className="modal-title">Reported Issue</h4>
            <button className="modal-close-btn" onClick={onClose}>✕</button>
          </div>

          <p className="modal-instruction">{existingBackJob.issueDescription}</p>

          <div className="bs-field-group">
            <label className="bs-label">Reported On</label>
            <p className="sdm-row-value">{formatDate(existingBackJob.reportedAt)}</p>
          </div>

          {isScheduled && (
            <p className="cancelled-message">
              This was within warranty, so it's free of charge. A follow-up visit has
              been scheduled — Booking ID <strong>{existingBackJob.resultingBookingId}</strong>,{' '}
              {formatDate(existingBackJob.resultingBooking?.date)}.
            </p>
          )}

          {isNotCovered && (
            <p className="cancelled-message">
              This is outside the covered warranty period, so it isn't automatically
              free of charge. Our team will review this and follow up with you.
            </p>
          )}

          {existingBackJob.status === 'Reviewed' && (
            <p className="cancelled-message">
              This was outside warranty. Our team has reviewed it — reach out to us if
              you haven't heard back yet.
            </p>
          )}

          <button className="modal-submit-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h4 className="modal-title">Report an Issue</h4>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <p className="modal-instruction">
          Use this if something's wrong after your service — e.g. a leak right after
          cleaning, or the AC not cooling soon after installation. We'll check whether
          this is covered by warranty.
        </p>

        <div className="bs-field-group">
          <label className="bs-label">What happened?</label>
          <textarea
            className="bs-textarea"
            rows={4}
            placeholder="Describe the issue..."
            value={issueDescription}
            onChange={(e) => setIssueDescription(e.target.value)}
          />
        </div>

        {error && (
          <p style={{ fontSize: '12px', color: '#e05a5a', marginTop: '-8px', marginBottom: '12px' }}>
            {error}
          </p>
        )}

        <button className="modal-submit-btn" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>
      </div>
    </div>
  );
}

export default BackJobModal;
