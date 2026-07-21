import React, { useState, useEffect } from 'react';
import AdminLayout from './admin_layout';

function ServiceManage() {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({ name: '', description: '', price: '' });
    const [editingId, setEditingId] = useState(null);

    // Fetch services from MongoDB API
    useEffect(() => {
        fetchServices();
    }, []);

    const fetchServices = async () => {
        try {
            const response = await fetch('/api/services');
            const data = await response.json();
            setServices(data);
        } catch (error) {
            console.error('Error fetching services:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/api/services/${editingId}` : '/api/services';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });
            if (response.ok) {
                setFormData({ name: '', description: '', price: '' });
                setEditingId(null);
                fetchServices();
            }
        } catch (error) {
            console.error('Error saving service:', error);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this service?')) return;
        try {
            await fetch(`/api/services/${id}`, { method: 'DELETE' });
            fetchServices();
        } catch (error) {
            console.error('Error deleting service:', error);
        }
    };

    const handleEdit = (service) => {
        setEditingId(service._id);
        setFormData({ name: service.name, description: service.description, price: service.price });
    };

    return (
        <AdminLayout title="Manage Services">
            <div className="page-container">
                <h1 className="dashboard-welcome">Manage Services</h1>

                {/* Service Form */}
                <form onSubmit={handleSubmit} className="mb-6 p-4 border rounded">
                    <h2>{editingId ? 'Edit Service' : 'Add New Service'}</h2>
                    <input
                        type="text"
                        placeholder="Service Name"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        required
                    />
                    <input
                        type="text"
                        placeholder="Description"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        required
                    />
                    <input
                        type="number"
                        placeholder="Price"
                        value={formData.price}
                        onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                        required
                    />
                    <button type="submit">{editingId ? 'Update' : 'Create'} Service</button>
                    {editingId && <button type="button" onClick={() => setEditingId(null)}>Cancel</button>}
                </form>

                {/* Services List */}
                {loading ? (
                    <p>Loading services...</p>
                ) : (
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Price</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {services.map((service) => (
                                <tr key={service._id}>
                                    <td>{service.name}</td>
                                    <td>{service.description}</td>
                                    <td>${service.price}</td>
                                    <td>
                                        <button onClick={() => handleEdit(service)}>Edit</button>
                                        <button onClick={() => handleDelete(service._id)}>Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
}

export default ServiceManage;