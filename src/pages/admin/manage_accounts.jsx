import { useState } from 'react';
import AdminLayout from './admin_layout';
import '../../css/admin.css';

/* ── Mock Data ─────────────────────────────────────────────
   TODO: replace with data fetched from the backend            */
const INITIAL_TECHNICIANS = [
  { id: 'TCH-0001', name: 'Juan Dela Cruz', rating: 5, email: 'juan.delacruz@email.com', phone: '+63 917 000 0001', address: '—' },
  { id: 'TCH-0002', name: 'Pedro Santos', rating: 4, email: 'pedro.santos@email.com', phone: '+63 917 000 0002', address: '—' },
  { id: 'TCH-0003', name: 'Maria Reyes', rating: 5, email: 'maria.reyes@email.com', phone: '+63 917 000 0003', address: '—' },
  { id: 'TCH-0004', name: 'Ana Villanueva', rating: 3, email: 'ana.villanueva@email.com', phone: '+63 917 000 0004', address: '—' },
  { id: 'TCH-0005', name: 'Carlos Mendoza', rating: 5, email: 'carlos.mendoza@email.com', phone: '+63 917 000 0005', address: '—' },
];

const INITIAL_CLIENTS = [
  { id: 'CLT-0001', name: 'Liza Fernandez', rating: 5, email: 'liza.fernandez@email.com', phone: '+63 917 100 0001', address: '—' },
  { id: 'CLT-0002', name: 'Mark Torres', rating: 4, email: 'mark.torres@email.com', phone: '+63 917 100 0002', address: '—' },
  { id: 'CLT-0003', name: 'Grace Ramos', rating: 5, email: 'grace.ramos@email.com', phone: '+63 917 100 0003', address: '—' },
  { id: 'CLT-0004', name: 'Noel Aquino', rating: 4, email: 'noel.aquino@email.com', phone: '+63 917 100 0004', address: '—' },
];

/* ── Helpers ───────────────────────────────────────────────── */
function generateAccountId(prefix, list) {
  const num = list.length + 1;
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

/* ── Small icon helpers ───────────────────────────────────── */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="white" strokeWidth="1.6" />
      <path d="M8 5V3.5C8 3.22386 8.22386 3 8.5 3H15.5C15.7761 3 16 3.22386 16 3.5V5" stroke="white" strokeWidth="1.6" />
      <path d="M3 10H21" stroke="white" strokeWidth="1.6" />
    </svg>
  );
}

function Stars({ count }) {
  return <span className="ma-stars">{'★'.repeat(count)}{'☆'.repeat(5 - count)}</span>;
}

/* ── Overview: the two nav cards ──────────────────────────── */
function Overview({ onSelect }) {
  return (
    <div className="ma-overview">
      <h1 className="ma-page-title">CZA User Account Management</h1>

      <div className="ma-account-cards">
        <button className="ma-account-card" type="button" onClick={() => onSelect('technicians')}>
          <span className="ma-account-icon"><AccountIcon /></span>
          <span className="ma-account-text">
            <span className="ma-account-title">Technicians</span>
            <span className="ma-account-subtitle">Manage Technician Accounts</span>
          </span>
          <span className="ma-account-arrow" aria-hidden="true">&rarr;</span>
        </button>

        <button className="ma-account-card" type="button" onClick={() => onSelect('clients')}>
          <span className="ma-account-icon"><AccountIcon /></span>
          <span className="ma-account-text">
            <span className="ma-account-title">Clients</span>
            <span className="ma-account-subtitle">Manage Client Accounts</span>
          </span>
          <span className="ma-account-arrow" aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  );
}

