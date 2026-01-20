const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = () => {
  // For development, use ethereal email (fake SMTP)
  // In production, use real SMTP credentials from .env
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }
  
  // Development fallback - logs to console
  return {
    sendMail: async (mailOptions) => {
      console.log('📧 EMAIL (Development Mode):', {
        to: mailOptions.to,
        cc: mailOptions.cc || 'None',
        subject: mailOptions.subject,
        text: mailOptions.text?.substring(0, 200) + '...'
      });
      return { messageId: 'dev-' + Date.now() };
    }
  };
};

// Email templates
const templates = {
  // 1. Paper Submission Confirmation to Author
  submissionConfirmation: (author, paper, conference) => ({
    subject: `Paper Submission Confirmed - ${conference.name}`,
    html: `
      <h2>Paper Submission Confirmed</h2>
      <p>Dear ${author.name},</p>
      <p>Your paper has been successfully submitted to <strong>${conference.name}</strong>.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Track:</strong> ${paper.trackId?.name || 'N/A'}</p>
        <p><strong>Submitted:</strong> ${new Date(paper.createdAt).toLocaleString()}</p>
      </div>
      
      <p>Your paper will be reviewed by our expert reviewers. You will be notified of any updates via email.</p>
      <p>Thank you for your submission!</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Paper Submission Confirmed\n\nDear ${author.name},\n\nYour paper "${paper.title}" has been successfully submitted to ${conference.name}.\n\nPaper ID: ${paper._id}\nSubmitted: ${new Date(paper.createdAt).toLocaleString()}\n\nThank you for your submission!`
  }),

  // 2. New Submission Alert to Organizer
  newSubmissionAlert: (organizer, paper, conference, author) => ({
    subject: `New Paper Submission - ${conference.name}`,
    html: `
      <h2>New Paper Submitted</h2>
      <p>Dear ${organizer.name},</p>
      <p>A new paper has been submitted to <strong>${conference.name}</strong>.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Author:</strong> ${author.name} (${author.email})</p>
        <p><strong>Track:</strong> ${paper.trackId?.name || 'N/A'}</p>
        <p><strong>Submitted:</strong> ${new Date(paper.createdAt).toLocaleString()}</p>
      </div>
      
      <p>Please review and approve this submission for the review process.</p>
      
      <p>Best regards,<br>CMS System</p>
    `,
    text: `New Paper Submitted\n\nA new paper "${paper.title}" by ${author.name} has been submitted to ${conference.name}.\n\nPaper ID: ${paper._id}`
  }),

  // 3. Paper Approved for Review
  paperApprovedForReview: (author, paper, conference) => ({
    subject: `Paper Approved for Review - ${conference.name}`,
    html: `
      <h2>Paper Approved for Review Process</h2>
      <p>Dear ${author.name},</p>
      <p>Great news! Your paper has been approved for the review process.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Conference:</strong> ${conference.name}</p>
      </div>
      
      <p>Your paper will now be assigned to expert reviewers. We will notify you once the review process is complete.</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Paper Approved for Review\n\nDear ${author.name},\n\nYour paper "${paper.title}" has been approved for the review process at ${conference.name}.`
  }),

  // 4. Reviewer Assignment Notification
  reviewerAssigned: (reviewer, paper, conference) => ({
    subject: `Review Assignment - ${conference.name}`,
    html: `
      <h2>New Review Assignment</h2>
      <p>Dear ${reviewer.name},</p>
      <p>You have been assigned to review a paper for <strong>${conference.name}</strong>.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Track:</strong> ${paper.trackId?.name || 'N/A'}</p>
      </div>
      
      <p>Please log in to the system to access the paper and submit your review.</p>
      <p><strong>Review Deadline:</strong> ${conference.reviewDeadline ? new Date(conference.reviewDeadline).toLocaleDateString() : 'TBD'}</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `New Review Assignment\n\nDear ${reviewer.name},\n\nYou have been assigned to review paper "${paper.title}" for ${conference.name}.\n\nPlease submit your review by the deadline.`
  }),

  // 5. Revision Requested
  revisionRequested: (author, paper, conference, feedback) => ({
    subject: `Revision Requested - ${conference.name}`,
    html: `
      <h2>Revision Requested for Your Paper</h2>
      <p>Dear ${author.name},</p>
      <p>The reviewers have completed their assessment of your paper and are requesting revisions.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Conference:</strong> ${conference.name}</p>
      </div>
      
      <div style="background: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <p><strong>Reviewer Feedback:</strong></p>
        <p>${feedback || 'Please see the detailed feedback in the system.'}</p>
      </div>
      
      <p>Please log in to the system to view the detailed feedback and upload your revised paper.</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Revision Requested\n\nDear ${author.name},\n\nRevisions have been requested for your paper "${paper.title}".\n\nFeedback: ${feedback}\n\nPlease submit your revised paper through the system.`
  }),

  // 6. All Reviews Complete (to Organizer)
  allReviewsComplete: (organizer, paper, conference, reviewCount) => ({
    subject: `All Reviews Complete - ${paper.title}`,
    html: `
      <h2>All Reviews Submitted</h2>
      <p>Dear ${organizer.name},</p>
      <p>All assigned reviewers have completed their reviews for the following paper:</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Reviews Completed:</strong> ${reviewCount}</p>
      </div>
      
      <p>The paper is now ready for your final decision.</p>
      
      <p>Best regards,<br>CMS System</p>
    `,
    text: `All Reviews Complete\n\nAll reviewers have submitted their reviews for paper "${paper.title}".\n\nThe paper is ready for final decision.`
  }),

  // 7. Review Reminder
  reviewReminder: (reviewer, paper, conference, daysLeft) => ({
    subject: `Review Reminder - ${conference.name}`,
    html: `
      <h2>Review Reminder</h2>
      <p>Dear ${reviewer.name},</p>
      <p>This is a friendly reminder that you have a pending review assignment.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Days Until Conference:</strong> ${daysLeft}</p>
      </div>
      
      <p style="color: #dc2626;">⚠️ Please submit your review as soon as possible to help meet the conference timeline.</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Review Reminder\n\nDear ${reviewer.name},\n\nYou have a pending review for paper "${paper.title}".\n\n${daysLeft} days until conference start. Please submit your review soon.`
  }),

  // 8. Revised Paper Submitted (to Reviewers)
  revisedPaperSubmitted: (reviewer, paper, conference) => ({
    subject: `Revised Paper Ready for Re-review - ${conference.name}`,
    html: `
      <h2>Revised Paper Submitted</h2>
      <p>Dear ${reviewer.name},</p>
      <p>The author has submitted a revised version of the paper you reviewed.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Revision Count:</strong> ${paper.revisionCount || 1}</p>
      </div>
      
      <p>Please log in to the system to review the revised paper and provide your feedback.</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Revised Paper Submitted\n\nThe author has submitted a revised version of "${paper.title}".\n\nPlease review the changes and provide feedback.`
  }),

  // 9. Paper Accepted
  paperAccepted: (author, paper, conference) => ({
    subject: `🎉 Paper Accepted - ${conference.name}`,
    html: `
      <h2>🎉 Congratulations! Your Paper Has Been Accepted</h2>
      <p>Dear ${author.name},</p>
      <p>We are pleased to inform you that your paper has been <strong>accepted</strong> for presentation at ${conference.name}!</p>
      
      <div style="background: #d1fae5; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Conference:</strong> ${conference.name}</p>
        ${conference.startDate ? `<p><strong>Conference Date:</strong> ${new Date(conference.startDate).toLocaleDateString()}</p>` : ''}
      </div>
      
      <h3>Next Steps:</h3>
      <ol>
        <li>Prepare your camera-ready version incorporating reviewer feedback</li>
        <li>Register for the conference (if not already done)</li>
        <li>Prepare your presentation</li>
      </ol>
      
      <p>We look forward to your participation!</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Congratulations!\n\nYour paper "${paper.title}" has been accepted for ${conference.name}!\n\nPlease prepare your camera-ready version and register for the conference.`
  }),

  // 10. Paper Rejected
  paperRejected: (author, paper, conference, feedback) => ({
    subject: `Paper Decision - ${conference.name}`,
    html: `
      <h2>Paper Decision Notification</h2>
      <p>Dear ${author.name},</p>
      <p>Thank you for submitting your paper to ${conference.name}. After careful review, we regret to inform you that your paper has not been accepted for presentation.</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
      </div>
      
      ${feedback ? `
      <div style="background: #fee2e2; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #dc2626;">
        <p><strong>Reviewer Feedback:</strong></p>
        <p>${feedback}</p>
      </div>
      ` : ''}
      
      <p>We appreciate your interest in ${conference.name} and encourage you to consider submitting to future conferences.</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Paper Decision\n\nDear ${author.name},\n\nYour paper "${paper.title}" was not accepted for ${conference.name}.\n\nFeedback: ${feedback}\n\nThank you for your submission.`
  }),

  // 11. Final Decision to Reviewers
  finalDecisionToReviewers: (reviewer, paper, conference, decision) => ({
    subject: `Final Decision Made - ${paper.title}`,
    html: `
      <h2>Final Decision Made</h2>
      <p>Dear ${reviewer.name},</p>
      <p>Thank you for your valuable contribution in reviewing the following paper:</p>
      
      <div style="background: #f3f4f6; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Paper ID:</strong> ${paper._id}</p>
        <p><strong>Title:</strong> ${paper.title}</p>
        <p><strong>Final Decision:</strong> <strong style="color: ${decision === 'accepted' ? '#10b981' : '#dc2626'};">${decision.toUpperCase()}</strong></p>
      </div>
      
      <p>Your expert review helped ensure the quality of ${conference.name}. We greatly appreciate your time and effort!</p>
      
      <p>Best regards,<br>${conference.name} Team</p>
    `,
    text: `Final Decision Made\n\nThank you for reviewing "${paper.title}".\n\nFinal Decision: ${decision.toUpperCase()}\n\nWe appreciate your contribution!`
  }),

  // 12. Weekly Digest to Organizer
  weeklyDigest: (organizer, conference, stats) => ({
    subject: `Weekly Conference Digest - ${conference.name}`,
    html: `
      <h2>Weekly Conference Digest</h2>
      <p>Dear ${organizer.name},</p>
      <p>Here's your weekly summary for <strong>${conference.name}</strong>:</p>
      
      <div style="background: #f3f4f6; padding: 20px; border-radius: 5px; margin: 20px 0;">
        <h3>📊 Statistics</h3>
        <p><strong>Total Submissions:</strong> ${stats.totalSubmissions || 0}</p>
        <p><strong>Pending Reviews:</strong> ${stats.pendingReviews || 0}</p>
        <p><strong>Completed Reviews:</strong> ${stats.completedReviews || 0}</p>
        <p><strong>Papers Awaiting Decision:</strong> ${stats.awaitingDecision || 0}</p>
        <p><strong>Accepted Papers:</strong> ${stats.acceptedPapers || 0}</p>
        <p><strong>Rejected Papers:</strong> ${stats.rejectedPapers || 0}</p>
      </div>
      
      ${stats.pendingReviews > 0 ? `
      <div style="background: #fef3c7; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p>⚠️ <strong>${stats.pendingReviews} reviews</strong> are still pending. Consider sending reminders to reviewers.</p>
      </div>
      ` : ''}
      
      ${stats.awaitingDecision > 0 ? `
      <div style="background: #dbeafe; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p>📋 <strong>${stats.awaitingDecision} papers</strong> have completed reviews and are ready for your decision.</p>
      </div>
      ` : ''}
      
      <p>Best regards,<br>CMS System</p>
    `,
    text: `Weekly Conference Digest - ${conference.name}\n\nTotal Submissions: ${stats.totalSubmissions}\nPending Reviews: ${stats.pendingReviews}\nPapers Awaiting Decision: ${stats.awaitingDecision}\n\nPlease log in for more details.`
  })
};

// Send email function
const sendEmail = async (to, template, cc = null) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"CMS System" <noreply@cms-system.com>',
      to,
      subject: template.subject,
      html: template.html,
      text: template.text
    };

    // Add CC if provided (for co-authors)
    if (cc) {
      mailOptions.cc = cc;
    }

    const result = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', { to, cc, subject: template.subject, messageId: result.messageId });
    return result;
  } catch (error) {
    console.error('❌ Email error:', error);
    throw error;
  }
};

module.exports = {
  sendEmail,
  templates
};
