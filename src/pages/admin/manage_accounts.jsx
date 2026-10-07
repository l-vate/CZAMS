import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './admin_layout';
import UserDetailsModal from '../../components/user_details_modal';
import TechnicianPerformanceModal from '../../components/technician_performance_modal';
import { getFilterPillStyle } from '../../utils/statusColors';
import { ApiError } from '../../services/apiClient';
import { listUsers, createUser } from '../../services/userService';
import { ROLE } from '../../constants/roles';

/* ── Small Icon Helpers ───────────────────────────────────── */
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7V12L15 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/* ── Registration Form (Technician / Client) ──────────────── */
function RegisterForm({ type, onCancel, onSubmit }) {
  const isTech = type === ROLE.STAFF;
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
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('Technicians'); // 'Technicians' | 'Clients'
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list'); // 'list' | 'register'
  const [registerRole, setRegisterRole] = useState(ROLE.STAFF);
  const [justAdded, setJustAdded] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [performanceReviewFor, setPerformanceReviewFor] = useState(null);

  const filters = ['Technicians', 'Clients'];

  useEffect(() => {
    fetchAllUsers();
  }, []);

  const fetchAllUsers = async () => {
    try {
      const data = await listUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      if (!(err instanceof ApiError)) console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (values) => {
    try {
      const newAccount = await createUser({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        address: values.address.trim(),
        role: registerRole,
      });
      setUsers((prev) => [newAccount, ...prev]);
      setJustAdded(newAccount);
      setView('list');
    } catch (err) {
      if (err instanceof ApiError) {
        alert(err.message || 'Error creating user');
        return;
      }
      console.error('Error creating user:', err);
    }
  };

  const handleUserUpdated = (updatedUser) => {
    setUsers((prev) => prev.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
    setSelectedUser(updatedUser);
  };

  // Most of these links reuse existing full pages (Bookings, Payments, Service
  // Reports) with a person filter pre-applied via navigation state, rather than
  // building six standalone views - see PersonFilterBanner on each of those pages
  // for the other half of this. Performance Review is the one exception: there's
  // no existing per-technician page to filter into (Analytics is aggregate-only),
  // so it opens a small modal here instead.
  const handleAccountLink = (person, label) => {
    const isTech = person.role === ROLE.STAFF;
    const personFilter = {
      type: isTech ? 'technician' : 'customer',
      id: person._id,
      name: person.name || 'No Name Provided',
    };

    switch (label) {
      case 'View Job History':
      case 'View Bookings':
        navigate('/admin/services/requests', { state: { personFilter } });
        break;
      case 'Performance Review':
        setPerformanceReviewFor(person);
        break;
      case 'Reports':
        navigate('/admin/services/reports', { state: { personFilter } });
        break;
      case 'Billing History':
        navigate('/admin/payments', { state: { personFilter } });
        break;
      default:
        break;
    }
  };

  const handleOpenRegister = () => {
    // Dynamically select role based on the current filter tab
    setRegisterRole(activeFilter === 'Technicians' ? ROLE.STAFF : ROLE.CUSTOMER);
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
        ? u.role === ROLE.STAFF
        : u.role === ROLE.CUSTOMER;

    return matchesSearch && matchesFilter;
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <AdminLayout
      title="Manage Accounts"
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Search by name, ID, or email..."
    >
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
            <div className="req-toolbar admin-manage-accounts-x1">
              <div className="req-filters">
                {filters.map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`filter-pill ${activeFilter === filter ? 'filter-pill--active' : ''}`}
                    style={getFilterPillStyle(filter, activeFilter === filter)}
                    onClick={() => setActiveFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Single action button adding to the active filter type */}
              <div className="admin-manage-accounts-x2">
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
              <div className="ma-success-banner admin-manage-accounts-x3">
                ✓ {justAdded.name} was successfully registered as a{' '}
                {justAdded.role === ROLE.STAFF ? 'Technician' : 'Client'} ({justAdded._id}).
              </div>
            )}

            {/* List View - same tech-job-card shell as the customer's My Bookings
                and technician's My Jobs cards, with a row of action buttons in
                place of the old underlined links. */}
            <div className="tech-job-list admin-manage-accounts-x4">
              {loading ? (
                <p>Loading accounts...</p>
              ) : filteredUsers.length === 0 ? (
                <p className="req-empty">No accounts found matching your criteria.</p>
              ) : (
                filteredUsers.map((person) => {
                  const isTech = person.role === ROLE.STAFF;
                  const roleLabel = isTech ? 'TECHNICIAN' : 'CLIENT';
                  const links = isTech
                    ? ['View Job History', 'Performance Review', 'Reports']
                    : ['View Bookings', 'Billing History', 'Reports'];

                  return (
                    <div
                      className="tech-job-card admin-manage-accounts-x5"
                      key={person._id}
                    >
                      <div className="tech-job-info">
                        <small className="tech-job-date-label">{roleLabel}</small>
                        <div className="tech-job-service">{person.name || 'No Name Provided'}</div>
                        <small className="tech-job-booking">{person._id}</small>
                      </div>

                      <div className="admin-manage-accounts-x6">
                        <div className="admin-manage-accounts-x7">
                          {links.map((label) => (
                            <button
                              type="button"
                              className="view-details-btn admin-manage-accounts-x8"
                              key={label}
                              onClick={() => handleAccountLink(person, label)}
                            >
                              <ClockIcon /> {label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="bs-next-btn admin-manage-accounts-x9"
                            onClick={() => setSelectedUser(person)}
                          >
                            View More
                          </button>
                        </div>
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

      {performanceReviewFor && (
        <TechnicianPerformanceModal
          technician={performanceReviewFor}
          onClose={() => setPerformanceReviewFor(null)}
        />
      )}
    </AdminLayout>
  );
}

export default ManageAccounts;