// A back job visit is a free repair after a customer's warranty claim. These show a technician that a visit is
// one and what it follows. Everything here is read only and comes from the whitelisted `backJob` on the job.

export function BackJobBadge() {
  return <span className="tech-job-status-badge tech-status-in-progress">Back job</span>;
}

const roleName = (role) => (role === 'Lead' ? 'lead' : 'helper');

// `showReport` also shows the original report's summary (for the report form).
export function BackJobInfo({ backJob, showReport = false }) {
  if (!backJob) return null;
  const { original, originalReport } = backJob;
  return (
    <div className="tech-job-detail-cell tech-job-detail-full">
      <div>
        <p className="confirmation-detail-label">Back job: follows booking {original?.bookingId || 'unknown'}</p>
        {original?.date && (
          <p className="confirmation-detail-value">Original service: {original.date}{original.time ? `, ${original.time}` : ''}</p>
        )}
        {original?.technicians?.length > 0 && (
          <p className="confirmation-detail-value">
            Original technicians: {original.technicians.map((t) => `${t.name} (${roleName(t.role)})`).join(', ')}
          </p>
        )}
        {showReport && (
          originalReport ? (
            <>
              <p className="confirmation-detail-label">Original report</p>
              <p className="confirmation-detail-value">{originalReport.workSummary}</p>
              {originalReport.issueResolution && <p className="confirmation-detail-value">Resolution: {originalReport.issueResolution}</p>}
              {originalReport.preExistingIssue?.flagged && (
                <p className="confirmation-detail-value">Pre-existing issue noted: {originalReport.preExistingIssue.description}</p>
              )}
            </>
          ) : (
            <p className="confirmation-detail-value">The original job has no service report on file.</p>
          )
        )}
      </div>
    </div>
  );
}
