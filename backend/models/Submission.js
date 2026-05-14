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
    enum: [
      'submitted',
      'submitted_pending_dup_check',
      'submitted_dup_ok',
      'submitted_dup_suspect',
      'under_review',
      'accepted',
      'rejected',
      'rejected_duplicate',
      'revision',
      'manual_review_required'
    ],
    default: 'submitted'
  },
  assignedReviewers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  assignedCount: {
    type: Number,
    default: 0,
    min: [0, 'Assigned count cannot be negative']
  },
  abstractVector: [{
    type: Number
  }],
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

  // ========== PDE Integration Fields ==========

  // Duplication check results from PDE
  duplicationCheck: {
    pdePaperId: { type: String, default: null },
    status: {
      type: String,
      enum: ['pending', 'clean', 'suspected_duplicate', 'verified_duplicate', 'error', null],
      default: null
    },
    similarityScore: { type: Number, default: null },
    matchedPaperId: { type: String, default: null },
    message: { type: String, default: null },
    checkedAt: { type: Date, default: null },
    retryCount: { type: Number, default: 0 }
  },

  // Rejection details (populated when status = rejected_duplicate)
  rejectionDetails: {
    reason: { type: String, default: null },
    duplicateStatus: { type: String, default: null },
    pdeSummary: { type: String, default: null },
    rejectedAt: { type: Date, default: null }
  },

  // Cleanup tracking (tracks Cloudinary/PDE cleanup after duplicate rejection)
  cleanupStatus: {
    cloudinaryDeleted: { type: Boolean, default: false },
    pdeHashDeleted: { type: Boolean, default: false },
    cleanedAt: { type: Date, default: null },
    cleanupError: { type: String, default: null }
  },

  // ========== End PDE Integration Fields ==========

  revisionCount: { type: Number, default: 0 }, // Tracks how many times paper was revised
  authorAttendanceMarked: { type: Boolean, default: false }, // For certificate eligibility
  authorAttendanceMarkedAt: { type: Date, default: null },
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
submissionSchema.index({ conferenceId: 1, assignedCount: 1, keywords: 1 });
submissionSchema.index({ 'duplicationCheck.status': 1 }); // PDE integration index

module.exports = mongoose.model('Submission', submissionSchema);
