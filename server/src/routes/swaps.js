import { Router } from 'express';
import mongoose from 'mongoose';
import Swap from '../models/Swap.js';
import Message from '../models/Message.js';
import Review from '../models/Review.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, ApiError, normalizeSkillName } from '../utils/http.js';

const router = Router();
router.use(requireAuth);

const POPULATE = [
  { path: 'requester', select: 'name location rating skillsOffered skillsWanted' },
  { path: 'recipient', select: 'name location rating skillsOffered skillsWanted' },
];

function serializeSwap(swap) {
  const o = swap.toObject({ virtuals: false });
  return { ...o, id: String(o._id), _id: undefined };
}

async function loadSwap(id, userId) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, 'Invalid swap id');
  const swap = await Swap.findById(id).populate(POPULATE);
  if (!swap) throw new ApiError(404, 'Swap not found');
  const isRequester = String(swap.requester._id) === userId;
  const isRecipient = String(swap.recipient._id) === userId;
  if (!isRequester && !isRecipient) throw new ApiError(403, 'You are not part of this swap');
  return { swap, isRequester, isRecipient };
}

async function findConflict(userId, start, end, excludeId = null) {
  return Swap.findOne({
    _id: { $ne: excludeId },
    status: 'scheduled',
    $or: [{ requester: userId }, { recipient: userId }],
    'slot.start': { $lt: new Date(end) },
    'slot.end': { $gt: new Date(start) },
  });
}

// POST /api/swaps - propose a swap
router.post(
  '/',
  ah(async (req, res) => {
    const { recipientId, offeredSkillName, requestedSkillName, slotStart, durationMinutes, note } = req.body || {};
    const me = await User.findById(req.userId);
    if (!me) throw new ApiError(401, 'Account no longer exists');

    if (!mongoose.isValidObjectId(recipientId)) throw new ApiError(400, 'Invalid recipient');
    if (String(recipientId) === String(me._id)) throw new ApiError(400, 'You cannot propose a swap with yourself');

    const recipient = await User.findById(recipientId);
    if (!recipient) throw new ApiError(404, 'Recipient not found');

    const offeredName = normalizeSkillName(offeredSkillName);
    const requestedName = normalizeSkillName(requestedSkillName);
    if (!offeredName || !requestedName) {
      throw new ApiError(400, 'Both an offered and a requested skill are required');
    }
    if (offeredName === requestedName) {
      throw new ApiError(400, 'You need to teach something different from what you want to learn');
    }

    const myOffer = me.skillsOffered.find((s) => s.name === offeredName);
    if (!myOffer) throw new ApiError(400, `You have not listed "${offeredName}" as a skill you teach`);

    const theirOffer = recipient.skillsOffered.find((s) => s.name === requestedName);
    if (!theirOffer) throw new ApiError(404, `${recipient.name} does not teach "${requestedName}"`);

    const start = new Date(slotStart);
    const duration = Number(durationMinutes) || 60;
    if (Number.isNaN(start.getTime())) throw new ApiError(400, 'A valid session start time is required');
    if (start.getTime() < Date.now() - 60 * 1000) throw new ApiError(400, 'Session time must be in the future');
    if (!Number.isFinite(duration) || duration < 15 || duration > 480) {
      throw new ApiError(400, 'Duration must be between 15 and 480 minutes');
    }
    const end = new Date(start.getTime() + duration * 60 * 1000);

    // Double-booking guard for both parties.
    for (const uid of [me._id, recipient._id]) {
      const clash = await findConflict(uid, start, end);
      if (clash) throw new ApiError(409, 'One of the participants already has a session booked in that time slot');
    }

    const duplicate = await Swap.findOne({
      status: 'pending',
      requester: me._id,
      recipient: recipient._id,
      'offeredSkill.name': offeredName,
      'requestedSkill.name': requestedName,
    });
    if (duplicate) throw new ApiError(409, 'You already have a pending proposal for this skill pair');

    const swap = await Swap.create({
      requester: me._id,
      recipient: recipient._id,
      offeredSkill: { name: offeredName, level: myOffer.level },
      requestedSkill: { name: requestedName, level: theirOffer.level },
      note: String(note || '').slice(0, 300),
      slot: { start, end },
      status: 'pending',
    });

    const populated = await swap.populate(POPULATE);
    res.status(201).json({ swap: serializeSwap(populated) });
  })
);

// GET /api/swaps?filter=incoming|outgoing|active|past|all
router.get(
  '/',
  ah(async (req, res) => {
    const filterName = req.query.filter || 'all';
    const base = { $or: [{ requester: req.userId }, { recipient: req.userId }] };
    const filters = {
      incoming: { status: 'pending', recipient: req.userId },
      outgoing: { status: 'pending', requester: req.userId },
      active: { status: 'scheduled' },
      past: { status: { $in: ['completed', 'declined', 'cancelled'] } },
      all: {},
    };
    if (!filters[filterName]) throw new ApiError(400, 'Unknown filter');

    const query = { ...base, ...filters[filterName] };
    const swaps = await Swap.find(query).populate(POPULATE).sort({ updatedAt: -1 }).limit(100);

    res.json({ swaps: swaps.map(serializeSwap) });
  })
);

