import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Textarea from '../../components/Textarea';
import ScoreSlider from '../../components/ScoreSlider';
import { getSubmissionForReview, createReview, getReviewerMyReview } from '../../utils/api';

const ReviewPaper = () => {
  const { submissionId, id } = useParams();
  const actualSubmissionId = submissionId || id;
  const navigate = useNavigate();

  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showPdfModal, setShowPdfModal] = useState(false);

  // Review status state
  const [reviewStatus, setReviewStatus] = useState(null);
  const [isUpdateMode, setIsUpdateMode] = useState(false);

  const [formData, setFormData] = useState({
    score: 5,
    recommendation: '',
    comments: '',
    confidentialComments: ''
  });

  // Helper function to get the correct file URL
  const getFileUrl = (fileUrl, forDownload = false) => {
    // If it's already a full URL (from Cloudinary), use it directly
    if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
      // For Cloudinary URLs, add attachment flag for downloads
      if (fileUrl.includes('cloudinary.com') && forDownload) {
        // Add fl_attachment flag for forced download
        return fileUrl.replace('/upload/', '/upload/fl_attachment/');
      }
      return fileUrl;
    }
    // If it's a relative path (legacy uploads), prepend backend URL
    if (fileUrl && fileUrl.startsWith('/')) {
      const API_BASE_URL = process.env.REACT_APP_API_URL?.replace('/api', '') || 'https://cms-backend-fjdo.onrender.com';
      return `${API_BASE_URL}${fileUrl}`;
    }
    return fileUrl;
  };

  const recommendations = [
    { value: 'ACCEPT', label: 'Accept', color: 'text-green-600' },
    { value: 'MINOR_REVISION', label: 'Minor Revision', color: 'text-yellow-600' },
    { value: 'MAJOR_REVISION', label: 'Major Revision', color: 'text-orange-600' },
    { value: 'REJECT', label: 'Reject', color: 'text-red-600' }
  ];

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch submission and review status in parallel
      const [submissionRes, reviewRes] = await Promise.all([
        getSubmissionForReview(actualSubmissionId),
        getReviewerMyReview(actualSubmissionId)
      ]);

      setSubmission(submissionRes.data || submissionRes);

      const reviewData = reviewRes.data || reviewRes;
      setReviewStatus(reviewData);

      // If reviewer has an existing review
      if (reviewData?.hasReview) {
        const review = reviewData.review;

        // Pre-fill form with previous review data
        setFormData({
          score: review.score || 5,
          recommendation: review.recommendation || '',
          comments: review.comments || '',
          confidentialComments: review.confidentialComments || ''
        });

        // Set update mode if canUpdate is true
        if (reviewData.canUpdate) {
          setIsUpdateMode(true);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.message || 'Failed to load submission');
    } finally {
      setLoading(false);
    }
  }, [actualSubmissionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.recommendation) {
      setError('Please select a recommendation');
      return;
    }
    if (!formData.comments.trim()) {
      setError('Please provide comments for the author');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      await createReview(actualSubmissionId, {
        score: Number(formData.score),
        recommendation: formData.recommendation,
        comments: formData.comments,
        confidentialComments: formData.confidentialComments
      });
      navigate('/reviewer/reviews');
    } catch (err) {
      console.error('Error submitting review:', err);
      setError(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading submission..." />
      </>
    );
  }

  // Block access if final verdict (ACCEPT/REJECT) was already submitted
  if (reviewStatus?.hasReview && reviewStatus?.isFinalVerdict) {
    return (
      <>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              ← Back
            </Button>
          </div>

          <Card className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Review Already Submitted</h2>
            <p className="text-gray-600 mb-2">
              You have already submitted your final review for this paper.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg mt-4">
              <span className="font-medium">Your Verdict:</span>
              <Badge variant={reviewStatus.review?.recommendation === 'ACCEPT' ? 'success' : 'danger'}>
                {reviewStatus.review?.recommendation}
              </Badge>
            </div>
            <div className="mt-6">
              <Button onClick={() => navigate('/reviewer/bids')}>
                Back to My Bids
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  // Block access if review with revision verdict exists but author hasn't resubmitted yet
  if (reviewStatus?.hasReview && !reviewStatus?.isFinalVerdict && !reviewStatus?.canUpdate) {
    return (
      <>
        <Navbar />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
              ← Back
            </Button>
          </div>

          <Card className="text-center py-12">
            <div className="text-6xl mb-4">⏳</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Waiting for Author Revision</h2>
            <p className="text-gray-600 mb-2">
              You requested a revision for this paper. The author has not yet submitted their revised version.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-lg mt-4 border border-orange-200">
              <span className="font-medium text-orange-800">Your Previous Verdict:</span>
              <Badge variant="warning">
                {reviewStatus.review?.recommendation?.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-sm text-gray-500 mt-4">
              You will be able to update your review once the author submits their revision.
            </p>
            <div className="mt-6">
              <Button onClick={() => navigate('/reviewer/bids')}>
                Back to My Bids
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            ← Back
          </Button>
        </div>

        {/* Update mode banner */}
        {isUpdateMode && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔄</span>
              <div>
                <h3 className="font-semibold text-blue-800">Update Your Review</h3>
                <p className="text-sm text-blue-700">
                  The author has submitted a revised version. Please review the updated paper and submit your new evaluation.
                </p>
              </div>
            </div>
          </div>
        )}

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          {isUpdateMode ? '🔄 Update Review' : '✏️ Write Review'}
        </h1>
        <p className="text-gray-600 mb-8">
          {isUpdateMode ? 'Review the revised paper and update your evaluation' : 'Review this paper submission'}
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {/* Submission Details */}
        {submission && (
          <Card className="mb-8">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  {submission.title}
                </h2>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span>
                    <span className="font-medium">Author:</span>{' '}
                    {submission.authorId?.name || 'Unknown'}
                  </span>
                  {submission.authorId?.email && (
                    <span className="text-gray-400">({submission.authorId.email})</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {submission.conferenceId?.name && (
                    <Badge variant="info">{submission.conferenceId.name}</Badge>
                  )}
                  {submission.trackId?.name && (
                    <Badge variant="default">{submission.trackId.name}</Badge>
                  )}
                  {submission.theme && (
                    <Badge variant="default">Theme: {submission.theme}</Badge>
                  )}
                </div>
              </div>
            </div>

            {submission.abstract && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Abstract</h3>
                <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg">
                  {submission.abstract}
                </p>
              </div>
            )}

            {submission.keywords && submission.keywords.length > 0 && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {submission.keywords.map((keyword, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {submission.fileUrl && (
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setShowPdfModal(true)}
                >
                  📄 Preview Paper
                </Button>
                <a
                  href={getFileUrl(submission.fileUrl, true)}
                  download
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 hover:border-blue-700 rounded-lg transition-colors"
                >
                  ⬇️ Download PDF
                </a>
              </div>
            )}
          </Card>
        )}

        {/* Review Form */}
        <Card>
          <h2 className="text-xl font-bold text-gray-900 mb-6">Your Review</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Score */}
            <div>
              <ScoreSlider
                value={formData.score}
                onChange={(val) => handleInputChange('score', val)}
                min={1}
                max={10}
                label="Score (1-10)"
              />
            </div>

            {/* Recommendation */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Recommendation <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {recommendations.map((rec) => (
                  <button
                    key={rec.value}
                    type="button"
                    onClick={() => handleInputChange('recommendation', rec.value)}
                    className={`p-3 rounded-lg border-2 text-center transition-all ${formData.recommendation === rec.value
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                      }`}
                  >
                    <span className={`font-medium ${rec.color}`}>{rec.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Comments for Author */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Comments for Author <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={formData.comments}
                onChange={(e) => handleInputChange('comments', e.target.value)}
                placeholder="Provide detailed feedback for the author. This will be visible to them."
                rows={6}
              />
              <p className="text-xs text-gray-500 mt-1">
                Be constructive and specific. This feedback will be shared with the author.
              </p>
            </div>

            {/* Confidential Comments */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Confidential Comments (Optional)
              </label>
              <Textarea
                value={formData.confidentialComments}
                onChange={(e) => handleInputChange('confidentialComments', e.target.value)}
                placeholder="Private notes for the organizer only. The author will not see these."
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                These comments are only visible to organizers.
              </p>
            </div>

            {/* Submit */}
            <div className="flex gap-4 pt-4">
              <Button
                type="submit"
                fullWidth
                disabled={submitting}
                className={submitting ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {submitting
                  ? (isUpdateMode ? 'Updating...' : 'Submitting...')
                  : (isUpdateMode ? '🔄 Update Review' : '✅ Submit Review')
                }
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(-1)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      </div>

      {/* PDF Preview Modal */}
      {showPdfModal && submission?.fileUrl && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {submission.title}
              </h3>
              <button
                onClick={() => setShowPdfModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            <div style={{ height: '70vh' }}>
              <iframe
                src={getFileUrl(submission.fileUrl)}
                className="w-full h-full"
                title="Paper Preview"
              />
            </div>
            <div className="px-6 py-4 border-t flex justify-end gap-3">
              <a
                href={getFileUrl(submission.fileUrl, true)}
                download
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Download PDF
              </a>
              <Button variant="outline" onClick={() => setShowPdfModal(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReviewPaper;