/* ── Registration form (Technician / Client) ──────────────── */
function RegisterForm({ type, onCancel, onSubmit }) {
  const isTech = type === 'technicians';
  const [values, setValues] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    specialization: '',
  });
  const [error, setError] = useState('');

  const update = (field) => (e) => setValues({ ...values, [field]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!values.name.trim() || !values.email.trim() || !values.phone.trim()) {
      setError('Name, email, and phone number are required.');
      return;
    }
    setError('');
    onSubmit(values);
  };

  return (
    <div className="ma-form-view">
      <button className="ma-back-link" type="button" onClick={onCancel}>
        &larr; Back to {isTech ? 'Technicians' : 'Clients'}
      </button>

      <div className="ma-form-card">
        <h3 className="ma-form-title">
          {isTech ? 'Register New Technician' : 'Register New Client'}
        </h3>
        <p className="ma-form-sub">
          Fill in the details below to create a new {isTech ? 'technician' : 'client'} account.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="ma-form-grid">
            <div className="ma-field-group">
              <label className="ma-label">Full Name</label>
              <input
                type="text"
                className="ma-input"
                placeholder="e.g. Juan Dela Cruz"
                value={values.name}
                onChange={update('name')}
              />
            </div>

            <div className="ma-field-group">
              <label className="ma-label">Email Address</label>
              <input
                type="email"
                className="ma-input"
                placeholder="e.g. juan.delacruz@email.com"
                value={values.email}
                onChange={update('email')}
              />
            </div>

            <div className="ma-field-group">
              <label className="ma-label">Phone Number</label>
              <input
                type="tel"
                className="ma-input"
                placeholder="e.g. +63 917 000 0000"
                value={values.phone}
                onChange={update('phone')}
              />
            </div>

            {isTech && (
              <div className="ma-field-group">
                <label className="ma-label">Specialization <span className="ma-label-hint">(Optional)</span></label>
                <input
                  type="text"
                  className="ma-input"
                  placeholder="e.g. Installation, Repair, Maintenance"
                  value={values.specialization}
                  onChange={update('specialization')}
                />
              </div>
            )}
          </div>

          <div className="ma-field-group">
            <label className="ma-label">Address <span className="ma-label-hint">(Optional)</span></label>
            <textarea
              className="ma-textarea"
              rows={2}
              placeholder="House No., Street, Barangay, City"
              value={values.address}
              onChange={update('address')}
            />
          </div>

          {error && <p className="ma-form-error">{error}</p>}

          <div className="ma-form-actions">
            <button type="button" className="ma-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="ma-submit-btn">
              Create Account
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Reusable list view (Technicians / Clients) ───────────── */
function AccountListView({ type, data, onBack, onGoRegister, justAdded }) {
  const [search, setSearch] = useState('');

  const isTech = type === 'technicians';
  const registerLabel = isTech ? '+ Register New Account' : '+ Register New Client';
  const roleLabel = isTech ? 'TECHNICIAN NAME' : 'CLIENT NAME';

  const links = isTech
    ? ['View Job History', 'Performance Review', 'Reports']
    : ['View Bookings', 'Billing History', 'Reports'];

  const filtered = data.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="ma-list-view">
      <button className="ma-back-link" type="button" onClick={onBack}>
        &larr; Back to Account Management
      </button>

      {justAdded && (
        <div className="ma-success-banner">
          ✓ {justAdded.name} was successfully registered as a {isTech ? 'technician' : 'client'} ({justAdded.id}).
        </div>
      )}

      <div className="ma-list-toolbar">
        <div className="ma-search-box">
          <span className="ma-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="ma-register-btn" type="button" onClick={onGoRegister}>
          {registerLabel}
        </button>
      </div>

      <div className="ma-list">
        {filtered.map((person, i) => (
          <div
            className="ma-list-row"
            key={person.id}
            style={{ background: i % 2 === 0 ? '#f4f5f7' : '#ececef' }}
          >
            <div className="ma-row-info">
              <p className="ma-row-role">{roleLabel}</p>
              <p className="ma-row-name">{person.name}</p>
              <p className="ma-row-id">account id: {person.id}</p>
              <p className="ma-row-rating"><Stars count={person.rating} /></p>
            </div>

            <div className="ma-row-links">
              {links.map((label) => (
                <a href="#" className="ma-row-link" key={label} onClick={(e) => e.preventDefault()}>
                  <ClockIcon /> {label}
                </a>
              ))}
              <a href="#" className="ma-row-link ma-row-more" onClick={(e) => e.preventDefault()}>
                View More
              </a>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="ma-empty">No {isTech ? 'technicians' : 'clients'} match your search.</p>
        )}
      </div>
    </div>
  );
}

/* ── Main ─────────────────────────────────────────────────── */
function ManageAccounts() {
  const [view, setView] = useState('overview'); // 'overview' | 'technicians' | 'clients' | 'register-technicians' | 'register-clients'
  const [technicians, setTechnicians] = useState(INITIAL_TECHNICIANS);
  const [clients, setClients] = useState(INITIAL_CLIENTS);
  const [justAdded, setJustAdded] = useState(null);

  const handleRegisterSubmit = (type) => (values) => {
    const isTech = type === 'technicians';
    const list = isTech ? technicians : clients;
    const newAccount = {
      id: generateAccountId(isTech ? 'TCH' : 'CLT', list),
      name: values.name.trim(),
      rating: 0,
      email: values.email.trim(),
      phone: values.phone.trim(),
      address: values.address.trim() || '—',
      ...(isTech ? { specialization: values.specialization.trim() || '—' } : {}),
    };

    // TODO: replace with a POST request to the backend/auth service
    if (isTech) {
      setTechnicians([...technicians, newAccount]);
    } else {
      setClients([...clients, newAccount]);
    }

    setJustAdded(newAccount);
    setView(type); // back to the list
  };

  return (
    <AdminLayout title="Manage Accounts">
      {view === 'overview' && <Overview onSelect={(v) => { setJustAdded(null); setView(v); }} />}

      {view === 'technicians' && (
        <AccountListView
          type="technicians"
          data={technicians}
          onBack={() => { setJustAdded(null); setView('overview'); }}
          onGoRegister={() => setView('register-technicians')}
          justAdded={justAdded}
        />
      )}

      {view === 'clients' && (
        <AccountListView
          type="clients"
          data={clients}
          onBack={() => { setJustAdded(null); setView('overview'); }}
          onGoRegister={() => setView('register-clients')}
          justAdded={justAdded}
        />
      )}

      {view === 'register-technicians' && (
        <RegisterForm
          type="technicians"
          onCancel={() => setView('technicians')}
          onSubmit={handleRegisterSubmit('technicians')}
        />
      )}

      {view === 'register-clients' && (
        <RegisterForm
          type="clients"
          onCancel={() => setView('clients')}
          onSubmit={handleRegisterSubmit('clients')}
        />
      )}
    </AdminLayout>
  );
}

export default ManageAccounts;