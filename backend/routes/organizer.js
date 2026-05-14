const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const mongoose = require('mongoose');
const Conference = require('../models/Conference');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const Certificate = require('../models/Certificate');
const Registration = require('../models/Registration');
const Track = require('../models/Track');
const User = require('../models/User');
const { sendEmail, templates } = require('../utils/emailService');
const { generateCertificate, formatConferenceDates } = require('../utils/certificateGenerator');
const { upload, setUploadType } = require('../middleware/upload');
const { analyzePaper } = require('../utils/pdeClient');
const { cleanupDuplicateSubmission } = require('../utils/duplicateCleanup');

// All organizer routes require authentication and organizer role
router.use(auth, authorize('organizer'));

/**
 * @route   GET /api/organizer/conferences
 * @desc    Get all conferences created by organizer with per-track stats (aggregation)
 * @access  Private (Organizer)
 */
router.get('/conferences', async (req, res) => {
  try {
    const organizerId = new mongoose.Types.ObjectId(req.user.userId);

    const conferencesWithStats = await Conference.aggregate([
      { $match: { organizerId } },
      { $sort: { createdAt: -1 } },
      // Lookup tracks -> for each track lookup submissions and compute stats
      {
        $lookup: {
          from: 'tracks',
          let: { confId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$conferenceId', '$$confId'] } } },
            {
              $lookup: {
                from: 'submissions',
                let: { trackId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$trackId', '$$trackId'] } } },
                  { $project: { status: 1 } }
                ],
                as: 'subs'
              }
            },
            {
              $addFields: {
                'stats.total': { $size: '$subs' },
                'stats.accepted': {
                  $size: {
                    $filter: { input: '$subs', as: 's', cond: { $eq: ['$$s.status', 'accepted'] } }
                  }
                },
                'stats.rejected': {
                  $size: {
                    $filter: { input: '$subs', as: 's', cond: { $eq: ['$$s.status', 'rejected'] } }
                  }
                },
                'stats.pending': {
                  $size: {
                    $filter: { input: '$subs', as: 's', cond: { $in: ['$$s.status', ['submitted', 'under_review']] } }
                  }
                }
              }
            },
            { $project: { subs: 0 } }
          ],
          as: 'tracks'
        }
      },
      // compute conference-level aggregates from tracks.stats
      {
        $addFields: {
          stats: {
            total: { $sum: '$tracks.stats.total' },
            accepted: { $sum: '$tracks.stats.accepted' },
            rejected: { $sum: '$tracks.stats.rejected' },
            pending: { $sum: '$tracks.stats.pending' }
          }
        }
      }
    ]);

    res.json({ success: true, data: { conferences: conferencesWithStats } });
  } catch (error) {
    console.error('Get conferences error (agg):', error);
    res.status(500).json({ success: false, message: 'Error fetching conferences' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id
 * @desc    Get a single conference with tracks + per-track submission stats (aggregation)
 * @access  Private (Organizer)
 */
router.get('/conferences/:id', async (req, res) => {
  try {
    const organizerId = new mongoose.Types.ObjectId(req.user.userId);
    const confId = new mongoose.Types.ObjectId(req.params.id);

    const results = await Conference.aggregate([
      { $match: { _id: confId, organizerId } },
      {
        $lookup: {
          from: 'tracks',
          let: { confId: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$conferenceId', '$$confId'] } } },
            {
              $lookup: {
                from: 'submissions',
                let: { trackId: '$_id' },
                pipeline: [
                  { $match: { $expr: { $eq: ['$trackId', '$$trackId'] } } },
                  { $project: { title: 1, status: 1, authorId: 1, submittedAt: 1 } }
                ],
                as: 'subs'
              }
            },
            {
              $addFields: {
                'stats.total': { $size: '$subs' },
                'stats.accepted': {
                  $size: {
                    $filter: { input: '$subs', as: 's', cond: { $eq: ['$$s.status', 'accepted'] } }
                  }
                },
                'stats.rejected': {
                  $size: {
                    $filter: { input: '$subs', as: 's', cond: { $eq: ['$$s.status', 'rejected'] } }
                  }
                }
              }
            }
          ],
          as: 'tracks'
        }
      },
      {
        $addFields: {
          stats: {
            total: { $sum: '$tracks.stats.total' },
            accepted: { $sum: '$tracks.stats.accepted' },
            rejected: { $sum: '$tracks.stats.rejected' }
          }
        }
      }
    ]);

    if (!results || !results.length) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const conference = results[0];
    res.json({ success: true, data: conference });
  } catch (error) {
    console.error('Get conference error (agg):', error);
    res.status(500).json({ success: false, message: 'Error fetching conference' });
  }
});

/**
 * @route   POST /api/organizer/conferences
 * @desc    Create a new conference (supports creating tracks inline)
 * @access  Private (Organizer)
 */
router.post('/conferences', [
  body('name').trim().notEmpty().withMessage('Conference name is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('venue').trim().notEmpty().withMessage('Venue is required'),
  body('startDate').isISO8601().withMessage('Valid start date is required'),
  body('endDate').isISO8601().withMessage('Valid end date is required'),
  body('submissionDeadline').isISO8601().withMessage('Valid submission deadline is required'),
  body('domains').optional().isArray().withMessage('Domains must be an array'),
  body('fee').optional().isNumeric().withMessage('Fee must be a number'),
  body('tracks').optional().isArray().withMessage('Tracks must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const conference = new Conference({
      ...req.body,
      organizerId: req.user.userId
    });

    await conference.save();

    // If tracks provided, create them tied to the conference
    let createdTracks = [];
    if (Array.isArray(req.body.tracks) && req.body.tracks.length > 0) {
      const tracksToInsert = req.body.tracks.map(t => ({
        conferenceId: conference._id,
        name: t.name,
        description: t.description || '',
        submissionDeadline: t.submissionDeadline || conference.submissionDeadline
      }));
      createdTracks = await Track.insertMany(tracksToInsert);
    }

    res.status(201).json({
      success: true,
      message: 'Conference created successfully',
      data: { conference, tracks: createdTracks }
    });

  } catch (error) {
    console.error('Create conference error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating conference',
    });
  }
});

/**
 * @route   PUT /api/organizer/conferences/:id
 * @desc    Update conference (and optionally add new tracks)
 * @access  Private (Organizer)
 */
router.put('/conferences/:id', async (req, res) => {
  try {
    const conference = await Conference.findOne({
      _id: req.params.id,
      organizerId: req.user.userId
    });

    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Prevent changing organizerId
    if (req.body.organizerId && req.body.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Cannot change organizer' });
    }

    // Apply allowed updates
    const updatable = ['name', 'description', 'venue', 'startDate', 'endDate', 'submissionDeadline', 'domains', 'fee', 'status', 'generalChairSignaturePath'];
    updatable.forEach(field => {
      if (typeof req.body[field] !== 'undefined') {
        conference[field] = req.body[field];
      }
    });

    await conference.save();

    // Optionally create any new tracks sent in `tracks` (array of { name, description, submissionDeadline })
    let newTracks = [];
    if (Array.isArray(req.body.tracks) && req.body.tracks.length > 0) {
      const toCreate = req.body.tracks.filter(t => !t._id).map(t => ({
        conferenceId: conference._id,
        name: t.name,
        description: t.description || '',
        submissionDeadline: t.submissionDeadline || conference.submissionDeadline
      }));
      if (toCreate.length) {
        newTracks = await Track.insertMany(toCreate);
      }
    }

    res.json({ success: true, message: 'Conference updated', data: { conference, newTracks } });

  } catch (error) {
    console.error('Update conference error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating conference',
    });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/submissions
 * @desc    Get submissions for a conference (optionally scoped to a track via ?trackId=)
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/submissions', async (req, res) => {
  try {
    // Verify conference ownership
    const conference = await Conference.findOne({
      _id: req.params.id,
      organizerId: req.user.userId
    });

    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    let submissionsQuery = {};
    if (req.query.trackId) {
      // verify track belongs to conference
      const track = await Track.findOne({ _id: req.query.trackId, conferenceId: req.params.id });
      if (!track) {
        return res.status(400).json({ success: false, message: 'Invalid track for this conference' });
      }
      submissionsQuery.trackId = req.query.trackId;
    } else {
      // gather all tracks for conference
      const tracks = await Track.find({ conferenceId: req.params.id }).select('_id').lean();
      const trackIds = tracks.map(t => t._id);
      submissionsQuery.trackId = { $in: trackIds };
    }

    // Apply status filter if provided
    if (req.query.status) {
      submissionsQuery.status = req.query.status;
    }

    const submissions = await Submission.find(submissionsQuery)
      .populate('authorId', 'name email')
      .populate('trackId', 'name')
      .populate('assignedReviewers', 'name email')
      .populate('decision.decidedBy', 'name')
      .sort({ submittedAt: -1 })
      .lean();

    // simple review stats for each submission
    // Note: pending_revision reviews are not included in score calculations
    const submissionsWithReviews = await Promise.all(
      submissions.map(async (submission) => {
        const reviews = await Review.find({ submissionId: submission._id }).lean();

        // Separate submitted reviews (final) from pending_revision reviews
        const submittedReviews = reviews.filter(r => r.status === 'submitted');
        const pendingReviews = reviews.filter(r => r.status === 'pending_revision');

        // Calculate average score only from submitted reviews (not pending_revision)
        const avgScore = submittedReviews.length
          ? (submittedReviews.reduce((s, r) => s + (r.score || 0), 0) / submittedReviews.length)
          : 0;

        // Mask scores for pending_revision reviews (organizer should not see detailed scores yet)
        const maskedReviews = reviews.map(r => ({
          ...r,
          // If pending_revision, mask the score and show revision request message
          score: r.status === 'pending_revision' ? null : r.score,
          displayMessage: r.status === 'pending_revision' ? 'Revision requested - awaiting author update' : null
        }));

        return {
          ...submission,
          reviewStats: {
            count: submittedReviews.length,  // Only count final reviews
            pendingCount: pendingReviews.length,
            avgScore
          },
          reviews: maskedReviews
        };
      })
    );

    res.json({
      success: true,
      data: submissionsWithReviews
    });

  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submissions',
    });
  }
});

/**
 * @route   PATCH /api/organizer/submission/:submissionId/decision
 * @desc    Make a final decision on a submission (accept/reject/reject_duplicate)
 * @access  Private (Organizer)
 */
router.patch('/submission/:submissionId/decision', [
  body('decision').isIn(['accepted', 'rejected', 'rejected_duplicate', 'revision', 'under_review']).withMessage('Decision must be accepted, rejected, rejected_duplicate, revision, or under_review'),
  body('feedback').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const submission = await Submission.findById(req.params.submissionId).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Ensure organizer owns the conference that this submission's track belongs to
    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }
    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to decide this submission' });
    }

    const decision = req.body.decision;

    // Update submission
    const update = {
      status: decision,
      'decision.decidedBy': req.user.userId,
      'decision.decidedAt': new Date(),
      'decision.feedback': req.body.feedback || ''
    };

    // If rejecting as duplicate, add rejection details
    if (decision === 'rejected_duplicate') {
      update.rejectionDetails = {
        reason: req.body.feedback || 'Paper identified as duplicate by PaperDuplicationEngine',
        duplicateStatus: submission.duplicationCheck?.status || 'unknown',
        pdeSummary: submission.duplicationCheck?.message || 'Duplicate detected',
        rejectedAt: new Date()
      };
    }

    const updated = await Submission.findByIdAndUpdate(req.params.submissionId, update, { new: true })
      .populate('authorId', 'name email')
      .populate('trackId', 'name');

    // Handle rejected_duplicate: cleanup + notify
    if (decision === 'rejected_duplicate') {
      // Trigger async cleanup (Cloudinary file + PDE hash)
      console.log(`[PDE] Triggering cleanup for duplicate-rejected submission: ${req.params.submissionId}`);
      cleanupDuplicateSubmission(req.params.submissionId)
        .then(result => {
          console.log(`[PDE] Cleanup result for ${req.params.submissionId}:`, result);
        })
        .catch(err => console.error('[PDE] Cleanup error:', err.message));

      // Send duplicate rejection email to author (CC co-authors)
      if (updated.authorId?.email) {
        const coAuthorEmails = updated.coAuthors
          ?.map(ca => ca.email)
          .filter(email => email && email !== updated.authorId.email)
          .join(', ');

        sendEmail(
          updated.authorId.email,
          templates.paperRejectedDuplicate(updated.authorId, updated, conference),
          coAuthorEmails || null
        ).catch(err => console.error('Email error:', err));
      }
    } else if (decision === 'accepted' || decision === 'rejected') {
      // Send to author (CC co-authors)
      if (updated.authorId?.email) {
        const emailTemplate = decision === 'accepted'
          ? templates.paperAccepted(updated.authorId, updated, conference)
          : templates.paperRejected(updated.authorId, updated, conference, req.body.feedback);

        // Get co-author emails
        const coAuthorEmails = updated.coAuthors
          ?.map(ca => ca.email)
          .filter(email => email && email !== updated.authorId.email)
          .join(', ');

        sendEmail(updated.authorId.email, emailTemplate, coAuthorEmails || null)
          .catch(err => console.error('Email error:', err));
      }

      // Send to all assigned reviewers
      if (updated.assignedReviewers && updated.assignedReviewers.length > 0) {
        for (const reviewerId of updated.assignedReviewers) {
          const reviewer = await User.findById(reviewerId).lean();
          if (reviewer?.email) {
            sendEmail(
              reviewer.email,
              templates.finalDecisionToReviewers(reviewer, updated, conference, decision)
            ).catch(err => console.error('Email error:', err));
          }
        }
      }
    } else if (decision === 'revision') {
      // Send revision request to author (CC co-authors)
      if (updated.authorId?.email) {
        // Get co-author emails
        const coAuthorEmails = updated.coAuthors
          ?.map(ca => ca.email)
          .filter(email => email && email !== updated.authorId.email)
          .join(', ');

        sendEmail(
          updated.authorId.email,
          templates.revisionRequested(updated.authorId, updated, conference, req.body.feedback),
          coAuthorEmails || null
        ).catch(err => console.error('Email error:', err));
      }
    }

    res.json({ success: true, message: 'Decision recorded', data: updated });

  } catch (error) {
    console.error('Decision error:', error);
    res.status(500).json({ success: false, message: 'Error recording decision' });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/approve
 * @desc    Approve a submission for review (organizer-level approval)
 *          Warns if duplication check flagged the paper, but still allows override
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/approve', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }
    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to approve this submission' });
    }

    // Check duplication status — warn but allow override via query param
    const dupStatus = submission.duplicationCheck?.status;
    const forceOverride = req.query.overrideDupCheck === 'true';
    let dupWarning = null;

    if ((dupStatus === 'suspected_duplicate' || dupStatus === 'verified_duplicate') && !forceOverride) {
      dupWarning = `Warning: This paper was flagged as ${dupStatus.replace('_', ' ')} ` +
        `(score: ${submission.duplicationCheck?.similarityScore}%). ` +
        `Approval will proceed, but consider reviewing the duplication report.`;
    }

    submission.organizerApproved = true;
    submission.approvedAt = new Date();
    submission.status = 'under_review'; // Move to under_review after organizer approval
    await submission.save();

    // Send email to author
    const [author, populatedSubmission] = await Promise.all([
      User.findById(submission.authorId).lean(),
      Submission.findById(submission._id).populate('trackId', 'name')
    ]);

    if (author?.email) {
      const conference = await Conference.findById(track.conferenceId).lean();
      sendEmail(
        author.email,
        templates.paperApprovedForReview(author, populatedSubmission, conference)
      ).catch(err => console.error('Email error:', err));
    }

    const response = { success: true, message: 'Submission approved', data: submission };
    if (dupWarning) {
      response.warning = dupWarning;
    }
    res.json(response);

  } catch (error) {
    console.error('Approve submission error:', error);
    res.status(500).json({ success: false, message: 'Error approving submission' });
  }
});

