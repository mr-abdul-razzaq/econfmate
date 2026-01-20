import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';
import { getConferenceBids, updateBidStatus, bulkUpdateBids } from '../../utils/api';

const ManageBids = () => {
    const { conferenceId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [bids, setBids] = useState([]);
    const [stats, setStats] = useState({ PENDING: 0, APPROVED: 0, REJECTED: 0, WITHDRAWN: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [statusFilter, setStatusFilter] = useState('PENDING');
    const [selectedBids, setSelectedBids] = useState([]);
    const [updating, setUpdating] = useState(false);

    // Rejection modal state
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectingBid, setRejectingBid] = useState(null); // single bid or null for bulk
    const [rejectionReason, setRejectionReason] = useState('');
    const [reasonError, setReasonError] = useState('');

    // Paper bids modal state
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [showBidsModal, setShowBidsModal] = useState(false);

    useEffect(() => {
        fetchBids();
    }, [conferenceId, statusFilter]);

    // Group bids by paper
    const groupedByPaper = useMemo(() => {
        const grouped = {};
        bids.forEach(bid => {
            const paperId = bid.submissionId?._id;
            if (!paperId) return;

            if (!grouped[paperId]) {
                grouped[paperId] = {
                    paper: bid.submissionId,
                    bids: [],
                    stats: { PENDING: 0, APPROVED: 0, REJECTED: 0, WITHDRAWN: 0 }
                };
            }
            grouped[paperId].bids.push(bid);
            grouped[paperId].stats[bid.status] = (grouped[paperId].stats[bid.status] || 0) + 1;
        });
        return Object.values(grouped);
    }, [bids]);

    const fetchBids = async () => {
        try {
            setLoading(true);
            setError(null);

            // Fetch filtered bids for display
            const response = await getConferenceBids(conferenceId, { status: statusFilter !== 'all' ? statusFilter : undefined });
            setBids(response.data?.bids || []);

            // Fetch ALL bids for stats calculation (without filter)
            const allBidsResponse = await getConferenceBids(conferenceId, {});
            const allBids = allBidsResponse.data?.bids || [];

            // Calculate stats from all bids
            const calculatedStats = { PENDING: 0, APPROVED: 0, REJECTED: 0, WITHDRAWN: 0 };
            allBids.forEach(bid => {
                if (calculatedStats.hasOwnProperty(bid.status)) {
                    calculatedStats[bid.status]++;
                }
            });
            setStats(calculatedStats);
        } catch (err) {
            console.error('Error fetching bids:', err);
            setError(err.response?.data?.message || 'Failed to load bids');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (bidId, status, reason = '') => {
        try {
            setUpdating(true);
            const response = await updateBidStatus(bidId, status, reason);

            // Close the bids modal if it's open
            if (showBidsModal) {
                closeBidsModal();
            }

            await fetchBids();

            // Show success message
            const statusText = status === 'APPROVED' ? 'approved' : 'rejected';
            toast.success(response.message || `Bid ${statusText} successfully!`);
        } catch (err) {
            console.error('Error updating bid:', err);
            toast.error(err.response?.data?.message || 'Failed to update bid');
        } finally {
            setUpdating(false);
        }
    };

    const handleBulkUpdate = async (status) => {
        if (selectedBids.length === 0) {
            toast.warning('Please select at least one bid');
            return;
        }

        // For rejections, open the modal instead of using prompt
        if (status === 'REJECTED') {
            setRejectingBid(null); // null indicates bulk rejection
            setRejectionReason('');
            setReasonError('');
            setShowRejectModal(true);
            return;
        }

        try {
            setUpdating(true);
            const response = await bulkUpdateBids(selectedBids, status, '');
            setSelectedBids([]);

            // Close the bids modal if it's open
            if (showBidsModal) {
                closeBidsModal();
            }

            await fetchBids();

            // Show success message
            const statusText = status === 'APPROVED' ? 'approved' : 'rejected';
            toast.success(response.message || `${selectedBids.length} bid(s) ${statusText} successfully!`);
        } catch (err) {
            console.error('Error bulk updating bids:', err);
            toast.error(err.response?.data?.message || 'Failed to update bids');
        } finally {
            setUpdating(false);
        }
    };

    // Open rejection modal for a single bid
    const openRejectModal = (bidId) => {
        setRejectingBid(bidId);
        setRejectionReason('');
        setReasonError('');
        setShowRejectModal(true);
    };

    // Handle the actual rejection (single or bulk)
    const handleConfirmReject = async () => {
        if (!rejectionReason.trim()) {
            setReasonError('Please provide a reason for rejection');
            return;
        }

        try {
            setUpdating(true);
            let response;
            if (rejectingBid) {
                // Single bid rejection
                response = await updateBidStatus(rejectingBid, 'REJECTED', rejectionReason.trim());
            } else {
                // Bulk rejection
                response = await bulkUpdateBids(selectedBids, 'REJECTED', rejectionReason.trim());
                setSelectedBids([]);
            }
            setShowRejectModal(false);
            setRejectingBid(null);
            setRejectionReason('');

            // Close the bids modal if it's open
            if (showBidsModal) {
                closeBidsModal();
            }

            await fetchBids();

            // Show success message
            const countText = rejectingBid ? '1 bid' : `${selectedBids.length} bid(s)`;
            toast.success(response.message || `${countText} rejected successfully!`);
        } catch (err) {
            console.error('Error rejecting bid(s):', err);
            toast.error(err.response?.data?.message || 'Failed to reject bid(s)');
        } finally {
            setUpdating(false);
        }
    };

    // Close rejection modal without action
    const closeRejectModal = () => {
        setShowRejectModal(false);
        setRejectingBid(null);
        setRejectionReason('');
        setReasonError('');
    };

    const toggleBidSelection = (bidId) => {
        setSelectedBids(prev =>
            prev.includes(bidId)
                ? prev.filter(id => id !== bidId)
                : [...prev, bidId]
        );
    };

    const selectAllVisible = () => {
        const visibleIds = bids.map(b => b._id);
        setSelectedBids(visibleIds);
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
            PENDING: 'warning',
            APPROVED: 'success',
            REJECTED: 'danger',
            WITHDRAWN: 'secondary'
        };
        return <Badge variant={variants[status] || 'info'}>{status}</Badge>;
    };

    const openPaperBids = (paperGroup) => {
        setSelectedPaper(paperGroup);
        setShowBidsModal(true);
    };

    const closeBidsModal = () => {
        setShowBidsModal(false);
        setSelectedPaper(null);
    };

    if (loading && bids.length === 0) {
        return (
            <>
                <Navbar />
                <Loading fullScreen message="Loading bids..." />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Manage Bids</h1>
                        <p className="text-gray-600 mt-1">Review and approve reviewer bids</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => navigate(`/organizer/conferences/${conferenceId}/assignments`)}>
                            View Assignments
                        </Button>
                        <Button onClick={() => navigate(`/organizer/conference/${conferenceId}`)}>
                            Back to Conference
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800">{error}</p>
                        <button onClick={fetchBids} className="text-red-600 hover:text-red-800 font-medium mt-2">
                            Try Again
                        </button>
                    </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 mb-6">
                    <Card className="cursor-pointer" onClick={() => setStatusFilter('PENDING')}>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-yellow-600">{stats.PENDING || 0}</div>
                            <p className="text-gray-600 mt-1">Pending</p>
                        </div>
                    </Card>
                    <Card className="cursor-pointer" onClick={() => setStatusFilter('APPROVED')}>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-green-600">{stats.APPROVED || 0}</div>
                            <p className="text-gray-600 mt-1">Approved</p>
                        </div>
                    </Card>
                    <Card className="cursor-pointer" onClick={() => setStatusFilter('REJECTED')}>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-red-600">{stats.REJECTED || 0}</div>
                            <p className="text-gray-600 mt-1">Rejected</p>
                        </div>
                    </Card>
                    <Card className="cursor-pointer" onClick={() => setStatusFilter('WITHDRAWN')}>
                        <div className="text-center">
                            <div className="text-3xl font-bold text-gray-600">{stats.WITHDRAWN || 0}</div>
                            <p className="text-gray-600 mt-1">Withdrawn</p>
                        </div>
                    </Card>
                </div>

                {/* Bulk Actions */}
                {statusFilter === 'PENDING' && bids.length > 0 && (
                    <div className="mb-6 flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                        <button onClick={selectAllVisible} className="text-blue-600 hover:underline text-sm">
                            Select All ({bids.length})
                        </button>
                        {selectedBids.length > 0 && (
                            <>
                                <span className="text-gray-500">|</span>
                                <span className="text-sm text-gray-600">{selectedBids.length} selected</span>
                                <Button
                                    size="sm"
                                    onClick={() => handleBulkUpdate('APPROVED')}
                                    disabled={updating}
                                >
                                    Approve Selected
                                </Button>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleBulkUpdate('REJECTED')}
                                    disabled={updating}
                                >
                                    Reject Selected
                                </Button>
                                <button onClick={() => setSelectedBids([])} className="text-gray-500 hover:underline text-sm">
                                    Clear Selection
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Bids List - Paper Centric View */}
                {groupedByPaper.length === 0 ? (
                    <Card className="text-center py-12">
                        <div className="text-6xl mb-4">📋</div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Bids Found</h3>
                        <p className="text-gray-600">No reviewer bids received yet.</p>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {groupedByPaper.map((paperGroup) => (
                            <Card key={paperGroup.paper._id} hoverable>
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <div className="flex items-start gap-3 mb-3">
                                            <h3 className="font-bold text-lg text-gray-900 flex-1">
                                                <span className="text-gray-600 font-medium">Paper Title:</span> {paperGroup.paper.title}
                                            </h3>
                                            {paperGroup.paper.trackId?.name && (
                                                <Badge variant="info">{paperGroup.paper.trackId.name}</Badge>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-6 text-sm text-gray-600 mb-4">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">Total Bids:</span>
                                                <span className="font-bold text-gray-900">{paperGroup.bids.length}</span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="flex items-center gap-1">
                                                    <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                                                    <span>{paperGroup.stats.PENDING} Pending</span>
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                                    <span>{paperGroup.stats.APPROVED} Approved</span>
                                                </span>
                                                <span className="flex items-center gap-1">
                                                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                                                    <span>{paperGroup.stats.REJECTED} Rejected</span>
                                                </span>
                                            </div>
                                        </div>

                                        <Button
                                            size="sm"
                                            onClick={() => openPaperBids(paperGroup)}
                                        >
                                            View Bids ({paperGroup.bids.length})
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Rejection Reason Modal */}
                {showRejectModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
                        <Card className="w-full max-w-md mx-4">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">
                                {rejectingBid ? 'Reject Bid' : `Reject ${selectedBids.length} Bid(s)`}
                            </h2>

                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Rejection Reason <span className="text-red-500">*</span>
                                </label>
                                <textarea
                                    value={rejectionReason}
                                    onChange={(e) => {
                                        setRejectionReason(e.target.value);
                                        if (e.target.value.trim()) setReasonError('');
                                    }}
                                    placeholder="Please provide a reason for rejection..."
                                    rows={4}
                                    className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${reasonError ? 'border-red-500' : 'border-gray-300'
                                        }`}
                                />
                                {reasonError && (
                                    <p className="text-red-500 text-sm mt-1">{reasonError}</p>
                                )}
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button
                                    variant="secondary"
                                    onClick={closeRejectModal}
                                    disabled={updating}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="danger"
                                    onClick={handleConfirmReject}
                                    disabled={updating}
                                >
                                    {updating ? 'Rejecting...' : 'Confirm Rejection'}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Paper Bids Modal */}
                {showBidsModal && selectedPaper && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                            {/* Modal Header */}
                            <div className="px-6 py-4 border-b border-gray-200">
                                <div className="flex items-start justify-between">
                                    <div className="flex-1">
                                        <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                            <span className="text-gray-600 font-medium">Paper Title:</span> {selectedPaper.paper.title}
                                        </h2>
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            {selectedPaper.paper.trackId?.name && (
                                                <Badge variant="info">{selectedPaper.paper.trackId.name}</Badge>
                                            )}
                                            <span>•</span>
                                            <span>{selectedPaper.bids.length} Bid(s)</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={closeBidsModal}
                                        className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body - Scrollable */}
                            <div className="flex-1 overflow-y-auto px-6 py-4">
                                <div className="space-y-4">
                                    {selectedPaper.bids.map((bid) => (
                                        <div
                                            key={bid._id}
                                            className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                                        >
                                            <div className="flex items-start gap-4">
                                                {statusFilter === 'PENDING' && bid.status === 'PENDING' && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedBids.includes(bid._id)}
                                                        onChange={() => toggleBidSelection(bid._id)}
                                                        className="mt-1 h-5 w-5 rounded border-gray-300"
                                                    />
                                                )}

                                                <div className="flex-1">
                                                    <div className="flex justify-between items-start mb-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                                                <span className="text-blue-600 font-semibold">
                                                                    {bid.reviewerId?.name?.charAt(0).toUpperCase() || '?'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <h4 className="font-semibold text-gray-900">
                                                                    {bid.reviewerId?.name || 'Unknown Reviewer'}
                                                                </h4>
                                                                <p className="text-sm text-gray-600">
                                                                    {bid.reviewerId?.email || 'N/A'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {getStatusBadge(bid.status)}
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-600">Confidence:</span>
                                                            <div className="flex items-center gap-1">
                                                                <div className="flex gap-0.5">
                                                                    {[...Array(10)].map((_, i) => (
                                                                        <div
                                                                            key={i}
                                                                            className={`w-2 h-4 rounded-sm ${i < bid.confidence ? 'bg-blue-500' : 'bg-gray-200'
                                                                                }`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                                <span className="font-medium text-gray-900 ml-1">
                                                                    {bid.confidence}/10
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-gray-600">Bid Date:</span>{' '}
                                                            <span className="text-gray-900">{formatDate(bid.createdAt)}</span>
                                                        </div>
                                                    </div>

                                                    {bid.reviewerId?.expertiseDomains?.length > 0 && (
                                                        <div className="text-sm mb-3">
                                                            <span className="text-gray-600">Expertise:</span>
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                {bid.reviewerId.expertiseDomains.map((domain, idx) => (
                                                                    <span
                                                                        key={idx}
                                                                        className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs"
                                                                    >
                                                                        {domain}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {bid.status === 'PENDING' && (
                                                        <div className="flex gap-2">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateStatus(bid._id, 'APPROVED')}
                                                                disabled={updating}
                                                            >
                                                                ✓ Approve
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="danger"
                                                                onClick={() => openRejectModal(bid._id)}
                                                                disabled={updating}
                                                            >
                                                                ✕ Reject
                                                            </Button>
                                                        </div>
                                                    )}

                                                    {bid.rejectionReason && (
                                                        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                                                            <p className="text-sm text-red-800">
                                                                <span className="font-medium">Rejection Reason:</span> {bid.rejectionReason}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Modal Footer with Bulk Actions */}
                            {statusFilter === 'PENDING' && selectedPaper.stats.PENDING > 0 && (
                                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-600">
                                            {selectedBids.filter(id =>
                                                selectedPaper.bids.some(b => b._id === id)
                                            ).length > 0 && (
                                                    <span>
                                                        {selectedBids.filter(id =>
                                                            selectedPaper.bids.some(b => b._id === id)
                                                        ).length} bid(s) selected
                                                    </span>
                                                )}
                                        </div>
                                        <div className="flex gap-3">
                                            <Button
                                                variant="secondary"
                                                onClick={closeBidsModal}
                                            >
                                                Close
                                            </Button>
                                            {selectedBids.filter(id =>
                                                selectedPaper.bids.some(b => b._id === id)
                                            ).length > 0 && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleBulkUpdate('APPROVED')}
                                                            disabled={updating}
                                                        >
                                                            Approve Selected
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="danger"
                                                            onClick={() => handleBulkUpdate('REJECTED')}
                                                            disabled={updating}
                                                        >
                                                            Reject Selected
                                                        </Button>
                                                    </>
                                                )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default ManageBids;
