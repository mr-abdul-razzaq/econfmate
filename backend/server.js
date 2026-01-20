const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const { initializeScheduledTasks } = require('./utils/scheduledTasks');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Connect to MongoDB
connectDB();

// Initialize scheduled tasks (email reminders, digests)
initializeScheduledTasks();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static file serving for uploads
app.use('/uploads', express.static('uploads'));

// routers
const authRouter = require('./routes/auth');
const authorRouter = require('./routes/author');
const reviewerRouter = require('./routes/reviewer');
const organizerRouter = require('./routes/organizer');
const participantRouter = require('./routes/participant');
const tracksRouter = require('./routes/tracks'); // NEW
const uploadRouter = require('./routes/upload'); // File uploads

app.use('/api/auth', authRouter);
app.use('/api/author', authorRouter);
app.use('/api/reviewer', reviewerRouter);
app.use('/api/organizer', organizerRouter);
app.use('/api/participant', participantRouter);
app.use('/api/tracks', tracksRouter);
app.use('/api/upload', uploadRouter);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
