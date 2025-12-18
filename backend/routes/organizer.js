const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Conference = require('../models/Conference');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const Certificate = require('../models/Certificate');
const Registration = require('../models/Registration');

// All organizer routes require authentication and organizer role
router.use(auth, authorize('organizer'));

/**
 * @route   GET /api/organizer/conferences
 * @desc    Get all conferences created by organizer
 * @access  Private (Organizer)
 */
router.get('/conferences', async (req, res) => {
  try {
    const conferences = await Conference.find({ organizerId: req.user.userId })
      .sort({ createdAt: -1 });

    // Get submission counts for each conference
    const conferencesWithStats = await Promise.all(
      conferences.map(async (conf) => {
        const submissionCount = await Submission.countDocuments({ conferenceId: conf._id });
        const acceptedCount = await Submission.countDocuments({ 
          conferenceId: conf._id, 
          status: 'accepted' 
        });
        const pendingCount = await Submission.countDocuments({ 
          conferenceId: conf._id, 
          status: 'under_review' 
        });

        return {
          ...conf.toObject(),
          stats: {
            submissions: submissionCount,
            accepted: acceptedCount,
            pending: pendingCount
          }
        };
      })
    );

    res.json({
      success: true,
      data: { conferences: conferencesWithStats }
    });

  } catch (error) {
    console.error('Get conferences error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conferences',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/organizer/conferences/:id
 * @desc    Get a single conference
 * @access  Private (Organizer)
 */
router.get('/conferences/:id', async (req, res) => {
  try {
    const conference = await Conference.findOne({
      _id: req.params.id,
      organizerId: req.user.userId
    }).populate('organizerId', 'name email');

    if (!conference) {
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    // Get submission stats
    const submissions = await Submission.find({ conferenceId: req.params.id });
    const acceptedCount = submissions.filter(s => s.status === 'accepted').length;
    const rejectedCount = submissions.filter(s => s.status === 'rejected').length;

    res.json({
      success: true,
      data: {
        ...conference.toObject(),
        submissions: submissions,
        stats: {
          total: submissions.length,
          accepted: acceptedCount,
          rejected: rejectedCount
        }
      }
    });

  } catch (error) {
    console.error('Get conference error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching conference',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/organizer/conferences
 * @desc    Create a new conference
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
  body('fee').optional().isNumeric().withMessage('Fee must be a number')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const conference = new Conference({
      ...req.body,
      organizerId: req.user.userId
    });

    await conference.save();

    res.status(201).json({
      success: true,
      message: 'Conference created successfully',
      data: { conference }
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
 * @desc    Update conference
 * @access  Private (Organizer)
 */
router.put('/conferences/:id', async (req, res) => {
  try {
    const conference = await Conference.findOne({
      _id: req.params.id,
      organizerId: req.user.userId
    });

    if (!conference) {
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    Object.assign(conference, req.body);
    await conference.save();

    res.json({
      success: true,
      message: 'Conference updated successfully',
      data: { conference }
    });

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
 * @desc    Get all submissions for a conference
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
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    const submissions = await Submission.find({ conferenceId: req.params.id })
      .populate('authorId', 'name email')
      .populate('assignedReviewers', 'name email')
      .populate('decision.decidedBy', 'name')
      .sort({ submittedAt: -1 });

    // Get detailed review stats for each submission
    const submissionsWithReviews = await Promise.all(
      submissions.map(async (submission) => {
        const reviews = await Review.find({ submissionId: submission._id, status: 'submitted' })
          .populate('reviewerId', 'name email')
          .sort({ submittedAt: -1 });
        
        // Calculate majority voting for final decision
        let majorityDecision = null;
        let decisionReason = '';
        let voteBreakdown = {
          accept: 0,
          reject: 0,
          minorRevision: 0,
          majorRevision: 0
        };

        if (reviews.length > 0) {
          // Count votes
          reviews.forEach(review => {
            if (review.recommendation === 'ACCEPT') {
              voteBreakdown.accept++;
            } else if (review.recommendation === 'REJECT') {
              voteBreakdown.reject++;
            } else if (review.recommendation === 'MINOR_REVISION') {
              voteBreakdown.minorRevision++;
            } else if (review.recommendation === 'MAJOR_REVISION') {
              voteBreakdown.majorRevision++;
            }
          });

          // Calculate average score
          const avgScore = reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length;

          // Majority voting logic
          const totalReviews = reviews.length;
          const requiredReviews = submission.requiredReviews || 3;
          
          // Only calculate final decision if all required reviews are completed
          if (totalReviews >= requiredReviews) {
            // Simple majority: Accept wins if more than 50% vote accept
            const acceptPercentage = (voteBreakdown.accept / totalReviews) * 100;
            const rejectPercentage = (voteBreakdown.reject / totalReviews) * 100;

            if (voteBreakdown.accept > totalReviews / 2) {
              majorityDecision = 'ACCEPTED';
              decisionReason = `Majority voting: ${voteBreakdown.accept} out of ${totalReviews} reviewers recommend acceptance (${acceptPercentage.toFixed(0)}%)`;
            } else if (voteBreakdown.reject >= totalReviews / 2) {
              majorityDecision = 'REJECTED';
              // Collect rejection reasons from comments
              const rejectionReasons = reviews
                .filter(r => r.recommendation === 'REJECT')
                .map(r => `• ${r.reviewerId.name}: ${r.comments.substring(0, 200)}${r.comments.length > 200 ? '...' : ''}`)
                .join('\n');
              decisionReason = `Majority voting: ${voteBreakdown.reject} out of ${totalReviews} reviewers recommend rejection (${rejectPercentage.toFixed(0)}%)\n\nKey concerns:\n${rejectionReasons}`;
            } else {
              // No clear majority
              majorityDecision = 'NEEDS_REVISION';
              decisionReason = `Mixed reviews: Accept(${voteBreakdown.accept}), Reject(${voteBreakdown.reject}), Minor Revision(${voteBreakdown.minorRevision}), Major Revision(${voteBreakdown.majorRevision}). Revisions recommended.`;
            }
          }
        }

        return {
          ...submission.toObject(),
          reviews: reviews.map(r => ({
            _id: r._id,
            reviewer: {
              _id: r.reviewerId._id,
              name: r.reviewerId.name,
              email: r.reviewerId.email
            },
            score: r.score,
            recommendation: r.recommendation,
            comments: r.comments,
            confidentialComments: r.confidentialComments,
            submittedAt: r.submittedAt
          })),
          progress: `${submission.reviewCount || 0} / ${submission.requiredReviews || 3} reviews completed`,
          reviewProgress: {
            completed: submission.reviewCount || 0,
            required: submission.requiredReviews || 3,
            percentage: Math.round(((submission.reviewCount || 0) / (submission.requiredReviews || 3)) * 100)
          },
          voteBreakdown,
          majorityDecision,
          decisionReason,
          averageScore: reviews.length > 0 ? (reviews.reduce((sum, r) => sum + r.score, 0) / reviews.length).toFixed(1) : null
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
  body('decision').isIn(['accepted', 'rejected']).withMessage('Decision must be accepted or rejected'),
  body('feedback').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { decision, feedback } = req.body;
    const submission = await Submission.findById(req.params.submissionId)
      .populate('conferenceId');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify conference ownership
    if (submission.conferenceId.organizerId.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to make decisions for this submission'
      });
    }

    // Update submission decision
    submission.status = decision;
    submission.decision = {
      decidedBy: req.user.userId,
      decidedAt: Date.now(),
      feedback: feedback || ''
    };
    submission.lastUpdatedAt = Date.now();

    await submission.save();

    res.json({
      success: true,
      message: `Submission ${decision} successfully`,
      data: submission
    });

  } catch (error) {
    console.error('Update decision error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating decision',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/approve
 * @desc    Approve a submission for review
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/approve', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('conferenceId');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify conference ownership
    if (submission.conferenceId.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    submission.organizerApproved = true;
    submission.approvedAt = Date.now();
    submission.lastUpdatedAt = Date.now();
    await submission.save();

    res.json({
      success: true,
      message: 'Submission approved successfully',
      data: { submission }
    });

  } catch (error) {
    console.error('Approve submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Error approving submission',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/status
 * @desc    Accept or reject a submission (legacy endpoint)
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/status', [
  body('status').isIn(['accepted', 'rejected']).withMessage('Status must be accepted or rejected'),
  body('feedback').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { status, feedback } = req.body;
    const submission = await Submission.findById(req.params.id)
      .populate('conferenceId');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify conference ownership
    if (submission.conferenceId.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    submission.status = status;
    submission.decision = {
      decidedBy: req.user.userId,
      decidedAt: Date.now(),
      feedback: feedback || ''
    };
    submission.lastUpdatedAt = Date.now();
    await submission.save();

    res.json({
      success: true,
      message: `Submission ${req.body.status} successfully`,
      data: { submission }
    });

  } catch (error) {
    console.error('Update submission status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating submission status',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/organizer/submissions/:id/schedule
 * @desc    Assign presentation slot to submission
 * @access  Private (Organizer)
 */
router.put('/submissions/:id/schedule', [
  body('date').isISO8601().withMessage('Valid date is required'),
  body('startTime').notEmpty().withMessage('Start time is required'),
  body('endTime').notEmpty().withMessage('End time is required'),
  body('venue').notEmpty().withMessage('Venue is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const submission = await Submission.findById(req.params.id)
      .populate('conferenceId');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Verify conference ownership
    if (submission.conferenceId.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    submission.presentationSlot = req.body;
    await submission.save();

    res.json({
      success: true,
      message: 'Presentation slot assigned successfully',
      data: { submission }
    });

  } catch (error) {
    console.error('Schedule submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Error scheduling submission',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/organizer/conferences/:id/certificates
 * @desc    Generate certificates for conference participants
 * @access  Private (Organizer)
 */
router.post('/conferences/:id/certificates', async (req, res) => {
  try {
    // Verify conference ownership
    const conference = await Conference.findOne({
      _id: req.params.id,
      organizerId: req.user.userId
    });

    if (!conference) {
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    // Get all registrations
    const registrations = await Registration.find({ 
      conferenceId: req.params.id,
      attendanceMarked: true
    });

    // Get accepted submissions
    const acceptedSubmissions = await Submission.find({
      conferenceId: req.params.id,
      status: 'accepted'
    });

    const certificates = [];

    // Create participation certificates
    for (const reg of registrations) {
      const existing = await Certificate.findOne({
        userId: reg.participantId,
        conferenceId: req.params.id,
        type: 'participation'
      });

      if (!existing) {
        const cert = await Certificate.create({
          userId: reg.participantId,
          conferenceId: req.params.id,
          type: 'participation',
          fileUrl: `/certificates/${conference.name}-participation-${reg.participantId}.pdf`
        });
        certificates.push(cert);
      }
    }

    // Create presentation certificates
    for (const submission of acceptedSubmissions) {
      const existing = await Certificate.findOne({
        userId: submission.authorId,
        conferenceId: req.params.id,
        type: 'presentation'
      });

      if (!existing) {
        const cert = await Certificate.create({
          userId: submission.authorId,
          conferenceId: req.params.id,
          type: 'presentation',
          fileUrl: `/certificates/${conference.name}-presentation-${submission.authorId}.pdf`
        });
        certificates.push(cert);
      }
    }

    res.json({
      success: true,
      message: `${certificates.length} certificates generated successfully`,
      data: { certificates }
    });

  } catch (error) {
    console.error('Generate certificates error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating certificates',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/organizer/registrations/:id/attendance
 * @desc    Mark attendance for a participant
 * @access  Private (Organizer)
 */
router.put('/registrations/:id/attendance', async (req, res) => {
  try {
    const registration = await Registration.findById(req.params.id)
      .populate('conferenceId');

    if (!registration) {
      return res.status(404).json({
        success: false,
        message: 'Registration not found'
      });
    }

    // Verify conference ownership
    if (registration.conferenceId.organizerId.toString() !== req.user.userId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    registration.attendanceMarked = true;
    await registration.save();

    res.json({
      success: true,
      message: 'Attendance marked successfully',
      data: { registration }
    });

  } catch (error) {
    console.error('Mark attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking attendance',
      error: error.message
    });
  }
});

module.exports = router;
