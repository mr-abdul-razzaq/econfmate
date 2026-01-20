import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Toast from './components/Toast';

// Pages
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ContactUs from './pages/ContactUs';
import OrcidCallback from './pages/OrcidCallback';
import GoogleCallback from './pages/GoogleCallback';
import Profile from './pages/Profile';

// Organizer Pages
import OrganizerDashboard from './pages/Organizer/Dashboard';
import CreateConference from './pages/Organizer/CreateConference';
import ManageConference from './pages/Organizer/ManageConference';
import ViewSubmissions from './pages/Organizer/ViewSubmissions';
import ManageBids from './pages/Organizer/ManageBids';
import ManageAssignments from './pages/Organizer/ManageAssignments';

// Author Pages
import AuthorDashboard from './pages/Author/Dashboard';
import DiscoverConferences from './pages/Author/DiscoverConferences';
import ConferenceDetails from './pages/Author/ConferenceDetails';
import SubmitPaper from './pages/Author/SubmitPaper';
import MySubmissions from './pages/Author/MySubmissions';
import SubmissionDetails from './pages/Author/SubmissionDetails';

// Reviewer Pages
import ReviewerDashboard from './pages/Reviewer/Dashboard';
import ActiveConferences from './pages/Reviewer/ActiveConferences';
import ConferenceSubmissions from './pages/Reviewer/ConferenceSubmissions';
import MyAssignedPapers from './pages/Reviewer/BrowseConferences';
import BidSubmissions from './pages/Reviewer/BidSubmissions';
import ReviewPaper from './pages/Reviewer/ReviewPaper';
import MyReviews from './pages/Reviewer/MyReviews';
import MyAssignments from './pages/Reviewer/MyAssignments';

// Participant Pages
import ParticipantDashboard from './pages/Participant/Dashboard';
import BrowseEvents from './pages/Participant/BrowseEvents';
import EventDetails from './pages/Participant/EventDetails';
import MyCertificates from './pages/Participant/MyCertificates';
import MyRegistrations from './pages/Participant/MyRegistrations';
import RegisterForConference from './pages/Participant/RegisterForConference';

// Organizer Participants
import OrganizerParticipants from './pages/Organizer/Participants';

function App() {
  return (
    <Router>
      <AuthProvider>
        <ToastProvider>
          <Toast />
          <div className="min-h-screen bg-gray-50">
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/contact" element={<ContactUs />} />
              <Route path="/auth/orcid/callback" element={<OrcidCallback />} />
              <Route path="/auth/google/callback" element={<GoogleCallback />} />

              {/* Profile Route (All Roles) */}
              <Route
                path="/profile"
                element={
                  <ProtectedRoute allowedRoles={['organizer', 'author', 'reviewer', 'participant']}>
                    <Profile />
                  </ProtectedRoute>
                }
              />

              {/* Organizer Routes */}
              <Route
                path="/organizer/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <OrganizerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/create-conference"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <CreateConference />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/manage-conference/:id"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <ManageConference />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/submissions/:id"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <ViewSubmissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/participants"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <OrganizerParticipants />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/conferences/:conferenceId/bids"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <ManageBids />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/conferences/:conferenceId/assignments"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <ManageAssignments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/organizer/conference/:conferenceId"
                element={
                  <ProtectedRoute allowedRoles={['organizer']}>
                    <ManageConference />
                  </ProtectedRoute>
                }
              />

              {/* Author Routes */}
              <Route
                path="/author/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <AuthorDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/author/discover"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <DiscoverConferences />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/author/conference/:id"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <ConferenceDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/author/submit/:conferenceId"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <SubmitPaper />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/author/submissions"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <MySubmissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/author/submissions/:id"
                element={
                  <ProtectedRoute allowedRoles={['author']}>
                    <SubmissionDetails />
                  </ProtectedRoute>
                }
              />

              {/* Reviewer Routes */}
              <Route
                path="/reviewer/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ReviewerDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/browse-conferences"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ActiveConferences />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/conferences/:id/submissions"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ConferenceSubmissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/assigned-papers"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <MyAssignedPapers />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/conferences"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ActiveConferences />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/conference/:id/submissions"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <BidSubmissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/submission/:id/review"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ReviewPaper />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/review/:id"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <ReviewPaper />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/reviews"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <MyReviews />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/bids"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <BidSubmissions />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/reviewer/assignments"
                element={
                  <ProtectedRoute allowedRoles={['reviewer']}>
                    <MyAssignments />
                  </ProtectedRoute>
                }
              />

              {/* Participant Routes */}
              <Route
                path="/participant/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <ParticipantDashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/participant/events"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <BrowseEvents />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/participant/registrations"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <MyRegistrations />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/participant/register/:id"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <RegisterForConference />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/participant/event/:id"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <EventDetails />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/participant/certificates"
                element={
                  <ProtectedRoute allowedRoles={['participant']}>
                    <MyCertificates />
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </ToastProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
