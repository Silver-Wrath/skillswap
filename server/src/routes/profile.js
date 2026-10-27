import { Router } from 'express';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { ah, ApiError, sanitizeSkillList, toPublicUser, toPublicProfile } from '../utils/http.js';

const router = Router();

// GET /api/users/me - the logged-in user's full profile
router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new ApiError(401, 'Account no longer exists');
    res.json({ user: toPublicUser(user) });
  })
);

// PUT /api/users/me - update profile fields (skills included)
router.put(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const { name, bio, location, skillsOffered, skillsWanted } = req.body || {};
    const user = await User.findById(req.userId);
    if (!user) throw new ApiError(401, 'Account no longer exists');

    if (name !== undefined) {
      const clean = String(name).trim();
      if (clean.length < 2 || clean.length > 60) throw new ApiError(400, 'Name must be between 2 and 60 characters');
      user.name = clean;
    }
    if (bio !== undefined) {
      const clean = String(bio).trim();
      if (clean.length > 500) throw new ApiError(400, 'Bio must be 500 characters or fewer');
      user.bio = clean;
    }
    if (location !== undefined) {
      const clean = String(location).trim();
      if (clean.length > 80) throw new ApiError(400, 'Location must be 80 characters or fewer');
      user.location = clean;
    }
    if (skillsOffered !== undefined) user.skillsOffered = sanitizeSkillList(skillsOffered);
    if (skillsWanted !== undefined) user.skillsWanted = sanitizeSkillList(skillsWanted);

    try {
      await user.save();
    } catch (err) {
      if (err.name === 'ValidationError') throw new ApiError(400, err.message);
      throw err;
    }

    res.json({ user: toPublicUser(user) });
  })
);

// GET /api/users/:id - public profile of another member
router.get(
  '/:id',
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, 'User not found');
    res.json({ user: toPublicProfile(user) });
  })
);

export default router;
