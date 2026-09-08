import { useEffect, useState } from "react";
import AdminLayout from '../../components/layouts/admin_layout';

function Calendar() {
  return (
    <AdminLayout title="Calendar">
      <div className="calendar"></div>
    </AdminLayout>
  );
}

export default Calendar;