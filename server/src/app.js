import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import discoveryRoutes from './routes/matches.js';
import swapRoutes from './routes/swaps.js';
import statsRoutes from './routes/stats.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true }));
app.use(express.json({ limit: '200kb' }));

// Health check reports connection state without requiring the connection.
app.get('/api/health', (req, res) => {
  res.json({ ok: true, db: mongoose.connection.readyState === 1 });
});

// Ensure MongoDB is connected before any API route runs. On the long-running
// server the connection is already open; on Vercel (serverless) this is what
// establishes and caches it per function instance. A failed attempt is
// forgotten so the next request can retry.
let dbPromise = null;
function ensureDb(req, res, next) {
  if (!dbPromise) {
    dbPromise = connectDB().catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  dbPromise.then(() => next()).catch(next);
}
app.use('/api', ensureDb);

app.use('/api/auth', authRoutes);
app.use('/api/users', profileRoutes);
app.use('/api', discoveryRoutes); // /api/matches, /api/discover, /api/skills
app.use('/api/swaps', swapRoutes);
app.use('/api/stats', statsRoutes);

// If the client has been built (npm run build in client/), serve it from the
// same process so a single deployment can host the whole product. (On Vercel,
// static files are served by the CDN instead - express.static is not used there.)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.use(notFound);
app.use(errorHandler);

export default app;
