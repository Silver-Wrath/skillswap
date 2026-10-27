import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const skillSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, lowercase: true },
    level: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 60 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true, select: false },
    bio: { type: String, trim: true, maxlength: 500, default: '' },
    location: { type: String, trim: true, maxlength: 80, default: '' },
    skillsOffered: { type: [skillSchema], default: [] },
    skillsWanted: { type: [skillSchema], default: [] },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
    },
    lastActiveAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

userSchema.index({ 'skillsOffered.name': 1 });
userSchema.index({ 'skillsWanted.name': 1 });

export default model('User', userSchema);
