import axios from 'axios';

const getBaseUrl = () => {
  if (typeof window !== 'undefined' && window.location) {
    return process.env.REACT_APP_API_URL || `http://${window.location.hostname}:5000/api`;
  }
  return process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
};

const axiosInstance = axios.create({
  baseURL: getBaseUrl(),
});

// Helper to add auth headers
export const authHeaders = (token) => ({
  Authorization: `Bearer ${token}`,
});

// Helper to set global auth token
export const setAuthToken = (token) => {
  if (token) {
    axiosInstance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axiosInstance.defaults.headers.common['Authorization'];
  }
};

// ============ AUTHENTICATION APIs ============

export const registerUser = async (data) => {
  const res = await axiosInstance.post('/auth/register', data);
  return res.data;
};

export const loginUser = async (email, password) => {
  const res = await axiosInstance.post('/auth/login', { email, password });
  return res.data;
};

// ============ FILE UPLOAD APIs ============

export const uploadPaper = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await axiosInstance.post('/upload/paper', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return res.data;
};

// ============ USER PROFILE APIs ============

/**
 * Get current user profile
 * @returns {Promise} User profile data
 */
export const getUserProfile = async () => {
  const res = await axiosInstance.get('/auth/me');
  return res.data.data || res.data;
};

/**
 * Update user profile
 * @param {Object} data - Updated profile data
 * @returns {Promise} Updated user data
 */
export const updateUserProfile = async (data) => {
  const res = await axiosInstance.put('/auth/profile', data);
  return res.data.data || res.data;
};

// ============ TRACK APIs ============

export const getTracks = async (conferenceId, token) => {
  // Try endpoints in order: author -> organizer -> reviewer
  try {
    const res = await axiosInstance.get(`/author/conferences/${conferenceId}/tracks`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 403 || err.response?.status === 404) {
      try {
        const res = await axiosInstance.get(`/tracks/conference/${conferenceId}`);
        return res.data;
      } catch (err2) {
        // Try reviewer endpoint
        if (err2.response?.status === 403 || err2.response?.status === 404) {
          try {
            const res = await axiosInstance.get(`/reviewer/conferences/${conferenceId}/tracks`);
            return res.data;
          } catch (err3) {
            return { data: [] };
          }
        }
        return { data: [] };
      }
    }
    return { data: [] };
  }
};

export const createTrack = async (conferenceId, trackData) => {
  const res = await axiosInstance.post('/tracks', {
    conferenceId,
    ...trackData,
  });
  return res.data;
};

export const updateTrack = async (trackId, updates) => {
  const res = await axiosInstance.put(`/tracks/${trackId}`, updates);
  return res.data;
};

export const deleteTrack = async (trackId) => {
  const res = await axiosInstance.delete(`/tracks/${trackId}`);
  return res.data;
};

// ============ AUTHOR APIs ============

export const getAuthorDashboard = async () => {
  const res = await axiosInstance.get('/author/dashboard');
  return res.data;
};

export const discoverConferences = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/author/conferences?${params}`);
  return res.data;
};

export const getConferenceDetailsAuthor = async (conferenceId) => {
  const res = await axiosInstance.get(`/author/conferences/${conferenceId}`);
  return res.data;
};

export const submitPaper = async (conferenceId, submissionData) => {
  const res = await axiosInstance.post(
    `/author/conferences/${conferenceId}/submissions`,
    submissionData
  );
  return res.data;
};

export const getAuthorSubmissions = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/author/submissions?${params}`);
  return res.data;
};

export const getSubmissionDetailsAuthor = async (submissionId) => {
  const res = await axiosInstance.get(`/author/submissions/${submissionId}`);
  return res.data;
};

export const uploadRevision = async (submissionId, revisionData) => {
  const res = await axiosInstance.put(
    `/author/submissions/${submissionId}/revision`,
    revisionData
  );
  return res.data;
};

// ============ REVIEWER APIs ============

export const getReviewerDashboard = async () => {
  const bids = await getReviewerBids();
  const reviews = await getReviewerReviews();
  return { data: { bids, reviews } };
};

export const placeBid = async (submissionId, confidence) => {
  const res = await axiosInstance.post('/reviewer/bids', {
    submissionId,
    ...(confidence && { confidence }),
  });
  return res.data;
};

export const getReviewerBids = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/reviewer/bids?${params}`);
  return res.data;
};

export const withdrawBid = async (bidId) => {
  const res = await axiosInstance.delete(`/reviewer/bids/${bidId}`);
  return res.data;
};

export const getReviewerAssignments = async () => {
  const res = await axiosInstance.get('/reviewer/assignments');
  return res.data;
};

export const createReview = async (submissionId, reviewData) => {
  const res = await axiosInstance.post(
    `/reviewer/submissions/${submissionId}/reviews`,
    reviewData
  );
  return res.data;
};

export const getSubmissionForReview = async (submissionId) => {
  const res = await axiosInstance.get(`/reviewer/submissions/${submissionId}`);
  return res.data;
};

export const getReviewerReviews = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/reviewer/reviews?${params}`);
  return res.data;
};

export const getSubmissionReviewsReviewer = async (submissionId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(
    `/reviewer/submissions/${submissionId}/reviews?${params}`
  );
  return res.data;
};

export const getReviewerMyReview = async (submissionId) => {
  const res = await axiosInstance.get(`/reviewer/submissions/${submissionId}/my-review`);
  return res.data;
};

export const getConferencesForReviewer = async (filters = {}) => {
  return discoverConferences(filters);
};

