const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const { upload, setUploadType } = require('../middleware/upload');
const Conference = require('../models/Conference');
const Submission = require('../models/Submission');
const Review = require('../models/Review');

// All author routes require authentication and author role
router.use(auth, authorize('author'));

/**
 * @route   GET /api/author/dashboard
 * @desc    Get author dashboard data
 * @access  Private (Author)
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get author's submissions
    const submissions = await Submission.find({ authorId: req.user.userId })
      .populate('conferenceId', 'name venue startDate endDate')
      .sort({ createdAt: -1 })
      .limit(10);

    // Get active conferences (from all organizers)
    const activeConferences = await Conference.find({
      status: 'active',
      submissionDeadline: { $gte: new Date() }
    })
      .populate('organizerId', 'name email')
      .sort({ submissionDeadline: 1 })
      .limit(6);

    res.json({
      success: true,
      data: {
        submissions,
        activeConferences
      }
    });

  } catch (error) {
    console.error('Get author dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/author/conferences
 * @desc    Discover conferences with filters
 * @access  Private (Author)
 */
router.get('/conferences', async (req, res) => {
  try {
    const { location, domain, minFee, maxFee, sortBy } = req.query;

    // Build query
    const query = { status: 'active' };

    if (location) {
      query.venue = { $regex: location, $options: 'i' };
    }

    if (domain) {
      query.domains = { $in: [domain] };
    }

    if (minFee || maxFee) {
      query.fee = {};
      if (minFee) query.fee.$gte = Number(minFee);
      if (maxFee) query.fee.$lte = Number(maxFee);
    }

    // Build sort
    let sort = {};
    switch (sortBy) {
      case 'newest':
        sort = { createdAt: -1 };
        break;
      case 'deadline':
        sort = { submissionDeadline: 1 };
        break;
      case 'startDate':
        sort = { startDate: 1 };
        break;
      default:
        sort = { submissionDeadline: 1 };
    }

    const conferences = await Conference.find(query)
      .populate('organizerId', 'name')
      .sort(sort);

    res.json({
      success: true,
      data: { conferences }
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
 * @route   GET /api/author/conferences/:id
 * @desc    Get conference details
 * @access  Private (Author)
 */
router.get('/conferences/:id', async (req, res) => {
  try {
    const conference = await Conference.findById(req.params.id)
      .populate('organizerId', 'name email');

    if (!conference) {
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    // Check if author has already submitted
    const existingSubmission = await Submission.findOne({
      conferenceId: req.params.id,
      authorId: req.user.userId
    });

    res.json({
      success: true,
      data: {
        conference,
        hasSubmitted: !!existingSubmission,
        submission: existingSubmission
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
 * @route   POST /api/author/submissions
 * @desc    Submit a paper to a conference
 * @access  Private (Author)
 */
router.post('/submissions', 
  setUploadType('submissions'),
  upload.single('paper'),
  [
    body('conferenceId').notEmpty().withMessage('Conference ID is required'),
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('abstract').trim().notEmpty().withMessage('Abstract is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array()
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Paper file is required'
        });
      }

      const { conferenceId, title, abstract } = req.body;

      // Check if conference exists and is active
      const conference = await Conference.findById(conferenceId);
      if (!conference) {
        return res.status(404).json({
          success: false,
          message: 'Conference not found'
        });
      }

      if (conference.status !== 'active') {
        return res.status(400).json({
          success: false,
          message: 'Conference is not accepting submissions'
        });
      }

      if (new Date() > conference.submissionDeadline) {
        return res.status(400).json({
          success: false,
          message: 'Submission deadline has passed'
        });
      }

      // Check for duplicate submission
      const existingSubmission = await Submission.findOne({
        conferenceId,
        authorId: req.user.userId
      });

      if (existingSubmission) {
        return res.status(400).json({
          success: false,
          message: 'You have already submitted to this conference'
        });
      }

      // Create submission
      const submission = new Submission({
        conferenceId,
        authorId: req.user.userId,
        title,
        abstract,
        fileUrl: `/uploads/submissions/${req.file.filename}`,
        status: 'submitted',
        submittedAt: Date.now(),
        lastUpdatedAt: Date.now(),
        reviewCount: 0,
        requiredReviews: 3,
        assignedReviewers: [],
        precheck: {
          format: true,
          plagiarismScore: 0 // TODO: Integrate plagiarism API
        }
      });

      await submission.save();

      res.status(201).json({
        success: true,
        message: 'Paper submitted successfully',
        data: { submission }
      });

    } catch (error) {
      console.error('Submit paper error:', error);
      res.status(500).json({
        success: false,
        message: 'Error submitting paper',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/author/submissions
 * @desc    Get all submissions by author
 * @access  Private (Author)
 */
router.get('/submissions', async (req, res) => {
  try {
    const submissions = await Submission.find({ authorId: req.user.userId })
      .populate('conferenceId', 'name venue startDate endDate')
      .populate('assignedReviewers', 'name')
      .populate('decision.decidedBy', 'name')
      .sort({ createdAt: -1 });

    // Add review progress and majority decision to each submission
    const submissionsWithProgress = await Promise.all(submissions.map(async (sub) => {
      const subObj = sub.toObject();
      
      // Calculate majority decision if reviews are complete
      let majorityDecision = null;
      if (sub.reviewCount === sub.requiredReviews && sub.reviewCount > 0) {
        const Review = require('../models/Review');
        const reviews = await Review.find({ submissionId: sub._id, status: 'submitted' });
        
        if (reviews.length > 0) {
          const voteBreakdown = {
            accept: 0,
            reject: 0,
            minorRevision: 0,
            majorRevision: 0
          };

          reviews.forEach(review => {
            switch (review.recommendation) {
              case 'ACCEPT': voteBreakdown.accept++; break;
              case 'REJECT': voteBreakdown.reject++; break;
              case 'MINOR_REVISION': voteBreakdown.minorRevision++; break;
              case 'MAJOR_REVISION': voteBreakdown.majorRevision++; break;
            }
          });

          const totalVotes = reviews.length;
          const acceptPercentage = (voteBreakdown.accept / totalVotes) * 100;
          const rejectPercentage = (voteBreakdown.reject / totalVotes) * 100;

          if (acceptPercentage > 50) {
            majorityDecision = 'ACCEPTED';
          } else if (rejectPercentage >= 50) {
            majorityDecision = 'REJECTED';
          } else {
            majorityDecision = 'NEEDS_REVISION';
          }
        }
      }

      return {
        ...subObj,
        majorityDecision,
        progress: `${sub.reviewCount || 0} / ${sub.requiredReviews || 3} reviews completed`,
        reviewProgress: {
          completed: sub.reviewCount || 0,
          required: sub.requiredReviews || 3,
          percentage: Math.round(((sub.reviewCount || 0) / (sub.requiredReviews || 3)) * 100)
        }
      };
    }));

    res.json({
      success: true,
      data: submissionsWithProgress
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
 * @route   GET /api/author/submissions/:id
 * @desc    Get submission details with reviews and majority voting
 * @access  Private (Author)
 */
router.get('/submissions/:id', async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      authorId: req.user.userId
    })
    .populate('conferenceId', 'name venue startDate endDate')
    .populate('assignedReviewers', 'name email')
    .populate('decision.decidedBy', 'name');

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    // Get reviews (exclude confidential comments for author)
    const reviews = await Review.find({ submissionId: req.params.id, status: 'submitted' })
      .select('-confidentialComments')
      .populate('reviewerId', 'name email');

    // Calculate majority voting and review statistics
    let majorityDecision = null;
    let voteBreakdown = {
      accept: 0,
      reject: 0,
      minorRevision: 0,
      majorRevision: 0
    };
    let averageScore = null;
    let decisionReason = '';

    if (reviews.length > 0) {
      // Count votes
      reviews.forEach(review => {
        switch (review.recommendation) {
          case 'ACCEPT':
            voteBreakdown.accept++;
            break;
          case 'REJECT':
            voteBreakdown.reject++;
            break;
          case 'MINOR_REVISION':
            voteBreakdown.minorRevision++;
            break;
          case 'MAJOR_REVISION':
            voteBreakdown.majorRevision++;
            break;
        }
      });

      // Calculate average score
      const totalScore = reviews.reduce((sum, review) => sum + review.score, 0);
      averageScore = (totalScore / reviews.length).toFixed(1);

      // Determine majority decision (only if all reviews are complete)
      if (reviews.length === submission.requiredReviews) {
        const totalVotes = reviews.length;
        const acceptPercentage = (voteBreakdown.accept / totalVotes) * 100;
        const rejectPercentage = (voteBreakdown.reject / totalVotes) * 100;

        if (acceptPercentage > 50) {
          majorityDecision = 'ACCEPTED';
          decisionReason = `${voteBreakdown.accept} out of ${totalVotes} reviewers (${acceptPercentage.toFixed(0)}%) recommended acceptance.`;
        } else if (rejectPercentage >= 50) {
          majorityDecision = 'REJECTED';
          const rejectionReasons = reviews
            .filter(r => r.recommendation === 'REJECT')
            .map(r => r.comments)
            .filter(c => c && c.trim())
            .join('; ');
          decisionReason = `${voteBreakdown.reject} out of ${totalVotes} reviewers (${rejectPercentage.toFixed(0)}%) recommended rejection.`;
          if (rejectionReasons) {
            decisionReason += ` Main concerns: ${rejectionReasons}`;
          }
        } else {
          majorityDecision = 'NEEDS_REVISION';
          decisionReason = `Mixed reviews received. ${voteBreakdown.minorRevision + voteBreakdown.majorRevision} reviewer(s) suggested revisions. Please address the feedback and consider resubmission.`;
        }
      }
    }

    res.json({
      success: true,
      data: {
        ...submission.toObject(),
        reviews,
        voteBreakdown,
        majorityDecision,
        decisionReason,
        averageScore,
        progress: `${submission.reviewCount || 0} / ${submission.requiredReviews || 3} reviews completed`,
        reviewProgress: {
          completed: submission.reviewCount || 0,
          required: submission.requiredReviews || 3,
          percentage: Math.round(((submission.reviewCount || 0) / (submission.requiredReviews || 3)) * 100)
        }
      }
    });

  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching submission',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/author/submissions/:id/payment
 * @desc    Update payment status
 * @access  Private (Author)
 */
router.put('/submissions/:id/payment', async (req, res) => {
  try {
    const submission = await Submission.findOne({
      _id: req.params.id,
      authorId: req.user.userId
    });

    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }

    submission.paymentStatus = 'completed';
    await submission.save();

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      data: { submission }
    });

  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating payment status',
      error: error.message
    });
  }
});

module.exports = router;
