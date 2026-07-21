import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';

function ServiceReports() {
    const [reports, setReports] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReports();
    }, []);

    const fetchReports = async () => {
        try {
            const response = await fetch('/api/service-reports');
            const data = await response.json();
            setReports(data);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AdminLayout title="Service Reports">
            <div className="page-container">
                <h1 className="dashboard-welcome">Service Performance & Reports</h1>

                {loading ? (
                    <p>Generating reports...</p>
                ) : reports ? (
                    <div className="reports-grid">
                        <div className="card">
                            <h3>Total Revenue</h3>
                            <p className="text-2xl font-bold">${reports.totalRevenue ?? 0}</p>
                        </div>
                        <div className="card">
                            <h3>Completed Services</h3>
                            <p className="text-2xl font-bold">{reports.completedCount ?? 0}</p>
                        </div>
                        <div className="card">
                            <h3>Pending Requests</h3>
                            <p className="text-2xl font-bold">{reports.pendingCount ?? 0}</p>
                        </div>
                    </div>
                ) : (
                    <p>No report data available.</p>
                )}
            </div>
        </AdminLayout>
    );
}

export default ServiceReports;  