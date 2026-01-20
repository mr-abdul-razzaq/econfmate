const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { auth, authorize } = require('../middleware/auth');
const Conference = require('../models/Conference');
const Track = require('../models/Track');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const User = require('../models/User');

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
 * @route   GET /api/author/conferences/:id/tracks
 * @desc    Get tracks for a conference (for authors to select when submitting)
 * @access  Private (Author)
 */
router.get('/conferences/:id/tracks', async (req, res) => {
  try {
    const conference = await Conference.findById(req.params.id);

    if (!conference) {
      return res.status(404).json({
        success: false,
        message: 'Conference not found'
      });
    }

    const tracks = await Track.find({ conferenceId: req.params.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: tracks
    });

  } catch (error) {
    console.error('Get conference tracks error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching tracks',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/author/conferences/:conferenceId/submissions
 * @desc    Submit a paper to a specific track of a conference (trackId required)
 * @access  Private (Author)
 */
router.post(
  '/conferences/:conferenceId/submissions',
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('abstract').trim().notEmpty().withMessage('Abstract is required'),
    body('trackId').notEmpty().withMessage('trackId is required'),
    body('fileUrl').trim().notEmpty().withMessage('fileUrl is required'),
    body('keywords').optional().isArray().withMessage('Keywords must be an array'),
    body('coAuthors').optional().isArray().withMessage('Co-authors must be an array'),
    body('coAuthors.*.name').optional().trim().notEmpty().withMessage('Co-author name is required'),
    body('coAuthors.*.email').optional().isEmail().withMessage('Valid co-author email is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { conferenceId } = req.params;
      const { title, abstract, trackId, fileUrl, keywords, coAuthors } = req.body;

      // Validate conference
      const conference = await Conference.findById(conferenceId).lean();
      if (!conference) {
        return res.status(404).json({ success: false, message: 'Conference not found' });
      }

      // Validate track belongs to conference
      const track = await Track.findOne({ _id: trackId, conferenceId: conferenceId }).lean();
      if (!track) {
        return res.status(400).json({ success: false, message: 'Invalid track for this conference' });
      }

      // Check submission deadline (track-level fallback to conference-level)
      const deadline = track.submissionDeadline || conference.submissionDeadline;
      if (deadline && new Date() > new Date(deadline)) {
        return res.status(400).json({ success: false, message: 'Submission deadline has passed for this track' });
      }

      // Link co-authors to registered users if they exist
      const processedCoAuthors = [];
      if (coAuthors && Array.isArray(coAuthors)) {
        for (const coAuthor of coAuthors) {
          const userByEmail = await User.findOne({ email: coAuthor.email.toLowerCase() }).lean();
          processedCoAuthors.push({
            name: coAuthor.name,
            email: coAuthor.email.toLowerCase(),
            orcid: coAuthor.orcid || '',
            userId: userByEmail?._id || null
          });
        }
      }

      // Create submission (track-scoped)
      const submission = new Submission({
        title,
        abstract,
        fileUrl,
        keywords: keywords || [],
        coAuthors: processedCoAuthors,
        authorId: req.user.userId,
        conferenceId,
        trackId,
        status: 'submitted'
      });

      await submission.save();

      res.status(201).json({ success: true, message: 'Submission created', data: submission });

    } catch (error) {
      console.error('Author submit error:', error);
      res.status(500).json({ success: false, message: 'Error creating submission', error: error.message });
    }
  }
);

/**
 * @route   GET /api/author/submissions
 * @desc    Get submissions by current author or where user is co-author (optional ?trackId=)
 * @access  Private (Author)
 */
router.get('/submissions', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Find submissions where user is either the main author OR a co-author
    const query = {
      $or: [
        { authorId: userId },
        { 'coAuthors.userId': userId }
      ]
    };
    
    if (req.query.trackId) {
      query.trackId = req.query.trackId;
    }
    
    const submissions = await Submission.find(query)
      .populate('conferenceId', 'name')
      .populate('trackId', 'name')
      .populate('authorId', 'name email')
      .sort({ submittedAt: -1 })
      .lean();

    // Mark which submissions the user is a co-author on (view-only)
    const enrichedSubmissions = submissions.map(sub => ({
      ...sub,
      isCoAuthor: sub.authorId._id.toString() !== userId,
      isMainAuthor: sub.authorId._id.toString() === userId
    }));

    res.json({ success: true, data: enrichedSubmissions });
  } catch (error) {
    console.error('Author get submissions error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submissions', error: error.message });
  }
});

/**
 * @route   GET /api/author/submissions/:id
 * @desc    Get submission details with reviews (comments only, no scores/recommendations)
 * @access  Private (Author or Co-Author)
 */
router.get('/submissions/:id', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    // Allow access if user is main author OR co-author
    const submission = await Submission.findOne({
      _id: req.params.id,
      $or: [
        { authorId: userId },
        { 'coAuthors.userId': userId }
      ]
    })
      .populate('conferenceId', 'name')
      .populate('trackId', 'name description')
      .populate('authorId', 'name email')
      .lean();

    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found or you do not have access' });
    }

    // Mark if user is co-author (view-only)
    submission.isCoAuthor = submission.authorId._id.toString() !== userId;
    submission.isMainAuthor = submission.authorId._id.toString() === userId;

    // Fetch reviews for this submission (only comments field visible to author)
    const reviews = await Review.find({ submissionId: submission._id })
      .select('comments submittedAt -_id')
      .sort({ submittedAt: -1 })
      .lean();

    // Attach reviews to submission (only showing suggestions/comments)
    submission.reviews = reviews.map((review, index) => ({
      reviewNumber: index + 1,
      comments: review.comments,
      submittedAt: review.submittedAt
    }));

    res.json({ success: true, data: submission });
  } catch (error) {
    console.error('Author get submission detail error:', error);
    res.status(500).json({ success: false, message: 'Error fetching submission', error: error.message });
  }
});

/**
 * @route   PUT /api/author/submissions/:id/revision
 * @desc    Upload revised paper and abstract when status is 'revision'
 * @access  Private (Author)
 */
router.put(
  '/submissions/:id/revision',
  [
    body('abstract').trim().notEmpty().withMessage('Abstract is required'),
    body('fileUrl').trim().notEmpty().withMessage('fileUrl is required')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { abstract, fileUrl } = req.body;

      // Find submission belonging to this author with revision status
      const submission = await Submission.findOne({
        _id: req.params.id,
        authorId: req.user.userId
      });

      if (!submission) {
        return res.status(404).json({ success: false, message: 'Submission not found' });
      }

      if (submission.status !== 'revision') {
        return res.status(400).json({
          success: false,
          message: 'Revision can only be submitted when status is "revision"'
        });
      }

      // Update submission with revised content
      submission.abstract = abstract;
      submission.fileUrl = fileUrl;
      submission.status = 'under_review'; // Move to under_review for re-evaluation
      submission.lastUpdatedAt = new Date();

      // Track revision count (optional - for lifecycle display)
      submission.revisionCount = (submission.revisionCount || 0) + 1;

      await submission.save();

      res.json({
        success: true,
        message: 'Revision submitted successfully. Your paper is now under review.',
        data: submission
      });

    } catch (error) {
      console.error('Author revision upload error:', error);
      res.status(500).json({ success: false, message: 'Error uploading revision', error: error.message });
    }
  }
);

module.exports = router;

