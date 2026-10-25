import { useEffect } from 'react';
import { matchingUnits, groupByBrand, unitLabel, chosenBrand, NOT_LISTED_NOTES_MAX, NOT_LISTED_BRAND_MAX } from '../utils/suppliedUnitChoice';
import { formatPeso } from '../utils/bookingPricing';

// The choice of unit for one unit entry of an installation where the company supplies the unit: the catalog items that fit the unit type
// and horsepower already chosen, grouped by brand, and "Not listed, ask the owner". An empty list or no match says so and leaves the
// request open. The price of a chosen unit is added to the total. Nothing here is invented: the list is whatever the admin entered.
function SuppliedUnitPicker({ unit, index, items, loaded, onChange }) {
  const supplied = unit.supplied;
  const matches = matchingUnits(items, unit);
  const groups = groupByBrand(matches);
  const requesting = Boolean(supplied?.notListed);
  const name = `unit-choice-${index}`;
  const brand = chosenBrand(unit);
  const ready = loaded && Boolean(unit.type && unit.hp && brand);

  // Once the brand is chosen the catalog is matched by type, horsepower and brand: a single match is chosen for the customer, and no match
  // becomes a request for the owner to confirm (the booking stays Pending with the "unit needs owner confirmation" note).
  useEffect(() => {
    if (!ready || supplied) return;
    if (matches.length === 1) {
      const item = matches[0];
      onChange({ catalogId: item._id, brand: item.brand, model: item.model, type: item.type, hp: item.hp, inverter: item.inverter, price: item.price });
    } else if (matches.length === 0) {
      onChange({ notListed: true, brand, notes: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, supplied, matches.length, brand]);

  if (!unit.type || !unit.hp) {
    return <p className="supplied-picker-hint">Choose the unit type and horsepower to see the units we supply.</p>;
  }
  if (!brand) return <p className="supplied-picker-hint">Choose the brand to see the units we supply.</p>;
  if (!loaded) return <p className="supplied-picker-hint" role="status">Loading the units we supply...</p>;

  const pick = (item) => onChange({ catalogId: item._id, brand: item.brand, model: item.model, type: item.type, hp: item.hp, inverter: item.inverter, price: item.price });
  const requestNotListed = () => onChange({ notListed: true, brand: supplied?.brand || '', notes: supplied?.notes || '' });

  return (
    <fieldset className="supplied-picker">
      <legend>Unit we supply ({unit.type}, {unit.hp} HP)</legend>
      {matches.length === 0 && (
        <p className="supplied-picker-hint">We do not have this unit listed. Your booking is sent as Pending and the owner will confirm it.</p>
      )}
      {groups.map((group) => (
        <div key={group.brand} className="supplied-picker-group">
          <p className="supplied-picker-brand">{group.brand}</p>
          {group.items.map((item) => (
            <label key={item._id} className={`supplied-picker-option${supplied?.catalogId === item._id ? ' is-chosen' : ''}`}>
              <input type="radio" name={name} checked={supplied?.catalogId === item._id} onChange={() => pick(item)} />
              <span>{unitLabel(item)}</span>
              <strong>{formatPeso(item.price)} each</strong>
            </label>
          ))}
        </div>
      ))}
      <label className={`supplied-picker-option${requesting ? ' is-chosen' : ''}`}>
        <input type="radio" name={name} checked={requesting} onChange={requestNotListed} />
        <span>Not listed, ask the owner</span>
      </label>
      {requesting && (
        <div className="supplied-picker-request">
          <input
            type="text"
            className="bs-input"
            placeholder="Brand you want"
            aria-label="Brand you want"
            maxLength={NOT_LISTED_BRAND_MAX}
            value={supplied.brand || ''}
            onChange={(e) => onChange({ ...supplied, brand: e.target.value })}
          />
          <textarea
            className="bs-textarea"
            rows={2}
            placeholder="Anything else the owner should know: model, inverter or not, color"
            aria-label="Notes for the owner"
            maxLength={NOT_LISTED_NOTES_MAX}
            value={supplied.notes || ''}
            onChange={(e) => onChange({ ...supplied, notes: e.target.value })}
          />
          <p className="supplied-picker-hint">
            Your booking is sent as Pending with a note that this unit needs the owner&apos;s confirmation. The price is added once the owner confirms it, and you are told in the app.
          </p>
        </div>
      )}
    </fieldset>
  );
}

export default SuppliedUnitPicker;