/**
 * @route   POST /api/organizer/submissions/:id/retry-dup-check
 * @desc    Manually retry a failed or pending duplication check for a submission
 * @access  Private (Organizer)
 */
router.post('/submissions/:id/retry-dup-check', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }
    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Only allow retry if status is error or pending
    const dupStatus = submission.duplicationCheck?.status;
    if (dupStatus && dupStatus !== 'error' && dupStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Duplication check already completed with status: ${dupStatus}`
      });
    }

    // Update status to pending
    submission.status = 'submitted_pending_dup_check';
    submission.duplicationCheck = {
      ...submission.duplicationCheck?.toObject?.() || {},
      status: 'pending',
      retryCount: (submission.duplicationCheck?.retryCount || 0) + 1
    };
    await submission.save();

    // Trigger async PDE analysis
    const submissionId = submission._id;
    (async () => {
      try {
        console.log(`[PDE] Retrying analysis for submission: ${submissionId}`);
        const pdeResult = await analyzePaper(submission.title, submission.abstract, submission.fileUrl);

        let newStatus = 'submitted_dup_ok';
        let dupCheckStatus = 'clean';

        if (pdeResult.status === 'VERIFIED_DUPLICATE') {
          newStatus = 'submitted_dup_suspect';
          dupCheckStatus = 'verified_duplicate';
        } else if (pdeResult.status === 'SUSPECTED_DUPLICATE') {
          newStatus = 'submitted_dup_suspect';
          dupCheckStatus = 'suspected_duplicate';
        }

        await Submission.findByIdAndUpdate(submissionId, {
          status: newStatus,
          duplicationCheck: {
            pdePaperId: pdeResult.paper_id,
            status: dupCheckStatus,
            similarityScore: pdeResult.similarity_score,
            matchedPaperId: pdeResult.matched_paper_id,
            message: pdeResult.message,
            checkedAt: new Date(),
            retryCount: (submission.duplicationCheck?.retryCount || 0) + 1
          }
        });

        console.log(`[PDE] Retry analysis complete for ${submissionId}: ${dupCheckStatus}`);
      } catch (pdeErr) {
        console.error(`[PDE] Retry analysis failed for ${submissionId}:`, pdeErr.message);
        await Submission.findByIdAndUpdate(submissionId, {
          status: 'submitted',
          'duplicationCheck.status': 'error',
          'duplicationCheck.message': 'Duplication check retry failed.',
          'duplicationCheck.retryCount': (submission.duplicationCheck?.retryCount || 0) + 1
        });
      }
    })();

    res.json({
      success: true,
      message: 'Duplication check retry initiated. Results will update shortly.'
    });

  } catch (error) {
    console.error('Retry dup check error:', error);
    res.status(500).json({ success: false, message: 'Error retrying duplication check' });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/status
 * @desc    Accept or reject a submission (legacy endpoint)
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/status', [
  body('status').isIn(['accepted', 'rejected', 'revision', 'under_review']).withMessage('Status must be accepted, rejected, revision, or under_review'),
  body('feedback').optional().trim()
], async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }
    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update status for this submission' });
    }

    submission.status = req.body.status;
    submission.decision = submission.decision || {};
    submission.decision.decidedBy = req.user.userId;
    submission.decision.decidedAt = new Date();
    submission.decision.feedback = req.body.feedback || '';
    await submission.save();

    res.json({ success: true, message: 'Submission status updated', data: submission });

  } catch (error) {
    console.error('Update submission status error:', error);
    res.status(500).json({ success: false, message: 'Error updating submission status' });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/schedule
 * @desc    Assign presentation slot to submission
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/schedule', [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('startTime').optional().trim(),
  body('endTime').optional().trim(),
  body('time').optional().trim(),
  body('venue').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }
    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to schedule this submission' });
    }

    // Support both simple time field and startTime/endTime
    const startTime = req.body.startTime || req.body.time || '';
    const endTime = req.body.endTime || '';

    submission.scheduled = {
      date: req.body.date,
      startTime: startTime,
      endTime: endTime,
      venue: req.body.venue || ''
    };
    await submission.save();

    res.json({ success: true, message: 'Submission scheduled', data: submission });

  } catch (error) {
    console.error('Schedule submission error:', error);
    res.status(500).json({ success: false, message: 'Error scheduling submission' });
  }
});

/**
 * @route   POST /api/organizer/conferences/:id/certificates
 * @desc    Generate certificates for conference authors, participants, and reviewers
 * @access  Private (Organizer)
 */
router.post('/conferences/:id/certificates', async (req, res) => {
  try {
    const conference = await Conference.findOne({ _id: req.params.id, organizerId: req.user.userId })
      .populate('organizerId', 'name');
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Get organizer info
    const organizer = await User.findById(req.user.userId).select('name').lean();
    const organizerName = organizer?.name || 'Conference Organizer';
    const chairTitle = conference.generalChairSignaturePath ? 'General Chair' : 'Conference Organizer';
    const signaturePath = conference.generalChairSignaturePath || null;
    const conferenceDate = formatConferenceDates(conference.startDate, conference.endDate);

    // Gather tracks
    const tracks = await Track.find({ conferenceId: conference._id }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);

    const created = [];
    const errors = [];

    // 1) Authors with accepted submissions AND attendance marked -> presentation certificates
    const acceptedSubmissions = await Submission.find({
      trackId: { $in: trackIds },
      status: 'accepted',
      authorAttendanceMarked: true
    }).populate('authorId', 'name email').lean();

    for (const sub of acceptedSubmissions) {
      if (!sub.authorId) continue;

      // Build list of all authors: main author + co-authors
      const allAuthors = [
        { userId: sub.authorId._id, name: sub.authorId.name, email: sub.authorId.email },
        ...(sub.coAuthors || []).map((ca) => ({
          userId: ca.userId || null,
          name: ca.name,
          email: ca.email
        }))
      ];

      for (const author of allAuthors) {
        // If co-author is not linked to a user account, skip (cannot attach certificate to user)
        if (!author.userId) {
          continue;
        }

        const existing = await Certificate.findOne({
          userId: author.userId,
          conferenceId: conference._id,
          type: 'presentation',
          submissionId: sub._id
        }).lean();

        if (!existing) {
          try {
            const uniqueId = Certificate.generateUniqueCertificateId();

            // Generate PDF
            const pdfBuffer = await generateCertificate({
              name: author.name,
              role: 'Author',
              conferenceName: conference.name,
              conferenceDate: conferenceDate,
              uniqueId: uniqueId,
              paperTitle: sub.title,
              organizerName: organizerName,
              chairTitle,
              signaturePath
            });

            const cert = await Certificate.create({
              userId: author.userId,
              conferenceId: conference._id,
              type: 'presentation',
              role: 'author',
              uniqueCertificateId: uniqueId,
              paperTitle: sub.title,
              submissionId: sub._id,
              certificateBuffer: pdfBuffer,
              generatedAt: new Date(),
              issuedAt: new Date()
            });
            created.push({ type: 'author', user: author.name, certificateId: cert._id });
          } catch (err) {
            console.error('Error generating author certificate:', err);
            errors.push({ type: 'author', user: author.name, error: 'Operation failed' });
          }
        }
      }
    }

    // 2) Participants with attendance marked -> participation certificates
    const registrations = await Registration.find({
      conferenceId: conference._id,
      attendanceMarked: true
    }).populate('participantId', 'name email').lean();

    for (const reg of registrations) {
      if (!reg.participantId) continue;

      const existing = await Certificate.findOne({
        userId: reg.participantId._id,
        conferenceId: conference._id,
        type: 'participation'
      }).lean();

      if (!existing) {
        try {
          const uniqueId = Certificate.generateUniqueCertificateId();

          // Generate PDF
          const pdfBuffer = await generateCertificate({
            name: reg.participantId.name,
            role: 'Participant',
            conferenceName: conference.name,
            conferenceDate: conferenceDate,
            uniqueId: uniqueId,
            organizerName: organizerName,
            chairTitle,
            signaturePath
          });

          const cert = await Certificate.create({
            userId: reg.participantId._id,
            conferenceId: conference._id,
            type: 'participation',
            role: 'participant',
            uniqueCertificateId: uniqueId,
            certificateBuffer: pdfBuffer,
            generatedAt: new Date(),
            issuedAt: new Date()
          });
          created.push({ type: 'participant', user: reg.participantId.name, certificateId: cert._id });
        } catch (err) {
          console.error('Error generating participant certificate:', err);
          errors.push({ type: 'participant', user: reg.participantId.name, error: 'Operation failed' });
        }
      }
    }

    // 3) Reviewers who submitted ACCEPT or REJECT verdicts -> reviewer certificates
    const reviews = await Review.find({
      trackId: { $in: trackIds },
      status: 'submitted',
      recommendation: { $in: ['ACCEPT', 'REJECT'] }
    }).populate('reviewerId', 'name email').lean();

    // Get unique reviewers (a reviewer may have reviewed multiple papers)
    const reviewerMap = new Map();
    for (const review of reviews) {
      if (review.reviewerId && !reviewerMap.has(review.reviewerId._id.toString())) {
        reviewerMap.set(review.reviewerId._id.toString(), review.reviewerId);
      }
    }

    for (const [reviewerId, reviewer] of reviewerMap) {
      const existing = await Certificate.findOne({
        userId: reviewer._id,
        conferenceId: conference._id,
        type: 'reviewer'
      }).lean();

      if (!existing) {
        try {
          const uniqueId = Certificate.generateUniqueCertificateId();

          // Generate PDF
          const pdfBuffer = await generateCertificate({
            name: reviewer.name,
            role: 'Reviewer',
            conferenceName: conference.name,
            conferenceDate: conferenceDate,
            uniqueId: uniqueId,
            organizerName: organizerName,
            chairTitle,
            signaturePath
          });

          const cert = await Certificate.create({
            userId: reviewer._id,
            conferenceId: conference._id,
            type: 'reviewer',
            role: 'reviewer',
            uniqueCertificateId: uniqueId,
            certificateBuffer: pdfBuffer,
            generatedAt: new Date(),
            issuedAt: new Date()
          });
          created.push({ type: 'reviewer', user: reviewer.name, certificateId: cert._id });
        } catch (err) {
          console.error('Error generating reviewer certificate:', err);
          errors.push({ type: 'reviewer', user: reviewer.name, error: 'Operation failed' });
        }
      }
    }

    res.json({
      success: true,
      message: `Certificates generated: ${created.length} created`,
      data: {
        createdCount: created.length,
        created,
        errors: errors.length > 0 ? errors : undefined
      }
    });

  } catch (error) {
    console.error('Generate certificates error:', error);
    res.status(500).json({ success: false, message: 'Error generating certificates' });
  }
});


/**
 * @route   PUT /api/organizer/registrations/:id/attendance
 * @desc    Mark attendance for a participant
 * @access  Private (Organizer)
 */
router.put('/registrations/:id/attendance', async (req, res) => {
  try {
    const regId = req.params.id;
    if (!regId || regId === 'null') {
      return res.status(400).json({ success: false, message: 'registration id is required' });
    }

    // ensure valid ObjectId before querying
    let registration;
    try {
      registration = await Registration.findById(regId);
    } catch (castErr) {
      return res.status(400).json({ success: false, message: 'Invalid registration id' });
    }

    if (!registration) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }

    registration.attendanceMarked = !!req.body.attended;
    if (registration.attendanceMarked) {
      registration.attendedAt = new Date();
    }
    await registration.save();

    res.json({ success: true, message: 'Attendance updated', data: registration });

  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ success: false, message: 'Error updating attendance' });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/attendance
 * @desc    Mark attendance for an author (for accepted submissions)
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/attendance', async (req, res) => {
  try {
    const submissionId = req.params.id;

    const submission = await Submission.findById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // Verify organizer owns the conference
    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Submission track missing' });
    }

    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to mark attendance for this submission' });
    }

    // Only allow attendance marking for accepted submissions
    if (submission.status !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Attendance can only be marked for accepted submissions' });
    }

    submission.authorAttendanceMarked = !!req.body.attended;
    submission.authorAttendanceMarkedAt = submission.authorAttendanceMarked ? new Date() : null;
    await submission.save();

    res.json({ success: true, message: 'Author attendance updated', data: submission });

  } catch (error) {
    console.error('Update author attendance error:', error);
    res.status(500).json({ success: false, message: 'Error updating author attendance' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/authors
 * @desc    Get all accepted submissions with author info for attendance marking
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/authors', async (req, res) => {
  try {
    const conference = await Conference.findOne({ _id: req.params.id, organizerId: req.user.userId });
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Get tracks for conference
    const tracks = await Track.find({ conferenceId: conference._id }).select('_id name').lean();
    const trackIds = tracks.map(t => t._id);

    // Get accepted submissions with author info
    const submissions = await Submission.find({
      trackId: { $in: trackIds },
      status: 'accepted'
    })
      .populate('authorId', 'name email')
      .populate('trackId', 'name')
      .select('title authorId trackId authorAttendanceMarked authorAttendanceMarkedAt status')
      .sort({ title: 1 })
      .lean();

    res.json({
      success: true,
      data: {
        submissions,
        conference: {
          _id: conference._id,
          name: conference.name
        }
      }
    });

  } catch (error) {
    console.error('Get authors error:', error);
    res.status(500).json({ success: false, message: 'Error fetching authors' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/certificate-stats
 * @desc    Get certificate eligibility stats for a conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/certificate-stats', async (req, res) => {
  try {
    const conference = await Conference.findOne({ _id: req.params.id, organizerId: req.user.userId });
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Get tracks
    const tracks = await Track.find({ conferenceId: conference._id }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);

    // Count eligible authors (accepted + attendance marked)
    const eligibleAuthors = await Submission.countDocuments({
      trackId: { $in: trackIds },
      status: 'accepted',
      authorAttendanceMarked: true
    });

    // Count eligible participants (attendance marked)
    const eligibleParticipants = await Registration.countDocuments({
      conferenceId: conference._id,
      attendanceMarked: true
    });

    // Count eligible reviewers (submitted ACCEPT/REJECT reviews)
    const reviews = await Review.find({
      trackId: { $in: trackIds },
      status: 'submitted',
      recommendation: { $in: ['ACCEPT', 'REJECT'] }
    }).distinct('reviewerId');
    const eligibleReviewers = reviews.length;

    // Count already generated certificates
    const existingAuthorCerts = await Certificate.countDocuments({
      conferenceId: conference._id,
      type: 'presentation'
    });

    const existingParticipantCerts = await Certificate.countDocuments({
      conferenceId: conference._id,
      type: 'participation'
    });

    const existingReviewerCerts = await Certificate.countDocuments({
      conferenceId: conference._id,
      type: 'reviewer'
    });

    res.json({
      success: true,
      data: {
        eligible: {
          authors: eligibleAuthors,
          participants: eligibleParticipants,
          reviewers: eligibleReviewers
        },
        existing: {
          authors: existingAuthorCerts,
          participants: existingParticipantCerts,
          reviewers: existingReviewerCerts
        },
        pending: {
          authors: Math.max(0, eligibleAuthors - existingAuthorCerts),
          participants: Math.max(0, eligibleParticipants - existingParticipantCerts),
          reviewers: Math.max(0, eligibleReviewers - existingReviewerCerts)
        }
      }
    });

  } catch (error) {
    console.error('Get certificate stats error:', error);
    res.status(500).json({ success: false, message: 'Error fetching certificate stats' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/participants
 * @desc    Get all participants registered for a conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/participants', async (req, res) => {
  try {
    const conference = await Conference.findOne({ _id: req.params.id, organizerId: req.user.userId });
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const registrations = await Registration.find({ conferenceId: conference._id })
      .populate('participantId', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: { registrations, conference } });

  } catch (error) {
    console.error('Get participants error:', error);
    res.status(500).json({ success: false, message: 'Error fetching participants' });
  }
});

/**
 * @route   POST /api/organizer/conferences/:id/signature
 * @desc    Upload and attach General Chair signature image for a conference
 * @access  Private (Organizer)
 */
router.post(
  '/conferences/:id/signature',
  setUploadType('signatures'),
  upload.single('signature'),
  async (req, res) => {
    try {
      const conference = await Conference.findOne({
        _id: req.params.id,
        organizerId: req.user.userId
      });

      if (!conference) {
        return res.status(404).json({ success: false, message: 'Conference not found' });
      }

      if (!req.file) {
        return res.status(400).json({ success: false, message: 'Signature file is required' });
      }

      // Store relative path so it can be resolved on the server
      const relativePath = `uploads/signatures/${req.file.filename}`;
      conference.generalChairSignaturePath = relativePath;
      await conference.save();

      res.status(201).json({
        success: true,
        message: 'Signature uploaded successfully',
        data: {
          path: relativePath,
          originalname: req.file.originalname
        }
      });
    } catch (error) {
      console.error('Upload signature error:', error);
      res
        .status(500)
        .json({ success: false, message: 'Error uploading signature' });
    }
  }
);

/**
 * @route   GET /api/organizer/reviews
 * @desc    List reviews across conferences owned by organizer (optional ?conferenceId=&trackId=&submissionId=&reviewerId=&page=&limit=)
 * @access  Private (Organizer)
 */
router.get('/reviews', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { conferenceId, trackId, submissionId, reviewerId } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);

    // Determine conferences the organizer owns (or validate provided conference)
    let confIds = [];
    if (conferenceId) {
      const conf = await Conference.findOne({ _id: conferenceId, organizerId }).select('_id').lean();
      if (!conf) return res.status(403).json({ success: false, message: 'Not authorized for provided conference' });
      confIds = [conf._id];
    } else {
      const confs = await Conference.find({ organizerId }).select('_id').lean();
      confIds = confs.map(c => c._id);
      if (!confIds.length) return res.json({ success: true, data: [] });
    }

    // Determine tracks to query
    let trackIds = [];
    if (trackId) {
      const track = await Track.findOne({ _id: trackId, conferenceId: { $in: confIds } }).select('_id').lean();
      if (!track) return res.status(400).json({ success: false, message: 'Invalid track for provided conferences' });
      trackIds = [track._id];
    } else {
      const tracks = await Track.find({ conferenceId: { $in: confIds } }).select('_id').lean();
      trackIds = tracks.map(t => t._id);
      if (!trackIds.length) return res.json({ success: true, data: [] });
    }

    // Build review query
    const query = {};
    if (submissionId) query.submissionId = submissionId;
    if (reviewerId) query.reviewerId = reviewerId;
    query.trackId = { $in: trackIds };

    const reviews = await Review.find(query)
      .populate({ path: 'submissionId', select: 'title conferenceId trackId' })
      .populate({ path: 'reviewerId', select: 'name email' })
      .populate({ path: 'trackId', select: 'name' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Organizer list reviews error:', error);
    res.status(500).json({ success: false, message: 'Error fetching reviews' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/reviews
 * @desc    List reviews for a single conference (optional ?trackId=&submissionId=&reviewerId=&page=&limit=)
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/reviews', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const confId = req.params.id;
    const { trackId, submissionId, reviewerId } = req.query;
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '25', 10), 1), 200);

    const conference = await Conference.findOne({ _id: confId, organizerId }).select('_id').lean();
    if (!conference) return res.status(404).json({ success: false, message: 'Conference not found or not owned' });

    // Tracks scope
    let trackIds = [];
    if (trackId) {
      const track = await Track.findOne({ _id: trackId, conferenceId: confId }).select('_id').lean();
      if (!track) return res.status(400).json({ success: false, message: 'Invalid track for this conference' });
      trackIds = [track._id];
    } else {
      const tracks = await Track.find({ conferenceId: confId }).select('_id').lean();
      trackIds = tracks.map(t => t._id);
      if (!trackIds.length) return res.json({ success: true, data: [] });
    }

    const query = { trackId: { $in: trackIds } };
    if (submissionId) query.submissionId = submissionId;
    if (reviewerId) query.reviewerId = reviewerId;

    const reviews = await Review.find(query)
      .populate({ path: 'submissionId', select: 'title trackId' })
      .populate({ path: 'reviewerId', select: 'name email' })
      .populate({ path: 'trackId', select: 'name' })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Organizer conference reviews error:', error);
    res.status(500).json({ success: false, message: 'Error fetching conference reviews' });
  }
});

/**
 * @route   GET /api/organizer/submissions/:submissionId/reviews
 * @desc    Get reviews for a specific submission (organizer must own parent conference). Optional ?trackId= to validate.
 * @access  Private (Organizer)
 */
router.get('/submissions/:submissionId/reviews', async (req, res) => {
  try {
    const submissionId = req.params.submissionId;
    const { trackId } = req.query;

    const submission = await Submission.findById(submissionId).lean();
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

    const track = await Track.findById(submission.trackId).lean();
    if (!track) return res.status(400).json({ success: false, message: 'Submission track missing' });

    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to view reviews for this submission' });
    }

    // If trackId provided, ensure it matches submission.trackId
    if (trackId && String(trackId) !== String(submission.trackId)) {
      return res.status(400).json({ success: false, message: 'Track filter does not match submission track' });
    }

    const query = { submissionId: submission._id };
    if (trackId) query.trackId = trackId;

    const reviews = await Review.find(query)
      .populate('reviewerId', 'name email')
      .populate('trackId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Organizer submission reviews error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submission reviews' });
  }
});

// ============ BID MANAGEMENT ROUTES ============

const Bid = require('../models/Bid');

/**
 * @route   GET /api/organizer/bids
 * @desc    List all bids across organizer's conferences (optional filters)
 * @access  Private (Organizer)
 */
router.get('/bids', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const { conferenceId, trackId, status, submissionId, reviewerId, page = 1, limit = 50 } = req.query;

    // Get conferences owned by organizer
    let confIds = [];
    if (conferenceId) {
      const conf = await Conference.findOne({ _id: conferenceId, organizerId }).select('_id').lean();
      if (!conf) return res.status(403).json({ success: false, message: 'Not authorized for this conference' });
      confIds = [conf._id];
    } else {
      const confs = await Conference.find({ organizerId }).select('_id').lean();
      confIds = confs.map(c => c._id);
      if (!confIds.length) return res.json({ success: true, data: { bids: [], total: 0 } });
    }

    // Get tracks for these conferences
    let trackIds = [];
    if (trackId) {
      const track = await Track.findOne({ _id: trackId, conferenceId: { $in: confIds } }).select('_id').lean();
      if (!track) return res.status(400).json({ success: false, message: 'Invalid track' });
      trackIds = [track._id];
    } else {
      const tracks = await Track.find({ conferenceId: { $in: confIds } }).select('_id').lean();
      trackIds = tracks.map(t => t._id);
    }

    // Build bid query
    const query = { trackId: { $in: trackIds } };
    if (status) query.status = status;
    if (submissionId) query.submissionId = submissionId;
    if (reviewerId) query.reviewerId = reviewerId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bids, total] = await Promise.all([
      Bid.find(query)
        .populate({ path: 'submissionId', select: 'title trackId conferenceId' })
        .populate({ path: 'reviewerId', select: 'name email affiliation expertiseDomains' })
        .populate({ path: 'trackId', select: 'name conferenceId' })
        .populate({ path: 'decision.decidedBy', select: 'name' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Bid.countDocuments(query)
    ]);

    // Get stats
    const stats = await Bid.aggregate([
      { $match: { trackId: { $in: trackIds } } },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    const statusCounts = stats.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, { PENDING: 0, APPROVED: 0, REJECTED: 0, WITHDRAWN: 0 });

    res.json({
      success: true,
      data: {
        bids,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        stats: statusCounts
      }
    });
  } catch (error) {
    console.error('Get organizer bids error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bids' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/bids
 * @desc    List bids for a specific conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/bids', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const conferenceId = req.params.id;
    const { status, trackId, page = 1, limit = 50 } = req.query;

    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Get tracks
    let trackIds = [];
    if (trackId) {
      const track = await Track.findOne({ _id: trackId, conferenceId }).select('_id').lean();
      if (!track) return res.status(400).json({ success: false, message: 'Invalid track' });
      trackIds = [track._id];
    } else {
      const tracks = await Track.find({ conferenceId }).select('_id').lean();
      trackIds = tracks.map(t => t._id);
    }

    const query = { trackId: { $in: trackIds } };
    if (status) query.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [bids, total] = await Promise.all([
      Bid.find(query)
        .populate({ path: 'submissionId', select: 'title trackId' })
        .populate({ path: 'reviewerId', select: 'name email affiliation expertiseDomains' })
        .populate({ path: 'trackId', select: 'name' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Bid.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: {
        bids,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get conference bids error:', error);
    res.status(500).json({ success: false, message: 'Error fetching conference bids' });
  }
});

/**
 * @route   PATCH /api/organizer/bids/:id
 * @desc    Approve or reject a bid
 * @access  Private (Organizer)
 */
router.patch('/bids/:id', [
  body('status').isIn(['APPROVED', 'REJECTED']).withMessage('Status must be APPROVED or REJECTED'),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const bid = await Bid.findById(req.params.id).populate('trackId').lean();
    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    // Verify organizer owns conference
    const conference = await Conference.findById(bid.trackId.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this bid' });
    }

    // Can only update PENDING bids
    if (bid.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot update bid with status ${bid.status}. Only PENDING bids can be approved/rejected.`
      });
    }

    const updates = {
      status: req.body.status,
      'decision.decidedBy': req.user.userId,
      'decision.decidedAt': new Date(),
      'decision.reason': req.body.reason || ''
    };

    const updatedBid = await Bid.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate({ path: 'reviewerId', select: 'name email' })
      .populate({ path: 'submissionId', select: 'title' });

    // If approved, create an assignment automatically
    if (req.body.status === 'APPROVED') {
      // Check if assignment already exists
      const existingAssignment = await Assignment.findOne({
        reviewerId: bid.reviewerId,
        submissionId: bid.submissionId,
        status: 'ACTIVE'
      }).lean();

      if (!existingAssignment) {
        const assignment = new Assignment({
          reviewerId: bid.reviewerId,
          submissionId: bid.submissionId,
          trackId: bid.trackId._id,
          conferenceId: conference._id,
          bidId: bid._id,
          source: 'MANUAL', // Approved from bid = manual assignment
          matchScore: bid.confidence * 10 || 50,
          assignedBy: req.user.userId,
          assignedAt: new Date()
        });
        await assignment.save();

        // Add reviewer to submission's assignedReviewers array
        await Submission.findByIdAndUpdate(
          bid.submissionId,
          { $addToSet: { assignedReviewers: bid.reviewerId } }
        );

        // Send email to reviewer
        const [reviewer, submission] = await Promise.all([
          User.findById(bid.reviewerId).lean(),
          Submission.findById(bid.submissionId).populate('trackId', 'name')
        ]);

        if (reviewer?.email) {
          sendEmail(
            reviewer.email,
            templates.reviewerAssigned(reviewer, submission, conference)
          ).catch(err => console.error('Email error:', err));
        }
      }
    }

    res.json({ success: true, message: `Bid ${req.body.status.toLowerCase()}`, data: updatedBid });
  } catch (error) {
    console.error('Update bid error:', error);
    res.status(500).json({ success: false, message: 'Error updating bid' });
  }
});

