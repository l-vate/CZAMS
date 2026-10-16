import { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import ReportSheet from '../../components/report_sheet';
import StatementOfAccount from '../../components/statement_of_account';
import { loadReportData } from '../../services/analyticsService';
import { manilaTodayKey, addDaysToKey } from '../../utils/manilaTime';
import { csvFilename, downloadCsv } from '../../utils/csvExport';
import {
  REPORT_TYPES, DATE_BASES, BUILDERS, formatRange, formatGeneratedAt,
} from '../../utils/reportBuilders';

const CLIENT_TYPES = [
  { key: 'all', label: 'All Clients' },
  { key: 'Residential', label: 'Residential' },
  { key: 'Commercial', label: 'Commercial' },
  { key: 'Unknown', label: 'Deleted accounts' },
];

const DEFAULT_DAYS = 30;

function defaultRange() {
  const toKey = manilaTodayKey();
  return { fromKey: addDaysToKey(toKey, -(DEFAULT_DAYS - 1)), toKey };
}

// Admin report builder: pick a report, a date range and a client type, preview it on
// screen, then print it or save it as a PDF. Nothing here is a new data source; it reads
// the same admin endpoints the other pages use.
function Reports() {
  const [tab, setTab] = useState('reports'); // 'reports' | 'statement'
  const [reportType, setReportType] = useState('requests');
  const [filters, setFilters] = useState({ ...defaultRange(), clientType: 'all', dateBasis: 'service' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [generated, setGenerated] = useState(null); // { report, meta }

  useEffect(() => {
    async function load() {
      try {
        setData(await loadReportData());
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
      // Kept with the report so the CSV file name matches what is on screen, not later filter edits.
      csvName: csvFilename(reportType, filters),
meta: {
        range: formatRange(filters.fromKey, filters.toKey),
        clientType: CLIENT_TYPES.find((c) => c.key === filters.clientType).label,
        dateBasis: DATE_BASES.find((d) => d.key === filters.dateBasis).label,
        generatedAt: formatGeneratedAt(),
        preparedBy: user.name || 'Admin',
      },
    });
  };

  return (
    <AdminLayout title="Reports">
      <h1 className="dashboard-welcome report-no-print">Reports</h1>

      <div className="report-tabs report-no-print">
        <button type="button" className={`filter-pill ${tab === 'reports' ? 'filter-pill--active' : ''}`} onClick={() => setTab('reports')}>Reports</button>
        <button type="button" className={`filter-pill ${tab === 'statement' ? 'filter-pill--active' : ''}`} onClick={() => setTab('statement')}>Statement of Account</button>
      </div>

      {tab === 'statement' && data && <StatementOfAccount data={data} />}
      {tab === 'statement' && !data && !loadError && <p className="report-no-print">Loading data...</p>}

      {tab === 'reports' && (<>
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

        <div className="report-control">
          <label htmlFor="report-basis">Date basis</label>
          <select
            id="report-basis"
            value={filters.dateBasis}
            onChange={(e) => setFilters({ ...filters, dateBasis: e.target.value })}
          >
            {DATE_BASES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>

        <div className="report-control report-control--actions">
          <button type="button" className="svc-btn svc-btn-primary" onClick={handleGenerate} disabled={loading || !data}>
            Generate
          </button>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={() => window.print()} disabled={!generated}>
            Print / Save as PDF
          </button>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={() => downloadCsv(generated.report, generated.csvName)} disabled={!generated}>
            Export CSV
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
      </>)}
      {tab === 'statement' && loadError && <p className="ma-form-error report-no-print">{loadError}</p>}
    </AdminLayout>
  );
}

export default Reports;
