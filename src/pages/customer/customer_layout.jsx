import Sidebar from '../../components/sidebar';

function CustomerLayout({ title, children }) {
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

export default CustomerLayout;