/**
 * @route   POST /api/organizer/bids/bulk-update
 * @desc    Bulk approve or reject bids
 * @access  Private (Organizer)
 */
router.post('/bids/bulk-update', [
  body('bidIds').isArray({ min: 1 }).withMessage('bidIds must be a non-empty array'),
  body('status').isIn(['APPROVED', 'REJECTED']).withMessage('Status must be APPROVED or REJECTED'),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { bidIds, status, reason } = req.body;
    const organizerId = req.user.userId;

    // Verify all bids belong to organizer's conferences
    const bids = await Bid.find({ _id: { $in: bidIds } }).populate('trackId').lean();

    for (const bid of bids) {
      const conference = await Conference.findById(bid.trackId.conferenceId).lean();
      if (!conference || conference.organizerId.toString() !== organizerId) {
        return res.status(403).json({
          success: false,
          message: `Not authorized to update bid ${bid._id}`
        });
      }
      if (bid.status !== 'PENDING') {
        return res.status(400).json({
          success: false,
          message: `Bid ${bid._id} is not in PENDING status`
        });
      }
    }

    const result = await Bid.updateMany(
      { _id: { $in: bidIds }, status: 'PENDING' },
      {
        status,
        'decision.decidedBy': organizerId,
        'decision.decidedAt': new Date(),
        'decision.reason': reason || ''
      }
    );

    // If approving, create assignments for each bid
    if (status === 'APPROVED') {
      for (const bid of bids) {
        // Check if assignment already exists
        const existingAssignment = await Assignment.findOne({
          reviewerId: bid.reviewerId,
          submissionId: bid.submissionId,
          status: 'ACTIVE'
        }).lean();

        if (!existingAssignment) {
          const conference = await Conference.findById(bid.trackId.conferenceId).lean();
          const assignment = new Assignment({
            reviewerId: bid.reviewerId,
            submissionId: bid.submissionId,
            trackId: bid.trackId._id,
            conferenceId: conference._id,
            bidId: bid._id,
            source: 'MANUAL',
            matchScore: bid.confidence * 10 || 50,
            assignedBy: organizerId,
            assignedAt: new Date()
          });
          await assignment.save();
        }
      }
    }

    res.json({
      success: true,
      message: `${result.modifiedCount} bids ${status.toLowerCase()}`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (error) {
    console.error('Bulk update bids error:', error);
    res.status(500).json({ success: false, message: 'Error updating bids' });
  }
});

// ============ ASSIGNMENT MANAGEMENT ROUTES ============

const Assignment = require('../models/Assignment');
const ReviewerConferenceRegistration = require('../models/ReviewerConferenceRegistration');
const {
  computeMatchScore: _computeMatchScore,
  hasConflict,
  buildBidMap,
  buildReviewerBidLookup,
  buildCapacityCache,
  buildConflictCache,
  buildDomainIndex,
  buildPaperAssignmentCounts,
  buildExistingAssignmentSet,
  sortBidCoveredCandidates,
  sortNoBidCandidates,
  findDomainMatchedReviewers,
  calculateBidBonus,
  computeFinalScore,
} = require('../utils/assignmentEngine');
const featureFlags = require('../config/featureFlags');

/**
 * Wrapper to maintain backward-compat call signature for manual assignment.
 * The new engine expects { bid, reviewer, submission, conference, currentLoad, maxLoad }.
 */
function computeMatchScore(bid, reviewer, submission, conference, currentLoad, maxLoad) {
  const result = _computeMatchScore({
    bid,
    reviewer,
    submission,
    conference,
    currentLoad: currentLoad || 0,
    maxLoad: maxLoad || (reviewer.maxLoad || 10),
  });
  return result;
}

/**
 * @route   POST /api/organizer/conferences/:id/auto-assign
 * @desc    Run automated reviewer assignment algorithm (5-stage workflow)
 * @access  Private (Organizer)
 * 
 * Stages:
 *   1. Data loading & index building
 *   2. Submission categorization (bid-covered vs no-bid)
 *   3. Bid-covered assignment (Scenario A: sufficient bids, B: insufficient)
 *   4. No-bid assignment (domain matching + fallback)
 *   5. Finalization (transactional persistence or dry-run stats)
 */
router.post('/conferences/:id/auto-assign', [
  body('reviewersPerPaper').optional().isInt({ min: 1, max: 10 }).withMessage('reviewersPerPaper must be 1-10'),
  body('maxPapersPerReviewer').optional().isInt({ min: 1, max: 50 }).withMessage('maxPapersPerReviewer must be 1-50'),
  body('clearExisting').optional().isBoolean(),
  body('dryRun').optional().isBoolean()
], async (req, res) => {
  const startTime = Date.now();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const organizerId = req.user.userId;
    const conferenceId = req.params.id;
    const {
      reviewersPerPaper = 3,
      maxPapersPerReviewer = 4,
      clearExisting = false,
      dryRun = false
    } = req.body;

    // Validate dry-run feature flag
    if (dryRun && !featureFlags.ENABLE_DRY_RUN) {
      return res.status(400).json({ success: false, message: 'Dry-run mode is not enabled' });
    }

    // ─── STAGE 0: Build Eligible Reviewer Pool ─────────────────────────
    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const tracks = await Track.find({ conferenceId }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);

    // Parallel data loading
    const [submissions, allBids, allReviewers] = await Promise.all([
      Submission.find({ trackId: { $in: trackIds } })
        .populate('authorId', 'name email affiliation')
        .lean(),
      // Load APPROVED + PENDING bids: approved for assignment, pending for prioritization
      Bid.find({ trackId: { $in: trackIds }, status: { $in: ['APPROVED', 'PENDING'] } }).lean(),
      User.find({ role: 'reviewer' }).lean(),
    ]);

    // Separate: approved bids are used for actual assignment, all bids for categorization
    const approvedBids = allBids.filter(b => b.status === 'APPROVED');

    if (submissions.length === 0) {
      return res.json({
        success: true,
        message: 'No submissions to assign',
        stats: { totalAssignments: 0, bidCoveredCount: 0, noBidCount: 0, fallbackCount: 0, averageScore: 0 }
      });
    }

    // Stage 0: Filter reviewers by conference eligibility
    let reviewers;
    let eligibilityLog = {};

    if (featureFlags.ENABLE_CONFERENCE_ELIGIBILITY) {
      const hasFee = conference.fee > 0;
      const eligibleIds = await ReviewerConferenceRegistration.getEligibleReviewerIds(conferenceId, hasFee);
      reviewers = allReviewers.filter(r => eligibleIds.has(r._id.toString()));

      eligibilityLog = {
        totalReviewersInSystem: allReviewers.length,
        conferenceRegistered: eligibleIds.size,
        eligibleAfterFilter: reviewers.length,
        filteredOut: allReviewers.length - reviewers.length,
      };
      console.log(`[Auto-Assign] Stage 0 — Eligibility: ${JSON.stringify(eligibilityLog)}`);
    } else {
      reviewers = allReviewers;
      eligibilityLog = {
        totalReviewersInSystem: allReviewers.length,
        conferenceRegistered: 'N/A (eligibility disabled)',
        eligibleAfterFilter: allReviewers.length,
        filteredOut: 0,
      };
    }

    if (reviewers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No conference-registered eligible reviewers are available for assignment.',
        eligibilityLog
      });
    }

    // Clear existing non-locked assignments if requested (and not dry-run)
    if (clearExisting && !dryRun) {
      await Assignment.deleteMany({ conferenceId, locked: false, status: 'ACTIVE' });
    }

    // Load existing assignments (after potential clear)
    const existingAssignments = await Assignment.find({ conferenceId, status: 'ACTIVE' }).lean();

    // ─── STAGE 1: Index Building ──────────────────────────────────────
    // bidMap uses approved bids only (for scoring + assignment)
    const bidMap = buildBidMap(approvedBids);
    const reviewerBidLookup = buildReviewerBidLookup(approvedBids);

    // allBidMap uses ALL bids (approved + pending) for paper prioritization
    const allBidMap = buildBidMap(allBids);

    const capacityCache = buildCapacityCache(reviewers, existingAssignments);
    const conflictCache = buildConflictCache(reviewers, submissions);
    const existingSet = buildExistingAssignmentSet(existingAssignments);
    const paperCounts = buildPaperAssignmentCounts(existingAssignments);

    // Build domain index for no-bid matching
    const domainIndex = featureFlags.ENABLE_DOMAIN_MATCHING
      ? buildDomainIndex(reviewers)
      : new Map();

    // Reviewer lookup by ID (eligible reviewers only)
    const reviewerById = new Map();
    for (const r of reviewers) {
      reviewerById.set(r._id.toString(), r);
    }

    // ─── STAGE 1: Submission Categorization ───────────────────────────
    // Papers with ANY bid (approved or pending) are processed FIRST.
    // This ensures reviewer capacity is reserved for bid-covered papers.
    const bidCoveredPapers = [];
    const noBidPapers = [];

    for (const sub of submissions) {
      const subId = sub._id.toString();
      // Skip if already fully assigned
      if ((paperCounts.get(subId) || 0) >= reviewersPerPaper) continue;

      // Use allBidMap (includes pending) for categorization
      const anyBids = allBidMap.get(subId);
      if (anyBids && anyBids.length > 0) {
        bidCoveredPapers.push(sub);
      } else {
        noBidPapers.push(sub);
      }
    }

    console.log(`[Auto-Assign] Categorized: ${bidCoveredPapers.length} bid-covered, ${noBidPapers.length} no-bid (from ${submissions.length} total)`);

    // ─── Helper: check if a reviewer can be assigned to a submission ──
    function isEligible(revId, subId) {
      // Already assigned?
      if (existingSet.has(`${revId}_${subId}`)) return false;
      // Conflict?
      if (conflictCache.has(`${revId}|${subId}`)) return false;
      // Over capacity?
      const cap = capacityCache.get(revId);
      if (cap && cap.used >= Math.min(cap.max, maxPapersPerReviewer)) return false;
      return true;
    }

    // Track new assignments to create
    const newAssignments = [];
    const submissionUpdates = new Map(); // subId -> [reviewerIds]
    let bidCoveredCount = 0;
    let noBidCount = 0;
    let fallbackCount = 0;
    let totalScore = 0;

    // ─── Helper: record an assignment ─────────────────────────────────
    function recordAssignment(revId, sub, source, matchResult, bidObj) {
      const subId = sub._id.toString();

      newAssignments.push({
        reviewerId: revId,
        submissionId: sub._id,
        trackId: sub.trackId,
        conferenceId: conference._id,
        bidId: bidObj ? bidObj._id : null,
        source,
        matchScore: matchResult.score,
        matchReason: matchResult.reason,
        assignedAt: new Date(),
      });

      // Update tracking structures
      existingSet.add(`${revId}_${subId}`);
      paperCounts.set(subId, (paperCounts.get(subId) || 0) + 1);
      const cap = capacityCache.get(revId);
      if (cap) cap.used += 1;

      totalScore += matchResult.score;

      if (!submissionUpdates.has(subId)) {
        submissionUpdates.set(subId, []);
      }
      submissionUpdates.get(subId).push(revId);

      // Track source counts
      if (source === 'BID' || source === 'BID_PRIORITY') bidCoveredCount++;
      else if (source === 'FALLBACK') fallbackCount++;
      else noBidCount++;
    }

    // ─── STAGE 2A: Assign ALL Bidders First (capacity-preserving) ──────
    // CRITICAL: Process every bidder across ALL papers BEFORE filling any
    // remaining slots from the general pool. This prevents general-pool
    // assignments from exhausting reviewer capacity and blocking bidders
    // on later papers.
    //
    // Example: 4 reviewers, 52 papers. Without this two-pass approach,
    // Case B fallback on Paper #1 could consume Reviewer B's capacity,
    // preventing Reviewer B from being assigned to Paper #5 which they
    // explicitly bid on.

    const bidCoveredPapersNeedingFill = []; // Track papers that need Pass B

    for (const sub of bidCoveredPapers) {
      const subId = sub._id.toString();
      const needed = reviewersPerPaper - (paperCounts.get(subId) || 0);
      if (needed <= 0) continue;

      const subBids = bidMap.get(subId) || [];

      // Score all eligible bidding reviewers
      const bidCandidates = [];
      for (const { reviewerId: revId, bid } of subBids) {
        if (!isEligible(revId, subId)) continue;
        const reviewer = reviewerById.get(revId);
        if (!reviewer) continue;

        const cap = capacityCache.get(revId) || { used: 0, max: 10 };
        const matchResult = computeMatchScore(bid, reviewer, sub, conference, cap.used, cap.max);

        // Apply additive bid bonus (PRD Section 9.4)
        const bidBonusResult = featureFlags.ENABLE_BID_BONUS
          ? calculateBidBonus(bid)
          : { bonus: 0, reason: '' };
        const finalScore = computeFinalScore(matchResult.score, bidBonusResult.bonus);
        const fullReason = [matchResult.reason, bidBonusResult.reason].filter(Boolean).join('; ');

        bidCandidates.push({
          reviewerId: revId,
          score: finalScore,
          baseScore: matchResult.score,
          bidBonus: bidBonusResult.bonus,
          reason: fullReason,
          bidTimestamp: bid.bidTimestamp || bid.createdAt,
          bid,
          reviewer,
        });
      }

      // Sort bidders by finalScore (includes bid bonus)
      sortBidCoveredCandidates(bidCandidates);

      // Assign up to `needed` bidders (but ONLY bidders — no fallback yet)
      const toAssign = bidCandidates.slice(0, needed);
      for (const c of toAssign) {
        recordAssignment(c.reviewerId, sub, 'BID_PRIORITY', { score: c.baseScore, reason: c.reason }, c.bid);
      }

      // If still unfilled after assigning all available bidders, queue for Pass B
      const stillNeeded = reviewersPerPaper - (paperCounts.get(subId) || 0);
      if (stillNeeded > 0) {
        bidCoveredPapersNeedingFill.push(sub);
      }
    }

    console.log(`[Auto-Assign] Stage 2A complete: ${bidCoveredCount} bid assignments, ${bidCoveredPapersNeedingFill.length} papers need fill`);

    // ─── STAGE 2B: Fill Remaining Slots on Bid-Covered Papers ─────────
    // Now that ALL bidders have been assigned, fill unfilled slots from
    // the general conference-eligible reviewer pool.
    for (const sub of bidCoveredPapersNeedingFill) {
      const subId = sub._id.toString();
      const remainingNeeded = reviewersPerPaper - (paperCounts.get(subId) || 0);
      if (remainingNeeded <= 0) continue;

      const generalCandidates = [];
      // Try domain-matched reviewers first
      if (featureFlags.ENABLE_DOMAIN_MATCHING) {
        const domainReviewerIds = findDomainMatchedReviewers(sub, conference, domainIndex);
        for (const revId of domainReviewerIds) {
          if (!isEligible(revId, subId)) continue;
          const reviewer = reviewerById.get(revId);
          if (!reviewer) continue;
          const cap = capacityCache.get(revId) || { used: 0, max: 10 };
          const matchResult = computeMatchScore(null, reviewer, sub, conference, cap.used, cap.max);
          generalCandidates.push({
            reviewerId: revId, score: matchResult.score, reason: matchResult.reason,
            lastAssignedAt: reviewer.lastAssignedAt, reviewer,
          });
        }
      }
      // Expand to all eligible reviewers if still insufficient
      if (generalCandidates.length < remainingNeeded) {
        for (const reviewer of reviewers) {
          const revId = reviewer._id.toString();
          if (generalCandidates.some(c => c.reviewerId === revId)) continue;
          if (!isEligible(revId, subId)) continue;
          const cap = capacityCache.get(revId) || { used: 0, max: 10 };
          const matchResult = computeMatchScore(null, reviewer, sub, conference, cap.used, cap.max);
          generalCandidates.push({
            reviewerId: revId, score: matchResult.score, reason: matchResult.reason + ' (fallback)',
            lastAssignedAt: reviewer.lastAssignedAt, reviewer, isFallback: true,
          });
        }
      }
      sortNoBidCandidates(generalCandidates);
      const toFill = generalCandidates.slice(0, remainingNeeded);
      for (const c of toFill) {
        const source = c.isFallback ? 'FALLBACK' : 'AUTO_GENERAL';
        recordAssignment(c.reviewerId, sub, source, { score: c.score, reason: c.reason }, null);
      }
    }

    // ─── STAGE 3: General Assignment (No-Bid Papers) ──────────────────
    if (featureFlags.ENABLE_DOMAIN_MATCHING) {
      for (const sub of noBidPapers) {
        const subId = sub._id.toString();
        const needed = reviewersPerPaper - (paperCounts.get(subId) || 0);
        if (needed <= 0) continue;

        // Find domain-matched reviewers
        const domainReviewerIds = findDomainMatchedReviewers(sub, conference, domainIndex);
        const candidates = [];

        for (const revId of domainReviewerIds) {
          if (!isEligible(revId, subId)) continue;
          const reviewer = reviewerById.get(revId);
          if (!reviewer) continue;

          const cap = capacityCache.get(revId) || { used: 0, max: 10 };
          const matchResult = computeMatchScore(null, reviewer, sub, conference, cap.used, cap.max);

          candidates.push({
            reviewerId: revId,
            score: matchResult.score,
            reason: matchResult.reason,
            lastAssignedAt: reviewer.lastAssignedAt,
            reviewer,
          });
        }

        // Fallback: if insufficient domain reviewers, expand to all reviewers
        if (candidates.length < needed) {
          for (const reviewer of reviewers) {
            const revId = reviewer._id.toString();
            if (candidates.some(c => c.reviewerId === revId)) continue;
            if (!isEligible(revId, subId)) continue;

            const cap = capacityCache.get(revId) || { used: 0, max: 10 };
            const matchResult = computeMatchScore(null, reviewer, sub, conference, cap.used, cap.max);

            candidates.push({
              reviewerId: revId,
              score: matchResult.score,
              reason: matchResult.reason + ' (fallback)',
              lastAssignedAt: reviewer.lastAssignedAt,
              reviewer,
              isFallback: true,
            });
          }
        }

        sortNoBidCandidates(candidates);

        const toAssign = candidates.slice(0, needed);
        for (const c of toAssign) {
          const source = c.isFallback ? 'FALLBACK' : 'DOMAIN_TOP_K';
          recordAssignment(c.reviewerId, sub, source, { score: c.score, reason: c.reason }, null);
        }
      }
    }

    // ─── STAGE 4: Validation & Finalization ───────────────────────────
    const duration = Date.now() - startTime;

    // Calculate final stats
    const allPaperCounts = new Map(paperCounts);
    const papersFullyAssigned = [...allPaperCounts.values()].filter(c => c >= reviewersPerPaper).length;

    const stats = {
      totalAssignments: newAssignments.length,
      bidCoveredCount,
      noBidCount,
      fallbackCount,
      averageScore: newAssignments.length > 0 ? Math.round(totalScore / newAssignments.length) : 0,
      totalSubmissions: submissions.length,
      papersFullyAssigned,
      papersUnderAssigned: submissions.length - papersFullyAssigned,
      reviewersUsed: new Set(newAssignments.map(a => a.reviewerId.toString())).size,
      dryRun,
      duration: `${duration}ms`,
      config: { reviewersPerPaper, maxPapersPerReviewer, clearExisting },
      eligibility: eligibilityLog,
    };

    // Log assignment run
    console.log(`[Auto-Assign] Conference ${conferenceId}: ${newAssignments.length} assignments in ${duration}ms | Bid: ${bidCoveredCount} | Domain: ${noBidCount} | Fallback: ${fallbackCount} | Avg Score: ${stats.averageScore} | DryRun: ${dryRun}`);

    if (dryRun) {
      return res.json({
        success: true,
        message: 'Dry-run completed — no data was persisted',
        stats,
      });
    }

    // Persist within a MongoDB transaction
    if (newAssignments.length > 0) {
      const session = await mongoose.startSession();
      try {
        session.startTransaction();

        // Bulk insert assignments
        await Assignment.insertMany(newAssignments, { session });

        // Update submission assignedReviewers + assignedCount
        const updatePromises = [];
        for (const [subId, reviewerIds] of submissionUpdates) {
          updatePromises.push(
            Submission.findByIdAndUpdate(subId, {
              $addToSet: { assignedReviewers: { $each: reviewerIds.map(id => new mongoose.Types.ObjectId(id)) } },
              $inc: { assignedCount: reviewerIds.length },
            }, { session })
          );
        }

        // Update reviewer lastAssignedAt
        const reviewerUpdateIds = [...new Set(newAssignments.map(a => a.reviewerId.toString()))];
        for (const revId of reviewerUpdateIds) {
          updatePromises.push(
            User.findByIdAndUpdate(revId, { lastAssignedAt: new Date() }, { session })
          );
        }

        await Promise.all(updatePromises);
        await session.commitTransaction();
      } catch (txError) {
        await session.abortTransaction();
        console.error('[Auto-Assign] Transaction failed, rolled back:', txError);
        throw txError;
      } finally {
        session.endSession();
      }
    }

    res.json({
      success: true,
      message: 'Auto-assignment completed',
      stats,
    });

  } catch (error) {
    console.error('Auto-assign error:', error);
    res.status(500).json({ success: false, message: 'Error running auto-assignment' });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id/assignments
 * @desc    Get assignments for a conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/assignments', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const conferenceId = req.params.id;
    const { trackId, status, reviewerId, submissionId, page = 1, limit = 100 } = req.query;

    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const query = { conferenceId };
    if (trackId) query.trackId = trackId;
    if (status) query.status = status;
    if (reviewerId) query.reviewerId = reviewerId;
    if (submissionId) query.submissionId = submissionId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [assignments, total] = await Promise.all([
      Assignment.find(query)
        .populate({ path: 'reviewerId', select: 'name email affiliation' })
        .populate({ path: 'submissionId', select: 'title trackId status' })
        .populate({ path: 'trackId', select: 'name' })
        .populate({ path: 'assignedBy', select: 'name' })
        .sort({ assignedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Assignment.countDocuments(query)
    ]);

    // Get stats
    const stats = await Assignment.aggregate([
      { $match: { conferenceId: new mongoose.Types.ObjectId(conferenceId) } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'ACTIVE'] }, 1, 0] } },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'COMPLETED'] }, 1, 0] } },
          autoAssigned: { $sum: { $cond: [{ $eq: ['$source', 'AUTO'] }, 1, 0] } },
          manualAssigned: { $sum: { $cond: [{ $eq: ['$source', 'MANUAL'] }, 1, 0] } },
          avgScore: { $avg: '$matchScore' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        assignments,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        stats: stats[0] || { total: 0, active: 0, completed: 0, autoAssigned: 0, manualAssigned: 0, avgScore: 0 }
      }
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching assignments' });
  }
});

