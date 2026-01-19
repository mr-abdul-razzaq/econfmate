import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Select from '../../components/Select';
import Modal from '../../components/Modal';
import { getTracks, getConferenceSubmissionsReviewer, placeBid } from '../../utils/api';

const ConferenceSubmissions = () => {
  const { id: conferenceId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [trackFilter, setTrackFilter] = useState('');
  const [bidding, setBidding] = useState(null);

  // Bid modal state
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedConfidence, setSelectedConfidence] = useState(5);

  // Get reviewer's expertise domains
  const reviewerExpertise = useMemo(() => {
    const domains = user?.expertiseDomains || [];
    // Normalize to lowercase for case-insensitive matching
    return domains.map(d => d.toLowerCase().trim());
  }, [user]);

  // Filter submissions based on expertise domains
  const filteredSubmissions = useMemo(() => {
    if (reviewerExpertise.length === 0) {
      // If no expertise, show all submissions (or could return empty)
      return submissions;
    }

    return submissions.filter(submission => {
      const trackName = submission.trackId?.name || submission.track || '';
      const normalizedTrack = trackName.toLowerCase().trim();
      
      // Check if track matches any expertise domain
      return reviewerExpertise.some(expertise => {
        // Exact match or contains match
        return normalizedTrack === expertise || 
               normalizedTrack.includes(expertise) ||
               expertise.includes(normalizedTrack);
      });
    });
  }, [submissions, reviewerExpertise]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [subsRes, tracksRes] = await Promise.all([
        getConferenceSubmissionsReviewer(conferenceId, { trackId: trackFilter || undefined }),
        getTracks(conferenceId)
      ]);
      setSubmissions(subsRes.data || subsRes || []);
      setTracks(tracksRes.data || tracksRes || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.response?.data?.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [conferenceId, trackFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openBidModal = (submission) => {
    setSelectedSubmission(submission);
    setSelectedConfidence(5);
    setShowBidModal(true);
  };

  const closeBidModal = () => {
    setShowBidModal(false);
    setSelectedSubmission(null);
    setSelectedConfidence(5);
  };

  const handlePlaceBid = async () => {
    if (!selectedSubmission) return;

    try {
      setBidding(selectedSubmission._id);
      await placeBid(selectedSubmission._id, selectedConfidence);
      closeBidModal();
      // Refresh data to show updated bid status
      await fetchData();
    } catch (err) {
      console.error('Error placing bid:', err);
      alert(err.response?.data?.message || 'Failed to place bid');
    } finally {
      setBidding(null);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusBadge = (status) => {
    const variants = {
      submitted: 'info',
      under_review: 'warning',
      accepted: 'success',
      rejected: 'danger',
      approved: 'success'
    };
    const statusText = status?.replace('_', ' ') || 'submitted';
    return <Badge variant={variants[status] || 'default'}>{statusText.toUpperCase()}</Badge>;
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
        <div className="mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate('/reviewer/browse-conferences')}>
            ← Back to Conferences
          </Button>
        </div>

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Conference Submissions</h1>
            <p className="text-gray-600 mt-1">Browse and bid on papers matching your expertise</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{filteredSubmissions.length}</p>
            <p className="text-sm text-gray-600">Matching Papers</p>
            {submissions.length !== filteredSubmissions.length && (
              <p className="text-xs text-gray-500 mt-1">
                ({submissions.length} total)
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchData}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Track Filter */}
        <div className="mb-6">
          <div className="w-64">
            <Select value={trackFilter} onChange={(e) => setTrackFilter(e.target.value)}>
              <option value="">All Tracks</option>
              {tracks.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </Select>
          </div>
        </div>

        {/* Submissions Grid */}
        {filteredSubmissions.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📄</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {reviewerExpertise.length === 0 
                ? 'No Expertise Domains Defined'
                : 'No Papers Match Your Expertise'}
            </h3>
            <p className="text-gray-600 mb-4">
              {reviewerExpertise.length === 0
                ? 'Please add expertise domains to your profile to view relevant papers.'
                : submissions.length === 0
                  ? 'No submissions available for bidding in this conference.'
                  : `No papers available for your expertise in this conference. ${trackFilter ? 'Try changing the track filter.' : ''}`}
            </p>
            {reviewerExpertise.length === 0 && (
              <Button onClick={() => navigate('/profile')}>
                Update Profile
              </Button>
            )}
            {reviewerExpertise.length > 0 && submissions.length > 0 && (
              <div className="mt-4 text-sm text-gray-500">
                <p className="font-medium mb-2">Your Expertise Domains:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {reviewerExpertise.map((domain, idx) => (
                    <Badge key={idx} variant="info" className="capitalize">{domain}</Badge>
                  ))}
                </div>
                <p className="mt-3 text-xs">Papers are filtered to match your expertise domains.</p>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredSubmissions.map((submission) => (
              <Card key={submission._id} hoverable>
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1 pr-2">
                    {submission.title}
                  </h3>
                  {getStatusBadge(submission.status)}
                </div>

                <div className="space-y-2 mb-4">
                  {submission.trackId?.name && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Track:</span>{' '}
                      <Badge variant="info" className="text-xs">{submission.trackId.name}</Badge>
                    </p>
                  )}
                  {submission.authorId?.name && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Author:</span> {submission.authorId.name}
                    </p>
                  )}
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Submitted:</span>{' '}
                    {formatDate(submission.createdAt || submission.submittedAt)}
                  </p>
                </div>

                {submission.abstract && (
                  <div className="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded max-h-32 overflow-y-auto">
                    {submission.abstract}
                  </div>
                )}

                <div className="flex gap-2">
                  {submission.hasBid ? (
                    <Badge variant="success" className="w-full text-center py-2">
                      ✓ Bid Placed
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      fullWidth
                      onClick={() => openBidModal(submission)}
                      disabled={bidding === submission._id}
                    >
                      {bidding === submission._id ? 'Placing Bid...' : 'Place Bid'}
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Bid Confidence Modal */}
      <Modal
        isOpen={showBidModal}
        onClose={closeBidModal}
        title="Place Bid"
        size="medium"
      >
        {selectedSubmission && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">
                {selectedSubmission.title}
              </h3>
              {selectedSubmission.trackId?.name && (
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Track:</span> {selectedSubmission.trackId.name}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Confidence Level
              </label>
              <p className="text-xs text-gray-500 mb-4">
                Rate your expertise in the paper's subject area (1 = Low, 10 = Expert)
              </p>

              {/* Slider */}
              <div className="mb-4">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={selectedConfidence}
                  onChange={(e) => setSelectedConfidence(parseInt(e.target.value))}
                  className="w-full h-3 bg-gradient-to-r from-red-400 via-yellow-400 to-green-500 rounded-lg appearance-none cursor-pointer"
                  style={{
                    WebkitAppearance: 'none',
                  }}
                />
              </div>

              {/* Scale numbers */}
              <div className="flex justify-between text-xs text-gray-500 mb-4 px-1">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedConfidence(num)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-medium transition-all ${selectedConfidence === num
                      ? 'bg-blue-600 text-white shadow-md scale-110'
                      : 'hover:bg-gray-200'
                      }`}
                  >
                    {num}
                  </button>
                ))}
              </div>

              {/* Selected value display */}
              <div className={`text-center p-3 rounded-lg ${selectedConfidence <= 3 ? 'bg-red-50 border border-red-200' :
                selectedConfidence <= 6 ? 'bg-yellow-50 border border-yellow-200' :
                  'bg-green-50 border border-green-200'
                }`}>
                <span className="text-2xl font-bold">{selectedConfidence}</span>
                <span className="text-gray-600 text-sm ml-2">
                  / 10 - {
                    selectedConfidence <= 3 ? 'Low expertise' :
                      selectedConfidence <= 6 ? 'Moderate expertise' :
                        selectedConfidence <= 8 ? 'High expertise' :
                          'Expert level'
                  }
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                onClick={handlePlaceBid}
                disabled={bidding === selectedSubmission._id}
                fullWidth
              >
                {bidding === selectedSubmission._id ? 'Placing Bid...' : 'Confirm Bid'}
              </Button>
              <Button variant="outline" onClick={closeBidModal}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default ConferenceSubmissions;
