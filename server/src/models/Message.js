import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const messageSchema = new Schema(
  {
    swap: { type: Schema.Types.ObjectId, ref: 'Swap', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
  },
  { timestamps: true }
);

messageSchema.index({ swap: 1, createdAt: 1 });

export default model('Message', messageSchema);
