import { BarChart, DonutChart, HorizontalBarChart, ChartCard } from './charts';
import { getRequestsPerMonth, getBookingsByStatus, getCompletedPerTechnician } from '../utils/chartData';

// The three operations charts. `bookings` must already be narrowed to the client type
// (and, on the Reports page, the date range) the viewer picked. `range` ({ from, to })
// sets the months shown in the first chart; without it, the last 6 months.
function DashboardCharts({ bookings, range }) {
  const perMonth = getRequestsPerMonth(bookings, range);
  const byStatus = getBookingsByStatus(bookings);
  const perTechnician = getCompletedPerTechnician(bookings);

  return (
    <div className="chart-grid-row">
      <ChartCard title="Service Requests per Month">
        <BarChart
          data={perMonth.data}
          xLabel={perMonth.xLabel}
          yLabel="Requests"
          ariaLabel="Bar chart of service requests per month"
        />
      </ChartCard>

      <ChartCard title="Bookings by Status">
        <DonutChart data={byStatus} centerLabel="Bookings" ariaLabel="Donut chart of bookings by status" />
      </ChartCard>

      <ChartCard title="Completed Jobs per Technician">
        <HorizontalBarChart
          data={perTechnician}
          xLabel="Completed jobs"
          ariaLabel="Horizontal bar chart of completed jobs per technician"
        />
        <p className="chart-note">Free back-job repair visits are not counted, the same as in the Technician Performance table.</p>
      </ChartCard>
    </div>
  );
}

export default DashboardCharts;
