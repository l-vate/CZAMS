import { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import ReportSheet from '../../components/report_sheet';
import { API_BASE } from '../../config/api';
import { toLocalDateKey } from '../../utils/date';
import {
  REPORT_TYPES, BUILDERS, formatRange, formatGeneratedAt,
} from '../../utils/reportBuilders';

const CLIENT_TYPES = [
  { key: 'all', label: 'All Clients' },
  { key: 'Residential', label: 'Residential' },
  { key: 'Commercial', label: 'Commercial' },
];

const DEFAULT_DAYS = 30;

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getFullYear(), to.getMonth(), to.getDate() - (DEFAULT_DAYS - 1));
  return { fromKey: toLocalDateKey(from), toKey: toLocalDateKey(to) };
}

// Admin report builder: pick a report, a date range and a client type, preview it on
// screen, then print it or save it as a PDF. Nothing here is a new data source; it reads
// the same admin endpoints the other pages use.
function Reports() {
  const [reportType, setReportType] = useState('requests');
  const [filters, setFilters] = useState({ ...defaultRange(), clientType: 'all' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [generated, setGenerated] = useState(null); // { report, meta }

  useEffect(() => {
    async function load() {
      try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };
        const get = async (path) => {
          const res = await fetch(`${API_BASE}${path}`, { headers });
          if (!res.ok) throw new Error(path);
          return res.json();
        };
        const [bookings, reports, backJobs, customers, technicians] = await Promise.all([
          get('/api/bookings'), get('/api/reports'), get('/api/backjobs'),
          get('/api/users?role=customer'), get('/api/users?role=staff'),
        ]);
        setData({ bookings, reports, backJobs, customers, technicians });
      } catch (err) {
        console.error('Error loading report data:', err);
        setLoadError('Could not load the data for reports. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // The print stylesheet is scoped to this body class, so it only ever affects this page.
  useEffect(() => {
    document.body.classList.add('printing-admin-report');
    return () => document.body.classList.remove('printing-admin-report');
  }, []);

  const handleGenerate = () => {
    if (!filters.fromKey || !filters.toKey) {
      setFormError('Choose both a start and an end date.');
      return;
    }
    if (filters.fromKey > filters.toKey) {
      setFormError('The start date must be on or before the end date.');
      return;
    }
    setFormError('');

    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const report = BUILDERS[reportType](data, filters);
    setGenerated({
      report,
      meta: {
        range: formatRange(filters.fromKey, filters.toKey),
        clientType: CLIENT_TYPES.find((c) => c.key === filters.clientType).label,
        generatedAt: formatGeneratedAt(),
        preparedBy: user.name || 'Admin',
      },
    });
  };

  return (
    <AdminLayout title="Reports">
      <h1 className="dashboard-welcome report-no-print">Reports</h1>

      <section className="report-controls report-no-print">
        <div className="report-control">
          <label htmlFor="report-type">Report</label>
          <select id="report-type" value={reportType} onChange={(e) => setReportType(e.target.value)}>
            {REPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        <div className="report-control">
          <label htmlFor="report-from">From</label>
          <input
            id="report-from"
            type="date"
            value={filters.fromKey}
            onChange={(e) => setFilters({ ...filters, fromKey: e.target.value })}
          />
        </div>

        <div className="report-control">
          <label htmlFor="report-to">To</label>
          <input
            id="report-to"
            type="date"
            value={filters.toKey}
            onChange={(e) => setFilters({ ...filters, toKey: e.target.value })}
          />
        </div>

        <div className="report-control">
          <label htmlFor="report-client">Client type</label>
          <select
            id="report-client"
            value={filters.clientType}
            onChange={(e) => setFilters({ ...filters, clientType: e.target.value })}
          >
            {CLIENT_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>

        <div className="report-control report-control--actions">
          <button type="button" className="svc-btn svc-btn-primary" onClick={handleGenerate} disabled={loading || !data}>
            Generate
          </button>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={() => window.print()} disabled={!generated}>
            Print / Save as PDF
          </button>
        </div>
      </section>

      {formError && <p className="ma-form-error report-no-print">{formError}</p>}
      {loadError && <p className="ma-form-error report-no-print">{loadError}</p>}
      {loading && <p className="report-no-print">Loading data...</p>}
      {!loading && !generated && !loadError && (
        <p className="report-hint report-no-print">
          Choose a report, a period and a client type, then press Generate to preview it.
        </p>
      )}

      {generated && <ReportSheet report={generated.report} meta={generated.meta} />}
    </AdminLayout>
  );
}

export default Reports;
