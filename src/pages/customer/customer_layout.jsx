import { useState } from 'react';
import { FiMenu, FiX } from 'react-icons/fi';
import Sidebar from '../../components/customer_sidebar';

function CustomerLayout({ title, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`dashboard-shell customer-dashboard-shell${sidebarOpen ? ' sidebar-open' : ''}`}>
      <Sidebar onNavigate={() => setSidebarOpen(false)} />

      <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />

      <div className="dashboard-main">
        <div className="dashboard-topbar">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <FiX /> : <FiMenu />}
          </button>
          {title}
        </div>

        <div className="dashboard-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default CustomerLayout;