const express = require('express');
const router = express.Router();
const Conference = require('../models/Conference');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Review = require('../models/Review');

/**
 * @route   GET /api/public/stats
 * @desc    Get public platform statistics (no auth required)
 */
router.get('/stats', async (req, res) => {
    try {
        // Get counts in parallel
        const [
            conferenceCount,
            userCount,
            submissionCount,
            reviewCount
        ] = await Promise.all([
            Conference.countDocuments({}),
            User.countDocuments({}),
            Submission.countDocuments({}),
            Review.countDocuments({})
        ]);

        res.json({
            success: true,
            data: {
                conferences: conferenceCount,
                users: userCount,
                submissions: submissionCount,
                reviews: reviewCount,
                country: 'India' // Platform is based in India
            }
        });
    } catch (error) {
        console.error('Error fetching public stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics'
        });
    }
});

module.exports = router;
