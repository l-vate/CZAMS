import { useEffect, useState } from 'react';
import AdminLayout from './admin_layout';
import LoadError from '../../components/load_error';
import AuditEntry from '../../components/audit_entry';
import { listAuditLog } from '../../services/auditService';

const RECORD_TYPES = ['', 'Booking', 'User', 'PaymentSettings', 'Promo', 'Service', 'Announcement', 'SuppliedUnit', 'Closure', 'TechnicianOff', 'Report', 'BackJob'];
const EMPTY = { from: '', to: '', actor: '', action: '', entityType: '', entityId: '' };

// A read-only list of what admins did: who, what in plain words, and when (Manila). Details are folded away. Newest first, a page at a time.
function AuditLog() {
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState('');

  const load = (nextFilters, nextPage) => {
    setLoading(true);
    setFailed('');
    listAuditLog({ ...nextFilters, page: nextPage, limit: 25 })
      .then((result) => setData(result))
      .catch((err) => setFailed(err && err.message ? err.message : 'Could not load the audit log.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(applied, page);
  }, [applied, page]);

  const apply = (e) => {
    e.preventDefault();
    setPage(1);
    setApplied(filters);
  };

  const set = (key) => (e) => setFilters({ ...filters, [key]: e.target.value });

  return (
    <AdminLayout title="Audit Log">
      <form className="req-filters" onSubmit={apply} aria-label="Filter the audit log">
        <label>From <input type="date" className="ma-input" value={filters.from} onChange={set('from')} /></label>
        <label>To <input type="date" className="ma-input" value={filters.to} onChange={set('to')} /></label>
        <label>Admin id <input type="text" className="ma-input" value={filters.actor} onChange={set('actor')} placeholder="any" /></label>
        <label>Action <input type="text" className="ma-input" value={filters.action} onChange={set('action')} placeholder="for example payment.verify" /></label>
        <label>Record
          <select className="ma-input" value={filters.entityType} onChange={set('entityType')}>
            {RECORD_TYPES.map((t) => <option key={t} value={t}>{t || 'Any'}</option>)}
          </select>
        </label>
        <label>Record id <input type="text" className="ma-input" value={filters.entityId} onChange={set('entityId')} placeholder="for example CZ-2026-1234" /></label>
        <button type="submit" className="bs-next-btn">Filter</button>
        <button type="button" className="bs-back-btn" onClick={() => { setFilters(EMPTY); setPage(1); setApplied(EMPTY); }}>Clear</button>
      </form>

      {failed ? (
        <LoadError message={failed} onRetry={() => load(applied, page)} />
      ) : loading ? (
        <p>Loading the audit log...</p>
      ) : data.items.length === 0 ? (
        <p className="tech-job-empty">Nothing recorded for these filters.</p>
      ) : (
        <ul className="audit-list">
          {data.items.map((line) => <AuditEntry key={line._id} line={line} />)}
        </ul>
      )}

      <div className="req-filters" aria-label="Pages">
        <button type="button" className="bs-back-btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {data.pages} ({data.total} lines)</span>
        <button type="button" className="bs-back-btn" disabled={page >= data.pages || loading} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </AdminLayout>
  );
}

export default AuditLog;