/**
 * @route   POST /api/organizer/assignments
 * @desc    Create a manual assignment (enhanced with capacity-aware scoring)
 * @access  Private (Organizer)
 */
router.post('/assignments', [
  body('reviewerId').notEmpty().withMessage('reviewerId is required'),
  body('submissionId').notEmpty().withMessage('submissionId is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const organizerId = req.user.userId;
    const { reviewerId, submissionId, notes } = req.body;

    // Get submission and verify ownership
    const submission = await Submission.findById(submissionId).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const track = await Track.findById(submission.trackId).lean();
    if (!track) {
      return res.status(400).json({ success: false, message: 'Track not found' });
    }

    const conference = await Conference.findById(track.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== organizerId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Check if reviewer exists and has correct role
    const reviewer = await User.findById(reviewerId).lean();
    if (!reviewer || reviewer.role !== 'reviewer') {
      return res.status(400).json({ success: false, message: 'Invalid reviewer' });
    }

    // Check conference registration eligibility (same rules as auto-assign)
    if (featureFlags.ENABLE_CONFERENCE_ELIGIBILITY) {
      const registration = await ReviewerConferenceRegistration.findOne({
        reviewerId,
        conferenceId: conference._id,
        active: true
      }).lean();

      if (!registration) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'REVIEWER_NOT_REGISTERED',
            message: 'Reviewer is not registered for this conference. They must register before being assigned.'
          }
        });
      }

      const hasFee = conference.fee > 0;
      const isEligible = registration.status === 'REGISTERED_ACTIVE' ||
        (registration.status === 'REGISTERED_PENDING_PAYMENT' && !hasFee);

      if (!isEligible) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'REVIEWER_INELIGIBLE',
            message: `Reviewer registration status (${registration.status}) does not allow assignment.`
          }
        });
      }
    }

    // Check for existing active assignment (duplicate prevention)
    const existing = await Assignment.findOne({ reviewerId, submissionId, status: 'ACTIVE' }).lean();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'DUPLICATE_ASSIGNMENT', message: 'Assignment already exists for this reviewer-submission pair' }
      });
    }

    // Check reviewer capacity
    const currentLoad = await Assignment.countDocuments({ reviewerId, status: 'ACTIVE' });
    const maxLoad = reviewer.maxLoad || 10;
    if (currentLoad >= maxLoad) {
      return res.status(400).json({
        success: false,
        error: { code: 'CAPACITY_EXCEEDED', message: `Reviewer has reached maximum capacity (${currentLoad}/${maxLoad})` }
      });
    }

    // Check for conflicts
    const author = await User.findById(submission.authorId).lean();
    if (hasConflict(reviewer, submission, author)) {
      return res.status(400).json({
        success: false,
        error: { code: 'ASSIGNMENT_CONFLICT', message: 'Conflict detected between reviewer and submission' }
      });
    }

    // Find any approved bid
    const bid = await Bid.findOne({ reviewerId, submissionId, status: 'APPROVED' }).lean();

    // Compute score with capacity awareness
    const matchResult = computeMatchScore(bid, reviewer, submission, conference, currentLoad, maxLoad);

    const assignment = new Assignment({
      reviewerId,
      submissionId,
      trackId: submission.trackId,
      conferenceId: conference._id,
      bidId: bid ? bid._id : null,
      source: 'MANUAL',
      matchScore: matchResult.score,
      matchReason: matchResult.reason,
      assignedBy: organizerId,
      assignedAt: new Date(),
      notes
    });

    await assignment.save();

    // Update submission assignedReviewers + assignedCount
    await Submission.findByIdAndUpdate(submissionId, {
      $addToSet: { assignedReviewers: reviewerId },
      $inc: { assignedCount: 1 },
    });

    // Update reviewer lastAssignedAt
    await User.findByIdAndUpdate(reviewerId, { lastAssignedAt: new Date() });

    const populated = await Assignment.findById(assignment._id)
      .populate({ path: 'reviewerId', select: 'name email affiliation expertiseDomains maxLoad' })
      .populate({ path: 'submissionId', select: 'title keywords' });

    res.status(201).json({ success: true, message: 'Assignment created', data: populated });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ success: false, message: 'Error creating assignment' });
  }
});

