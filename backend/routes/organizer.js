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
    res.status(500).json({ success: false, message: 'Error fetching conferences', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching conference', error: error.message });
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
      error: error.message
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
    const updatable = ['name', 'description', 'venue', 'startDate', 'endDate', 'submissionDeadline', 'domains', 'fee', 'status'];
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
      error: error.message
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
      error: error.message
    });
  }
});

/**
 * @route   PATCH /api/organizer/submission/:submissionId/decision
 * @desc    Make a final decision on a submission (accept/reject)
 * @access  Private (Organizer)
 */
router.patch('/submission/:submissionId/decision', [
  body('decision').isIn(['accepted', 'rejected', 'revision', 'under_review']).withMessage('Decision must be accepted, rejected, revision, or under_review'),
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

    // Update submission
    const update = {
      status: req.body.decision,
      'decision.decidedBy': req.user.userId,
      'decision.decidedAt': new Date(),
      'decision.feedback': req.body.feedback || ''
    };

    const updated = await Submission.findByIdAndUpdate(req.params.submissionId, update, { new: true })
      .populate('authorId', 'name email')
      .populate('trackId', 'name');

    // Send emails based on decision
    const decision = req.body.decision;
    
    if (decision === 'accepted' || decision === 'rejected') {
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
    res.status(500).json({ success: false, message: 'Error recording decision', error: error.message });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/approve
 * @desc    Approve a submission for review (organizer-level approval)
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

    res.json({ success: true, message: 'Submission approved', data: submission });

  } catch (error) {
    console.error('Approve submission error:', error);
    res.status(500).json({ success: false, message: 'Error approving submission', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error updating submission status', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error scheduling submission', error: error.message });
  }
});

/**
 * @route   POST /api/organizer/conferences/:id/certificates
 * @desc    Generate certificates for conference participants and accepted presenters
 * @access  Private (Organizer)
 */
router.post('/conferences/:id/certificates', async (req, res) => {
  try {
    const conference = await Conference.findOne({ _id: req.params.id, organizerId: req.user.userId });
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // gather tracks
    const tracks = await Track.find({ conferenceId: conference._id }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);

    // 1) Accepted submissions -> presenter certificates
    const acceptedSubmissions = await Submission.find({ trackId: { $in: trackIds }, status: 'accepted' }).populate('authorId', 'name email').lean();

    const created = [];
    for (const sub of acceptedSubmissions) {
      const existing = await Certificate.findOne({ userId: sub.authorId._id, conferenceId: conference._id, type: 'presentation' }).lean();
      if (!existing) {
        const cert = await Certificate.create({
          userId: sub.authorId._id,
          conferenceId: conference._id,
          type: 'presentation',
          meta: { submissionId: sub._id, trackId: sub.trackId },
          issuedAt: new Date()
        });
        created.push(cert);
      }
    }

    // 2) Participants with attendance -> participation certificates
    const registrations = await Registration.find({ conferenceId: conference._id, attended: true }).populate('userId', 'name email').lean();
    for (const reg of registrations) {
      const existing = await Certificate.findOne({ userId: reg.userId._id, conferenceId: conference._id, type: 'participation' }).lean();
      if (!existing) {
        const cert = await Certificate.create({
          userId: reg.userId._id,
          conferenceId: conference._id,
          type: 'participation',
          meta: { registrationId: reg._id },
          issuedAt: new Date()
        });
        created.push(cert);
      }
    }

    res.json({ success: true, message: 'Certificates generated', data: { createdCount: created.length, created } });

  } catch (error) {
    console.error('Generate certificates error:', error);
    res.status(500).json({ success: false, message: 'Error generating certificates', error: error.message });
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

    registration.attended = !!req.body.attended;
    registration.attendedAt = registration.attended ? new Date() : undefined;
    await registration.save();

    res.json({ success: true, message: 'Attendance updated', data: registration });

  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({ success: false, message: 'Error updating attendance', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching participants', error: error.message });
  }
});

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
    res.status(500).json({ success: false, message: 'Error fetching reviews', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching conference reviews', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching submission reviews', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching bids', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching conference bids', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error updating bid', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error updating bids', error: error.message });
  }
});

// ============ ASSIGNMENT MANAGEMENT ROUTES ============

const Assignment = require('../models/Assignment');

/**
 * Scoring function for reviewer-paper matching
 * Returns score 0-100
 */
