import Sidebar from '../../components/admin_sidebar';

function AdminLayout({ title, children }) {
  return (
    <div className="dashboard-shell">
      <Sidebar />

      <div className="dashboard-main">
        <div className="dashboard-topbar">
          {title}
        </div>

        <div className="dashboard-body">
          {children}
        </div>
      </div>
    </div>
  );
}

export default AdminLayout;