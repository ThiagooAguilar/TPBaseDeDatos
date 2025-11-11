const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: {
    type: String,
    enum: ['RATED_MOVIE', 'WROTE_REVIEW', 'ADDED_TO_FAVORITES'],
    required: true
  },
  timestamp: { type: Date, default: Date.now },
  details: { type: Object, required: true }
}, {
  timestamps: true
});

module.exports = mongoose.model('UserActivity', schema);
