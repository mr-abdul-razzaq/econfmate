import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import Input from '../../components/Input';
import api from '../../utils/api';

const MyReviews = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reviews, setReviews] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState(location.pathname.includes('/bids') ? 'bids' : 'reviews');

  // Filters
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    dateFrom: '',
    dateTo: ''
  });
  const [filteredReviews, setFilteredReviews] = useState([]);
  const [filteredBids, setFilteredBids] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch reviews
      const reviewsResponse = await api.get('/reviewer/reviews');
      setReviews(reviewsResponse.data.data?.reviews || reviewsResponse.data.data || []);

      // Fetch bids
      const bidsResponse = await api.get('/reviewer/bids');
      setBids(bidsResponse.data.data?.bids || bidsResponse.data.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = useCallback(() => {
    // Filter reviews
    let filtered = [...reviews];
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.submissionId?.title?.toLowerCase().includes(searchLower) ||
        r.comments?.toLowerCase().includes(searchLower)
      );
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      filtered = filtered.filter(r => new Date(r.createdAt) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59);
      filtered = filtered.filter(r => new Date(r.createdAt) <= to);
    }
    setFilteredReviews(filtered);

    // Filter bids
    let filteredB = [...bids];
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filteredB = filteredB.filter(b =>
        b.submissionId?.title?.toLowerCase().includes(searchLower)
      );
    }
    if (filters.status) {
      filteredB = filteredB.filter(b => b.status === filters.status);
    }
    if (filters.dateFrom) {
      const from = new Date(filters.dateFrom);
      filteredB = filteredB.filter(b => new Date(b.createdAt) >= from);
    }
    if (filters.dateTo) {
      const to = new Date(filters.dateTo);
      to.setHours(23, 59, 59);
      filteredB = filteredB.filter(b => new Date(b.createdAt) <= to);
    }
    setFilteredBids(filteredB);
  }, [reviews, bids, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const clearFilters = () => {
    setFilters({ search: '', status: '', dateFrom: '', dateTo: '' });
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getRecommendationBadge = (rec) => {
    const variants = {
      'STRONG_ACCEPT': 'success',
      'ACCEPT': 'success',
      'WEAK_ACCEPT': 'info',
      'BORDERLINE': 'warning',
      'WEAK_REJECT': 'warning',
      'REJECT': 'danger',
      'STRONG_REJECT': 'danger'
    };
    const recUpper = (rec || '').toUpperCase().replace(/ /g, '_');
    return <Badge variant={variants[recUpper] || 'default'}>{rec || 'N/A'}</Badge>;
  };

  const getScoreColor = (score) => {
    if (score >= 8) return 'text-green-600';
    if (score >= 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading your review history..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-transition">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Reviews & Bids</h1>
          <p className="text-gray-600 mt-1">Track your review history and paper assignments</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card className="text-center">
            <div className="text-3xl font-bold text-primary-600">{reviews.length}</div>
            <div className="text-sm text-gray-600">Total Reviews</div>
          </Card>
          <Card className="text-center">
            <div className="text-3xl font-bold text-green-600">{bids.length}</div>
            <div className="text-sm text-gray-600">Total Bids</div>
          </Card>
          <Card className="text-center">
            <div className="text-3xl font-bold text-blue-600">
              {reviews.length > 0 ? (reviews.reduce((sum, r) => sum + (r.score || 0), 0) / reviews.length).toFixed(1) : '0'}
            </div>
            <div className="text-sm text-gray-600">Avg. Score Given</div>
          </Card>
          <Card className="text-center">
            <div className="text-3xl font-bold text-purple-600">
              {bids.filter(b => b.status === 'accepted').length}
            </div>
            <div className="text-sm text-gray-600">Accepted Bids</div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-6">
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'reviews'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            📝 My Reviews ({reviews.length})
          </button>
          <button
            onClick={() => setActiveTab('bids')}
            className={`px-6 py-3 font-medium transition-colors ${activeTab === 'bids'
                ? 'text-primary-600 border-b-2 border-primary-600'
                : 'text-gray-500 hover:text-gray-700'
              }`}
          >
            🎯 My Bids ({bids.length})
          </button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Filters</h3>
            <button
              onClick={clearFilters}
              className="text-sm text-primary-600 hover:text-primary-700"
            >
              Clear All
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input
              label="Search"
              name="search"
              type="text"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Search by title..."
            />
            {activeTab === 'bids' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="status"
                  value={filters.status}
                  onChange={handleFilterChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="accepted">Accepted</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            )}
            <Input
              label="From Date"
              name="dateFrom"
              type="date"
              value={filters.dateFrom}
              onChange={handleFilterChange}
            />
            <Input
              label="To Date"
              name="dateTo"
              type="date"
              value={filters.dateTo}
              onChange={handleFilterChange}
            />
          </div>
        </Card>

        {/* Reviews Tab Content */}
        {activeTab === 'reviews' && (
          <>
            {filteredReviews.length === 0 ? (
              <Card className="text-center py-12">
                <div className="text-6xl mb-4">📋</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Reviews Yet</h3>
                <p className="text-gray-600 mb-4">You haven't submitted any reviews yet</p>
                <Button onClick={() => navigate('/reviewer/browse-conferences')}>
                  Browse Papers to Review
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredReviews.map((review) => (
                  <Card
                    key={review._id}
                    className="card-hover cursor-pointer"
                    onClick={() => {
                      setSelectedReview(review);
                      setShowModal(true);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">
                          {review.submissionId?.title || 'Untitled Submission'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          Track: {review.trackId?.name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">
                            Reviewed: {formatDate(review.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className={`text-2xl font-bold ${getScoreColor(review.score)}`}>
                          {review.score}/10
                        </div>
                        {getRecommendationBadge(review.recommendation)}
                      </div>
                    </div>
                    {review.comments && (
                      <p className="text-sm text-gray-600 mt-3 line-clamp-2">
                        {review.comments}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {/* Bids Tab Content */}
        {activeTab === 'bids' && (
          <>
            {filteredBids.length === 0 ? (
              <Card className="text-center py-12">
                <div className="text-6xl mb-4">🎯</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No Bids Yet</h3>
                <p className="text-gray-600 mb-4">You haven't placed any bids on papers</p>
                <Button onClick={() => navigate('/reviewer/browse-conferences')}>
                  Browse Available Papers
                </Button>
              </Card>
            ) : (
              <div className="space-y-4">
                {filteredBids.map((bid) => (
                  <Card key={bid._id} className="card-hover">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">
                          {bid.submissionId?.title || 'Untitled Submission'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-2">
                          Track: {bid.trackId?.name || 'Unknown'}
                        </p>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-gray-500">
                            Bid placed: {formatDate(bid.createdAt)}
                          </span>
                          <span className="text-gray-500">
                            Confidence: {bid.confidence || 0}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={
                          bid.status === 'accepted' ? 'success' :
                            bid.status === 'rejected' ? 'danger' : 'warning'
                        }>
                          {(bid.status || 'pending').charAt(0).toUpperCase() + (bid.status || 'pending').slice(1)}
                        </Badge>
                        {bid.status === 'accepted' && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/reviewer/review/${bid.submissionId?._id}`);
                            }}
                          >
                            Review Paper
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Review Details Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedReview(null);
        }}
        title="Review Details"
        size="large"
      >
        {selectedReview && (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Paper Title</h3>
              <p className="text-gray-700">{selectedReview.submissionId?.title || 'Untitled'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Score</h3>
                <div className={`text-3xl font-bold ${getScoreColor(selectedReview.score)}`}>
                  {selectedReview.score}/10
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Recommendation</h3>
                {getRecommendationBadge(selectedReview.recommendation)}
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Your Comments</h3>
              <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 p-4 rounded-lg">
                {selectedReview.comments || 'No comments provided'}
              </p>
            </div>

            {selectedReview.confidentialComments && (
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Confidential Notes</h3>
                <p className="text-gray-700 whitespace-pre-wrap bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  {selectedReview.confidentialComments}
                </p>
              </div>
            )}

            <div className="text-sm text-gray-500">
              Reviewed on: {formatDate(selectedReview.createdAt)}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default MyReviews;
