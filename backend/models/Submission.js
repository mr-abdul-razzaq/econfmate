const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  abstract: { type: String, required: true },
  keywords: [{ type: String, trim: true }],
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conferenceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conference', required: true },
  trackId: { type: mongoose.Schema.Types.ObjectId, ref: 'Track', required: true }, // NEW: track-scoped
  fileUrl: { type: String, required: true },
  coAuthors: [
    {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, lowercase: true, trim: true },
      orcid: { type: String, trim: true },
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    }
  ],
  status: {
    type: String,
    enum: ['submitted', 'under_review', 'accepted', 'rejected', 'revision'],
    default: 'submitted'
  },
  assignedReviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  decision: {
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    feedback: { type: String }
  },
  organizerApproved: { type: Boolean, default: false },
  approvedAt: { type: Date },
  scheduled: {
    date: Date,
    startTime: String,
    endTime: String,
    venue: String
  },
  revisionCount: { type: Number, default: 0 }, // Tracks how many times paper was revised
  submittedAt: { type: Date, default: Date.now },
  lastUpdatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// indexes
submissionSchema.index({ conferenceId: 1 });
submissionSchema.index({ trackId: 1 });
submissionSchema.index({ authorId: 1, status: 1 });
submissionSchema.index({ 'coAuthors.email': 1 });

module.exports = mongoose.model('Submission', submissionSchema);
