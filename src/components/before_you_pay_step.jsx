import QuotationTerms from './quotation_terms';
import { standardTerms } from '../utils/quotationTerms';
import { WORK_CHOICES, OTHER_WORK_MAX, EMPTY_WORKS } from '../utils/mayNeedWorks';

// The "Before you pay" step: the terms (estimated time, what is not included, warranty), a callout about quotations, and the optional
// "I may need these works" checklist. It comes right before Payment and is only shown for a service that has these terms.
function BeforeYouPayStep({ form, setForm, isCommercial = false }) {
  const works = { ...EMPTY_WORKS, ...(form.mayNeedWorks || {}) };
  const setWorks = (patch) => setForm({ ...form, mayNeedWorks: { ...works, ...patch } });
  return (
    <div className="bs-card bs-before-pay">
      <h3 className="bs-card-title">Before you pay</h3>
      <p className="bs-card-sub">Please read this before you choose how to pay.</p>

      <QuotationTerms terms={standardTerms({ clientSuppliedUnit: !!form.clientSuppliedUnit })} isCommercial={isCommercial} title="Good to know" />

      <div className="bs-callout" role="note">
        If any of these are needed, or your site needs extra work such as longer pipe or a distance charge, the owner will get back to you with a quotation and the updated total. You will see it on your booking.
      </div>

      <fieldset className="bs-works">
        <legend className="bs-label">I may need these works (optional)</legend>
        {WORK_CHOICES.map(([key, label]) => (
          <label key={key} className="bs-works-option">
            <input type="checkbox" checked={Boolean(works[key])} onChange={(e) => setWorks({ [key]: e.target.checked })} />
            <span>{label}</span>
          </label>
        ))}
        <label className="bs-works-option">
          <input type="checkbox" checked={Boolean(works.other)} onChange={(e) => setWorks({ other: e.target.checked, ...(e.target.checked ? {} : { otherText: '' }) })} />
          <span>Other</span>
        </label>
        {works.other && (
          <input
            type="text"
            className="bs-input"
            aria-label="Other work you may need"
            placeholder="What other work?"
            maxLength={OTHER_WORK_MAX}
            value={works.otherText}
            onChange={(e) => setWorks({ otherText: e.target.value })}
          />
        )}
        <p className="bs-works-note">Ticking these does not change your price. It only lets the owner prepare a quotation.</p>
      </fieldset>
    </div>
  );
}

export default BeforeYouPayStep;
