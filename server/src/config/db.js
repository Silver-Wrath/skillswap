import mongoose from 'mongoose';

// The connection promise is cached so repeated calls (server entry point and
// the per-request ensureDb middleware) share one connection.
let connectionPromise = null;

export function connectDB() {
  if (connectionPromise) return connectionPromise;
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/skillswap';
  mongoose.set('strictQuery', true);
  connectionPromise = mongoose.connect(uri).then(() => {
    console.log(`MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return mongoose.connection;
  });
  // Allow a later request to retry after a failed attempt.
  connectionPromise.catch(() => {
    connectionPromise = null;
  });
  return connectionPromise;
}
