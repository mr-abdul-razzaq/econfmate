import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Select from '../../components/Select';
import Textarea from '../../components/Textarea';
import Input from '../../components/Input';
import {
  getConferenceSubmissionsOrganizer,
  getTracks,
  makeSubmissionDecision,
  getSubmissionReviewsOrganizer,
  scheduleSubmission,
  approveSubmission,
  getConferenceDetailsOrganizer,
  retryDuplicationCheck
} from '../../utils/api';
import { viewPdfInNewTab, downloadPdfFile, extractFilename } from '../../utils/pdfHelper';

const ViewSubmissions = () => {
  const { id: conferenceId } = useParams();
  const navigate = useNavigate();

  const [conference, setConference] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [trackFilter, setTrackFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Detail modal
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [submissionReviews, setSubmissionReviews] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Decision form
  const [decision, setDecision] = useState('');
  const [feedback, setFeedback] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  const [retryingDupCheck, setRetryingDupCheck] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [confRes, subsRes, tracksRes] = await Promise.all([
        getConferenceDetailsOrganizer(conferenceId),
        getConferenceSubmissionsOrganizer(conferenceId, {
          trackId: trackFilter || undefined,
          status: statusFilter || undefined
        }),
        getTracks(conferenceId)
      ]);

      setConference(confRes.data || confRes);
      setSubmissions(subsRes.data || subsRes || []);
      setTracks(tracksRes.data || tracksRes || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [conferenceId, trackFilter, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openSubmissionDetails = async (submission) => {
    setSelectedSubmission(submission);
    // Pre-fill decision based on submission status
    setDecision(submission.status || '');
    setFeedback(submission.feedback || '');
    setScheduleDate(submission.scheduleDate ? submission.scheduleDate.split('T')[0] : '');
    setScheduleTime(submission.scheduleTime || '');

    try {
      setLoadingDetails(true);
      const reviewsRes = await getSubmissionReviewsOrganizer(submission._id);
      setSubmissionReviews(reviewsRes.data?.reviews || reviewsRes.data || reviewsRes || []);
    } catch (err) {
      console.error('Error fetching reviews:', err);
      setSubmissionReviews([]);
    } finally {
      setLoadingDetails(false);
    }
  };

  const closeModal = () => {
    setSelectedSubmission(null);
    setSubmissionReviews([]);
    setDecision('');
    setFeedback('');
    setScheduleDate('');
    setScheduleTime('');
  };

  const handleDecision = async () => {
    if (!decision) {
      setError('Please select a decision');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      await makeSubmissionDecision(selectedSubmission._id, decision, feedback);

      // If accepted and schedule provided, update schedule
      if (decision === 'accepted' && scheduleDate) {
        await scheduleSubmission(selectedSubmission._id, {
          date: scheduleDate,
          time: scheduleTime
        });
      }

      await fetchData();
      closeModal();
    } catch (err) {
      console.error('Error making decision:', err);
      setError(err.response?.data?.message || 'Failed to save decision');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveForReview = async (e, submissionId) => {
    e.stopPropagation(); // Prevent card click
    try {
      setApprovingId(submissionId);
      await approveSubmission(submissionId);
      await fetchData(); // Refresh list
    } catch (err) {
      console.error('Error approving submission:', err);
      setError(err.response?.data?.message || 'Failed to approve submission');
    } finally {
      setApprovingId(null);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      pending: 'warning',
      submitted_pending_dup_check: 'warning',
      submitted_dup_ok: 'info',
      submitted_dup_suspect: 'danger',
      under_review: 'info',
      accepted: 'success',
      rejected: 'danger',
      rejected_duplicate: 'danger',
      revision: 'default',
      manual_review_required: 'warning'
    };
    const statusLabels = {
      submitted_pending_dup_check: 'DUP CHECK PENDING',
      submitted_dup_ok: 'ORIGINAL',
      submitted_dup_suspect: 'FLAGGED',
      rejected_duplicate: 'REJECTED (DUPLICATE)',
      manual_review_required: 'MANUAL REVIEW'
    };
    const label = statusLabels[status] || status?.replace(/_/g, ' ')?.toUpperCase() || 'PENDING';
    return <Badge variant={variants[status] || 'default'}>{label}</Badge>;
  };

  const getDupBadge = (dupCheck) => {
    if (!dupCheck || !dupCheck.status) return null;
    const config = {
      pending: { color: 'bg-gray-100 text-gray-700 border-gray-300', icon: '⏳', label: 'Checking...' },
      clean: { color: 'bg-green-100 text-green-800 border-green-300', icon: '✅', label: 'Original' },
      suspected_duplicate: { color: 'bg-amber-100 text-amber-800 border-amber-300', icon: '⚠️', label: `Suspect (${dupCheck.similarityScore}%)` },
      verified_duplicate: { color: 'bg-red-100 text-red-800 border-red-300', icon: '🔴', label: `Duplicate (${dupCheck.similarityScore}%)` },
      error: { color: 'bg-gray-100 text-gray-600 border-gray-300', icon: '❌', label: 'Check Failed' }
    };
    const c = config[dupCheck.status] || config.pending;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${c.color}`}>
        {c.icon} {c.label}
      </span>
    );
  };

  const handleRetryDupCheck = async (e, submissionId) => {
    e.stopPropagation();
    try {
      setRetryingDupCheck(submissionId);
      await retryDuplicationCheck(submissionId);
      // Wait a moment for the async check to update
      setTimeout(() => fetchData(), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to retry duplication check');
    } finally {
      setRetryingDupCheck(null);
    }
  };

  const getRecommendationBadge = (rec) => {
    const variants = {
      ACCEPT: 'success',
      REJECT: 'danger',
      MINOR_REVISION: 'warning',
      MAJOR_REVISION: 'default'
    };
    return <Badge variant={variants[rec] || 'info'}>{rec?.replace('_', ' ')}</Badge>;
  };

  const calculateAverageScore = (reviews) => {
    if (!reviews || reviews.length === 0) return 'N/A';
    const avg = reviews.reduce((sum, r) => sum + (r.score || 0), 0) / reviews.length;
    return avg.toFixed(1);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // PDF helper functions imported from utils/pdfHelper

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading submissions..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate(`/organizer/manage-conference/${conferenceId}`)}>
            ← Back to Conference
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Manage Submissions</h1>
            {conference && (
              <>
                <p className="text-lg font-semibold text-gray-800 mt-2">{conference.name}</p>
                <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                  {conference.startDate && conference.endDate && (
                    <span className="flex items-center gap-1">
                      📅 {new Date(conference.startDate).toLocaleDateString()} - {new Date(conference.endDate).toLocaleDateString()}
                    </span>
                  )}
                  {conference.location && (
                    <span className="flex items-center gap-1">
                      📍 {conference.location}
                    </span>
                  )}
                </div>
              </>
            )}
            <p className="text-gray-600 mt-1">Review and make decisions on paper submissions</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{submissions.length}</p>
            <p className="text-sm text-gray-600">Total Submissions</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div className="w-48">
            <Select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
              <option value="">All Tracks</option>
              {tracks.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </Select>
          </div>
          <div className="w-48">
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              <option value="submitted_pending_dup_check">Dup Check Pending</option>
              <option value="submitted_dup_ok">Original</option>
              <option value="submitted_dup_suspect">Flagged (Suspect)</option>
              <option value="under_review">Under Review</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
              <option value="rejected_duplicate">Rejected (Duplicate)</option>
            </Select>
          </div>
        </div>

        {/* Submissions Grid */}
        {submissions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Submissions</h3>
            <p className="text-gray-600">No submissions match your filters</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card
                key={submission._id}
                hoverable
                onClick={() => openSubmissionDetails(submission)}
                className="cursor-pointer"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    {/* Track Label - displayed above title */}
                    {submission.trackId?.name && (
                      <div className="mb-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-md text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                          📁 Track: {submission.trackId.name}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-bold text-gray-900 line-clamp-1">
                        {submission.title}
                      </h3>
                      {getStatusBadge(submission.status)}
                      {getDupBadge(submission.duplicationCheck)}
                      {submission.organizerApproved && (
                        <Badge variant="success">✓ Approved for Review</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-2">
                      <span>
                        <span className="font-medium">Author:</span>{' '}
                        {submission.authorId?.name || 'Unknown'}
                      </span>
                      <span>
                        <span className="font-medium">Submitted:</span>{' '}
                        {formatDate(submission.createdAt || submission.submittedAt)}
                      </span>
                    </div>
                    {submission.abstract && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {submission.abstract}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 ml-4">
                    {!submission.organizerApproved && ['submitted', 'submitted_dup_ok', 'submitted_dup_suspect'].includes(submission.status) && (
                      <Button
                        variant="success"
                        size="sm"
                        onClick={(e) => handleApproveForReview(e, submission._id)}
                        disabled={approvingId === submission._id}
                      >
                        {approvingId === submission._id ? 'Approving...' : '✓ Approve for Review'}
                      </Button>
                    )}
                    {submission.duplicationCheck?.status === 'error' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => handleRetryDupCheck(e, submission._id)}
                        disabled={retryingDupCheck === submission._id}
                      >
                        {retryingDupCheck === submission._id ? 'Retrying...' : '🔄 Retry Check'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submission Detail Modal */}
      {selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-start">
              <div className="flex-1 pr-4">
                <h2 className="text-xl font-bold text-gray-900 mb-2">
                  {selectedSubmission.title}
                </h2>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedSubmission.status)}
                  {selectedSubmission.trackId?.name && (
                    <Badge variant="default">{selectedSubmission.trackId.name}</Badge>
                  )}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {/* Submission Info */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-900 mb-3">Submission Details</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <p><span className="font-medium">Author:</span> {selectedSubmission.authorId?.name} ({selectedSubmission.authorId?.email})</p>
                  <p><span className="font-medium">Submitted:</span> {formatDate(selectedSubmission.createdAt)}</p>
                  {selectedSubmission.abstract && (
                    <div>
                      <span className="font-medium">Abstract:</span>
                      <p className="mt-1 text-gray-700">{selectedSubmission.abstract}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Paper File Download */}
              {selectedSubmission.fileUrl && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">Submitted Paper</h3>
                  <div className="bg-blue-50 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">File:</span>{' '}
                        {selectedSubmission.fileUrl.split('/').pop()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => viewPdfInNewTab(selectedSubmission.fileUrl)}
                        className="hidden px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition"
                      >
                        📄 View Paper
                      </button>
                      <button
                        onClick={() => downloadPdfFile(selectedSubmission.fileUrl, extractFilename(selectedSubmission.fileUrl, selectedSubmission.title))}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition"
                      >
                        ⬇️ Download
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Duplication Analysis Section */}
              {selectedSubmission.duplicationCheck && selectedSubmission.duplicationCheck.status && (
                <div className="mb-6">
                  <h3 className="font-semibold text-gray-900 mb-3">Duplication Analysis</h3>
                  <div className={`rounded-lg p-4 border-2 ${
                    selectedSubmission.duplicationCheck.status === 'clean' ? 'bg-green-50 border-green-200' :
                    selectedSubmission.duplicationCheck.status === 'verified_duplicate' ? 'bg-red-50 border-red-200' :
                    selectedSubmission.duplicationCheck.status === 'suspected_duplicate' ? 'bg-amber-50 border-amber-200' :
                    'bg-gray-50 border-gray-200'
                  }`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {getDupBadge(selectedSubmission.duplicationCheck)}
                      </div>
                      {selectedSubmission.duplicationCheck.checkedAt && (
                        <span className="text-xs text-gray-500">
                          Checked: {formatDate(selectedSubmission.duplicationCheck.checkedAt)}
                        </span>
                      )}
                    </div>
                    {selectedSubmission.duplicationCheck.similarityScore != null && (
                      <div className="mb-3">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-medium">Similarity Score</span>
                          <span className="font-bold">{selectedSubmission.duplicationCheck.similarityScore}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5">
                          <div
                            className={`h-2.5 rounded-full transition-all ${
                              selectedSubmission.duplicationCheck.similarityScore >= 90 ? 'bg-red-500' :
                              selectedSubmission.duplicationCheck.similarityScore >= 75 ? 'bg-amber-500' :
                              'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(selectedSubmission.duplicationCheck.similarityScore, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {selectedSubmission.duplicationCheck.matchedPaperId && (
                      <p className="text-sm mb-2">
                        <span className="font-medium">Matched Reference:</span>{' '}
                        <code className="bg-gray-200 px-1 rounded text-xs">{selectedSubmission.duplicationCheck.matchedPaperId}</code>
                      </p>
                    )}
                    {selectedSubmission.duplicationCheck.message && (
                      <p className="text-sm text-gray-700">{selectedSubmission.duplicationCheck.message}</p>
                    )}
                    {selectedSubmission.duplicationCheck.status === 'error' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => handleRetryDupCheck(e, selectedSubmission._id)}
                        disabled={retryingDupCheck === selectedSubmission._id}
                        className="mt-2"
                      >
                        {retryingDupCheck === selectedSubmission._id ? 'Retrying...' : '🔄 Retry Duplication Check'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Reviews Section */}
              <div className="mb-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 mb-3">
                  <h3 className="font-semibold text-gray-900">Reviews</h3>
                  <div className="text-sm">
                    <span className="font-medium">Average Score:</span>{' '}
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-bold">
                      {calculateAverageScore(submissionReviews)}/10
                    </span>
                  </div>
                </div>

                {loadingDetails ? (
                  <div className="text-center py-4 text-gray-600">Loading reviews...</div>
                ) : submissionReviews.length === 0 ? (
                  <div className="text-center py-4 bg-gray-50 rounded-lg text-gray-600">
                    No reviews yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {submissionReviews.map((review, index) => (
                      <div key={review._id || index} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-sm text-gray-600">
                            Reviewer {index + 1}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 text-sm rounded">
                              Score: {review.score}/10
                            </span>
                            {getRecommendationBadge(review.recommendation)}
                          </div>
                        </div>
                        {review.comments && (
                          <p className="text-sm text-gray-700 mt-2">{review.comments}</p>
                        )}
                        {review.confidentialComments && (
                          <div className="mt-2 p-2 bg-purple-50 rounded text-sm">
                            <span className="font-medium text-purple-800">Confidential:</span>{' '}
                            <span className="text-purple-700 italic">{review.confidentialComments}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Decision Form */}
              <div className="border-t pt-6">
                <h3 className="font-semibold text-gray-900 mb-4">Make Decision</h3>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  {[
                    { value: 'accepted', label: '✓ Accept', color: 'border-green-600 bg-green-50' },
                    { value: 'rejected', label: '✗ Reject', color: 'border-red-600 bg-red-50' },
                    { value: 'rejected_duplicate', label: '🔴 Reject Duplicate', color: 'border-red-800 bg-red-100' },
                    { value: 'under_review', label: '🔍 Under Review', color: 'border-blue-600 bg-blue-50' }
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDecision(opt.value)}
                      disabled={['accepted', 'rejected', 'rejected_duplicate'].includes(selectedSubmission.status)}
                      className={`p-3 rounded-lg border-2 text-center transition-all ${decision === opt.value
                        ? opt.color + ' border-2'
                        : 'border-gray-200 hover:border-gray-300'
                        } ${['accepted', 'rejected', 'rejected_duplicate'].includes(selectedSubmission.status)
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                        }`}
                    >
                      <span className="font-medium text-sm">{opt.label}</span>
                    </button>
                  ))}
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Feedback to Author
                  </label>
                  <Textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Provide feedback for the author..."
                    rows={3}
                    disabled={['accepted', 'rejected', 'rejected_duplicate'].includes(selectedSubmission.status)}
                  />
                </div>

                {decision === 'accepted' && (
                  <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-green-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Presentation Date
                      </label>
                      <Input
                        type="date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                        disabled={selectedSubmission.status === 'accepted' || selectedSubmission.status === 'rejected'}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Time Slot
                      </label>
                      <Input
                        type="time"
                        value={scheduleTime}
                        onChange={(e) => setScheduleTime(e.target.value)}
                        disabled={selectedSubmission.status === 'accepted' || selectedSubmission.status === 'rejected'}
                      />
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleDecision}
                    disabled={saving || !decision || ['accepted', 'rejected', 'rejected_duplicate'].includes(selectedSubmission.status)}
                    fullWidth
                  >
                    {saving ? 'Saving...' : 'Save Decision'}
                  </Button>
                  <Button variant="outline" onClick={closeModal}>
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ViewSubmissions;
