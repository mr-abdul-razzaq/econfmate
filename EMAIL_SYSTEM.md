# Email System Documentation

## Overview
The CMS now has a comprehensive email notification system that keeps all stakeholders informed throughout the paper review lifecycle.

## Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

The required package `node-cron` has been added to package.json for scheduled tasks.

### 2. Configure Email Settings (.env)
```env
# Email Configuration
EMAIL_HOST=smtp.gmail.com          # Your SMTP host
EMAIL_PORT=587                     # SMTP port (587 for TLS, 465 for SSL)
EMAIL_SECURE=false                 # true for SSL, false for TLS
EMAIL_USER=your-email@gmail.com    # SMTP username
EMAIL_PASSWORD=your-app-password   # SMTP password or app password
EMAIL_FROM="CMS System <noreply@cms-system.com>"  # From address
```

**For Gmail:**
1. Enable 2-factor authentication
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Use the app password in EMAIL_PASSWORD

**For Development:**
- Leave EMAIL_HOST empty to use console logging (emails printed to terminal)

## Email Notifications

### 1. Paper Submission Phase

#### ✅ Submission Confirmation (to Author)
- **Trigger:** Author submits a paper
- **Recipient:** Paper author
- **Content:** Confirmation with paper ID, title, track, submission date
- **File:** `backend/routes/author.js` (line ~267)

#### ✅ New Submission Alert (to Organizer)
- **Trigger:** Author submits a paper
- **Recipient:** Conference organizer
- **Content:** New paper details, author info, track
- **File:** `backend/routes/author.js` (line ~276)

#### ✅ Paper Approved for Review (to Author)
- **Trigger:** Organizer approves paper for review
- **Recipient:** Paper author
- **Content:** Confirmation that paper entered review process
- **File:** `backend/routes/organizer.js` (line ~489)

### 2. Assignment Phase

#### ✅ Reviewer Assignment (to Reviewer)
- **Trigger:** Organizer approves a bid OR manually assigns reviewer
- **Recipient:** Assigned reviewer
- **Content:** Paper details, track, review deadline
- **File:** `backend/routes/organizer.js` (line ~1030)

### 3. Review Phase

#### ✅ Revision Requested (to Author)
- **Trigger:** Reviewer submits review with revision recommendation
- **Recipient:** Paper author
- **Content:** Revision request with reviewer feedback
- **File:** `backend/routes/reviewer.js` (line ~388)

#### ✅ All Reviews Complete (to Organizer)
- **Trigger:** All assigned reviewers complete their reviews
- **Recipient:** Conference organizer
- **Content:** Notification that paper ready for final decision
- **File:** `backend/routes/reviewer.js` (line ~405)

#### ✅ Review Reminder (to Reviewers)
- **Trigger:** Automated - 7 days before conference start
- **Recipient:** Reviewers with pending reviews
- **Content:** Reminder to submit pending reviews
- **File:** `backend/utils/scheduledTasks.js` (sendReviewReminders)

### 4. Revision Phase

#### ✅ Revised Paper Submitted (to Reviewers)
- **Trigger:** Author submits revised paper
- **Recipient:** All assigned reviewers
- **Content:** Notification that revised paper ready for re-review
- **File:** `backend/routes/author.js` (line ~441)

### 5. Final Decision Phase

#### ✅ Paper Accepted (to Author)
- **Trigger:** Organizer makes final decision (accept)
- **Recipient:** Paper author
- **Content:** Congratulations, next steps, camera-ready instructions
- **File:** `backend/routes/organizer.js` (line ~421)

#### ✅ Paper Rejected (to Author)
- **Trigger:** Organizer makes final decision (reject)
- **Recipient:** Paper author
- **Content:** Rejection notification with feedback
- **File:** `backend/routes/organizer.js` (line ~423)

#### ✅ Final Decision (to Reviewers)
- **Trigger:** Organizer makes final decision
- **Recipient:** All assigned reviewers
- **Content:** Thank you note with final decision
- **File:** `backend/routes/organizer.js` (line ~432)

### 6. Automated Tasks

#### ✅ Weekly Digest (to Organizers)
- **Schedule:** Every Monday at 8:00 AM
- **Recipient:** Conference organizers
- **Content:** 
  - Total submissions
  - Pending reviews
  - Papers awaiting decision
  - Accepted/rejected papers
- **File:** `backend/utils/scheduledTasks.js` (sendWeeklyDigest)

## Email Templates

All email templates are defined in `backend/utils/emailService.js` with both HTML and plain text versions.

### Template Features:
- Professional HTML formatting with inline styles
- Color-coded sections (green for success, yellow for warnings, red for rejections)
- Responsive design
- Plain text fallback for email clients that don't support HTML

## Scheduled Tasks

Configured in `backend/utils/scheduledTasks.js` and initialized in `backend/server.js`.

### Active Schedules:
1. **Review Reminders:** Daily at 9:00 AM
   - Checks conferences starting in 7 days
   - Sends reminders to reviewers with pending reviews

2. **Weekly Digests:** Every Monday at 8:00 AM
   - Sends statistics to all conference organizers
   - Highlights pending actions

### Manual Execution (for testing):
```javascript
// In backend console or API endpoint
const { sendReviewReminders, sendWeeklyDigest } = require('./utils/scheduledTasks');

// Test review reminders
sendReviewReminders();

// Test weekly digest
sendWeeklyDigest();
```

## Testing

### Development Mode (Console Logging)
Leave EMAIL_HOST empty in .env. All emails will be printed to the console:
```
📧 EMAIL (Development Mode): {
  to: 'author@example.com',
  subject: 'Paper Submission Confirmed',
  text: 'Paper Submission Confirmed...'
}
```

### Production Mode (Real Emails)
Configure SMTP settings in .env with real credentials.

## Troubleshooting

### Emails Not Sending
1. Check .env configuration
2. Verify SMTP credentials
3. Check console for error messages
4. For Gmail, ensure "Less secure app access" is enabled or use App Password

### Scheduled Tasks Not Running
1. Ensure server is running continuously (not just during development)
2. Check server logs for cron initialization messages
3. Verify timezone settings match your requirements

## Files Modified

### Backend:
- `backend/utils/emailService.js` - Email templates and sending logic (NEW)
- `backend/utils/scheduledTasks.js` - Cron jobs for reminders and digests (NEW)
- `backend/routes/author.js` - Author submission and revision emails
- `backend/routes/organizer.js` - Decision, approval, and assignment emails
- `backend/routes/reviewer.js` - Review submission and revision request emails
- `backend/server.js` - Initialize scheduled tasks
- `backend/package.json` - Added node-cron dependency
- `backend/.env` - Email configuration variables

### Frontend:
- `frontend/src/pages/Organizer/ViewSubmissions.js` - Added conference dates and location display

## Future Enhancements

Potential additions:
- Email preferences (allow users to opt-out of certain notifications)
- Email templates customization per conference
- Send test emails from admin panel
- Email delivery tracking and logs
- Batch email sending with rate limiting
- Integration with email marketing platforms (SendGrid, Mailgun)
