import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { getReviewerAssignments } from '../../utils/api';

const MyAssignments = () => {
    const navigate = useNavigate();
    const [assignments, setAssignments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        fetchAssignments();
    }, []);

    const fetchAssignments = async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getReviewerAssignments();
            setAssignments(response.data || []);
        } catch (err) {
            console.error('Error fetching assignments:', err);
            setError(err.response?.data?.message || 'Failed to load assignments');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const getSourceBadge = (source) => {
        return source === 'AUTO'
            ? <Badge variant="info">Auto-Assigned</Badge>
            : <Badge variant="primary">Manually Assigned</Badge>;
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <Loading fullScreen message="Loading your assignments..." />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">My Assignments</h1>
                        <p className="text-gray-600 mt-1">Papers assigned to you for review</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => navigate('/reviewer/bids')}>
                            My Bids
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
                            onClick={fetchAssignments}
                            className="text-red-600 hover:text-red-800 font-medium mt-2"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {assignments.length === 0 ? (
                    <Card className="text-center py-12">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Assignments Yet</h3>
                        <p className="text-gray-600 mb-6">
                            You haven't been assigned any papers to review yet. Place bids on papers you're interested in reviewing.
                        </p>
                        <Button onClick={() => navigate('/reviewer/browse-conferences')}>
                            Browse Available Papers
                        </Button>
                    </Card>
                ) : (
                    <div className="space-y-4">
                        {/* Stats */}
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <Card>
                                <div className="text-center">
                                    <div className="text-4xl font-bold text-blue-600">{assignments.length}</div>
                                    <p className="text-gray-600 mt-2">Total Assigned</p>
                                </div>
                            </Card>
                            <Card>
                                <div className="text-center">
                                    <div className="text-4xl font-bold text-green-600">
                                        {assignments.filter(a => a.source === 'AUTO').length}
                                    </div>
                                    <p className="text-gray-600 mt-2">Auto-Assigned</p>
                                </div>
                            </Card>
                            <Card>
                                <div className="text-center">
                                    <div className="text-4xl font-bold text-purple-600">
                                        {assignments.filter(a => a.source === 'MANUAL').length}
                                    </div>
                                    <p className="text-gray-600 mt-2">Manually Assigned</p>
                                </div>
                            </Card>
                        </div>

                        {/* Assignments List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {assignments.map((assignment) => (
                                <Card key={assignment._id} hoverable>
                                    <div className="flex justify-between items-start mb-3">
                                        <h3 className="font-bold text-gray-900 line-clamp-2 flex-1 pr-2">
                                            {assignment.submissionId?.title || 'Untitled Submission'}
                                        </h3>
                                        {getSourceBadge(assignment.source)}
                                    </div>

                                    <div className="space-y-2 mb-4">
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">Conference:</span>{' '}
                                            {assignment.conferenceId?.name || 'Unknown Conference'}
                                        </p>
                                        {assignment.trackId?.name && (
                                            <p className="text-sm text-gray-600">
                                                <span className="font-medium">Track:</span>{' '}
                                                {assignment.trackId.name}
                                            </p>
                                        )}
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">Match Score:</span>{' '}
                                            <span className="font-semibold">{assignment.matchScore}%</span>
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            <span className="font-medium">Assigned:</span>{' '}
                                            {formatDate(assignment.assignedAt)}
                                        </p>

                                        {/* Review Deadline Display */}
                                        {assignment.conferenceId?.startDate && (() => {
                                            const conferenceStart = new Date(assignment.conferenceId.startDate);
                                            const deadline = new Date(conferenceStart);
                                            deadline.setDate(deadline.getDate() - 7);
                                            const now = new Date();
                                            const daysRemaining = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
                                            const isOverdue = daysRemaining < 0;
                                            const isUrgent = daysRemaining <= 2 && !isOverdue;
                                            const isWarning = daysRemaining > 2 && daysRemaining <= 5;

                                            return (
                                                <div className={`mt-3 p-3 rounded-lg border ${isOverdue ? 'bg-red-50 border-red-200' :
                                                        isUrgent ? 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200' :
                                                            isWarning ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200' :
                                                                'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                                                    }`}>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`text-xl ${isOverdue ? 'text-red-500' :
                                                                isUrgent ? 'text-red-500' :
                                                                    isWarning ? 'text-yellow-500' :
                                                                        'text-green-500'
                                                            }`}>
                                                            {isOverdue ? '⚠️' : isUrgent ? '🔥' : isWarning ? '⏰' : '📅'}
                                                        </div>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-medium text-gray-600">Review Deadline</p>
                                                            <p className={`text-sm font-bold ${isOverdue ? 'text-red-600' :
                                                                    isUrgent ? 'text-red-600' :
                                                                        isWarning ? 'text-yellow-700' :
                                                                            'text-green-700'
                                                                }`}>
                                                                {deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                            </p>
                                                        </div>
                                                        <div className={`px-2 py-1 rounded-full text-xs font-bold ${isOverdue ? 'bg-red-100 text-red-700' :
                                                                isUrgent ? 'bg-red-100 text-red-700' :
                                                                    isWarning ? 'bg-yellow-100 text-yellow-700' :
                                                                        'bg-green-100 text-green-700'
                                                            }`}>
                                                            {isOverdue
                                                                ? `${Math.abs(daysRemaining)}d overdue`
                                                                : daysRemaining === 0
                                                                    ? 'Due today!'
                                                                    : `${daysRemaining}d left`
                                                            }
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    <Button
                                        fullWidth
                                        onClick={() => navigate(`/reviewer/review/${assignment.submissionId?._id}`)}
                                    >
                                        Write Review
                                    </Button>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default MyAssignments;