function computeMatchScore(bid, reviewer, submission, conference) {
  let score = 0;

  // BID_PREFERENCE (50% weight)
  if (bid && bid.status === 'APPROVED') {
    score += 50;
  } else if (!bid) {
    // No bid - medium score
    score += 25;
  }
  // REJECTED/WITHDRAWN bids should not reach here

  // EXPERTISE_MATCH (30% weight)
  const reviewerDomains = (reviewer.expertiseDomains || []).map(d => d.toLowerCase());
  const conferenceDomains = (conference.domains || []).map(d => d.toLowerCase());

  if (reviewerDomains.length > 0 && conferenceDomains.length > 0) {
    const matchCount = reviewerDomains.filter(rd =>
      conferenceDomains.some(cd => cd.includes(rd) || rd.includes(cd))
    ).length;
    const expertiseScore = (matchCount / Math.max(reviewerDomains.length, conferenceDomains.length)) * 30;
    score += expertiseScore;
  }

  // CONFIDENCE_SCORE (20% weight)
  if (bid && bid.confidence) {
    score += (bid.confidence / 10) * 20;
  }

  return Math.round(score);
}

/**
 * Check for conflicts between reviewer and submission
 */
function hasConflict(reviewer, submission, author) {
  // Same person
  if (reviewer._id.toString() === author._id.toString()) {
    return true;
  }

  // Same institution (by affiliation)
  if (reviewer.affiliation && author.affiliation) {
    const revAff = reviewer.affiliation.toLowerCase();
    const authAff = author.affiliation.toLowerCase();
    if (revAff === authAff || revAff.includes(authAff) || authAff.includes(revAff)) {
      return true;
    }
  }

  // Same email domain (potential co-affiliation)
  if (reviewer.email && author.email) {
    const revDomain = reviewer.email.split('@')[1];
    const authDomain = author.email.split('@')[1];
    // Only check for institutional domains, not public email providers
    const publicDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com'];
    if (!publicDomains.includes(revDomain) && revDomain === authDomain) {
      return true;
    }
  }

  return false;
}

/**
 * @route   POST /api/organizer/conferences/:id/auto-assign
 * @desc    Run automated reviewer assignment algorithm
 * @access  Private (Organizer)
 */
router.post('/conferences/:id/auto-assign', [
  body('reviewersPerPaper').optional().isInt({ min: 1, max: 10 }).withMessage('reviewersPerPaper must be 1-10'),
  body('maxPapersPerReviewer').optional().isInt({ min: 1, max: 50 }).withMessage('maxPapersPerReviewer must be 1-50'),
  body('clearExisting').optional().isBoolean()
], async (req, res) => {
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
      clearExisting = false
    } = req.body;

    // Verify conference ownership
    const conference = await Conference.findOne({ _id: conferenceId, organizerId }).lean();
    if (!conference) {
      return res.status(404).json({ success: false, message: 'Conference not found' });
    }

    // Get all tracks
    const tracks = await Track.find({ conferenceId }).select('_id').lean();
    const trackIds = tracks.map(t => t._id);

    // Get all submissions for this conference
    const submissions = await Submission.find({ trackId: { $in: trackIds } })
      .populate('authorId', 'name email affiliation')
      .lean();

    if (submissions.length === 0) {
      return res.json({ success: true, message: 'No submissions to assign', data: { assigned: 0 } });
    }

    // Get all approved bids
    const approvedBids = await Bid.find({
      trackId: { $in: trackIds },
      status: 'APPROVED'
    }).lean();

    // Create bid lookup map
    const bidMap = {};
    for (const bid of approvedBids) {
      const key = `${bid.reviewerId.toString()}_${bid.submissionId.toString()}`;
      bidMap[key] = bid;
    }

    // Get all reviewers (users with reviewer role)
    const reviewers = await User.find({ role: 'reviewer' }).lean();

    if (reviewers.length === 0) {
      return res.status(400).json({ success: false, message: 'No reviewers available' });
    }

    // Clear existing non-locked assignments if requested
    if (clearExisting) {
      await Assignment.deleteMany({
        conferenceId,
        locked: false,
        status: 'ACTIVE'
      });
    }

    // Get existing assignments
    const existingAssignments = await Assignment.find({
      conferenceId,
      status: 'ACTIVE'
    }).lean();

    // Track current assignments
    const paperAssignments = {}; // submissionId -> count
    const reviewerLoad = {}; // reviewerId -> count

    for (const existing of existingAssignments) {
      const subId = existing.submissionId.toString();
      const revId = existing.reviewerId.toString();
      paperAssignments[subId] = (paperAssignments[subId] || 0) + 1;
      reviewerLoad[revId] = (reviewerLoad[revId] || 0) + 1;
    }

    // Build all possible (reviewer, paper) pairs with scores
    const candidates = [];

    for (const submission of submissions) {
      const subId = submission._id.toString();

      // Skip if already has enough reviewers
      if ((paperAssignments[subId] || 0) >= reviewersPerPaper) {
        continue;
      }

      for (const reviewer of reviewers) {
        const revId = reviewer._id.toString();

        // Skip if already assigned
        const existingAssignment = existingAssignments.find(
          a => a.reviewerId.toString() === revId && a.submissionId.toString() === subId
        );
        if (existingAssignment) continue;

        // Skip if reviewer at max load
        if ((reviewerLoad[revId] || 0) >= maxPapersPerReviewer) continue;

        // Check conflicts
        if (hasConflict(reviewer, submission, submission.authorId)) continue;

        // Get bid if exists
        const bidKey = `${revId}_${subId}`;
        const bid = bidMap[bidKey];

        // IMPORTANT: Only assign reviewers who have an APPROVED bid for this paper
        // Skip if no bid exists or bid is not APPROVED
        if (!bid || bid.status !== 'APPROVED') continue;

        // Compute score
        const matchScore = computeMatchScore(bid, reviewer, submission, conference);

        candidates.push({
          reviewerId: reviewer._id,
          submissionId: submission._id,
          trackId: submission.trackId,
          bidId: bid._id,
          matchScore,
          reviewer,
          submission
        });
      }
    }

    // Sort by score descending
    candidates.sort((a, b) => b.matchScore - a.matchScore);

    // Greedy assignment
    const newAssignments = [];

    for (const candidate of candidates) {
      const subId = candidate.submissionId.toString();
      const revId = candidate.reviewerId.toString();

      // Check constraints again (may have changed during assignment)
      if ((paperAssignments[subId] || 0) >= reviewersPerPaper) continue;
      if ((reviewerLoad[revId] || 0) >= maxPapersPerReviewer) continue;

      // Create assignment
      const assignment = new Assignment({
        reviewerId: candidate.reviewerId,
        submissionId: candidate.submissionId,
        trackId: candidate.trackId,
        conferenceId: conference._id,
        bidId: candidate.bidId,
        source: 'AUTO',
        matchScore: candidate.matchScore,
        assignedAt: new Date()
      });

      newAssignments.push(assignment);
      paperAssignments[subId] = (paperAssignments[subId] || 0) + 1;
      reviewerLoad[revId] = (reviewerLoad[revId] || 0) + 1;
    }

    // Bulk insert assignments
    if (newAssignments.length > 0) {
      await Assignment.insertMany(newAssignments);
    }

    // Calculate stats
    const papersFullyAssigned = Object.values(paperAssignments)
      .filter(count => count >= reviewersPerPaper).length;

    const papersUnderAssigned = submissions.length - papersFullyAssigned;

    res.json({
      success: true,
      message: `Auto-assignment completed`,
      data: {
        assigned: newAssignments.length,
        totalSubmissions: submissions.length,
        papersFullyAssigned,
        papersUnderAssigned,
        reviewersUsed: Object.keys(reviewerLoad).length,
        config: { reviewersPerPaper, maxPapersPerReviewer }
      }
    });

  } catch (error) {
    console.error('Auto-assign error:', error);
    res.status(500).json({ success: false, message: 'Error running auto-assignment', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error fetching assignments', error: error.message });
  }
});

