import { useState } from 'react';
import { LIMITS } from '../constants/inputLimits';
import { SERVICE_CITIES, SERVICE_CITY_NAMES, OTHER_CITY, partsForForm } from '../constants/addressOptions';
import { buildAddress, addressPartsProblem } from '../utils/addressParts';

// The address as separate boxes: House or Block and Lot, Street, Subdivision or Building (optional), Barangay, City or Municipality
// (a list of the service areas plus Other), Province and a 4 digit ZIP code. A one line preview shows the address the way every other
// screen will show it (utils/addressParts.js builds it, the same code as the server). `value` is the parts, `onChange` gets the new parts.
function AddressFields({ value, onChange, idPrefix = 'addr', onFocus }) {
  const parts = partsForForm(value);
  // Other is chosen from the list; its own box then takes the city. A saved city that is not in the list opens as Other.
  const [otherChosen, setOtherChosen] = useState(() => Boolean(parts.city) && !SERVICE_CITY_NAMES.includes(parts.city));
  const showOther = otherChosen || (Boolean(parts.city) && !SERVICE_CITY_NAMES.includes(parts.city));
  const selectValue = showOther ? OTHER_CITY : parts.city;

  const set = (key, text) => onChange({ ...parts, [key]: text });

  const chooseCity = (name) => {
    if (name === OTHER_CITY) {
      setOtherChosen(true);
      onChange({ ...parts, city: '' });
      return;
    }
    setOtherChosen(false);
    const known = SERVICE_CITIES.find((c) => c.name === name);
    // the province is only suggested, and only while it is empty
    onChange({ ...parts, city: name, province: parts.province || (known ? known.province : '') });
  };

  const line = buildAddress(parts);
  const problem = parts.zip && !/^\d{4}$/.test(parts.zip) ? 'ZIP code must be exactly 4 digits.' : (line.length > LIMITS.address ? addressPartsProblem(parts) : '');

  const box = (key, label, limit, extra = {}) => (
    <div className="bs-field-group address-field">
      <label className="bs-label" htmlFor={`${idPrefix}-${key}`}>
        {label}{extra.optional && <span className="bs-label-hint"> (Optional)</span>}
      </label>
      <input
        id={`${idPrefix}-${key}`} type="text" className="bs-input" maxLength={limit}
        autoComplete={extra.autoComplete || 'off'} onFocus={onFocus}
        inputMode={extra.inputMode} value={parts[key]}
        onChange={(e) => set(key, extra.digitsOnly ? e.target.value.replace(/\D/g, '') : e.target.value)}
      />
    </div>
  );

  return (
    <div className="address-fields">
      <div className="address-grid">
        {box('houseLot', 'House or Block and Lot', LIMITS.addressHouseLot, { autoComplete: 'address-line1' })}
        {box('street', 'Street', LIMITS.addressStreet, { autoComplete: 'address-line2' })}
        {box('subdivision', 'Subdivision or Building', LIMITS.addressSubdivision, { optional: true })}
        {box('barangay', 'Barangay', LIMITS.addressBarangay, { autoComplete: 'address-level3' })}
        <div className="bs-field-group address-field">
          <label className="bs-label" htmlFor={`${idPrefix}-city`}>City or Municipality</label>
          <select id={`${idPrefix}-city`} className="bs-input" value={selectValue} onChange={(e) => chooseCity(e.target.value)} onFocus={onFocus}>
            <option value="">Select a city</option>
            {SERVICE_CITY_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
            <option value={OTHER_CITY}>{OTHER_CITY}</option>
          </select>
        </div>
        {showOther && box('city', 'Other city or municipality', LIMITS.addressCity, { autoComplete: 'address-level2' })}
        {box('province', 'Province', LIMITS.addressProvince, { autoComplete: 'address-level1' })}
        {box('zip', 'ZIP code', LIMITS.addressZip, { autoComplete: 'postal-code', inputMode: 'numeric', digitsOnly: true })}
      </div>
      {problem && <p className="address-problem" role="alert">{problem}</p>}
      <p className="address-preview" aria-live="polite">
        <span className="address-preview-label">Address</span>
        {line || 'It appears here as you fill in the boxes.'}
      </p>
    </div>
  );
}

export default AddressFields;
