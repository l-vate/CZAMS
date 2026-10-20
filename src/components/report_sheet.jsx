import { BarChart, DonutChart, HorizontalBarChart, ChartCard } from './charts';
import { pluralize } from '../utils/pluralize';
import { BRAND_NAME, COMPANY_PHONE } from '../config/company';

function Chart({ chart }) {
  if (chart.kind === 'bar') {
    return <BarChart data={chart.data} xLabel={chart.xLabel} yLabel={chart.yLabel} ariaLabel={chart.title} />;
  }
  if (chart.kind === 'hbar') {
    return <HorizontalBarChart data={chart.data} xLabel={chart.xLabel} ariaLabel={chart.title} />;
  }
  return <DonutChart data={chart.data} centerLabel={chart.centerLabel} ariaLabel={chart.title} />;
}

// One generated report, laid out as a document: company header, key numbers, charts,
// then the data table. The same markup is what gets printed (see
// css/components/report_print.css), so the preview is what the PDF will look like.
function ReportSheet({ report, meta }) {
  return (
    <article className="report-sheet">
      <header className="report-header">
        <div className="report-brand">
          <img src="/images/logo.png" alt={`${BRAND_NAME} logo`} className="report-logo" />
          <div>
            <p className="report-company">{BRAND_NAME}</p>
            <p className="report-company-phone">Tel. {COMPANY_PHONE}</p>
            <h1 className="report-title">{report.title}</h1>
          </div>
        </div>
        <dl className="report-meta">
          <div><dt>Period</dt><dd>{meta.range}</dd></div>
          <div><dt>Client type</dt><dd>{meta.clientType}</dd></div>
          <div><dt>Date basis</dt><dd>{meta.dateBasis}</dd></div>
          <div><dt>Generated</dt><dd>{meta.generatedAt}</dd></div>
          <div><dt>Prepared by</dt><dd>{meta.preparedBy}</dd></div>
        </dl>
      </header>

      <section className="report-section">
        <h2 className="report-section-title">Summary</h2>
        <div className="report-summary-grid">
          {report.summary.map((item) => (
            <div className="report-summary-item" key={item.label}>
              <span className="report-summary-value">{item.value}</span>
              <span className="report-summary-label">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="report-section">
        <h2 className="report-section-title">Charts</h2>
        <div className="report-charts">
          {report.charts.map((chart) => (
            <ChartCard key={chart.title} title={chart.title}>
              <Chart chart={chart} />
            </ChartCard>
          ))}
        </div>
      </section>

      <section className="report-section report-section--table">
        <h2 className="report-section-title">Details</h2>
        {report.rows.length === 0 ? (
          <p className="report-empty">No records for this period and client type.</p>
        ) : (
          <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr>
                {report.columns.map((c) => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => <td key={j}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
            {report.totalRow && (
              <tfoot>
                <tr>
                  {report.totalRow.map((cell, j) => <td key={j}>{cell}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
          </div>
        )}
        <p className="report-record-count">{report.rows.length} {pluralize(report.rows.length, 'record')}</p>
        {report.notes.length > 0 && (
          <ul className="report-notes">
            {report.notes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        )}
      </section>
    </article>
  );
}

export default ReportSheet;
