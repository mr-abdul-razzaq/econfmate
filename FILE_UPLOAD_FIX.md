# File Upload/Download Issue - Diagnosis and Solutions

## Problem
When clicking "View Paper" or "Download Paper", you get a "no route" error for URLs like:
```
https://cms-backend-fjdo.onrender.com/uploads/paper-1234567890-123456789.pdf
```

## Root Cause Analysis

### Current Implementation (Correct)
1. **Backend** (`backend/server.js` line 25):
   ```javascript
   app.use('/uploads', express.static('uploads'));
   ```
   - Serves static files from `/uploads` directory

2. **Upload Route** (`backend/routes/upload.js` line 63):
   ```javascript
   const fileUrl = `/uploads/${req.file.filename}`;
   ```
   - Returns URL like `/uploads/paper-1234567890-123456789.pdf`

3. **Frontend** (4 files):
   ```javascript
   const API_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'https://cms-backend-fjdo.onrender.com';
   // Constructs: https://cms-backend-fjdo.onrender.com/uploads/paper-xxx.pdf
   ```

### The REAL Problem: Render.com Ephemeral Storage ⚠️

**Render.com free tier uses ephemeral storage** - any files uploaded are **deleted when the container restarts**!

This means:
- Files upload successfully
- Files are stored temporarily in `/uploads` folder
- When Render restarts your app (happens frequently on free tier), all files are lost
- The database still has the `fileUrl` reference, but the actual file is gone
- Result: "No route" or 404 error

## Solutions

### ⭐ RECOMMENDED: Use Cloud Storage (Permanent Fix)

Use a cloud storage service to persist files:

#### Option 1: Cloudinary (Easiest, Free Tier Available)
1. Sign up at https://cloudinary.com (free tier: 25GB storage)
2. Install cloudinary package:
   ```bash
   cd backend
   npm install cloudinary multer-storage-cloudinary
   ```
3. Update `backend/.env`:
   ```env
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   ```
4. Update `backend/routes/upload.js`:
   ```javascript
   const cloudinary = require('cloudinary').v2;
   const { CloudinaryStorage } = require('multer-storage-cloudinary');

   cloudinary.config({
     cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
     api_key: process.env.CLOUDINARY_API_KEY,
     api_secret: process.env.CLOUDINARY_API_SECRET
   });

   const storage = new CloudinaryStorage({
     cloudinary: cloudinary,
     params: {
       folder: 'conference-papers',
       allowed_formats: ['pdf', 'doc', 'docx'],
       resource_type: 'raw' // For non-image files
     }
   });

   // Rest of the code remains the same
   ```

#### Option 2: AWS S3
Similar setup but requires AWS account and S3 bucket configuration.

#### Option 3: MongoDB GridFS (For Small Files)
Store files directly in MongoDB (not recommended for large files).

### 🔧 TEMPORARY: Test Locally

To test if the URLs work correctly:

1. Run backend locally:
   ```bash
   cd backend
   npm start
   ```

2. Upload a file through the UI

3. Try accessing: `http://localhost:5000/uploads/paper-xxx.pdf`

4. If it works locally, the issue is definitely Render's ephemeral storage

### 🚀 IMMEDIATE: Update Render Configuration

While you implement cloud storage, you can try this (limited success):

1. Add a `render.yaml` to project root:
   ```yaml
   services:
     - type: web
       name: cms-backend
       env: node
       buildCommand: npm install
       startCommand: npm start
       envVars:
         - key: NODE_ENV
           value: production
       disk:
         name: uploads-disk
         mountPath: /opt/render/project/src/uploads
         sizeGB: 1
   ```

2. Note: This adds persistent disk storage but costs $7/month on Render

## Recommended Action Plan

### Step 1: Quick Test (5 minutes)
Run backend locally and test file upload/download to confirm URLs work correctly.

### Step 2: Implement Cloudinary (30 minutes)
1. Sign up for Cloudinary free tier
2. Update upload.js to use Cloudinary storage
3. Add environment variables to Render dashboard
4. Redeploy backend
5. Test file upload/download

### Step 3: Update Frontend (if needed)
The frontend code is already correct and will work automatically once backend returns proper URLs from Cloudinary.

## Files Using File URLs (Already Correct)

1. `frontend/src/pages/Reviewer/ReviewPaper.js` (lines 34, 308, 431, 438)
2. `frontend/src/pages/Author/SubmissionDetails.js` (lines 100-108)
3. `frontend/src/pages/Organizer/ViewSubmissions.js` (lines 189-195)
4. `frontend/src/pages/Reviewer/BrowseConferences.js` (line 19, 158, 166)

**No changes needed** - these will work once backend serves files correctly.

## Testing Checklist

After implementing Cloudinary:
- [ ] Upload a paper submission
- [ ] View paper in browser (PDF preview)
- [ ] Download paper
- [ ] Wait 24 hours and test again (verify persistence)
- [ ] Restart Render app and test again

## Additional Notes

### Why Local Uploads Don't Work on Render
```
Your App Container (Ephemeral)
├── /app (code - persistent)
├── /uploads (files - DELETED ON RESTART)
└── /node_modules (dependencies - persistent)
```

### Why Cloudinary Works
```
Cloudinary Cloud Storage (Persistent)
├── /conference-papers/paper-123.pdf
├── /conference-papers/paper-456.pdf
└── Public URLs accessible from anywhere
```

## Environment Variables Needed

Add to Render.com dashboard → Environment:
```
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
```

## Cost Comparison

| Solution | Storage | Cost | Persistence |
|----------|---------|------|-------------|
| Local uploads (current) | Ephemeral | Free | ❌ Lost on restart |
| Render Disk | 1GB | $7/month | ✅ Persistent |
| Cloudinary Free | 25GB | Free | ✅ Persistent |
| AWS S3 | Pay-as-go | ~$0.023/GB/month | ✅ Persistent |

**Recommendation: Use Cloudinary free tier for now, upgrade to paid plan later if needed.**
