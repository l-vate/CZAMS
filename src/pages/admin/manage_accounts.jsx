import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';
import UserDetailsModal from '../../components/user_details_modal';

/* ── Small Icon Helpers ───────────────────────────────────── */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Stars({ count = 5 }) {
  return <span className="ma-stars">{'★'.repeat(count)}{'☆'.repeat(5 - count)}</span>;
}

/* ── Registration Form (Technician / Client) ──────────────── */
function RegisterForm({ type, onCancel, onSubmit }) {
  const isTech = type === 'staff';
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
        &larr; Back to Account List
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
                <label className="ma-label">
                  Specialization <span className="ma-label-hint">(Optional)</span>
                </label>
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
            <label className="ma-label">
              Address <span className="ma-label-hint">(Optional)</span>
            </label>
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

/* ── Main Manage Accounts Component ───────────────────────── */
function ManageAccounts() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Technicians'); // 'Technicians' | 'Clients'
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'register'
  const [registerRole, setRegisterRole] = useState('staff'); // 'staff' | 'customer'
  const [justAdded, setJustAdded] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  const filters = ['Technicians', 'Clients'];

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (values) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('http://localhost:5000/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: values.name.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          address: values.address.trim(),
          role: registerRole,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        alert(errData.message || 'Error creating user');
        return;
      }

      const newAccount = await response.json();
      setUsers((prev) => [newAccount, ...prev]);
      setJustAdded(newAccount);
      setView('list');
    } catch (err) {
      console.error('Error creating user:', err);
    }
  };

  const handleUserUpdated = (updatedUser) => {
    setUsers((prev) => prev.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
    setSelectedUser(updatedUser);
  };

  const handleOpenRegister = () => {
    // Dynamically select role based on the current filter tab
    setRegisterRole(activeFilter === 'Technicians' ? 'staff' : 'customer');
    setView('register');
  };

  // Filter users according to search query and selected filter pill
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      (u.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (u._id || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase());

    const matchesFilter =
      activeFilter === 'Technicians'
        ? u.role === 'staff'
        : u.role === 'customer';

    return matchesSearch && matchesFilter;
  });

  return (
    <AdminLayout title="Manage Accounts">
      <div className="page-container">
        <h1 className="dashboard-welcome">Manage Accounts</h1>
        {view === 'register' ? (
          <RegisterForm
            type={registerRole}
            onCancel={() => setView('list')}
            onSubmit={handleRegisterSubmit}
          />
        ) : (
          <div className="ma-list-view">
            {/* Toolbar using ServiceRequests pill filter styling */}
            <div className="req-toolbar" style={{ flexWrap: 'wrap', gap: '12px' }}>
              <div className="req-filters">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Search input box */}
              <div className="ma-search-box" style={{ flex: '1', minWidth: '200px' }}>
                <span className="ma-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by name, ID, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              {/* Single action button adding to the active filter type */}
              <div>
                <button
                  className="req-new-btn"
                  type="button"
                  onClick={handleOpenRegister}
                >
                  + Add Account
                </button>
              </div>
            </div>

            {justAdded && (
              <div className="ma-success-banner" style={{ margin: '16px 0' }}>
                ✓ {justAdded.name} was successfully registered as a{' '}
                {justAdded.role === 'staff' ? 'Technician' : 'Client'} ({justAdded._id}).
              </div>
            )}

            {/* List View */}
            <div className="ma-list" style={{ marginTop: '16px' }}>
              {loading ? (
                <p>Loading accounts...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="req-empty">No accounts found matching your criteria.</p>
              ) : (
                filteredUsers.map((person, i) => {
                  const isTech = person.role === 'staff';
                  const roleLabel = isTech ? 'TECHNICIAN' : 'CLIENT';
                  const links = isTech
                    ? ['View Job History', 'Performance Review', 'Reports']
                    : ['View Bookings', 'Billing History', 'Reports'];

                  return (
                    <div
                      className="ma-list-row"
                      key={person._id}
                      style={{ background: i % 2 === 0 ? '#f4f5f7' : '#ececef' }}
                    >
                      <div className="ma-row-info">
                        <p className="ma-row-role">{roleLabel} NAME</p>
                        <p className="ma-row-name">{person.name || 'No Name Provided'}</p>
                        <p className="ma-row-id">account id: {person._id}</p>
                        <p className="ma-row-rating"><Stars count={person.rating || 5} /></p>
                      </div>

                      <div className="ma-row-links">
                        {links.map((label) => (
                          <a
                            href="#"
                            className="ma-row-link"
                            key={label}
                            onClick={(e) => e.preventDefault()}
                          >
                            <ClockIcon /> {label}
                          </a>
                        ))}
                        <a
                          href="#"
                          className="ma-row-link ma-row-more"
                          onClick={(e) => {
                            e.preventDefault();
                            setSelectedUser(person);
                          }}
                        >
                          View More
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* User Details Modal */}
      {selectedUser && (
        <UserDetailsModal
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onUpdated={handleUserUpdated}
        />
      )}
    </AdminLayout>
  );
}

export default ManageAccounts;