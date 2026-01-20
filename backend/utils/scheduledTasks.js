const cron = require('node-cron');
const Conference = require('../models/Conference');
const Submission = require('../models/Submission');
const Review = require('../models/Review');
const User = require('../models/User');
const { sendEmail, templates } = require('./emailService');

// Send review reminders 7 days before conference start
const sendReviewReminders = async () => {
  try {
    console.log('📧 Running review reminder check...');
    
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    
    const eightDaysFromNow = new Date();
    eightDaysFromNow.setDate(eightDaysFromNow.getDate() + 8);

    // Find conferences starting in 7 days
    const upcomingConferences = await Conference.find({
      startDate: {
        $gte: sevenDaysFromNow,
        $lt: eightDaysFromNow
      }
    }).lean();

    if (upcomingConferences.length === 0) {
      console.log('No conferences starting in 7 days');
      return;
    }

    for (const conference of upcomingConferences) {
      // Get all submissions for this conference
      const submissions = await Submission.find({
        conferenceId: conference._id,
        status: { $in: ['submitted', 'under_review'] }
      }).populate('trackId', 'name');

      for (const submission of submissions) {
        if (!submission.assignedReviewers || submission.assignedReviewers.length === 0) {
          continue;
        }

        // Check which reviewers haven't submitted their reviews
        const completedReviews = await Review.find({
          submissionId: submission._id,
          status: { $in: ['submitted', 'pending_revision'] }
        }).select('reviewerId');

        const completedReviewerIds = completedReviews.map(r => r.reviewerId.toString());
        const pendingReviewers = submission.assignedReviewers.filter(
          rId => !completedReviewerIds.includes(rId.toString())
        );

        // Send reminders to pending reviewers
        for (const reviewerId of pendingReviewers) {
          const reviewer = await User.findById(reviewerId).lean();
          if (reviewer?.email) {
            console.log(`Sending reminder to ${reviewer.email} for paper ${submission.title}`);
            sendEmail(
              reviewer.email,
              templates.reviewReminder(reviewer, submission, conference, 7)
            ).catch(err => console.error('Email error:', err));
          }
        }
      }
    }

    console.log('✅ Review reminders sent');
  } catch (error) {
    console.error('❌ Error sending review reminders:', error);
  }
};

// Send weekly digest to organizers
const sendWeeklyDigest = async () => {
  try {
    console.log('📧 Running weekly digest...');
    
    // Get all active conferences (not ended)
    const activeConferences = await Conference.find({
      $or: [
        { endDate: { $gte: new Date() } },
        { endDate: null }
      ]
    }).lean();

    for (const conference of activeConferences) {
      // Calculate stats
      const [
        totalSubmissions,
        pendingReviews,
        completedReviews,
        acceptedPapers,
        rejectedPapers
      ] = await Promise.all([
        Submission.countDocuments({ conferenceId: conference._id }),
        Review.countDocuments({ 
          submissionId: { $in: await Submission.find({ conferenceId: conference._id }).distinct('_id') },
          status: 'in_progress'
        }),
        Review.countDocuments({
          submissionId: { $in: await Submission.find({ conferenceId: conference._id }).distinct('_id') },
          status: { $in: ['submitted', 'pending_revision'] }
        }),
        Submission.countDocuments({ conferenceId: conference._id, status: 'accepted' }),
        Submission.countDocuments({ conferenceId: conference._id, status: 'rejected' })
      ]);

      // Count papers awaiting decision (all reviews completed but no final decision)
      const submissionsWithReviews = await Submission.find({
        conferenceId: conference._id,
        status: 'under_review',
        assignedReviewers: { $exists: true, $ne: [] }
      });

      let awaitingDecision = 0;
      for (const submission of submissionsWithReviews) {
        const reviewCount = await Review.countDocuments({
          submissionId: submission._id,
          status: { $in: ['submitted', 'pending_revision'] }
        });
        if (reviewCount >= submission.assignedReviewers.length) {
          awaitingDecision++;
        }
      }

      const stats = {
        totalSubmissions,
        pendingReviews,
        completedReviews,
        awaitingDecision,
        acceptedPapers,
        rejectedPapers
      };

      // Send digest to organizer
      const organizer = await User.findById(conference.organizerId).lean();
      if (organizer?.email) {
        console.log(`Sending digest to ${organizer.email} for ${conference.name}`);
        sendEmail(
          organizer.email,
          templates.weeklyDigest(organizer, conference, stats)
        ).catch(err => console.error('Email error:', err));
      }
    }

    console.log('✅ Weekly digests sent');
  } catch (error) {
    console.error('❌ Error sending weekly digests:', error);
  }
};

// Initialize cron jobs
const initializeScheduledTasks = () => {
  // Run review reminders daily at 9 AM
  cron.schedule('0 9 * * *', () => {
    console.log('⏰ Running daily review reminder check...');
    sendReviewReminders();
  });

  // Run weekly digest every Monday at 8 AM
  cron.schedule('0 8 * * 1', () => {
    console.log('⏰ Running weekly digest...');
    sendWeeklyDigest();
  });

  console.log('✅ Scheduled tasks initialized');
  console.log('   - Review reminders: Daily at 9:00 AM');
  console.log('   - Weekly digests: Every Monday at 8:00 AM');
};

module.exports = {
  initializeScheduledTasks,
  sendReviewReminders,
  sendWeeklyDigest
};
