import { Router } from 'express';
import User from '../models/User.js';
import Swap from '../models/Swap.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, ApiError, toPublicProfile, escapeRegex } from '../utils/http.js';
import { scoreMatch, buildScarcity } from '../services/matcher.js';

const router = Router();

async function getMe(req) {
  const me = await User.findById(req.userId);
  if (!me) throw new ApiError(401, 'Account no longer exists');
  return me;
}

// GET /api/matches - ranked recommendations for the logged-in user
router.get(
  '/matches',
  requireAuth,
  ah(async (req, res) => {
    const me = await getMe(req);

    if ((me.skillsOffered.length === 0 && me.skillsWanted.length === 0)) {
      return res.json({
        matches: [],
        hint: 'Add at least one skill you can teach and one you want to learn to unlock matches.',
      });
    }

    const myWants = me.skillsWanted.map((s) => s.name);
    const myOffers = me.skillsOffered.map((s) => s.name);

    const candidateFilter = { _id: { $ne: me._id } };
    const or = [];
    if (myWants.length) or.push({ 'skillsOffered.name': { $in: myWants } });
    if (myOffers.length) or.push({ 'skillsWanted.name': { $in: myOffers } });
    if (or.length) candidateFilter.$or = or;

    const [candidates, scarcityRows] = await Promise.all([
      User.find(candidateFilter).limit(500),
      User.aggregate([
        { $unwind: '$skillsOffered' },
        { $group: { _id: '$skillsOffered.name', count: { $sum: 1 } } },
      ]),
    ]);

    const scarcity = buildScarcity(scarcityRows);

    // Pairs that already have a live (pending/scheduled) swap are deprioritised
    // so the list keeps surfacing fresh people.
    const liveSwaps = await Swap.find({
      status: { $in: ['pending', 'scheduled'] },
      $or: [{ requester: me._id }, { recipient: me._id }],
    }).select('requester recipient');

    const busy = new Set(
      liveSwaps.map((s) => String(s.requester) === String(me._id) ? String(s.recipient) : String(s.requester))
    );

    const matches = candidates
      .map((c) => scoreMatch(me, c.toObject(), scarcity))
      .filter(Boolean)
      .map((m) => ({ ...m, hasOpenSwap: busy.has(String(m.user._id)), user: toPublicProfile(m.user) }))
      .sort((a, b) => Number(a.hasOpenSwap) - Number(b.hasOpenSwap) || b.score - a.score);

    const limit = clampInt(req.query.limit, 1, 50, 20);
    res.json({ matches: matches.slice(0, limit), total: matches.length });
  })
);

// GET /api/discover?q=&skill=&kind=&page= - search members by skill or name
router.get(
  '/discover',
  requireAuth,
  ah(async (req, res) => {
    const me = await getMe(req);
    const q = String(req.query.q || '').trim().slice(0, 60);
    const skill = String(req.query.skill || '').trim().toLowerCase().slice(0, 40);
    const kind = ['offer', 'want', 'any'].includes(req.query.kind) ? req.query.kind : 'any';
    const page = clampInt(req.query.page, 1, 10000, 1);
    const limit = clampInt(req.query.limit, 1, 50, 12);

    const filter = { _id: { $ne: me._id } };
    const and = [];

    if (skill) {
      if (kind === 'offer') and.push({ 'skillsOffered.name': skill });
      else if (kind === 'want') and.push({ 'skillsWanted.name': skill });
      else and.push({ $or: [{ 'skillsOffered.name': skill }, { 'skillsWanted.name': skill }] });
    }

    if (q) {
      const rx = new RegExp(escapeRegex(q), 'i');
      const nameOrSkill = {
        $or: [{ name: rx }, { 'skillsOffered.name': rx }, { 'skillsWanted.name': rx }],
      };
      and.push(nameOrSkill);
    }

    if (and.length) filter.$and = and;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    res.json({
      users: users.map(toPublicProfile),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

// GET /api/skills - the shared skill catalogue, for filter dropdowns
router.get(
  '/skills',
  requireAuth,
  ah(async (req, res) => {
    const rows = await User.aggregate([
      { $project: { skills: { $concatArrays: ['$skillsOffered.name', '$skillsWanted.name'] } } },
      { $unwind: '$skills' },
      { $group: { _id: '$skills', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 100 },
    ]);
    res.json({ skills: rows.map((r) => ({ name: r._id, count: r.count })) });
  })
);

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default router;