/**
 * @route   POST /api/organizer/assignments
 * @desc    Create a manual assignment
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

    // Check if reviewer exists
    const reviewer = await User.findById(reviewerId).lean();
    if (!reviewer || reviewer.role !== 'reviewer') {
      return res.status(400).json({ success: false, message: 'Invalid reviewer' });
    }

    // Check for existing assignment
    const existing = await Assignment.findOne({ reviewerId, submissionId, status: 'ACTIVE' }).lean();
    if (existing) {
      return res.status(400).json({ success: false, message: 'Assignment already exists' });
    }

    // Check for conflicts
    const author = await User.findById(submission.authorId).lean();
    if (hasConflict(reviewer, submission, author)) {
      return res.status(400).json({ success: false, message: 'Conflict detected between reviewer and submission' });
    }

    // Find any approved bid
    const bid = await Bid.findOne({
      reviewerId,
      submissionId,
      status: 'APPROVED'
    }).lean();

    const assignment = new Assignment({
      reviewerId,
      submissionId,
      trackId: submission.trackId,
      conferenceId: conference._id,
      bidId: bid ? bid._id : null,
      source: 'MANUAL',
      matchScore: bid ? computeMatchScore(bid, reviewer, submission, conference) : 25,
      assignedBy: organizerId,
      assignedAt: new Date(),
      notes
    });

    await assignment.save();

    const populated = await Assignment.findById(assignment._id)
      .populate({ path: 'reviewerId', select: 'name email' })
      .populate({ path: 'submissionId', select: 'title' });

    res.status(201).json({ success: true, message: 'Assignment created', data: populated });
  } catch (error) {
    console.error('Create assignment error:', error);
    res.status(500).json({ success: false, message: 'Error creating assignment', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error updating assignment', error: error.message });
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
    res.status(500).json({ success: false, message: 'Error deleting assignment', error: error.message });
  }
});

module.exports = router;
