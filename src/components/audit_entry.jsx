import { useState } from 'react';
import { describeAudit, auditDetails } from '../utils/auditText';

// One audit line, readable by default: who, what happened in plain words, and when (Manila). The technical details (action code, record,
// raw values) stay folded behind "View details".
function AuditEntry({ line, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
  const { who, what, when } = describeAudit(line);
  const details = auditDetails(line);
  const panelId = `audit-details-${line._id}`;
  return (
    <li className="audit-entry">
      <p className="audit-entry-line">
        <strong className="audit-entry-who">{who}</strong> <span className="audit-entry-what">{what}</span>
        <span className="audit-entry-when"> {when}</span>
      </p>
      <button type="button" className="audit-entry-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
        {open ? 'Hide details' : 'View details'}
      </button>
      {open && (
        <dl id={panelId} className="audit-entry-details">
          <dt>Action</dt><dd>{details.action}</dd>
          {details.record && (<><dt>Record</dt><dd>{details.record}</dd></>)}
          {details.role && (<><dt>Role</dt><dd>{details.role}</dd></>)}
          {details.meta && (<><dt>Values</dt><dd><pre className="audit-entry-json">{details.meta}</pre></dd></>)}
        </dl>
      )}
    </li>
  );
}

export default AuditEntry;