/**
 * @route   PUT /api/organizer/assignments/:id
 * @desc    Update an assignment (lock, notes, status)
 * @access  Private (Organizer)
 */
router.put('/assignments/:id', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const assignmentId = req.params.id;
    const { locked, notes, status } = req.body;

    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify ownership
    const conference = await Conference.findById(assignment.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== organizerId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const updates = {};
    if (typeof locked === 'boolean') updates.locked = locked;
    if (notes !== undefined) updates.notes = notes;
    if (status && ['ACTIVE', 'COMPLETED', 'CANCELLED'].includes(status)) {
      updates.status = status;
      if (status === 'COMPLETED') updates.completedAt = new Date();
    }

    const updated = await Assignment.findByIdAndUpdate(assignmentId, updates, { new: true })
      .populate({ path: 'reviewerId', select: 'name email' })
      .populate({ path: 'submissionId', select: 'title' });

    res.json({ success: true, message: 'Assignment updated', data: updated });
  } catch (error) {
    console.error('Update assignment error:', error);
    res.status(500).json({ success: false, message: 'Error updating assignment' });
  }
});

/**
 * @route   DELETE /api/organizer/assignments/:id
 * @desc    Delete an assignment
 * @access  Private (Organizer)
 */
router.delete('/assignments/:id', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const assignmentId = req.params.id;

    const assignment = await Assignment.findById(assignmentId).lean();
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Verify ownership
    const conference = await Conference.findById(assignment.conferenceId).lean();
    if (!conference || conference.organizerId.toString() !== organizerId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    // Cannot delete locked assignments
    if (assignment.locked) {
      return res.status(400).json({ success: false, message: 'Cannot delete locked assignment' });
    }

    await Assignment.findByIdAndDelete(assignmentId);

    res.json({ success: true, message: 'Assignment deleted' });
  } catch (error) {
    console.error('Delete assignment error:', error);
    res.status(500).json({ success: false, message: 'Error deleting assignment' });
  }
});

