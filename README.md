# SkillSwap

**A community skill-exchange network — teach what you know, learn what you don't.**

---

## Problem Statement

People already trade skills informally — *"I'll teach you guitar if you teach me Spanish"* — but that
exchange is hard to make happen. There is no way to find the right counterpart, no fair way to decide
who teaches what, no scheduling, and no record of whether someone actually showed up. Informal skill
trades collapse because of coordination failure, not lack of interest.

## Target Users

- Students (college/school) who want to pick up a new skill without paying for classes
- Hobbyists and makers who want peers to practice with
- Anyone who has a skill to share and a skill to gain, and wants a fair, tracked exchange

## Solution

SkillSwap makes the informal barter of skills a first-class, trackable workflow:

```text
List skills you teach + want
        ↓
Ranked, explainable matches (reciprocity, level fit, reputation, scarcity)
        ↓
Propose a swap: a skill pair + a session slot
        ↓
Recipient accepts → double-booking is prevented → session is scheduled
        ↓
Chat in the swap thread → mark completed → both sides rate each other
        ↓
Ratings feed back into the matching engine
```

## Key Features

1. **Accounts & auth** — register/login with bcrypt-hashed passwords and JWT sessions; every swap
   action is authorized against the actual participants.
2. **Skill profiles** — members declare skills they can teach and skills they want, each with a
   proficiency level (1–5).
3. **Matching engine** — deterministic server-side scoring across five weighted factors
   (reciprocity, level fit, skill depth, reputation, skill scarcity), returned with a score
   breakdown so rankings are explainable, not magic.
4. **Swap lifecycle with a strict state machine** — `pending → scheduled → completed`, plus
   `declined`/`cancelled`, with server-enforced transitions (only the recipient can accept/decline,
   a proposal cannot accept itself, closed swaps stay closed).
5. **Scheduling with conflict detection** — a booking is rejected if either participant already has
   an overlapping session.
6. **Messaging** — a conversation thread per swap, with messaging auto-closing once the swap is
   resolved.
7. **Reviews & reputation** — one review per participant per completed swap, rolled into a rating
   aggregate that feeds back into match scoring.
8. **Discovery & analytics** — search/filter members by skill and direction, plus a dashboard with
   stats and a "demand for your skills" analysis.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, React Router 6 (SPA, no UI framework — hand-written CSS) |
| Backend | Node.js 20, Express 4 (ESM) |
| Database | MongoDB with Mongoose 8 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Testing | Node-based end-to-end API smoke test (43 checks), headless-Chrome UI check (19 checks) |
| Dev infra | Docker/Podman container for local MongoDB, Vite dev proxy |

## Architecture

```text
┌──────────────────────┐        /api (JSON, JWT)        ┌───────────────────────┐
│  React SPA (Vite)    │ ─────────────────────────────► │   Express API         │
│  pages + auth ctx    │ ◄───────────────────────────── │  routes/              │
│  fetch wrapper       │   (dev: Vite proxy /api)       │   auth, users,        │
└──────────────────────┘                               │   matches, swaps,     │
                                                       │   stats               │
                                                       │  services/matcher.js  │
                                                       │  (scoring engine)     │
                                                       └──────────┬────────────┘
                                                                  │ Mongoose
                                                       ┌──────────▼────────────┐
                                                       │  MongoDB              │
                                                       │  users, swaps,        │
                                                       │  messages, reviews    │
                                                       └───────────────────────┘
```

- `server/src/models/` — data model (User, Swap, Message, Review) with schema-level validation.
- `server/src/services/matcher.js` — the pure matching/scoring engine (unit-testable, no I/O).
- `server/src/routes/` — HTTP layer; all handlers are wrapped so every failure returns clean JSON
  through one central error middleware (no stack traces leaked).
- `client/src/api.js` — single fetch wrapper: attaches the token, normalises network/server errors.
- `client/src/auth.jsx` — auth context (session restore on load, login/register/logout).
- When `client/dist` exists the Express server serves the SPA too, so **one process can host the
  entire product**.

## Local Setup

Prerequisites: **Node.js 18+** and **MongoDB** (a container is the easiest way).

```bash
# 1. Install dependencies
npm run setup                # installs server/ and client/

# 2. Start MongoDB (Docker or Podman)
docker run -d --name skillswap-mongo -p 27017:27017 mongo:7
# ...or use any MongoDB you already have running.

# 3. Configure the API
cp server/.env.example server/.env
# edit server/.env — at minimum set a strong JWT_SECRET

# 4. Run (two terminals)
npm run api                  # Express API on http://localhost:5000
npm run web                  # Vite dev server on http://localhost:5173
```

Open **http://localhost:5173**, create an account, add one skill you teach and one you want, then
open **Matches**.

### Seeding a second user (to see both sides)

Register a second account in a private window (or another browser), give it complementary skills
(e.g. teaches *spanish*, wants *guitar*), and you will rank as a mutual match for each other — you
can then propose, accept, chat, complete and review across the two sessions.

## Environment Variables

`server/.env` (see `server/.env.example`):

| Variable | Purpose | Example |
|---|---|---|
| `PORT` | API port | `5000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://127.0.0.1:27017/skillswap` |
| `JWT_SECRET` | Secret for signing tokens — **generate with `openssl rand -hex 32`, never commit it** | — |
| `JWT_EXPIRES_IN` | Token lifetime | `7d` |
| `CLIENT_ORIGIN` | Allowed CORS origin | `http://localhost:5173` |

`client/.env` (optional):

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_URL` | API base URL if not using the dev proxy/same-origin build | `https://skillswap-api.onrender.com/api` |

No secrets are committed: `.env` is gitignored and only `.env.example` (placeholders) is tracked.

## Testing

```bash
npm test         # 43 end-to-end API checks: auth, matching, swap state machine,
                 # double-booking, authz, messaging, reviews, stats, error handling
npm run test:ui  # 19 headless-Chrome checks: walks the real UI — register → skills →
                 # match → propose → message → complete → review — and fails on any
                 # JavaScript/console error
npm run build    # production build of the client (fails on any build error)
```

Both servers must be running for `npm test` and `npm run test:ui`.

## Deployment

**Option A — single service (simplest):**

```bash
npm run build                # produces client/dist
# deploy the server/ folder to Render/Railway/Fly; set MONGODB_URI (e.g. MongoDB Atlas)
# and a strong JWT_SECRET. The API serves the built SPA at the same URL.
```

**Option B — split:** deploy `client/dist` to any static host (Netlify/Vercel/GitHub Pages) with
`VITE_API_URL` pointing at the API deployment, and the API separately as in Option A.

Local eval without deploying: `npm run setup && npm run api && npm run web` is enough to run the
whole product from a fresh clone.

## Repository Map

```text
END_TERM_PROJECT_GUIDELINES.md   submission guidelines
scripts/smoke-test.mjs           end-to-end API test suite
server/                          Express + Mongoose API
client/                          React (Vite) SPA + headless UI check
README.md                        this file
```

## Notes

- Built as an original project for the end-term submission; AI assistance was used as an
  engineering tool (scaffolding, debugging, test authoring) per the submission policy, and the
  final repository is a complete, functional product.
