import Sidebar from '../../components/staff_sidebar';

function StaffLayout({ title, children }) {
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

export default StaffLayout;