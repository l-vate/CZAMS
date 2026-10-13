import { useState, useEffect, useCallback } from 'react';
import AdminLayout from './admin_layout';
import { attempt, orFallback } from '../../services/apiClient';
import { listTeams, createTeam, updateTeam } from '../../services/teamService';
import { listUsers } from '../../services/userService';

const EMPTY_FORM = { name: '', lead: '', helper: '' };

// Technician teams: a fixed lead plus helper pair. A technician can be on only one active
// team at a time. Teams are what the admin assigns to bookings; deactivating a team frees
// its technicians and never changes bookings that were already assigned to it.
function Teams() {
  const [teams, setTeams] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null); // null = creating
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [teamList, users] = await Promise.all([
        orFallback(listTeams(), []),
        orFallback(listUsers('staff'), []),
      ]);
      setTeams(teamList);
      setTechnicians(users.filter((u) => u.isActive !== false));
    } catch (err) {
      console.error('Error loading teams:', err);
      setError('Could not load teams.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Which active team a technician is already on (ignoring the team being edited).
  const activeTeamOf = (userId) =>
    teams.find((t) => t.isActive && t._id !== editingId && (t.lead._id === userId || t.helper._id === userId));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !form.lead || !form.helper) {
      setError('Give the team a name and choose both a lead and a helper.');
      return;
    }
    setSaving(true);
    try {
      const saved = await attempt(editingId ? updateTeam(editingId, form) : createTeam(form), 'Could not save the team.');
      if (saved.error) {
        setError(saved.error);
        return;
      }
      setForm(EMPTY_FORM);
      setEditingId(null);
      await load();
    } catch (err) {
      console.error('Error saving team:', err);
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (team) => {
    setError('');
    const updated = await attempt(updateTeam(team._id, { isActive: !team.isActive }), 'Could not update the team.');
    if (updated.error) {
      setError(updated.error);
      return;
    }
    await load();
  };

  const startEdit = (team) => {
    setEditingId(team._id);
    setForm({ name: team.name, lead: team.lead._id, helper: team.helper._id });
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const memberOptions = (otherValue) =>
    technicians.map((u) => {
      const team = activeTeamOf(u._id);
      return (
        <option key={u._id} value={u._id} disabled={!!team || u._id === otherValue}>
          {u.name}{team ? ` (on ${team.name})` : ''}
        </option>
      );
    });

  return (
    <AdminLayout title="Teams">
      <h1 className="dashboard-welcome">Technician Teams</h1>
      <p className="bs-card-sub">
        A team is a fixed lead plus a helper. A technician can be on one active team at a time. Bookings are assigned to
        teams; only the lead files the service report.
      </p>

      <form className="bs-card" onSubmit={submit}>
        <h3 className="bs-card-title">{editingId ? 'Edit team' : 'Create a team'}</h3>
        <div className="bs-two-col">
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="team-name">Team name</label>
            <input id="team-name" className="bs-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Team Alpha" />
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="team-lead">Lead</label>
            <select id="team-lead" className="bs-select" value={form.lead} onChange={(e) => setForm({ ...form, lead: e.target.value })}>
              <option value="">Choose the lead</option>
              {memberOptions(form.helper)}
            </select>
          </div>
          <div className="bs-field-group">
            <label className="bs-label" htmlFor="team-helper">Helper</label>
            <select id="team-helper" className="bs-select" value={form.helper} onChange={(e) => setForm({ ...form, helper: e.target.value })}>
              <option value="">Choose the helper</option>
              {memberOptions(form.lead)}
            </select>
          </div>
        </div>
        {error && <p className="ma-form-error">{error}</p>}
        <div className="admin-teams-x1">
          <button type="submit" className="svc-btn svc-btn-primary" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Save team' : 'Create team'}
          </button>
          {editingId && (
            <button type="button" className="svc-btn svc-btn-ghost" onClick={cancelEdit}>Cancel</button>
          )}
        </div>
      </form>

      {loading ? (
        <p>Loading teams...</p>
      ) : teams.length === 0 ? (
        <p className="svc-empty">No teams yet. Create the first one above.</p>
      ) : (
        <div className="tech-job-list">
          {teams.map((team) => (
            <div className={`tech-job-card ${team.isActive ? '' : 'tech-job-card--dimmed'}`} key={team._id}>
              <div className="tech-job-info">
                <div className="tech-job-top-row">
                  <span className={`tech-job-status-badge ${team.isActive ? 'tech-status-completed' : 'tech-status-cancelled'}`}>
                    {team.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="tech-job-service">{team.name}</div>
                <small className="tech-job-booking">Lead: {team.lead.name} · Helper: {team.helper.name}</small>
              </div>
              <div className="admin-teams-x1">
                <button type="button" className="view-details-btn" onClick={() => startEdit(team)}>Edit</button>
                <button type="button" className="view-details-btn" onClick={() => toggleActive(team)}>
                  {team.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
}

export default Teams;
