// Vercel serverless entry: the same Express app used for local development,
// exported as a function instead of calling app.listen().
import app from '../server/src/app.js';

export default app;
