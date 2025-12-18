import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const MySubmissions = () => {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    try {
      const response = await api.get('/author/submissions');
      setSubmissions(Array.isArray(response.data.data) ? response.data.data : response.data.data.submissions || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSubmissionDetails = async (submissionId) => {
    setDetailsLoading(true);
    try {
      const response = await api.get(`/author/submissions/${submissionId}`);
      setSelectedSubmission(response.data.data);
      setShowDetailsModal(true);
    } catch (error) {
      console.error('Error fetching submission details:', error);
      alert('Failed to load submission details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedSubmission(null);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusVariant = (status) => {
    const variants = {
      submitted: 'info',
      under_review: 'warning',
      review_completed: 'warning',
      accepted: 'success',
      rejected: 'danger',
      camera_ready_pending: 'warning',
      final_submitted: 'success'
    };
    return variants[status] || 'default';
  };

  const getStatusLabel = (status) => {
    const labels = {
      submitted: 'Submitted',
      under_review: 'Under Review',
      review_completed: 'Review Completed',
      accepted: 'Accepted',
      rejected: 'Rejected',
      camera_ready_pending: 'Camera Ready Pending',
      final_submitted: 'Final Submitted'
    };
    return labels[status] || status;
  };

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
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Submissions</h1>
            <p className="text-gray-600 mt-1">Track all your paper submissions</p>
          </div>
          <Button onClick={() => navigate('/author/discover')}>
            + Submit New Paper
          </Button>
        </div>

        {submissions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Submissions Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Start submitting papers to conferences
            </p>
            <Button onClick={() => navigate('/author/discover')}>
              Discover Conferences
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card
                key={submission._id}
                hoverable
                onClick={() => fetchSubmissionDetails(submission._id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {submission.title}
                      </h3>
                      <Badge variant={getStatusVariant(submission.status)}>
                        {getStatusLabel(submission.status)}
                      </Badge>
                      {submission.majorityDecision && (
                        <div className="flex items-center">
                          {submission.majorityDecision === 'ACCEPTED' && (
                            <div className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded-full">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span className="text-sm font-semibold">Accepted</span>
                            </div>
                          )}
                          {submission.majorityDecision === 'REJECTED' && (
                            <div className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-800 rounded-full">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              <span className="text-sm font-semibold">Rejected</span>
                            </div>
                          )}
                          {submission.majorityDecision === 'NEEDS_REVISION' && (
                            <div className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                              </svg>
                              <span className="text-sm font-semibold">Needs Revision</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <p className="text-gray-600 mb-3">
                      Conference: <span className="font-medium">{submission.conferenceId?.name}</span>
                    </p>

                    <p className="text-gray-700 text-sm line-clamp-2 mb-3">
                      {submission.abstract}
                    </p>

                    {/* Review Progress Bar */}
                    {(submission.status === 'under_review' || submission.status === 'review_completed') && (
                      <div className="mb-3">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium text-gray-700">Review Progress</span>
                          <span className="text-xs text-gray-600">{submission.progress || submission.reviewProgress?.percentage + '%'}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${submission.reviewProgress?.percentage || 0}%` }}
                          ></div>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-6 text-sm text-gray-600">
                      <div>
                        <span className="text-gray-500">Submitted:</span>{' '}
                        <span className="font-medium">{formatDate(submission.submittedAt || submission.createdAt)}</span>
                      </div>

                      {submission.reviewCount !== undefined && (
                        <div>
                          <span className="text-gray-500">Reviews:</span>{' '}
                          <span className="font-medium">{submission.reviewCount} / {submission.requiredReviews || 3}</span>
                        </div>
                      )}

                      {submission.status === 'accepted' && submission.presentationSlot && (
                        <div>
                          <span className="text-gray-500">Presentation:</span>{' '}
                          <span className="font-medium">
                            {formatDate(submission.presentationSlot.date)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchSubmissionDetails(submission._id);
                      }}
                    >
                      View Details
                    </Button>
                  </div>
                </div>

                {/* Reviews Section */}
                {submission.status !== 'under_review' && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm font-medium text-gray-900 mb-2">Reviewer Feedback</p>
                    <p className="text-sm text-gray-600">
                      Click "View Details" to see reviews and feedback
                    </p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Submission Details Modal */}
      {showDetailsModal && selectedSubmission && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">{selectedSubmission.title}</h2>
                <p className="text-gray-600 mt-1">
                  Conference: {selectedSubmission.conferenceId?.name}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {/* Status and Review Progress */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <Badge variant={getStatusVariant(selectedSubmission.status)}>
                    {getStatusLabel(selectedSubmission.status)}
                  </Badge>
                  {selectedSubmission.organizerApproved && (
                    <Badge variant="success">Organizer Approved</Badge>
                  )}
                </div>

                {/* Review Progress Bar */}
                {(selectedSubmission.status === 'under_review' || 
                  selectedSubmission.status === 'review_completed' ||
                  selectedSubmission.reviews?.length > 0) && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Review Progress</span>
                      <span className="text-sm text-gray-600">
                        {selectedSubmission.reviewProgress?.completed || 0} / {selectedSubmission.reviewProgress?.required || 3} reviews completed
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div 
                        className="bg-blue-600 h-2.5 rounded-full transition-all"
                        style={{ width: `${selectedSubmission.reviewProgress?.percentage || 0}%` }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Abstract */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Abstract</h3>
                <p className="text-gray-700 leading-relaxed">{selectedSubmission.abstract}</p>
              </div>

              {/* Theme */}
              {selectedSubmission.theme && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Theme</h3>
                  <p className="text-gray-700">{selectedSubmission.theme}</p>
                </div>
              )}

              {/* Document */}
              {selectedSubmission.fileUrl && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Document</h3>
                  <a
                    href={`http://localhost:5000${selectedSubmission.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    Download Paper (PDF)
                  </a>
                </div>
              )}

              {/* Assigned Reviewers */}
              {selectedSubmission.assignedReviewers?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Assigned Reviewers</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedSubmission.assignedReviewers.map((reviewer, idx) => (
                      <Badge key={idx} variant="info">
                        {reviewer.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Majority Voting Decision - Only shown when all reviews are complete */}
              {selectedSubmission.majorityDecision && (
                <div className="mb-6 p-6 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg border-2 border-gray-200">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      {selectedSubmission.majorityDecision === 'ACCEPTED' && (
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      {selectedSubmission.majorityDecision === 'REJECTED' && (
                        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      )}
                      {selectedSubmission.majorityDecision === 'NEEDS_REVISION' && (
                        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center">
                          <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-2xl font-bold text-gray-900">
                          {selectedSubmission.majorityDecision === 'ACCEPTED' && 'Paper Accepted'}
                          {selectedSubmission.majorityDecision === 'REJECTED' && 'Paper Rejected'}
                          {selectedSubmission.majorityDecision === 'NEEDS_REVISION' && 'Revisions Needed'}
                        </h3>
                        {selectedSubmission.averageScore && (
                          <Badge variant="info" className="text-lg px-3 py-1">
                            Average Score: {selectedSubmission.averageScore}/10
                          </Badge>
                        )}
                      </div>
                      <p className="text-gray-700 leading-relaxed">
                        {selectedSubmission.decisionReason}
                      </p>
                    </div>
                  </div>

                  {/* Vote Statistics */}
                  {selectedSubmission.voteBreakdown && (
                    <div className="mt-4 pt-4 border-t border-gray-300">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Vote Breakdown</h4>
                      <div className="flex flex-wrap gap-3">
                        {selectedSubmission.voteBreakdown.accept > 0 && (
                          <div className="px-4 py-2 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                            ✓ Accept: {selectedSubmission.voteBreakdown.accept}
                          </div>
                        )}
                        {selectedSubmission.voteBreakdown.reject > 0 && (
                          <div className="px-4 py-2 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                            ✗ Reject: {selectedSubmission.voteBreakdown.reject}
                          </div>
                        )}
                        {selectedSubmission.voteBreakdown.minorRevision > 0 && (
                          <div className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                            ⚠ Minor Revision: {selectedSubmission.voteBreakdown.minorRevision}
                          </div>
                        )}
                        {selectedSubmission.voteBreakdown.majorRevision > 0 && (
                          <div className="px-4 py-2 bg-orange-100 text-orange-800 rounded-full text-sm font-medium">
                            ⚠ Major Revision: {selectedSubmission.voteBreakdown.majorRevision}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Detailed Reviews */}
              {selectedSubmission.reviews?.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Reviewer Feedback ({selectedSubmission.reviews.length})
                  </h3>
                  
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {selectedSubmission.reviews.map((review, idx) => (
                      <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900">
                              {review.reviewerId?.name || 'Anonymous Reviewer'}
                            </span>
                            <Badge
                              variant={
                                review.recommendation === 'ACCEPT' ? 'success' :
                                review.recommendation === 'REJECT' ? 'danger' :
                                review.recommendation === 'MINOR_REVISION' ? 'warning' : 'default'
                              }
                            >
                              {review.recommendation?.replace('_', ' ')}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                              {review.score}/10
                            </span>
                          </div>
                        </div>

                        {review.comments && (
                          <div className="mt-3">
                            <p className="text-sm font-medium text-gray-700 mb-1">Feedback:</p>
                            <p className="text-gray-700 bg-gray-50 p-3 rounded leading-relaxed">
                              {review.comments}
                            </p>
                          </div>
                        )}

                        {review.submittedAt && (
                          <div className="mt-3 text-xs text-gray-500">
                            Submitted: {formatDate(review.submittedAt)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Reviews Yet */}
              {(!selectedSubmission.reviews || selectedSubmission.reviews.length === 0) && (
                <div className="text-center py-8 bg-gray-50 rounded-lg">
                  <div className="text-4xl mb-2">📝</div>
                  <p className="text-gray-600">No reviews submitted yet</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Reviews will appear here once reviewers submit their feedback
                  </p>
                </div>
              )}

              {/* Submission Info */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Submitted:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {formatDate(selectedSubmission.submittedAt || selectedSubmission.createdAt)}
                    </span>
                  </div>
                  {selectedSubmission.organizerApproved && selectedSubmission.approvedAt && (
                    <div>
                      <span className="text-gray-500">Approved:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {formatDate(selectedSubmission.approvedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t">
              <Button onClick={closeModal} variant="outline" className="w-full">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MySubmissions;
