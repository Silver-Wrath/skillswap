import { Router } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { ah, ApiError, isEmail, toPublicUser } from '../utils/http.js';

const router = Router();

function publicAuthPayload(user) {
  return { user: toPublicUser(user) };
}

router.post(
  '/register',
  ah(async (req, res) => {
    const { name, email, password } = req.body || {};

    if (!name || String(name).trim().length < 2 || String(name).trim().length > 60) {
      throw new ApiError(400, 'Name must be between 2 and 60 characters');
    }
    if (!isEmail(email)) {
      throw new ApiError(400, 'Please provide a valid email address');
    }
    if (typeof password !== 'string' || password.length < 8) {
      throw new ApiError(400, 'Password must be at least 8 characters');
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) throw new ApiError(409, 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name: String(name).trim(),
      email: normalizedEmail,
      passwordHash,
    });

    res.status(201).json({ token: signToken(user._id), ...publicAuthPayload(user) });
  })
);

router.post(
  '/login',
  ah(async (req, res) => {
    const { email, password } = req.body || {};
    if (!isEmail(email) || typeof password !== 'string' || !password) {
      throw new ApiError(400, 'Email and password are required');
    }

    const user = await User.findOne({ email: String(email).trim().toLowerCase() }).select('+passwordHash');
    const invalid = new ApiError(401, 'Incorrect email or password');
    if (!user) throw invalid;

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw invalid;

    res.json({ token: signToken(user._id), ...publicAuthPayload(user) });
  })
);

router.get(
  '/me',
  requireAuth,
  ah(async (req, res) => {
    const user = await User.findById(req.userId);
    if (!user) throw new ApiError(401, 'Account no longer exists');
    res.json(publicAuthPayload(user));
  })
);

export default router;
