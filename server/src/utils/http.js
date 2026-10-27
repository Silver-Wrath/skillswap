// Wraps an async route handler so rejections reach the error middleware.
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (v) => typeof v === 'string' && EMAIL_RE.test(v) && v.length <= 254;

export function sanitizeSkill(raw) {
  const name = String(raw?.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const level = Number(raw?.level);
  if (!name || name.length > 40) return null;
  if (!Number.isInteger(level) || level < 1 || level > 5) return null;
  return { name, level };
}

export function normalizeSkillName(raw) {
  const name = String(raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!name || name.length > 40) return null;
  return name;
}

export function sanitizeSkillList(list) {
  if (!Array.isArray(list)) throw Object.assign(new Error('Skill list must be an array'), { status: 400 });
  if (list.length > 20) throw Object.assign(new Error('Maximum of 20 skills per list'), { status: 400 });
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const skill = sanitizeSkill(item);
    if (!skill) throw Object.assign(new Error('Each skill needs a name (max 40 chars) and a level from 1 to 5'), { status: 400 });
    if (seen.has(skill.name)) continue; // silently dedupe repeats
    seen.add(skill.name);
    out.push(skill);
  }
  return out;
}

export function toPublicUser(user) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    bio: user.bio || '',
    location: user.location || '',
    skillsOffered: user.skillsOffered || [],
    skillsWanted: user.skillsWanted || [],
    rating: user.rating || { average: 0, count: 0 },
    createdAt: user.createdAt,
  };
}

export function toPublicProfile(user) {
  const { email, ...rest } = toPublicUser(user);
  return rest;
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
