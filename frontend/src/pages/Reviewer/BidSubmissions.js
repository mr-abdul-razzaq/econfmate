import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';
import { getReviewerBids, withdrawBid } from '../../utils/api';

const BidSubmissions = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [withdrawingId, setWithdrawingId] = useState(null);

  useEffect(() => {
    fetchBids();
  }, []);

  const fetchBids = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getReviewerBids();
      setBids(response.data || response || []);
    } catch (err) {
      console.error('Error fetching bids:', err);
      setError(err.response?.data?.message || 'Failed to load bids');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async (bidId) => {
    if (!window.confirm('Are you sure you want to withdraw this bid?')) return;

    try {
      setWithdrawingId(bidId);
      await withdrawBid(bidId);
      // Refresh bids list
      await fetchBids();
    } catch (err) {
      console.error('Error withdrawing bid:', err);
      toast.error(err.response?.data?.message || 'Failed to withdraw bid');
    } finally {
      setWithdrawingId(null);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Handle both uppercase (new API) and lowercase (legacy) statuses
  const normalizeStatus = (status) => {
    if (!status) return 'PENDING';
    return status.toUpperCase();
  };

  const getStatusBadge = (status) => {
    const normalized = normalizeStatus(status);
    const variants = {
      PENDING: 'warning',
      APPROVED: 'success',
      REJECTED: 'danger',
      WITHDRAWN: 'secondary'
    };
    const labels = {
      PENDING: 'Pending',
      APPROVED: 'Approved',
      REJECTED: 'Rejected',
      WITHDRAWN: 'Withdrawn'
    };
    return <Badge variant={variants[normalized] || 'info'}>{labels[normalized] || normalized}</Badge>;
  };

  const countByStatus = (targetStatus) => {
    return bids.filter(b => normalizeStatus(b.status) === targetStatus).length;
  };

  const filteredBids = statusFilter === 'all'
    ? bids
    : bids.filter(bid => normalizeStatus(bid.status) === statusFilter);

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading your bids..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Bids</h1>
            <p className="text-gray-600 mt-1">Manage your bids on paper submissions</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => navigate('/reviewer/assignments')}>
              My Assignments
            </Button>
            <Button onClick={() => navigate('/reviewer/browse-conferences')}>
              Browse Conferences
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchBids}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              All ({bids.length})
            </button>
            <button
              onClick={() => setStatusFilter('PENDING')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'PENDING'
                ? 'bg-yellow-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Pending ({countByStatus('PENDING')})
            </button>
            <button
              onClick={() => setStatusFilter('APPROVED')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'APPROVED'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Approved ({countByStatus('APPROVED')})
            </button>
            <button
              onClick={() => setStatusFilter('REJECTED')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'REJECTED'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Rejected ({countByStatus('REJECTED')})
            </button>
            <button
              onClick={() => setStatusFilter('WITHDRAWN')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === 'WITHDRAWN'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              Withdrawn ({countByStatus('WITHDRAWN')})
            </button>
          </div>
        </div>

        {/* Bids List */}
        {filteredBids.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {statusFilter === 'all' ? 'No Bids Yet' : `No ${statusFilter.toLowerCase()} bids`}
            </h3>
            <p className="text-gray-600 mb-6">
              {statusFilter === 'all'
                ? 'Start bidding on paper submissions to review them'
                : `You don't have any bids with ${statusFilter.toLowerCase()} status`}
            </p>
            {statusFilter === 'all' && (
              <Button onClick={() => navigate('/reviewer/browse-conferences')}>
                Browse Available Papers
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredBids.map((bid) => {
              const status = normalizeStatus(bid.status);
              return (
                <Card key={bid._id} hoverable>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 line-clamp-2 flex-1 pr-2">
                      {bid.submissionId?.title || 'Untitled Submission'}
                    </h3>
                    {getStatusBadge(bid.status)}
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Conference:</span>{' '}
                      {bid.submissionId?.conferenceId?.name || bid.trackId?.conferenceId?.name || 'Unknown Conference'}
                    </p>
                    {(bid.submissionId?.trackId?.name || bid.trackId?.name) && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Track:</span>{' '}
                        {bid.submissionId?.trackId?.name || bid.trackId?.name}
                      </p>
                    )}
                    {bid.confidence > 0 && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Confidence:</span>{' '}
                        <span>{bid.confidence}/10</span>
                      </p>
                    )}
                    <p className="text-sm text-gray-500">
                      <span className="font-medium">Bid Date:</span>{' '}
                      {formatDate(bid.createdAt)}
                    </p>
                    {bid.decision?.reason && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Reason:</span>{' '}
                        {bid.decision.reason}
                      </p>
                    )}
                  </div>

                  {/* Action buttons based on bid status and review status */}
                  {status === 'APPROVED' && (
                    <>
                      {/* No review yet - can write review */}
                      {!bid.reviewStatus?.hasReview && bid.reviewStatus?.canReview && (
                        <Button
                          fullWidth
                          onClick={() => navigate(`/reviewer/review/${bid.submissionId?._id}`)}
                        >
                          ✏️ Write Review
                        </Button>
                      )}

                      {/* Has review with final verdict (Accept/Reject) - show completed */}
                      {bid.reviewStatus?.hasReview && bid.reviewStatus?.isFinalVerdict && (
                        <div className="text-center text-sm text-green-600 bg-green-50 py-2 rounded-lg border border-green-200">
                          ✓ Review Submitted ({bid.reviewStatus.recommendation})
                        </div>
                      )}

                      {/* Has review with revision verdict - waiting for author */}
                      {bid.reviewStatus?.hasReview && !bid.reviewStatus?.isFinalVerdict && !bid.reviewStatus?.canUpdate && (
                        <div className="text-center text-sm text-orange-600 bg-orange-50 py-2 rounded-lg border border-orange-200">
                          ⏳ Waiting for author revision ({bid.reviewStatus.recommendation?.replace('_', ' ')})
                        </div>
                      )}

                      {/* Has revision review and author has resubmitted - can update */}
                      {bid.reviewStatus?.hasReview && bid.reviewStatus?.canUpdate && (
                        <Button
                          fullWidth
                          variant="warning"
                          onClick={() => navigate(`/reviewer/review/${bid.submissionId?._id}`)}
                        >
                          🔄 Update Review (Revision Submitted)
                        </Button>
                      )}

                      {/* Fallback if no reviewStatus - legacy behavior */}
                      {!bid.reviewStatus && (
                        <Button
                          fullWidth
                          onClick={() => navigate(`/reviewer/review/${bid.submissionId?._id}`)}
                        >
                          Write Review
                        </Button>
                      )}
                    </>
                  )}
                  {status === 'PENDING' && (
                    <div className="space-y-2">
                      <div className="text-center text-sm text-yellow-600 bg-yellow-50 py-2 rounded-lg">
                        Waiting for organizer approval
                      </div>
                      <Button
                        variant="danger"
                        fullWidth
                        onClick={() => handleWithdraw(bid._id)}
                        disabled={withdrawingId === bid._id}
                      >
                        {withdrawingId === bid._id ? 'Withdrawing...' : 'Withdraw Bid'}
                      </Button>
                    </div>
                  )}
                  {status === 'REJECTED' && (
                    <div className="text-center text-sm text-red-600 bg-red-50 py-2 rounded-lg">
                      Bid was not accepted
                    </div>
                  )}
                  {status === 'WITHDRAWN' && (
                    <div className="text-center text-sm text-gray-600 bg-gray-50 py-2 rounded-lg">
                      Bid was withdrawn
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Stats Summary */}
        {bids.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <div className="text-center">
                <div className="text-4xl font-bold text-blue-600">{bids.length}</div>
                <p className="text-gray-600 mt-2">Total Bids</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-4xl font-bold text-green-600">
                  {countByStatus('APPROVED')}
                </div>
                <p className="text-gray-600 mt-2">Approved</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-4xl font-bold text-yellow-600">
                  {countByStatus('PENDING')}
                </div>
                <p className="text-gray-600 mt-2">Pending</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-4xl font-bold text-red-600">
                  {countByStatus('REJECTED')}
                </div>
                <p className="text-gray-600 mt-2">Rejected</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </>
  );
};

export default BidSubmissions;
