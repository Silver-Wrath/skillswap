import mongoose from 'mongoose';

const { Schema, model } = mongoose;

export const SWAP_STATUSES = ['pending', 'scheduled', 'completed', 'declined', 'cancelled'];

const skillRefSchema = new Schema(
  {
    name: { type: String, required: true, lowercase: true, trim: true },
    level: { type: Number, required: true, min: 1, max: 5 },
  },
  { _id: false }
);

const swapSchema = new Schema(
  {
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // What the requester will teach in this swap.
    offeredSkill: { type: skillRefSchema, required: true },
    // What the requester wants to learn from the recipient.
    requestedSkill: { type: skillRefSchema, required: true },
    note: { type: String, trim: true, maxlength: 300, default: '' },
    slot: {
      start: { type: Date, required: true },
      end: { type: Date, required: true },
    },
    status: { type: String, enum: SWAP_STATUSES, default: 'pending', index: true },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    closeReason: { type: String, trim: true, maxlength: 300, default: '' },
    reviewers: { type: [Schema.Types.ObjectId], default: [] },
  },
  { timestamps: true }
);

swapSchema.index({ requester: 1, recipient: 1, status: 1 });
swapSchema.index({ 'slot.start': 1, status: 1 });

export default model('Swap', swapSchema);
