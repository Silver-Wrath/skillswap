import { Router } from 'express';
import User from '../models/User.js';
import Swap from '../models/Swap.js';
import Review from '../models/Review.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, ApiError, toPublicUser } from '../utils/http.js';

const router = Router();

// GET /api/stats/me - dashboard numbers + skill demand analysis
router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const me = await User.findById(req.userId);
    if (!me) throw new ApiError(401, 'Account no longer exists');

    const match = { $or: [{ requester: me._id }, { recipient: me._id }] };
    const [byStatus, reviewsReceived, demandRows] = await Promise.all([
      Swap.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Review.countDocuments({ reviewee: me._id }),
      // How many other members want each of the skills I teach?
      User.aggregate([
        { $match: { _id: { $ne: me._id } } },
        { $unwind: '$skillsWanted' },
        { $group: { _id: '$skillsWanted.name', learners: { $sum: 1 } } },
        { $match: { _id: { $in: me.skillsOffered.map((s) => s.name) } } },
        { $sort: { learners: -1 } },
      ]),
    ]);

    const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
    const completed = counts.completed || 0;

    res.json({
      user: toPublicUser(me),
      stats: {
        offers: me.skillsOffered.length,
        wants: me.skillsWanted.length,
        incoming: counts.pending || 0,
        active: counts.scheduled || 0,
        completed,
        cancelled: (counts.cancelled || 0) + (counts.declined || 0),
        rating: me.rating,
        reviewsReceived,
        // pending incoming specifically needs recipient side:
        pendingIncoming: await Swap.countDocuments({ recipient: me._id, status: 'pending' }),
        pendingOutgoing: await Swap.countDocuments({ requester: me._id, status: 'pending' }),
      },
      skillDemand: demandRows.map((r) => ({ skill: r._id, learners: r.learners })),
    });
  })
);

export default router;
