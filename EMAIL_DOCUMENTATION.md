# 📧 Email Notification System - Complete Guide

## Table of Contents
- [Overview](#overview)
- [Quick Setup](#quick-setup)
- [Email Notifications](#email-notifications)
- [Configuration](#configuration)
- [Testing](#testing)
- [Scheduled Tasks](#scheduled-tasks)
- [Troubleshooting](#troubleshooting)
- [Technical Details](#technical-details)

---

## Overview

The CMS includes a comprehensive email notification system that automatically sends emails to stakeholders throughout the paper review lifecycle. The system supports:

✅ **12 Different Email Types**  
✅ **Professional HTML Templates**  
✅ **Automated Reminders**  
✅ **Weekly Digests**  
✅ **Development Mode** (console logging)  
✅ **Production Mode** (real SMTP)

---

## Quick Setup

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

This installs `node-cron` (for scheduled tasks) and `nodemailer` (for sending emails).

### Step 2: Configure Environment Variables

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` and configure email settings:

**For Development (Console Logging):**
```env
EMAIL_HOST=
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=
EMAIL_PASSWORD=
EMAIL_FROM="CMS System <noreply@cms-system.com>"
```
Leave EMAIL_HOST empty. Emails will be printed to the console.

**For Production (Gmail):**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
EMAIL_FROM="Conference System <your-email@gmail.com>"
```

### Step 3: Start the Server
```bash
npm run dev
```

You should see:
```
✅ Scheduled tasks initialized
   - Review reminders: Daily at 9:00 AM
   - Weekly digests: Every Monday at 8:00 AM
```

---

## Email Notifications

### 📬 All Automated Emails

| # | Email Type | Trigger | Recipient | CC | When |
|---|------------|---------|-----------|-------|------|
| 1 | **Submission Confirmation** | Author submits paper | Author | Co-authors | Immediately |
| 2 | **New Submission Alert** | Author submits paper | Organizer | - | Immediately |
| 3 | **Paper Approved for Review** | Organizer approves paper | Author | - | Immediately |
| 4 | **Reviewer Assignment** | Organizer assigns reviewer | Reviewer | - | Immediately |
| 5 | **Revision Requested** | Reviewer requests revision | Author | Co-authors | Immediately |
| 6 | **All Reviews Complete** | All reviewers finish | Organizer | - | Immediately |
| 7 | **Review Reminder** | Automated check | Reviewers | - | 7 days before conference |
| 8 | **Revised Paper Submitted** | Author uploads revision | Reviewers | - | Immediately |
| 9 | **Paper Accepted** | Organizer accepts paper | Author | Co-authors | Immediately |
| 10 | **Paper Rejected** | Organizer rejects paper | Author | Co-authors | Immediately |
| 11 | **Final Decision Notice** | Organizer makes decision | Reviewers | - | Immediately |
| 12 | **Weekly Digest** | Automated (Monday 8 AM) | Organizers | - | Every Monday |

**Note:** All emails sent to authors automatically CC co-authors (if any).

---

## Configuration

### Gmail Setup (Production)

1. **Enable 2-Factor Authentication:**
   - Go to https://myaccount.google.com/security
   - Turn on 2-Step Verification

2. **Generate App Password:**
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "CMS System"
   - Copy the 16-character password

3. **Update .env:**
   ```env
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=abcd efgh ijkl mnop  # The app password
   EMAIL_FROM="CMS System <your-email@gmail.com>"
   ```

### SendGrid Setup (Recommended for Production)

1. **Create Account:** https://sendgrid.com/
2. **Create API Key:** Settings > API Keys
3. **Update .env:**
   ```env
   EMAIL_HOST=smtp.sendgrid.net
   EMAIL_PORT=587
   EMAIL_SECURE=false
   EMAIL_USER=apikey
   EMAIL_PASSWORD=SG.xxxxxxxxxxxx.xxxxxxxxxxx
   EMAIL_FROM="CMS System <verified@yourdomain.com>"
   ```

---

## Testing

### Development Mode Testing

1. **Leave EMAIL_HOST empty in .env**
2. **Perform an action** (e.g., submit a paper)
3. **Check console output:**

```
📧 EMAIL (Development Mode): {
  to: 'author@example.com',
  cc: 'coauthor1@example.com, coauthor2@example.com',
  subject: 'Paper Submission Confirmed - AI Conference 2026',
  text: 'Paper Submission Confirmed\n\nDear John Doe,\n\nYour paper...'
}
✅ Email sent: {
  to: 'author@example.com',
  cc: 'coauthor1@example.com, coauthor2@example.com',
  subject: 'Paper Submission Confirmed - AI Conference 2026',
  messageId: 'dev-1234567890'
}
```

### Production Mode Testing

1. **Configure real SMTP in .env**
2. **Perform an action**
3. **Check recipient's inbox**

### Manual Testing (Email Templates)

Create a test endpoint in `backend/routes/test.js`:

```javascript
const express = require('express');
const router = express.Router();
const { sendEmail, templates } = require('../utils/emailService');

router.get('/test-email', async (req, res) => {
  const testEmail = 'your-test-email@example.com';
  
  const mockAuthor = { name: 'Test Author', email: testEmail };
  const mockPaper = { 
    _id: '123', 
    title: 'Test Paper Title',
    trackId: { name: 'AI Track' },
    createdAt: new Date()
  };
  const mockConference = { name: 'Test Conference 2026' };

  try {
    await sendEmail(
      testEmail,
      templates.submissionConfirmation(mockAuthor, mockPaper, mockConference)
    );
    res.json({ success: true, message: 'Test email sent!' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
```

Add to `server.js`:
```javascript
app.use('/api/test', require('./routes/test'));
```

Visit: http://localhost:5000/api/test/test-email

---

## Scheduled Tasks

### Automatic Email Schedules

**Review Reminders:**
- **When:** Every day at 9:00 AM
- **What:** Checks for conferences starting in 7 days
- **Who:** Reviewers with pending reviews
- **Cron:** `0 9 * * *`

**Weekly Digests:**
- **When:** Every Monday at 8:00 AM
- **What:** Conference statistics summary
- **Who:** Conference organizers
- **Cron:** `0 8 * * 1`

### Customizing Schedules

Edit `backend/utils/scheduledTasks.js`:

```javascript
// Change review reminder time (currently 9 AM daily)
cron.schedule('0 9 * * *', () => {
  sendReviewReminders();
});

// Change to different time (e.g., 2 PM daily)
cron.schedule('0 14 * * *', () => {
  sendReviewReminders();
});

// Change weekly digest (currently Monday 8 AM)
cron.schedule('0 8 * * 1', () => {
  sendWeeklyDigest();
});

// Change to different day (e.g., Friday 10 AM)
cron.schedule('0 10 * * 5', () => {
  sendWeeklyDigest();
});
```

**Cron Format:** `minute hour day-of-month month day-of-week`

Examples:
- `0 9 * * *` - Every day at 9:00 AM
- `0 8 * * 1` - Every Monday at 8:00 AM
- `30 14 * * *` - Every day at 2:30 PM
- `0 0 * * 0` - Every Sunday at midnight

### Manual Execution (Testing Scheduled Tasks)

In Node.js console or create an API endpoint:

```javascript
const { sendReviewReminders, sendWeeklyDigest } = require('./utils/scheduledTasks');

// Test review reminders
await sendReviewReminders();

// Test weekly digest
await sendWeeklyDigest();
```

---

## Troubleshooting

### ❌ Emails Not Sending

**Problem:** Emails don't appear in inbox

**Solutions:**
1. **Check .env configuration**
   ```bash
   # Verify all email settings are correct
   cat .env | grep EMAIL
   ```

2. **Check spam/junk folder**

3. **Verify SMTP credentials**
   - Gmail: Use App Password, not regular password
   - Ensure 2FA is enabled for Gmail

4. **Check console for errors**
   ```
   ❌ Email error: Error: Invalid login: 535-5.7.8 Username and Password not accepted
   ```

5. **Test with a simple email client:**
   ```javascript
   const nodemailer = require('nodemailer');
   const transporter = nodemailer.createTransport({
     host: 'smtp.gmail.com',
     port: 587,
     auth: {
       user: 'your-email@gmail.com',
       pass: 'your-app-password'
     }
   });
   
   await transporter.sendMail({
     from: 'your-email@gmail.com',
     to: 'test@example.com',
     subject: 'Test',
     text: 'Testing'
   });
   ```

### ❌ Scheduled Tasks Not Running

**Problem:** Review reminders or weekly digests not sending

**Solutions:**
1. **Check if server is running continuously**
   - Scheduled tasks only work when server is running
   - Use PM2 or similar for production

2. **Check server logs for initialization:**
   ```
   ✅ Scheduled tasks initialized
      - Review reminders: Daily at 9:00 AM
      - Weekly digests: Every Monday at 8:00 AM
   ```

3. **Check timezone:**
   - Cron uses server's local timezone
   - Set timezone in environment:
     ```bash
     export TZ=America/New_York
     ```

4. **Test manually:**
   ```javascript
   const { sendReviewReminders } = require('./utils/scheduledTasks');
   sendReviewReminders(); // Should execute immediately
   ```

### ❌ Gmail "Less Secure Apps" Error

**Problem:** Gmail blocks sign-in attempts

**Solution:**
- Don't use "Allow less secure apps" (deprecated)
- Use App Password with 2FA instead
- Or use OAuth2 (more complex setup)

### ❌ Rate Limiting

**Problem:** Too many emails being rejected

**Solution:**
- Gmail: Max 500 emails/day for free accounts
- For higher volume, consider a business Gmail account (2,000 emails/day)
- Implement rate limiting in code if needed:
  ```javascript
  const rateLimit = require('express-rate-limit');
  
  const emailLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  ```

---

## Technical Details

### Architecture

```
┌─────────────────┐
│   Application   │
│   (Routes)      │
└────────┬────────┘
         │
         ├── Immediate Triggers
         │   ├── Paper Submission
         │   ├── Review Submission
         │   └── Final Decision
         │
         └── Scheduled Triggers (Cron)
             ├── Review Reminders (Daily)
             └── Weekly Digests (Weekly)
                    ↓
         ┌──────────────────┐
         │  emailService.js │
         │  - Templates     │
         │  - sendEmail()   │
         └────────┬─────────┘
                  │
         ┌────────┴────────┐
         │                 │
    Development         Production
    (Console Log)      (SMTP Server)
         │                 │
         └─────────┬───────┘
                   ↓
              Recipient
```

### File Structure

```
backend/
├── utils/
│   ├── emailService.js       # Core email service
│   └── scheduledTasks.js     # Cron jobs
├── routes/
│   ├── author.js            # Author email triggers
│   ├── organizer.js         # Organizer email triggers
│   └── reviewer.js          # Reviewer email triggers
├── server.js                # Initialize scheduled tasks
└── .env                     # Email configuration
```

### Email Templates

All templates in `backend/utils/emailService.js`:

```javascript
const templates = {
  submissionConfirmation: (author, paper, conference) => ({
    subject: `Paper Submission Confirmed - ${conference.name}`,
    html: `<h2>Paper Submission Confirmed</h2>...`,
    text: `Paper Submission Confirmed\n\n...`
  }),
  // ... 11 more templates
};
```

Each template includes:
- **subject:** Email subject line
- **html:** Rich HTML email with styling
- **text:** Plain text fallback

### Sending Emails

```javascript
const { sendEmail, templates } = require('./utils/emailService');

// Send an email
await sendEmail(
  'recipient@example.com',
  templates.submissionConfirmation(author, paper, conference)
);
```

### Error Handling

Emails are sent asynchronously and errors are logged but don't break the application:

```javascript
sendEmail(email, template)
  .catch(err => console.error('Email error:', err));
```

This prevents email failures from affecting core functionality.

---

## Production Deployment

### Environment Variables

Set all required environment variables:
```bash
export EMAIL_HOST=smtp.sendgrid.net
export EMAIL_PORT=587
export EMAIL_USER=apikey
export EMAIL_PASSWORD=SG.xxxxx
export EMAIL_FROM="CMS <noreply@yourdomain.com>"
```

### Process Manager (PM2)

Keep server running for scheduled tasks:

```bash
npm install -g pm2
pm2 start server.js --name cms-backend
pm2 save
pm2 startup
```

### Monitoring

Check email logs:
```bash
pm2 logs cms-backend | grep EMAIL
```

---

## Best Practices

### ✅ Do's

1. **Use App Passwords** for Gmail (not regular passwords)
2. **Test in development** before enabling in production
3. **Monitor email delivery** via Gmail's Sent folder
4. **Keep co-authors informed** (automatic CC on all author emails)
5. **Log all email attempts** for debugging
6. **Handle errors gracefully** (don't break app if email fails)
7. **Respect Gmail's 500 emails/day limit** for free accounts

### ❌ Don'ts

1. **Don't commit .env** with real credentials to Git
2. **Don't use personal Gmail** for high-volume production (>500 emails/day)
3. **Don't send passwords** in emails
4. **Don't spam users** with unnecessary emails
5. **Don't forget timezone** when scheduling tasks
6. **Don't use regular Gmail password** - always use App Password with 2FA

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review console logs for error messages
3. Test with development mode (console logging)
4. Verify .env configuration

---

## License

Part of the Conference Management System (CMS) project.
