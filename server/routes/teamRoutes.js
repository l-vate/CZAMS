const { ROLE } = require('../constants/roles');
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Team = require('../models/Team');
const User = require('../models/User');
const { getBusyTechnicianIds } = require('../utils/assignments');
const { TIME_BLOCKS } = require('../utils/timeBlocks');

function adminOnly(req, res, next) {
  if (req.userRole !== ROLE.ADMIN) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
}

const POPULATE = [
  { path: 'lead', select: 'name email isActive' },
  { path: 'helper', select: 'name email isActive' },
];

// A team is valid when both members are different, active technicians who are not already
// on another ACTIVE team. Returns an error message, or null when fine.
async function validateMembers(leadId, helperId, ignoreTeamId) {
  if (!leadId || !helperId) return 'A team needs both a lead and a helper.';
  if (leadId === helperId) return 'The lead and the helper must be two different technicians.';

  const members = await User.find({ _id: { $in: [leadId, helperId] } }).select('name role isActive');
  if (members.length !== 2 || members.some((u) => u.role !== ROLE.STAFF)) {
    return 'The lead and the helper must both be technician accounts.';
  }
  const inactive = members.find((u) => u.isActive === false);
  if (inactive) return `${inactive.name} is deactivated and cannot be on a team.`;

  const clash = await Team.findOne({
    isActive: true,
    ...(ignoreTeamId ? { _id: { $ne: ignoreTeamId } } : {}),
    $or: [{ lead: { $in: [leadId, helperId] } }, { helper: { $in: [leadId, helperId] } }],
  });
  if (clash) {
    const busy = members.find((u) => [clash.lead, clash.helper].includes(u._id));
    return `${busy?.name || 'A technician'} is already on the active team "${clash.name}". A technician can only be on one active team at a time.`;
  }
  return null;
}

// Admin: every team.
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const teams = await Team.find().populate(POPULATE).sort({ name: 1 });
    res.json(teams);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: which teams and technicians are free in a date and time block. A team is free only
// if BOTH members are free. excludeBookingId ignores that booking's own current assignment,
// so reassigning a booking does not make its own team look busy.
// Registered before '/:id' so it is not read as a team id.
router.get('/availability', auth, adminOnly, async (req, res) => {
  try {
    const { date, time, excludeBookingId } = req.query;
    if (!date || !TIME_BLOCKS.includes(time)) {
      return res.status(400).json({ message: 'A date and a time block (Morning or Afternoon) are required.' });
    }

    const busy = new Set(await getBusyTechnicianIds(date, time, excludeBookingId));
    const teams = await Team.find({ isActive: true }).populate(POPULATE).sort({ name: 1 });
    const technicians = await User.find({ role: ROLE.STAFF, isActive: true }).select('name').sort({ name: 1 });

    const teamOf = new Map();
    teams.forEach((t) => {
      teamOf.set(t.lead._id, t);
      teamOf.set(t.helper._id, t);
    });

    res.json({
      teams: teams.map((t) => {
        const busyMembers = [t.lead, t.helper].filter((m) => busy.has(m._id)).map((m) => m.name);
        const membersActive = t.lead.isActive !== false && t.helper.isActive !== false;
        return {
          _id: t._id,
          name: t.name,
          lead: { _id: t.lead._id, name: t.lead.name },
          helper: { _id: t.helper._id, name: t.helper.name },
          free: busyMembers.length === 0 && membersActive,
          busyMembers,
        };
      }),
      technicians: technicians.map((u) => ({
        _id: u._id,
        name: u.name,
        free: !busy.has(u._id),
        teamName: teamOf.get(u._id)?.name || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const { lead, helper } = req.body;
    if (!name) return res.status(400).json({ message: 'A team name is required.' });

    const problem = await validateMembers(lead, helper);
    if (problem) return res.status(400).json({ message: problem });

    const team = await Team.create({ name, lead, helper, isActive: true });
    res.status(201).json(await team.populate(POPULATE));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A team with that name already exists.' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Edit name, members and active state. Bookings already assigned keep the lead and helper
// they were given, so editing a team never rewrites history.
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) return res.status(404).json({ message: 'Team not found' });

    const name = req.body.name !== undefined ? String(req.body.name).trim() : team.name;
    const lead = req.body.lead !== undefined ? req.body.lead : team.lead;
    const helper = req.body.helper !== undefined ? req.body.helper : team.helper;
    const isActive = req.body.isActive !== undefined ? !!req.body.isActive : team.isActive;
    if (!name) return res.status(400).json({ message: 'A team name is required.' });

    // Members only matter while the team is active; a deactivated team frees its technicians.
    if (isActive) {
      const problem = await validateMembers(lead, helper, team._id);
      if (problem) return res.status(400).json({ message: problem });
    } else if (!lead || !helper || lead === helper) {
      return res.status(400).json({ message: 'The lead and the helper must be two different technicians.' });
    }

    team.name = name;
    team.lead = lead;
    team.helper = helper;
    team.isActive = isActive;
    await team.save();
    res.json(await team.populate(POPULATE));
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'A team with that name already exists.' });
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
