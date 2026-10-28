import QuotationTerms from './quotation_terms';
import { standardTerms } from '../utils/quotationTerms';

// The "Before you pay" step: the terms (estimated time, what is not included, warranty) and a callout about quotations. It comes right
// before Payment and is only shown for a service that has these terms. (The old "I may need these works" checklist is gone: a customer
// cannot be expected to know which works a site needs, so the owner works that out and sends a quotation.)
function BeforeYouPayStep({ form, isCommercial = false }) {
  return (
    <div className="bs-card bs-before-pay">
      <h3 className="bs-card-title">Before you pay</h3>
      <p className="bs-card-sub">Please read this before you choose how to pay.</p>

      <QuotationTerms terms={standardTerms({ clientSuppliedUnit: !!form.clientSuppliedUnit })} isCommercial={isCommercial} title="Good to know" />

      <div className="bs-callout" role="note">
        If any of these are needed, or your site needs extra work such as longer pipe or a distance charge, the owner will get back to you with a quotation and the updated total. You will see it on your booking.
      </div>
    </div>
  );
}

export default BeforeYouPayStep;
