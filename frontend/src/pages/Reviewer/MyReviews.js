import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const MyReviews = () => {
  const navigate = useNavigate();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const response = await api.get('/reviewer/reviews');
      setReviews(response.data.data.reviews || []);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
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

  const getRecommendationVariant = (recommendation) => {
    switch (recommendation) {
      case 'ACCEPT':
        return 'success';
      case 'REJECT':
        return 'danger';
      case 'MINOR_REVISION':
        return 'warning';
      case 'MAJOR_REVISION':
        return 'default';
      default:
        return 'default';
    }
  };

  const openModal = (review) => {
    setSelectedReview(review);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedReview(null);
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading your reviews..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Reviews</h1>
          <p className="text-gray-600 mt-1">
            All reviews you have completed ({reviews.length})
          </p>
        </div>

        {reviews.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Reviews Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Start reviewing papers to see your reviews here
            </p>
            <Button onClick={() => navigate('/reviewer/browse-conferences')}>
              Browse Conferences
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <Card
                key={review._id}
                hoverable
                onClick={() => openModal(review)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl font-bold text-gray-900">
                        {review.submissionId?.title || 'Untitled Submission'}
                      </h3>
                      <Badge variant={getRecommendationVariant(review.recommendation)}>
                        {review.recommendation?.replace('_', ' ')}
                      </Badge>
                      {review.status === 'submitted' && (
                        <Badge variant="success">Submitted</Badge>
                      )}
                      {review.status === 'draft' && (
                        <Badge variant="warning">Draft</Badge>
                      )}
                    </div>

                    <p className="text-gray-600 mb-3">
                      Conference:{' '}
                      <span className="font-medium">
                        {review.submissionId?.conferenceId?.name || 'N/A'}
                      </span>
                    </p>

                    <div className="flex items-center gap-6 text-sm text-gray-600 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500">Score:</span>
                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full font-semibold">
                          {review.score}/10
                        </span>
                      </div>
                      {review.submittedAt && (
                        <div>
                          <span className="text-gray-500">Submitted:</span>{' '}
                          <span className="font-medium">
                            {formatDate(review.submittedAt)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Feedback Preview */}
                    {review.comments && (
                      <div className="mt-3">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Feedback Preview:
                        </p>
                        <p className="text-gray-700 bg-gray-50 p-3 rounded text-sm line-clamp-2">
                          {review.comments}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        openModal(review);
                      }}
                    >
                      View Full Review
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Review Detail Modal */}
      {showModal && selectedReview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Review Details
                </h2>
                <p className="text-gray-600 mt-1">
                  {selectedReview.submissionId?.title || 'Untitled Submission'}
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
              {/* Conference and Submission Info */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Submission Information
                </h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div>
                    <span className="text-gray-600">Conference:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {selectedReview.submissionId?.conferenceId?.name || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Paper Title:</span>{' '}
                    <span className="font-medium text-gray-900">
                      {selectedReview.submissionId?.title || 'Untitled'}
                    </span>
                  </div>
                  {selectedReview.submissionId?.abstract && (
                    <div>
                      <span className="text-gray-600">Abstract:</span>
                      <p className="text-gray-700 mt-1">
                        {selectedReview.submissionId.abstract}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Review Details */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Your Review
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-gray-600">Recommendation:</span>{' '}
                      <Badge
                        variant={getRecommendationVariant(selectedReview.recommendation)}
                        className="text-base px-4 py-2"
                      >
                        {selectedReview.recommendation?.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-gray-600">Score:</span>{' '}
                      <span className="px-4 py-2 bg-blue-100 text-blue-800 rounded-full font-bold">
                        {selectedReview.score}/10
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Status:</span>{' '}
                      <Badge variant={selectedReview.status === 'submitted' ? 'success' : 'warning'}>
                        {selectedReview.status === 'submitted' ? 'Submitted' : 'Draft'}
                      </Badge>
                    </div>
                  </div>

                  {selectedReview.submittedAt && (
                    <div>
                      <span className="text-gray-600">Submitted At:</span>{' '}
                      <span className="font-medium text-gray-900">
                        {formatDate(selectedReview.submittedAt)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Comments */}
              {selectedReview.comments && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Feedback to Author
                  </h3>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {selectedReview.comments}
                    </p>
                  </div>
                </div>
              )}

              {/* Confidential Comments */}
              {selectedReview.confidentialComments && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Confidential Comments (Organizer Only)
                  </h3>
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <p className="text-purple-900 leading-relaxed whitespace-pre-wrap italic">
                      {selectedReview.confidentialComments}
                    </p>
                  </div>
                </div>
              )}

              {/* Paper Document Link */}
              {selectedReview.submissionId?.fileUrl && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    Paper Document
                  </h3>
                  <a
                    href={`http://localhost:5000${selectedReview.submissionId.fileUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 underline"
                  >
                    View/Download Paper (PDF)
                  </a>
                </div>
              )}
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

export default MyReviews;
