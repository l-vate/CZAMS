import { useState } from 'react';
import AdminLayout from './admin_layout';
import ServiceRequests from './service_requests';
import ManageServices from './service_manage';
import ServiceReports from './service_reports';
import '../../css/admin.css';

const STATUS_ICON = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

function ServicesMenu({ onSelect }) {
  return (
    <div className="svc-menu">
      <h1 className="dashboard-welcome">CZA Services Management</h1>

      <button type="button" className="svc-menu-card svc-menu-card-lg" onClick={() => onSelect('requests')}>
        <span className="svc-menu-icon">{STATUS_ICON}</span>
        <span className="svc-menu-text">
          <span className="svc-menu-title">Requests</span>
          <span className="svc-menu-sub">View service requests made by clients.</span>
        </span>
        <span className="svc-menu-arrow">→</span>
      </button>

      <div className="svc-menu-row">
        <button type="button" className="svc-menu-card svc-menu-card-light" onClick={() => onSelect('manage')}>
          <span className="svc-menu-icon">{STATUS_ICON}</span>
          <span className="svc-menu-text">
            <span className="svc-menu-title">Manage Services</span>
            <span className="svc-menu-sub">Manage available services, pricing, and more.</span>
          </span>
          <span className="svc-menu-arrow">→</span>
        </button>

        <button type="button" className="svc-menu-card svc-menu-card-lg" onClick={() => onSelect('reports')}>
          <span className="svc-menu-icon">{STATUS_ICON}</span>
          <span className="svc-menu-text">
            <span className="svc-menu-title">Reports</span>
            <span className="svc-menu-sub">View service reports</span>
          </span>
          <span className="svc-menu-arrow">→</span>
        </button>
      </div>
    </div>
  );
}

function Services() {
  const [view, setView] = useState('menu'); // 'menu' | 'requests' | 'manage' | 'reports'

  return (
    <AdminLayout title="Services">
      {view === 'menu' && <ServicesMenu onSelect={setView} />}
      {view === 'requests' && <ServiceRequests onBack={() => setView('menu')} />}
      {view === 'manage' && <ManageServices onBack={() => setView('menu')} />}
      {view === 'reports' && <ServiceReports onBack={() => setView('menu')} />}
    </AdminLayout>
  );
}

export default Services;