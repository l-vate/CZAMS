import { useState } from 'react';
import { buildStatement, statementPeso } from '../utils/statementBuilder';
import { pricingOf } from '../utils/bookingMoney';
import { DATE_BASES, formatRange, formatGeneratedAt } from '../utils/reportBuilders';
import { downloadCsv } from '../utils/csvExport';

import { manilaTodayKey } from '../utils/manilaTime';
import { BRAND_NAME } from '../config/company';
const slug = (text) => String(text || 'customer').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'customer';

// The CSV carries the same table: header, rows, totals row, then the outstanding balance.
function statementCsv(statement) {
  return {
    columns: statement.columns,
    rows: statement.rows,
    totalRow: statement.totalRow,
    footerRows: [['Outstanding balance', '', '', '', '', statementPeso(statement.outstanding), '']],
  };
}

// Admin: pick a customer and a date range, preview the Statement of Account, then print it or save
// it as a CSV file. Printing uses the same page rules as the reports (the sheet below is a report-sheet).
function StatementOfAccount({ data }) {
  const todayKey = manilaTodayKey();
  const [form, setForm] = useState({ customerId: '', fromKey: '', toKey: todayKey, dateBasis: 'service' });
  const [error, setError] = useState('');
  const [generated, setGenerated] = useState(null);

  const customers = [...data.customers].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const handleGenerate = () => {
    if (!form.customerId) { setError('Choose a customer.'); return; }
    if (!form.fromKey || !form.toKey) { setError('Choose both a start and an end date.'); return; }
    if (form.fromKey > form.toKey) { setError('The start date must be on or before the end date.'); return; }
    setError('');
    const customer = data.customers.find((c) => c._id === form.customerId);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setGenerated({
      customer,
      filters: { ...form },
      statement: buildStatement(form.customerId, data.bookings, form, pricingOf),
      meta: {
        range: formatRange(form.fromKey, form.toKey),
        dateBasis: DATE_BASES.find((d) => d.key === form.dateBasis).label,
        generatedAt: formatGeneratedAt(),
        preparedBy: user.name || 'Admin',
      },
    });
  };

  const csvName = generated
    ? `CZAMS_statement_${slug(generated.customer.name)}_${generated.filters.fromKey}_${generated.filters.toKey}_${generated.filters.dateBasis}.csv`
    : '';

  return (
    <>
      <section className="report-controls report-no-print">
        <div className="report-control">
          <label htmlFor="statement-customer">Customer</label>
          <select id="statement-customer" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
            <option value="">Choose a customer</option>
            {customers.map((c) => (
              <option key={c._id} value={c._id}>{c.name || c.email}{c.clientType === 'Commercial' ? ' (Commercial)' : ''}</option>
            ))}
          </select>
        </div>
        <div className="report-control">
          <label htmlFor="statement-from">From</label>
          <input id="statement-from" type="date" value={form.fromKey} onChange={(e) => setForm({ ...form, fromKey: e.target.value })} />
        </div>
        <div className="report-control">
          <label htmlFor="statement-to">To</label>
          <input id="statement-to" type="date" value={form.toKey} onChange={(e) => setForm({ ...form, toKey: e.target.value })} />
        </div>
        <div className="report-control">
          <label htmlFor="statement-basis">Date basis</label>
          <select id="statement-basis" value={form.dateBasis} onChange={(e) => setForm({ ...form, dateBasis: e.target.value })}>
            {DATE_BASES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </div>
        <div className="report-control report-control--actions">
          <button type="button" className="svc-btn svc-btn-primary" onClick={handleGenerate}>Generate</button>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={() => window.print()} disabled={!generated}>Print / Save as PDF</button>
          <button type="button" className="svc-btn svc-btn-ghost" onClick={() => downloadCsv(statementCsv(generated.statement), csvName)} disabled={!generated}>Export CSV</button>
        </div>
      </section>

      {error && <p className="ma-form-error report-no-print">{error}</p>}
      {!generated && !error && (
        <p className="report-hint report-no-print">Choose a customer and a period, then press Generate to preview the statement.</p>
      )}

      {generated && <StatementSheet {...generated} />}
    </>
  );
}

function StatementSheet({ customer, statement, meta }) {
  const commercial = customer.clientType === 'Commercial';
  return (
    <article className="report-sheet">
      <header className="report-header">
        <div className="report-brand">
          <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="report-logo" />
          <div>
            <p className="report-company">{BRAND_NAME}</p>
            <h1 className="report-title">Statement of Account</h1>
          </div>
        </div>
        <dl className="report-meta">
          <div><dt>Period</dt><dd>{meta.range}</dd></div>
          <div><dt>Date basis</dt><dd>{meta.dateBasis}</dd></div>
          <div><dt>Generated</dt><dd>{meta.generatedAt}</dd></div>
          <div><dt>Prepared by</dt><dd>{meta.preparedBy}</dd></div>
        </dl>
      </header>

      <section className="report-section">
        <h2 className="report-section-title">Customer</h2>
        <dl className="report-meta statement-customer">
          {commercial && <div><dt>Company</dt><dd>{customer.companyName || 'Not recorded'}</dd></div>}
          {commercial && <div><dt>Representative</dt><dd>{customer.representativeName || 'Not recorded'}</dd></div>}
          <div><dt>Name</dt><dd>{customer.name || 'N/A'}</dd></div>
          <div><dt>Client type</dt><dd>{customer.clientType || 'Residential'}</dd></div>
          <div><dt>Email</dt><dd>{customer.email || 'N/A'}</dd></div>
          <div><dt>Phone</dt><dd>{customer.phone || 'N/A'}</dd></div>
          <div><dt>Address</dt><dd>{customer.address || 'N/A'}</dd></div>
        </dl>
      </section>

      <section className="report-section report-section--table">
        <h2 className="report-section-title">Bookings</h2>
        {statement.rows.length === 0 ? (
          <p className="report-empty">No bookings for this customer in this period.</p>
        ) : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead><tr>{statement.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {statement.rows.map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                ))}
              </tbody>
              <tfoot>
                <tr>{statement.totalRow.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="statement-outstanding">Outstanding balance: <strong>{statementPeso(statement.outstanding)}</strong></p>
        <ul className="report-notes">
          <li>Total is the final price of each booking after any approved discount, with distance or mobilization charges. VAT for commercial clients is not included, the same as on the Payments page.</li>
          <li>Paid is what the customer has paid and the admin has verified, after any refund already processed.</li>
          <li>Cancelled bookings are listed for reference only: they are not billed and owe nothing.</li>
          <li>Free back-job repair visits have nothing to pay and are not listed.</li>
        </ul>
      </section>
    </article>
  );
}

export default StatementOfAccount;