// GET /api/swaps/:id - detail
router.get(
  '/:id',
  ah(async (req, res) => {
    const { swap } = await loadSwap(req.params.id, req.userId);
    res.json({ swap: serializeSwap(swap) });
  })
);

// PATCH /api/swaps/:id { action, reason } - state transitions
router.patch(
  '/:id',
  ah(async (req, res) => {
    const { swap, isRequester, isRecipient } = await loadSwap(req.params.id, req.userId);
    const action = req.body?.action;
    const reason = String(req.body?.reason || '').slice(0, 300);

    const transitions = {
      accept: {
        allowed: isRecipient && swap.status === 'pending',
        to: 'scheduled',
        deny: 'Only the recipient can accept a pending proposal',
      },
      decline: {
        allowed: isRecipient && swap.status === 'pending',
        to: 'declined',
        deny: 'Only the recipient can decline a pending proposal',
      },
      cancel: {
        allowed: (isRequester && swap.status === 'pending') || (swap.status === 'scheduled'),
        to: 'cancelled',
        deny: 'This swap can no longer be cancelled',
      },
      complete: {
        allowed: swap.status === 'scheduled',
        to: 'completed',
        deny: 'Only a scheduled swap can be completed',
      },
    };

    const t = transitions[action];
    if (!t) throw new ApiError(400, 'Unknown action. Use accept, decline, cancel or complete');
    if (!t.allowed) throw new ApiError(403, t.deny);

    swap.status = t.to;
    if (t.to === 'declined' || t.to === 'cancelled') {
      swap.closedBy = req.userId;
      swap.closeReason = reason;
    }
    await swap.save();

    await swap.populate(POPULATE);
    res.json({ swap: serializeSwap(swap) });
  })
);

// GET /api/swaps/:id/messages
router.get(
  '/:id/messages',
  ah(async (req, res) => {
    const { swap } = await loadSwap(req.params.id, req.userId);
    const messages = await Message.find({ swap: swap._id }).sort({ createdAt: 1 }).limit(500);
    res.json({ messages });
  })
);

// POST /api/swaps/:id/messages { text }
router.post(
  '/:id/messages',
  ah(async (req, res) => {
    const { swap } = await loadSwap(req.params.id, req.userId);
    if (!['pending', 'scheduled'].includes(swap.status)) {
      throw new ApiError(409, 'Messaging is closed for this swap');
    }
    const text = String(req.body?.text || '').trim();
    if (!text) throw new ApiError(400, 'Message text is required');
    if (text.length > 1000) throw new ApiError(400, 'Messages are limited to 1000 characters');

    const message = await Message.create({ swap: swap._id, sender: req.userId, text });
    swap.updatedAt = new Date(); // bump activity so the list sorts sensibly
    await swap.save();
    res.status(201).json({ message });
  })
);

// POST /api/swaps/:id/reviews { rating, comment }
router.post(
  '/:id/reviews',
  ah(async (req, res) => {
    const { swap, isRequester, isRecipient } = await loadSwap(req.params.id, req.userId);
    if (swap.status !== 'completed') throw new ApiError(409, 'You can only review a completed swap');
    if (swap.reviewers.some((r) => String(r) === req.userId)) {
      throw new ApiError(409, 'You have already reviewed this swap');
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new ApiError(400, 'Rating must be an integer from 1 to 5');
    }
    const comment = String(req.body?.comment || '').trim().slice(0, 500);

    const revieweeId = isRequester ? swap.recipient._id : swap.requester._id;
    const reviewee = await User.findById(revieweeId);
    if (!reviewee) throw new ApiError(404, 'Reviewer target not found');

    const review = await Review.create({
      swap: swap._id,
      reviewer: req.userId,
      reviewee: revieweeId,
      rating,
      comment,
    });

    // Update the rolling rating aggregate.
    const count = reviewee.rating.count + 1;
    const average = (reviewee.rating.average * reviewee.rating.count + rating) / count;
    reviewee.rating = { average: Math.round(average * 100) / 100, count };
    await reviewee.save();

    swap.reviewers.push(req.userId);
    await swap.save();

    res.status(201).json({ review, rating: reviewee.rating });
  })
);

// GET /api/swaps/:id/reviews - reviews written about this swap's participants
router.get(
  '/:id/reviews',
  ah(async (req, res) => {
    const { swap } = await loadSwap(req.params.id, req.userId);
    const reviews = await Review.find({ swap: swap._id }).populate('reviewer', 'name');
    res.json({ reviews });
  })
);

export default router;