export const getConferenceSubmissionsReviewer = async (conferenceId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(
    `/reviewer/conferences/${conferenceId}/submissions?${params}`
  );
  return res.data;
};

// ============ ORGANIZER APIs ============

export const getOrganizerDashboard = async () => {
  const res = await axiosInstance.get('/organizer/conferences');
  return res.data;
};

export const getConferenceDetailsOrganizer = async (conferenceId) => {
  const res = await axiosInstance.get(`/organizer/conferences/${conferenceId}`);
  return res.data;
};

export const createConference = async (conferenceData) => {
  const res = await axiosInstance.post('/organizer/conferences', conferenceData);
  return res.data;
};

export const updateConference = async (conferenceId, updateData) => {
  const res = await axiosInstance.put(`/organizer/conferences/${conferenceId}`, updateData);
  return res.data;
};

export const getConferenceSubmissionsOrganizer = async (conferenceId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(
    `/organizer/conferences/${conferenceId}/submissions?${params}`
  );
  return res.data;
};

export const makeSubmissionDecision = async (submissionId, decision, feedback) => {
  const res = await axiosInstance.patch(
    `/organizer/submission/${submissionId}/decision`,
    { decision, feedback }
  );
  return res.data;
};

export const approveSubmission = async (submissionId) => {
  const res = await axiosInstance.put(`/organizer/submissions/${submissionId}/approve`);
  return res.data;
};

export const updateSubmissionStatus = async (submissionId, status, feedback) => {
  const res = await axiosInstance.put(`/organizer/submissions/${submissionId}/status`, {
    status,
    feedback,
  });
  return res.data;
};

export const scheduleSubmission = async (submissionId, scheduleData) => {
  const res = await axiosInstance.put(
    `/organizer/submissions/${submissionId}/schedule`,
    scheduleData
  );
  return res.data;
};

export const getSubmissionDetailsOrganizer = async (submissionId) => {
  const res = await axiosInstance.get(`/organizer/submissions/${submissionId}`);
  return res.data;
};

export const getSubmissionReviewsOrganizer = async (submissionId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(
    `/organizer/submissions/${submissionId}/reviews?${params}`
  );
  return res.data;
};

export const getOrganizerReviews = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/organizer/reviews?${params}`);
  return res.data;
};

export const getConferenceReviews = async (conferenceId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(
    `/organizer/conferences/${conferenceId}/reviews?${params}`
  );
  return res.data;
};

export const generateCertificates = async (conferenceId) => {
  const res = await axiosInstance.post(`/organizer/conferences/${conferenceId}/certificates`);
  return res.data;
};

export const markAttendance = async (registrationId, attended) => {
  const res = await axiosInstance.put(`/organizer/registrations/${registrationId}/attendance`, {
    attended,
  });
  return res.data;
};

export const getConferenceParticipants = async (conferenceId) => {
  const res = await axiosInstance.get(`/organizer/conferences/${conferenceId}/participants`);
  return res.data;
};

// ============ ORGANIZER BID MANAGEMENT APIs ============

export const getOrganizerBids = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/organizer/bids?${params}`);
  return res.data;
};

export const getConferenceBids = async (conferenceId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/organizer/conferences/${conferenceId}/bids?${params}`);
  return res.data;
};

export const updateBidStatus = async (bidId, status, reason = '') => {
  const res = await axiosInstance.patch(`/organizer/bids/${bidId}`, { status, reason });
  return res.data;
};

export const bulkUpdateBids = async (bidIds, status, reason = '') => {
  const res = await axiosInstance.post('/organizer/bids/bulk-update', { bidIds, status, reason });
  return res.data;
};

// ============ ORGANIZER ASSIGNMENT APIs ============

export const getConferenceAssignments = async (conferenceId, filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await axiosInstance.get(`/organizer/conferences/${conferenceId}/assignments?${params}`);
  return res.data;
};

export const runAutoAssign = async (conferenceId, config = {}) => {
  const res = await axiosInstance.post(`/organizer/conferences/${conferenceId}/auto-assign`, config);
  return res.data;
};

export const createManualAssignment = async (reviewerId, submissionId, notes = '') => {
  const res = await axiosInstance.post('/organizer/assignments', { reviewerId, submissionId, notes });
  return res.data;
};

export const updateAssignment = async (assignmentId, updates) => {
  const res = await axiosInstance.put(`/organizer/assignments/${assignmentId}`, updates);
  return res.data;
};

export const deleteAssignment = async (assignmentId) => {
  const res = await axiosInstance.delete(`/organizer/assignments/${assignmentId}`);
  return res.data;
};

// ============ PARTICIPANT APIs ============

export const getParticipantDashboard = async () => {
  const res = await axiosInstance.get('/participant/dashboard');
  return res.data;
};

export const getConferencesParticipant = async (filters = {}) => {
  return discoverConferences(filters);
};

export const getConferenceDetailsParticipant = async (conferenceId) => {
  const res = await axiosInstance.get(`/participant/conferences/${conferenceId}`);
  return res.data;
};

export const registerForConference = async (conferenceId) => {
  const res = await axiosInstance.post('/participant/registrations', { conferenceId });
  return res.data;
};

export const getParticipantRegistrations = async () => {
  const res = await axiosInstance.get('/participant/registrations');
  return res.data;
};

export const getParticipantCertificates = async () => {
  const res = await axiosInstance.get('/participant/certificates');
  return res.data;
};

// ============ DEFAULT EXPORT (for legacy support) ============

export default axiosInstance;
