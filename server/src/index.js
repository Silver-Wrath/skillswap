// Long-running server entry point (local dev, Docker, Render, Fly, ...).
// On Vercel the same app is used as a serverless function via api/index.js.
import app from './app.js';
import { connectDB } from './config/db.js';

const PORT = Number(process.env.PORT) || 5000;

connectDB()
  .then(() => {
    const server = app.listen(PORT, () =>
      console.log(`SkillSwap API listening on http://localhost:${PORT}`)
    );
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use - stop the other process or set PORT in .env`);
      } else {
        console.error('Server failed to start:', err.message);
      }
      process.exit(1);
    });
  })
  .catch((err) => {
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  });
