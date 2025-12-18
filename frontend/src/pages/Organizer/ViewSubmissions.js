import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Select from '../../components/Select';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import Input from '../../components/Input';
import Textarea from '../../components/Textarea';
import api from '../../utils/api';

const ViewSubmissions = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [decision, setDecision] = useState('');
  const [feedback, setFeedback] = useState('');
  const [decidingId, setDecidingId] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');

  const API_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'http://localhost:5000';

  useEffect(() => {
    fetchSubmissions();
  }, [id]);

  const fetchSubmissions = async () => {
    try {
      const response = await api.get(`/organizer/conferences/${id}/submissions`);
      const data = Array.isArray(response.data.data) ? response.data.data : response.data.data.submissions || [];
      console.log('Fetched submissions with approval status:', data.map(s => ({ 
        id: s._id, 
        title: s.title, 
        organizerApproved: s.organizerApproved 
      })));
      setSubmissions(data);
    } catch (error) {
      console.error('Error fetching submissions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (submissionId) => {
    try {
      const response = await api.put(`/organizer/submissions/${submissionId}/approve`);
      console.log('Approval response:', response.data);
      setSubmissions(
        submissions.map((s) =>
          s._id === submissionId ? { ...s, organizerApproved: true, approvedAt: new Date() } : s
        )
      );
      alert('Submission approved successfully! Reviewers can now bid on this paper.');
      fetchSubmissions(); // Refresh to get updated data
    } catch (error) {
      console.error('Error approving submission:', error);
      console.error('Error details:', error.response?.data);
      alert(error.response?.data?.message || 'Failed to approve submission');
    }
  };

  const handleDecision = async () => {
    try {
      setDeciding(true);
      await api.put(`/organizer/submissions/${selectedSubmission._id}/status`, {
        status: decision,
        feedback: feedback
      });
      setSubmissions(
        submissions.map((s) =>
          s._id === selectedSubmission._id ? { ...s, status: decision } : s
        )
      );
      setShowModal(false);
      setDecision('');
      setFeedback('');
      alert('Decision submitted successfully!');
    } catch (error) {
      console.error('Error submitting decision:', error);
      alert('Failed to submit decision');
    } finally {
      setDeciding(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const variants = {
      submitted: 'info',
      under_review: 'warning',
      review_completed: 'warning',
      accepted: 'success',
      rejected: 'danger',
      camera_ready_pending: 'warning',
      final_submitted: 'success',
      presented: 'info'
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
      final_submitted: 'Final Submitted',
      presented: 'Presented'
    };
    return labels[status] || status;
  };

  const filteredSubmissions = submissions.filter((sub) => {
    if (filter === 'all') return true;
    return sub.status === filter;
  });

  const getFilterCount = (status) => {
    if (status === 'all') return submissions.length;
    return submissions.filter(s => s.status === status).length;
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
            <h1 className="text-3xl font-bold text-gray-900">Submissions</h1>
            <p className="text-gray-600 mt-1">Review and manage paper submissions</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/organizer/dashboard')}>
            Back to Dashboard
          </Button>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
          {['all', 'submitted', 'under_review', 'review_completed', 'accepted', 'rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setFilter(status)}
              className={`px-4 py-2 border-b-2 font-medium transition-colors whitespace-nowrap ${
                filter === status
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {status === 'all' ? 'All' : getStatusLabel(status)} ({getFilterCount(status)})
            </button>
          ))}
        </div>

        {/* Submissions List */}
        {filteredSubmissions.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-gray-600 text-lg">No submissions found</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredSubmissions.map((submission) => (
              <Card
                key={submission._id}
                hoverable
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {submission.title}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium text-blue-600">{submission.authorId?.name}</span>
                      <span>•</span>
                      <span>{submission.authorId?.email}</span>
                    </div>
                  </div>
                  <Badge variant={getStatusBadge(submission.status)}>
                    {submission.status.replace('_', ' ').charAt(0).toUpperCase() +
                      submission.status.slice(1).replace('_', ' ')}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {submission.abstract}
                </p>

                {/* Paper File Info */}
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-blue-900">Paper Document Available</p>
                    <p className="text-xs text-blue-700">{submission.fileUrl?.split('/').pop()}</p>
                  </div>
                </div>

                {/* Review Progress Bar */}
                {(submission.status === 'under_review' || submission.status === 'review_completed') && submission.reviewProgress && (
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-medium text-gray-700">Review Progress</span>
                      <span className="text-xs text-gray-600">{submission.progress}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full transition-all"
                        style={{ width: `${submission.reviewProgress.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {/* Majority Decision Display */}
                {submission.majorityDecision && (
                  <div className={`mb-3 p-3 rounded-lg border-2 ${
                    submission.majorityDecision === 'ACCEPTED' 
                      ? 'bg-green-50 border-green-300' 
                      : submission.majorityDecision === 'REJECTED'
                      ? 'bg-red-50 border-red-300'
                      : 'bg-yellow-50 border-yellow-300'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {submission.majorityDecision === 'ACCEPTED' ? (
                        <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : submission.majorityDecision === 'REJECTED' ? (
                        <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                      )}
                      <span className={`font-bold text-sm ${
                        submission.majorityDecision === 'ACCEPTED' 
                          ? 'text-green-800' 
                          : submission.majorityDecision === 'REJECTED'
                          ? 'text-red-800'
                          : 'text-yellow-800'
                      }`}>
                        Majority Voting: {submission.majorityDecision}
                      </span>
                      {submission.averageScore && (
                        <Badge variant="default" className="ml-auto">
                          Avg Score: {submission.averageScore}/10
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-gray-700 whitespace-pre-line">{submission.decisionReason}</p>
                  </div>
                )}

                {/* Detailed Reviews Section */}
                {submission.reviews && submission.reviews.length > 0 && (
                  <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-sm text-gray-900">
                        Reviewer Feedback ({submission.reviews.length})
                      </h4>
                      {submission.voteBreakdown && (
                        <div className="flex gap-2 text-xs">
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded">
                            Accept: {submission.voteBreakdown.accept}
                          </span>
                          <span className="px-2 py-1 bg-red-100 text-red-700 rounded">
                            Reject: {submission.voteBreakdown.reject}
                          </span>
                          {(submission.voteBreakdown.minorRevision > 0 || submission.voteBreakdown.majorRevision > 0) && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">
                              Revision: {submission.voteBreakdown.minorRevision + submission.voteBreakdown.majorRevision}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      {submission.reviews.map((review, idx) => (
                        <div key={idx} className="p-2 bg-white border border-gray-200 rounded">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-gray-900">
                                {review.reviewer?.name || 'Anonymous Reviewer'}
                              </span>
                              <Badge variant={
                                review.recommendation === 'ACCEPT' ? 'success' :
                                review.recommendation === 'REJECT' ? 'danger' :
                                'warning'
                              } className="text-xs">
                                {review.recommendation}
                              </Badge>
                            </div>
                            <span className="text-xs font-bold text-gray-700">
                              Score: {review.score}/10
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 mb-1">
                            <span className="font-medium">Feedback: </span>
                            {review.comments?.substring(0, 150)}{review.comments?.length > 150 ? '...' : ''}
                          </p>
                          {review.confidentialComments && (
                            <p className="text-xs text-purple-600 italic">
                              <span className="font-medium">Confidential: </span>
                              {review.confidentialComments?.substring(0, 100)}{review.confidentialComments?.length > 100 ? '...' : ''}
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            Submitted: {formatDate(review.submittedAt)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Submitted</p>
                    <p className="font-medium text-gray-900">{formatDate(submission.submittedAt || submission.submissionDate)}</p>
                  </div>
                  {submission.authorId && (
                    <div>
                      <p className="text-gray-500 text-xs">Author Email</p>
                      <p className="font-medium text-gray-900 text-xs">{submission.authorId.email}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500 text-xs">Reviews</p>
                    <p className="font-medium text-gray-900">{submission.reviewCount || 0} / {submission.requiredReviews || 3}</p>
                  </div>
                  {submission.assignedReviewers && submission.assignedReviewers.length > 0 && (
                    <div>
                      <p className="text-gray-500 text-xs">Reviewers Assigned</p>
                      <p className="font-medium text-gray-900">{submission.assignedReviewers.length}</p>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPdfUrl(`${API_BASE_URL}${submission.fileUrl}`);
                      setShowPdfModal(true);
                      setSelectedSubmission(submission);
                    }}
                  >
                    View Paper
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedSubmission(submission);
                      setShowModal(true);
                    }}
                  >
                    View Details & Decide
                  </Button>
                  <a
                    href={`${API_BASE_URL}${submission.fileUrl}`}
                    download
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 hover:border-blue-700 rounded-lg transition-colors"
                  >
                    Download
                  </a>
                  {!submission.organizerApproved && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleApprove(submission._id);
                      }}
                    >
                      ✓ Approve for Review
                    </Button>
                  )}
                  {submission.organizerApproved && (
                    <Badge variant="success" className="inline-flex items-center px-3 py-1.5">
                      ✓ Approved
                    </Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Details Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setDecision('');
          setFeedback('');
        }}
        title="Review Submission"
      >
        {selectedSubmission && (
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-gray-900 mb-1">Title</h4>
              <p className="text-gray-600">{selectedSubmission.title}</p>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-1">Author</h4>
              <p className="text-gray-600">{selectedSubmission.authorId?.name}</p>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-1">Abstract</h4>
              <p className="text-gray-600 text-sm">{selectedSubmission.abstract}</p>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-2">Paper Document</h4>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    setPdfUrl(`${API_BASE_URL}${selectedSubmission.fileUrl}`);
                    setShowModal(false);
                    setShowPdfModal(true);
                  }}
                >
                  Preview Paper
                </Button>
                <a
                  href={`${API_BASE_URL}${selectedSubmission.fileUrl}`}
                  download
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 hover:border-blue-700 rounded-lg transition-colors"
                >
                  Download
                </a>
                <a
                  href={`${API_BASE_URL}${selectedSubmission.fileUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-700 border border-gray-300 hover:border-gray-400 rounded-lg transition-colors"
                >
                  Open in New Tab
                </a>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-gray-900 mb-1">Status</h4>
              <Badge variant={getStatusBadge(selectedSubmission.status)}>
                {selectedSubmission.status.replace('_', ' ')}
              </Badge>
            </div>

            {/* Assigned Reviewers */}
            {selectedSubmission.assignedReviewers && selectedSubmission.assignedReviewers.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-900 mb-2">Assigned Reviewers</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedSubmission.assignedReviewers.map((reviewer, idx) => (
                    <Badge key={idx} variant="info" className="text-sm">
                      {reviewer.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Majority Voting Decision */}
            {selectedSubmission.majorityDecision && (
              <div className={`p-4 rounded-lg border-2 ${
                selectedSubmission.majorityDecision === 'ACCEPTED' 
                  ? 'bg-green-50 border-green-300' 
                  : selectedSubmission.majorityDecision === 'REJECTED'
                  ? 'bg-red-50 border-red-300'
                  : 'bg-yellow-50 border-yellow-300'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {selectedSubmission.majorityDecision === 'ACCEPTED' ? (
                    <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : selectedSubmission.majorityDecision === 'REJECTED' ? (
                    <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  )}
                  <span className={`font-bold ${
                    selectedSubmission.majorityDecision === 'ACCEPTED' 
                      ? 'text-green-800' 
                      : selectedSubmission.majorityDecision === 'REJECTED'
                      ? 'text-red-800'
                      : 'text-yellow-800'
                  }`}>
                    Final Decision: {selectedSubmission.majorityDecision}
                  </span>
                  {selectedSubmission.averageScore && (
                    <Badge variant="default" className="ml-auto">
                      Average Score: {selectedSubmission.averageScore}/10
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-line">{selectedSubmission.decisionReason}</p>
              </div>
            )}

            {/* Detailed Reviews */}
            {selectedSubmission.reviews && selectedSubmission.reviews.length > 0 && (
              <div>
                <h4 className="font-bold text-gray-900 mb-2">Detailed Review Feedback ({selectedSubmission.reviews.length})</h4>
                {selectedSubmission.voteBreakdown && (
                  <div className="flex gap-2 mb-3">
                    <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                      ✓ Accept: {selectedSubmission.voteBreakdown.accept}
                    </span>
                    <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                      ✗ Reject: {selectedSubmission.voteBreakdown.reject}
                    </span>
                    {selectedSubmission.voteBreakdown.minorRevision > 0 && (
                      <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                        Minor Rev: {selectedSubmission.voteBreakdown.minorRevision}
                      </span>
                    )}
                    {selectedSubmission.voteBreakdown.majorRevision > 0 && (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                        Major Rev: {selectedSubmission.voteBreakdown.majorRevision}
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {selectedSubmission.reviews.map((review, idx) => (
                    <div key={idx} className="p-4 bg-white border-2 border-gray-200 rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-bold text-gray-900">{review.reviewer?.name || 'Anonymous Reviewer'}</p>
                          <p className="text-xs text-gray-500">{review.reviewer?.email}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            review.recommendation === 'ACCEPT' ? 'success' :
                            review.recommendation === 'REJECT' ? 'danger' :
                            review.recommendation === 'MINOR_REVISION' ? 'warning' :
                            'default'
                          }>
                            {review.recommendation.replace('_', ' ')}
                          </Badge>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">
                            {review.score}/10
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs font-semibold text-gray-700 mb-1">Reviewer Comments:</p>
                          <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded">{review.comments}</p>
                        </div>
                        {review.confidentialComments && (
                          <div>
                            <p className="text-xs font-semibold text-purple-700 mb-1">Confidential Comments (Organizer Only):</p>
                            <p className="text-sm text-purple-700 bg-purple-50 p-2 rounded italic">{review.confidentialComments}</p>
                          </div>
                        )}
                        <p className="text-xs text-gray-400">
                          Submitted on: {formatDate(review.submittedAt)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedSubmission.status === 'under_review' && (
              <div className="border-t pt-4 space-y-4">
                <Select
                  label="Decision"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  options={[
                    { value: 'accepted', label: 'Accept' },
                    { value: 'rejected', label: 'Reject' }
                  ]}
                />

                <Textarea
                  label="Feedback (optional)"
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  rows={4}
                  placeholder="Add feedback for the author..."
                />

                <Button
                  onClick={handleDecision}
                  disabled={!decision || deciding}
                  fullWidth
                >
                  {deciding ? 'Submitting...' : 'Submit Decision'}
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* PDF Preview Modal */}
      <Modal
        isOpen={showPdfModal}
        onClose={() => {
          setShowPdfModal(false);
          setPdfUrl('');
        }}
        title={selectedSubmission ? `${selectedSubmission.title} - ${selectedSubmission.authorId?.name}` : 'Paper Preview'}
        size="large"
      >
        {selectedSubmission && (
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Author: {selectedSubmission.authorId?.name}</p>
                <p className="text-xs text-gray-600">{selectedSubmission.authorId?.email}</p>
              </div>
              <div className="flex gap-2">
                <a
                  href={pdfUrl}
                  download
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Download PDF
                </a>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Open in New Tab
                </a>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="Paper Preview"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowPdfModal(false);
                  setShowModal(true);
                }}
              >
                View Details & Reviews
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPdfModal(false);
                  setPdfUrl('');
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ViewSubmissions;
