const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const Track = require('../models/Track');
const Bid = require('../models/Bid');
const Conference = require('../models/Conference');
const User = require('../models/User');
const { sendEmail, templates } = require('../utils/emailService');

// All reviewer routes require authentication and reviewer role
router.use(auth, authorize('reviewer'));

/**
 * @route   GET /api/reviewer/conferences
 * @desc    Get active conferences for reviewers to browse and bid on papers
 * @access  Private (Reviewer)
 */
router.get('/conferences', async (req, res) => {
  try {
    const conferences = await Conference.find({ status: 'active' })
      .populate('organizerId', 'name')
      .sort({ submissionDeadline: 1 })
      .lean();

    res.json({ success: true, data: { conferences } });
  } catch (error) {
    console.error('Reviewer get conferences error:', error);
    res.status(500).json({ success: false, message: 'Error fetching conferences', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/conferences/:id/submissions
 * @desc    Get approved submissions for a conference (for reviewers to bid on)
 * @access  Private (Reviewer)
 */
router.get('/conferences/:id/submissions', async (req, res) => {
  try {
    const conference = await Conference.findById(req.params.id).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Build track filter
    let trackIds;
    if (req.query.trackId) {
      // Filter by specific track
      const track = await Track.findOne({ _id: req.query.trackId, conferenceId: req.params.id }).lean();
      if (!track) {
        return res.status(400).json({ success: false, message: 'Invalid track for this conference' });
      }
      trackIds = [track._id];
    } else {
      // Get all tracks for this conference
      const tracks = await Track.find({ conferenceId: req.params.id }).select('_id').lean();
      trackIds = tracks.map(t => t._id);
    }

    // Get approved submissions (organizerApproved = true) for bidding
    const submissions = await Submission.find({
      trackId: { $in: trackIds },
      organizerApproved: true
    })
      .populate('authorId', 'name email')
      .populate('trackId', 'name')
      .populate('conferenceId', 'name')
      .sort({ submittedAt: -1 })
      .lean();

    // Check which submissions the reviewer has already bid on
    const reviewerId = req.user.userId;
    const bids = await Bid.find({
      reviewerId,
      submissionId: { $in: submissions.map(s => s._id) }
    }).lean();
    const biddedIds = new Set(bids.map(b => b.submissionId.toString()));

    const submissionsWithBidStatus = submissions.map(s => ({
      ...s,
      hasBid: biddedIds.has(s._id.toString())
    }));

    res.json({ success: true, data: submissionsWithBidStatus });
  } catch (error) {
    console.error('Reviewer get conference submissions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submissions', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/conferences/:id/tracks
 * @desc    Get tracks for a conference
 * @access  Private (Reviewer)
 */
router.get('/conferences/:id/tracks', async (req, res) => {
  try {
    const conference = await Conference.findById(req.params.id).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    const tracks = await Track.find({ conferenceId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: tracks });
  } catch (error) {
    console.error('Reviewer get conference tracks error:', error);
    res.status(500).json({ success: false, message: 'Error fetching tracks', error: error.message });
  }
});

/**
 * @route   POST /api/reviewer/bids
 * @desc    Place a bid for a submission (track-aware). Body: { submissionId, confidence }
 * @access  Private (Reviewer)
 */
router.post('/bids', [
  body('submissionId').notEmpty().withMessage('submissionId is required'),
  body('confidence').optional().isNumeric().withMessage('confidence must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { submissionId, confidence = 0 } = req.body;
    const submission = await Submission.findById(submissionId).lean();
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

    // Ensure submission has a track
    if (!submission.trackId) return res.status(400).json({ success: false, message: 'Submission is not associated with a track' });

    const bid = new Bid({
      reviewerId: req.user.userId,
      submissionId: submission._id,
      trackId: submission.trackId,
      confidence
    });

    await bid.save();
    res.status(201).json({ success: true, message: 'Bid placed', data: bid });
  } catch (error) {
    console.error('Place bid error:', error);
    res.status(500).json({ success: false, message: 'Error placing bid', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/bids
 * @desc    List bids by current reviewer (optional ?trackId=&submissionId=)
 * @access  Private (Reviewer)
 */
router.get('/bids', async (req, res) => {
  try {
    const reviewerId = req.user.userId;
    const query = { reviewerId };
    if (req.query.trackId) query.trackId = req.query.trackId;
    if (req.query.submissionId) query.submissionId = req.query.submissionId;

    const bids = await Bid.find(query)
      .populate({
        path: 'submissionId',
        select: 'title conferenceId trackId status lastUpdatedAt',
        populate: { path: 'conferenceId', select: 'name' }
      })
      .populate({ path: 'trackId', select: 'name conferenceId', populate: { path: 'conferenceId', select: 'name' } })
      .sort({ createdAt: -1 })
      .lean();

    // Get all submission IDs from bids
    const submissionIds = bids.map(b => b.submissionId?._id).filter(Boolean);

    // Fetch reviews by this reviewer for all bid submissions
    const reviews = await Review.find({
      reviewerId,
      submissionId: { $in: submissionIds }
    }).lean();

    // Create a map of submissionId -> review
    const reviewMap = new Map();
    reviews.forEach(r => {
      reviewMap.set(r.submissionId.toString(), r);
    });

    // Enrich bids with review status
    const enrichedBids = bids.map(bid => {
      const subId = bid.submissionId?._id?.toString();
      const review = subId ? reviewMap.get(subId) : null;
      const submissionStatus = bid.submissionId?.status;

      if (!review) {
        // No review yet
        return {
          ...bid,
          reviewStatus: {
            hasReview: false,
            canReview: submissionStatus === 'under_review' || submissionStatus === 'submitted'
          }
        };
      }

      const isFinalVerdict = review.recommendation === 'ACCEPT' || review.recommendation === 'REJECT';

      // Can update only if:
      // 1. Gave revision verdict (MINOR_REVISION or MAJOR_REVISION)
      // 2. Submission was updated AFTER the review was submitted (author actually uploaded revision)
      // 3. Submission status is back to 'submitted' or 'under_review' (not still 'revision')
      const reviewSubmittedAt = new Date(review.submittedAt || review.createdAt);
      const submissionUpdatedAt = new Date(bid.submissionId?.lastUpdatedAt || bid.submissionId?.updatedAt || 0);
      const paperWasRevised = submissionUpdatedAt > reviewSubmittedAt;

      const canUpdate =
        (review.recommendation === 'MINOR_REVISION' || review.recommendation === 'MAJOR_REVISION') &&
        paperWasRevised &&
        (submissionStatus === 'submitted' || submissionStatus === 'under_review');

      return {
        ...bid,
        reviewStatus: {
          hasReview: true,
          recommendation: review.recommendation,
          isFinalVerdict,
          canUpdate,
          reviewedAt: review.createdAt,
          paperWasRevised  // helpful for debugging
        }
      };
    });

    res.json({ success: true, data: enrichedBids });
  } catch (error) {
    console.error('List bids error:', error);
    res.status(500).json({ success: false, message: 'Error fetching bids', error: error.message });
  }
});

/**
 * @route   POST /api/reviewer/submissions/:submissionId/reviews
 * @desc    Create a review for a submission (submission must be track-scoped)
 * @access  Private (Reviewer)
 */
router.post(
  '/submissions/:submissionId/reviews',
  [
    body('score').isNumeric().withMessage('Score must be a number'),
    body('comments').optional().trim(),
    body('recommendation').optional().trim()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const submission = await Submission.findById(req.params.submissionId).lean();
      if (!submission) {
        return res.status(404).json({ success: false, message: 'Submission not found' });
      }

      if (!submission.trackId) {
        return res.status(400).json({ success: false, message: 'Submission is not associated with a track' });
      }

      const track = await Track.findById(submission.trackId).lean();
      if (!track) {
        return res.status(400).json({ success: false, message: 'Submission track not found' });
      }

      const reviewerId = req.user.userId;
      const assigned = (submission.assignedReviewers || []).map(String);
      if (assigned.length && !assigned.includes(String(reviewerId))) {
        return res.status(403).json({ success: false, message: 'You are not assigned to review this submission' });
      }

      // Normalize/mapping of recommendation values to avoid enum validation errors
      const rawRec = (req.body.recommendation || '').toString().trim();
      // Try to pick a value that matches the Review schema enum if present.
      const recPath = Review.schema && Review.schema.path && Review.schema.path('recommendation');
      const allowedEnums = (recPath && recPath.enumValues) || [];

      function chooseRecommendation(input) {
        if (!input) return '';
        const key = input.toLowerCase();
        // exact match with allowed enums
        const exact = allowedEnums.find(v => String(v).toLowerCase() === key);
        if (exact) return exact;

        // common synonym heuristics -> prefer enum that contains token
        const synonyms = [
          { re: /\bstrong.*accept\b|\bstrong_accept\b/, token: 'strong' },
          { re: /\bweak.*accept\b|\bweak_accept\b/, token: 'weak' },
          { re: /\baccept(ed)?\b/, token: 'accept' },
          { re: /\breject(ed)?\b/, token: 'reject' },
          { re: /\bborderline\b/, token: 'borderline' }
        ];
        for (const s of synonyms) {
          if (s.re.test(key)) {
            const candidate = allowedEnums.find(v => String(v).toLowerCase().includes(s.token));
            if (candidate) return candidate;
          }
        }

        // last resort: find allowed enum that shares any token
        const parts = key.split(/[\s_\-]/).filter(Boolean);
        for (const a of allowedEnums) {
          const lower = String(a).toLowerCase();
          if (parts.some(p => lower.includes(p))) return a;
        }

        // fallback to raw input (Mongoose will validate and throw if invalid)
        return input;
      }

      const normalizedRec = chooseRecommendation(rawRec);

      // Check if reviewer already has a review for this submission
      const existingReview = await Review.findOne({
        submissionId: submission._id,
        reviewerId
      });

      if (existingReview) {
        // Only allow update if:
        // 1. Previous recommendation was MINOR_REVISION or MAJOR_REVISION
        // 2. Submission was updated AFTER the review was submitted (author actually uploaded revision)
        // 3. Submission status is 'submitted' or 'under_review'
        const reviewSubmittedAt = new Date(existingReview.submittedAt || existingReview.createdAt);
        const submissionUpdatedAt = new Date(submission.lastUpdatedAt || submission.updatedAt || 0);
        const paperWasRevised = submissionUpdatedAt > reviewSubmittedAt;

        const canUpdate =
          (existingReview.recommendation === 'MINOR_REVISION' || existingReview.recommendation === 'MAJOR_REVISION') &&
          paperWasRevised &&
          (submission.status === 'submitted' || submission.status === 'under_review');

        if (!canUpdate) {
          return res.status(400).json({
            success: false,
            message: 'You have already submitted a review for this paper. Updates are only allowed after the author submits a revision.'
          });
        }

        // Update existing review
        // Set status based on new recommendation
        const isNewRevisionVerdict = normalizedRec === 'MINOR_REVISION' || normalizedRec === 'MAJOR_REVISION';

        existingReview.score = req.body.score;
        existingReview.comments = req.body.comments || '';
        existingReview.recommendation = normalizedRec;
        existingReview.confidentialComments = req.body.confidentialComments || existingReview.confidentialComments;
        existingReview.submittedAt = new Date();
        existingReview.status = isNewRevisionVerdict ? 'pending_revision' : 'submitted';

        await existingReview.save();

        return res.json({ success: true, message: 'Review updated successfully', data: existingReview });
      }

      // Create new review
      // Status is 'pending_revision' for revision verdicts (temporary until author revises)
      // Status is 'submitted' for final verdicts (ACCEPT/REJECT)
      const isRevisionVerdict = normalizedRec === 'MINOR_REVISION' || normalizedRec === 'MAJOR_REVISION';
      const reviewStatus = isRevisionVerdict ? 'pending_revision' : 'submitted';

      const review = new Review({
        submissionId: submission._id,
        reviewerId: reviewerId,
        trackId: submission.trackId,
        score: req.body.score,
        comments: req.body.comments || '',
        recommendation: normalizedRec,
        confidentialComments: req.body.confidentialComments || '',
        status: reviewStatus
      });

      await review.save();

      // If recommendation is MINOR_REVISION or MAJOR_REVISION, auto-update submission status to 'revision'
      // This enables the author to see the edit/upload option
      if (isRevisionVerdict) {
        await Submission.findByIdAndUpdate(submission._id, {
          status: 'revision',
          'decision.feedback': req.body.comments || 'Revision requested by reviewer'
        });

        // Send revision request email to author
        const [author, conference, populatedSubmission] = await Promise.all([
          User.findById(submission.authorId).lean(),
          Conference.findById(track.conferenceId).lean(),
          Submission.findById(submission._id).populate('trackId', 'name')
        ]);

        if (author?.email) {
          // Get co-author emails
          const coAuthorEmails = populatedSubmission.coAuthors
            ?.map(ca => ca.email)
            .filter(email => email && email !== author.email)
            .join(', ');
          
          sendEmail(
            author.email,
            templates.revisionRequested(author, populatedSubmission, conference, req.body.comments),
            coAuthorEmails || null
          ).catch(err => console.error('Email error:', err));
        }
      }

      // Check if all assigned reviewers have completed their reviews
      const totalAssignedReviewers = (submission.assignedReviewers || []).length;
      if (totalAssignedReviewers > 0) {
        const completedReviews = await Review.countDocuments({
          submissionId: submission._id,
          status: { $in: ['submitted', 'pending_revision'] }
        });

        // If all reviews are complete, notify organizer
        if (completedReviews >= totalAssignedReviewers) {
          const [conference, organizer, populatedSubmission] = await Promise.all([
            Conference.findById(track.conferenceId).lean(),
            Conference.findById(track.conferenceId).then(c => User.findById(c.organizerId).lean()),
            Submission.findById(submission._id).populate('trackId', 'name')
          ]);

          if (organizer?.email) {
            sendEmail(
              organizer.email,
              templates.allReviewsComplete(organizer, populatedSubmission, conference, completedReviews)
            ).catch(err => console.error('Email error:', err));
          }
        }
      }

      res.status(201).json({ success: true, message: 'Review submitted', data: review });

    } catch (error) {
      console.error('Reviewer create review error:', error);
      res.status(500).json({ success: false, message: 'Error creating review', error: error.message });
    }
  }
);

/**
 * @route   GET /api/reviewer/submissions/:submissionId
 * @desc    Get a submission for review (includes track info)
 * @access  Private (Reviewer)
 */
router.get('/submissions/:submissionId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId)
      .populate('conferenceId', 'name')
      .populate('trackId', 'name description')
      .populate('authorId', 'name email')
      .lean();

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    res.json({ success: true, data: submission });
  } catch (error) {
    console.error('Reviewer get submission error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submission', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/reviews
 * @desc    List reviews by current reviewer (optional ?trackId=&?submissionId=)
 * @access  Private (Reviewer)
 */
router.get('/reviews', async (req, res) => {
  try {
    const query = { reviewerId: req.user.userId };
    if (req.query.trackId) query.trackId = req.query.trackId;
    if (req.query.submissionId) query.submissionId = req.query.submissionId;

    // By default, only show 'submitted' reviews (not pending_revision)
    // Unless ?includePending=true is passed
    if (req.query.includePending !== 'true') {
      query.status = 'submitted';
    }

    const reviews = await Review.find(query)
      .populate({
        path: 'submissionId',
        select: 'title conferenceId trackId status'
      })
      .populate('trackId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Reviewer list reviews error:', error);
    res.status(500).json({ success: false, message: 'Error fetching reviews', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/submissions/:submissionId/reviews
 * @desc    List reviews for a submission (optional ?trackId= to filter by track)
 * @access  Private (Reviewer)
 */
router.get('/submissions/:submissionId/reviews', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    // If a trackId filter is provided, ensure it matches the submission
    if (req.query.trackId && String(submission.trackId) !== String(req.query.trackId)) {
      return res.status(400).json({ success: false, message: 'Track filter does not match submission track' });
    }

    const query = { submissionId: submission._id };
    if (req.query.trackId) query.trackId = req.query.trackId;

    const reviews = await Review.find(query)
      .populate('reviewerId', 'name email')
      .populate('trackId', 'name')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Reviewer list submission reviews error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submission reviews', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/submissions/:submissionId/my-review
 * @desc    Get the current reviewer's review for a specific submission (if exists)
 * @access  Private (Reviewer)
 */
router.get('/submissions/:submissionId/my-review', async (req, res) => {
  try {
    const reviewerId = req.user.userId;
    const submissionId = req.params.submissionId;

    const submission = await Submission.findById(submissionId).lean();
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    const review = await Review.findOne({
      submissionId,
      reviewerId
    })
      .populate('trackId', 'name')
      .lean();

    // If no review exists, return empty but with submission status info
    if (!review) {
      return res.json({
        success: true,
        data: {
          hasReview: false,
          submissionStatus: submission.status,
          canReview: submission.status === 'under_review' || submission.status === 'submitted'
        }
      });
    }

    // Determine if reviewer can update their review
    // Can update only if:
    // 1. Gave revision verdict (MINOR_REVISION or MAJOR_REVISION)
    // 2. Submission was updated AFTER the review was submitted (author actually uploaded revision)
    // 3. Submission status is back to 'submitted' or 'under_review' (not still 'revision')
    const reviewSubmittedAt = new Date(review.submittedAt || review.createdAt);
    const submissionUpdatedAt = new Date(submission.lastUpdatedAt || submission.updatedAt || 0);
    const paperWasRevised = submissionUpdatedAt > reviewSubmittedAt;

    const canUpdate =
      (review.recommendation === 'MINOR_REVISION' || review.recommendation === 'MAJOR_REVISION') &&
      paperWasRevised &&
      (submission.status === 'submitted' || submission.status === 'under_review');

    res.json({
      success: true,
      data: {
        hasReview: true,
        review,
        submissionStatus: submission.status,
        canUpdate,
        isFinalVerdict: review.recommendation === 'ACCEPT' || review.recommendation === 'REJECT',
        paperWasRevised  // helpful for debugging
      }
    });
  } catch (error) {
    console.error('Reviewer get my review error:', error);
    res.status(500).json({ success: false, message: 'Error fetching review', error: error.message });
  }
});

/**
 * @route   DELETE /api/reviewer/bids/:id
 * @desc    Withdraw a bid (sets status to WITHDRAWN)
 * @access  Private (Reviewer)
 */
router.delete('/bids/:id', async (req, res) => {
  try {
    const bid = await Bid.findOne({
      _id: req.params.id,
      reviewerId: req.user.userId
    });

    if (!bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    // Can only withdraw PENDING bids
    if (bid.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        message: `Cannot withdraw bid with status ${bid.status}. Only PENDING bids can be withdrawn.`
      });
    }

    bid.status = 'WITHDRAWN';
    await bid.save();

    res.json({ success: true, message: 'Bid withdrawn successfully', data: bid });
  } catch (error) {
    console.error('Withdraw bid error:', error);
    res.status(500).json({ success: false, message: 'Error withdrawing bid', error: error.message });
  }
});

/**
 * @route   GET /api/reviewer/assignments
 * @desc    Get current reviewer's assignments
 * @access  Private (Reviewer)
 */
router.get('/assignments', async (req, res) => {
  try {
    const Assignment = require('../models/Assignment');

    const query = {
      reviewerId: req.user.userId,
      status: 'ACTIVE'
    };

    const assignments = await Assignment.find(query)
      .populate({
        path: 'submissionId',
        select: 'title abstract conferenceId trackId fileUrl status'
      })
      .populate('trackId', 'name')
      .populate('conferenceId', 'name submissionDeadline')
      .sort({ assignedAt: -1 })
      .lean();

    res.json({ success: true, data: assignments });
  } catch (error) {
    console.error('Get reviewer assignments error:', error);
    res.status(500).json({ success: false, message: 'Error fetching assignments', error: error.message });
  }
});


module.exports = router;