// ============ ELIGIBLE REVIEWERS ============

/**
 * @route   GET /api/organizer/conferences/:id/eligible-reviewers
 * @desc    Get conference-registered eligible reviewers with status info
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/eligible-reviewers', async (req, res) => {
  try {
    const organizerId = req.user.userId;
    const conferenceId = req.params.id;

    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const registrations = await ReviewerConferenceRegistration.find({ conferenceId })
      .populate('reviewerId', 'name email affiliation expertiseDomains maxLoad')
      .sort({ registeredAt: -1 })
      .lean();

    // Get assignment counts for each reviewer
    const reviewerIds = registrations.map(r => r.reviewerId?._id).filter(Boolean);
    const assignmentCounts = await Assignment.aggregate([
      { $match: { conferenceId: new mongoose.Types.ObjectId(conferenceId), reviewerId: { $in: reviewerIds }, status: 'ACTIVE' } },
      { $group: { _id: '$reviewerId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(assignmentCounts.map(a => [a._id.toString(), a.count]));

    const hasFee = conference.fee > 0;
    const enriched = registrations.map(reg => {
      const isEligible = reg.active && (
        reg.status === 'REGISTERED_ACTIVE' ||
        (reg.status === 'REGISTERED_PENDING_PAYMENT' && !hasFee)
      );
      const revId = reg.reviewerId?._id?.toString();
      return {
        ...reg,
        isEligible,
        currentAssignments: revId ? (countMap.get(revId) || 0) : 0,
      };
    });

    res.json({
      success: true,
      data: {
        reviewers: enriched,
        total: enriched.length,
        eligible: enriched.filter(r => r.isEligible).length,
      }
    });
  } catch (error) {
    console.error('Get eligible reviewers error:', error);
    res.status(500).json({ success: false, message: 'Error fetching eligible reviewers' });
  }
});

// ============ ASSIGNMENT ANALYTICS ============

/**
 * @route   GET /api/organizer/conferences/:id/assignment-analytics
 * @desc    Get assignment analytics for a conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id/assignment-analytics', async (req, res) => {
  try {
    if (!featureFlags.ENABLE_ASSIGNMENT_ANALYTICS) {
      return res.status(400).json({ success: false, message: 'Assignment analytics is not enabled' });
    }

    const organizerId = req.user.userId;
    const conferenceId = req.params.id;

    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const confObjId = new mongoose.Types.ObjectId(conferenceId);

    // Aggregate assignment stats
    const [scoreStats, sourceBreakdown, reviewerLoadData] = await Promise.all([
      // Score distribution
      Assignment.aggregate([
        { $match: { conferenceId: confObjId, status: 'ACTIVE' } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            avgScore: { $avg: '$matchScore' },
            low: { $sum: { $cond: [{ $lte: ['$matchScore', 25] }, 1, 0] } },
            medium: { $sum: { $cond: [{ $and: [{ $gt: ['$matchScore', 25] }, { $lte: ['$matchScore', 50] }] }, 1, 0] } },
            good: { $sum: { $cond: [{ $and: [{ $gt: ['$matchScore', 50] }, { $lte: ['$matchScore', 75] }] }, 1, 0] } },
            excellent: { $sum: { $cond: [{ $gt: ['$matchScore', 75] }, 1, 0] } },
          }
        }
      ]),

      // Source breakdown
      Assignment.aggregate([
        { $match: { conferenceId: confObjId, status: 'ACTIVE' } },
        { $group: { _id: '$source', count: { $sum: 1 } } }
      ]),

      // Reviewer load distribution
      Assignment.aggregate([
        { $match: { conferenceId: confObjId, status: 'ACTIVE' } },
        { $group: { _id: '$reviewerId', count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'reviewer' } },
        { $unwind: '$reviewer' },
        { $project: { name: '$reviewer.name', count: 1, maxLoad: { $ifNull: ['$reviewer.maxLoad', 10] } } },
        { $sort: { count: -1 } }
      ]),
    ]);

    const stats = scoreStats[0] || { total: 0, avgScore: 0, low: 0, medium: 0, good: 0, excellent: 0 };

    // Source counts
    const sources = {};
    for (const s of sourceBreakdown) {
      sources[s._id || 'UNKNOWN'] = s.count;
    }

    // Bid coverage
    const tracks = await Track.find({ conferenceId }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);
    const totalSubmissions = await Submission.countDocuments({ trackId: { $in: trackIds } });
    const biddedSubmissions = await Bid.distinct('submissionId', { trackId: { $in: trackIds }, status: 'APPROVED' });
    const bidCoverage = totalSubmissions > 0 ? Math.round((biddedSubmissions.length / totalSubmissions) * 100 * 10) / 10 : 0;

    // Fallback percentage
    const fallbackPct = stats.total > 0 ? Math.round(((sources.FALLBACK || 0) / stats.total) * 100 * 10) / 10 : 0;

    res.json({
      success: true,
      data: {
        averageScore: Math.round(stats.avgScore || 0),
        scoreDistribution: {
          '0-25': stats.low,
          '26-50': stats.medium,
          '51-75': stats.good,
          '76-100': stats.excellent,
        },
        reviewerLoad: reviewerLoadData.map(r => ({ name: r.name, count: r.count, max: r.maxLoad })),
        sourceBreakdown: sources,
        fallbackPercentage: fallbackPct,
        bidCoverage,
        totalAssignments: stats.total,
      }
    });
  } catch (error) {
    console.error('Assignment analytics error:', error);
    res.status(500).json({ success: false, message: 'Error fetching analytics' });
  }
});

module.exports = router;
