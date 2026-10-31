import { Fragment, useState } from 'react';
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
        <div id={panelId} className="audit-entry-panel">
          <dl className="audit-entry-details">
            <dt>What happened</dt><dd>{details.what}</dd>
            <dt>Done by</dt><dd>{details.who}</dd>
            {details.when && (<><dt>When</dt><dd>{details.when}</dd></>)}
            {details.record && (<><dt>Record</dt><dd>{details.record}</dd></>)}
          </dl>
          {details.values.length > 0 && (
            <>
              <p className="audit-entry-subhead">What changed</p>
              <dl className="audit-entry-details audit-entry-values">
                {details.values.map(([label, value]) => (<Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>))}
              </dl>
            </>
          )}
          <p className="audit-entry-code">Action code: <code>{details.action}</code></p>
        </div>
      )}
    </li>
  );
}

export default AuditEntry;
