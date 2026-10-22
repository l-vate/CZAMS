import { formatDays, formatMonths, siteLines } from '../utils/quotationTerms';

// The terms of an installation quotation, in plain words: how long it takes, what the price does not cover, the warranty, and whether the
// prices include VAT. Shown to the customer before they pay and again on their booking. `terms` is what the server works out for a saved
// booking (quotationTerms) or the standard ones for a booking being made. Renders nothing when there is nothing to say.
function QuotationTerms({ terms, site, isCommercial = false, title = 'Before you pay' }) {
  if (!terms) return null;
  const days = formatDays(terms.estimatedDays);
  const sites = siteLines(site);
  if (!days && !terms.exclusions && !terms.warranty && sites.length === 0) return null;
  return (
    <section className="quotation-terms" aria-label="Quotation terms">
      <p className="summary-section-title">{title}</p>
      {days && <p className="quotation-term"><strong>Estimated time:</strong> {days}</p>}
      {terms.exclusions && (
        <div className="quotation-term">
          <strong>Not included in the price:</strong>
          <ul>{terms.exclusions.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
      {terms.warranty && (
        <div className="quotation-term">
          <strong>Warranty:</strong>
          <ul>
            <li>Workmanship: {formatMonths(terms.warranty.workmanshipMonths)}</li>
            {terms.warranty.unitText ? <li>Unit: {terms.warranty.unitText}</li> : <li>No warranty on the unit itself (your own unit)</li>}
          </ul>
        </div>
      )}
      {terms.taxInclusive && <p className="quotation-term">The prices already include VAT.</p>}
      {!terms.taxInclusive && isCommercial && <p className="quotation-term">VAT (12%) is added on top of the prices.</p>}
      {sites.length > 0 && (
        <div className="quotation-term">
          <strong>Site:</strong>
          <ul>{sites.map(([label, value]) => <li key={label}>{label}: {value}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

export default QuotationTerms;
