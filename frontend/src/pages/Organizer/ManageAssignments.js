import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';
import { getConferenceAssignments, runAutoAssign, updateAssignment, deleteAssignment } from '../../utils/api';

const ManageAssignments = () => {
    const { conferenceId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const [assignments, setAssignments] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [running, setRunning] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const [config, setConfig] = useState({
        reviewersPerPaper: 3,
        maxPapersPerReviewer: 4,
        clearExisting: false
    });

    const fetchAssignments = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await getConferenceAssignments(conferenceId);
            setAssignments(response.data?.assignments || []);
            setStats(response.data?.stats || null);
        } catch (err) {
            console.error('Error fetching assignments:', err);
            setError(err.response?.data?.message || 'Failed to load assignments');
        } finally {
            setLoading(false);
        }
    }, [conferenceId]);

    useEffect(() => {
        fetchAssignments();
    }, [fetchAssignments]);

    const handleAutoAssign = async () => {
        try {
            setRunning(true);
            const result = await runAutoAssign(conferenceId, config);
            toast.success(`Auto-assignment completed! Assigned: ${result.data.assigned}, Papers covered: ${result.data.papersFullyAssigned}/${result.data.totalSubmissions}, Reviewers: ${result.data.reviewersUsed}`);
            setShowConfig(false);
            await fetchAssignments();
        } catch (err) {
            console.error('Auto-assign error:', err);
            toast.error(err.response?.data?.message || 'Failed to run auto-assignment');
        } finally {
            setRunning(false);
        }
    };

    const handleToggleLock = async (assignmentId, currentLocked) => {
        try {
            await updateAssignment(assignmentId, { locked: !currentLocked });
            await fetchAssignments();
        } catch (err) {
            console.error('Error toggling lock:', err);
            toast.error(err.response?.data?.message || 'Failed to update assignment');
        }
    };

    const handleDelete = async (assignmentId) => {
        if (!window.confirm('Are you sure you want to delete this assignment?')) return;

        try {
            await deleteAssignment(assignmentId);
            await fetchAssignments();
        } catch (err) {
            console.error('Error deleting assignment:', err);
            toast.error(err.response?.data?.message || 'Failed to delete assignment');
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
            ? <Badge variant="info">Auto</Badge>
            : <Badge variant="primary">Manual</Badge>;
    };

    // Group assignments by paper (submission)
    const groupedAssignments = useMemo(() => {
        const groups = {};
        assignments.forEach(assignment => {
            const paperId = assignment.submissionId?._id || 'unknown';
            if (!groups[paperId]) {
                groups[paperId] = {
                    paper: assignment.submissionId,
                    track: assignment.trackId,
                    reviewers: []
                };
            }
            groups[paperId].reviewers.push(assignment);
        });
        return Object.values(groups);
    }, [assignments]);

    if (loading && assignments.length === 0) {
        return (
            <>
                <Navbar />
                <Loading fullScreen message="Loading assignments..." />
            </>
        );
    }

    return (
        <>
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Manage Assignments</h1>
                        <p className="text-gray-600 mt-1">Reviewer-paper assignments</p>
                    </div>
                    <div className="flex gap-3">
                        <Button variant="secondary" onClick={() => navigate(`/organizer/conferences/${conferenceId}/bids`)}>
                            Manage Bids
                        </Button>
                        <Button onClick={() => setShowConfig(true)}>
                            Run Auto-Assign
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800">{error}</p>
                        <button onClick={fetchAssignments} className="text-red-600 hover:text-red-800 font-medium mt-2">
                            Try Again
                        </button>
                    </div>
                )}

                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <Card>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                                <p className="text-gray-600 mt-1">Total</p>
                            </div>
                        </Card>
                        <Card>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-green-600">{stats.active}</div>
                                <p className="text-gray-600 mt-1">Active</p>
                            </div>
                        </Card>
                        <Card>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-purple-600">{stats.completed}</div>
                                <p className="text-gray-600 mt-1">Completed</p>
                            </div>
                        </Card>
                        <Card>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-cyan-600">{stats.autoAssigned}</div>
                                <p className="text-gray-600 mt-1">Auto-Assigned</p>
                            </div>
                        </Card>
                        <Card>
                            <div className="text-center">
                                <div className="text-3xl font-bold text-orange-600">{Math.round(stats.avgScore || 0)}%</div>
                                <p className="text-gray-600 mt-1">Avg Score</p>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Auto-Assign Config Modal */}
                {showConfig && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <Card className="w-full max-w-md">
                            <h2 className="text-xl font-bold mb-4">Auto-Assignment Configuration</h2>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Reviewers per Paper
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="10"
                                        value={config.reviewersPerPaper}
                                        onChange={(e) => setConfig({ ...config, reviewersPerPaper: parseInt(e.target.value) || 3 })}
                                        className="w-full border rounded-lg px-3 py-2"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Max Papers per Reviewer
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="50"
                                        value={config.maxPapersPerReviewer}
                                        onChange={(e) => setConfig({ ...config, maxPapersPerReviewer: parseInt(e.target.value) || 4 })}
                                        className="w-full border rounded-lg px-3 py-2"
                                    />
                                </div>

                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="clearExisting"
                                        checked={config.clearExisting}
                                        onChange={(e) => setConfig({ ...config, clearExisting: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300"
                                    />
                                    <label htmlFor="clearExisting" className="text-sm text-gray-700">
                                        Clear existing non-locked assignments
                                    </label>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <Button variant="secondary" onClick={() => setShowConfig(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={handleAutoAssign} disabled={running}>
                                    {running ? 'Running...' : 'Run Assignment'}
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Assignments List - Paper-wise Grouped View */}
                {assignments.length === 0 ? (
                    <Card className="text-center py-12">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">No Assignments Yet</h3>
                        <p className="text-gray-600 mb-6">
                            Run the auto-assignment algorithm or create manual assignments.
                        </p>
                        <Button onClick={() => setShowConfig(true)}>
                            Run Auto-Assign
                        </Button>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {groupedAssignments.map((group) => (
                            <Card key={group.paper?._id || 'unknown'} className="overflow-hidden">
                                {/* Paper Header */}
                                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 -mx-4 -mt-4 px-4 py-4 mb-4 border-b border-blue-100">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <h3 className="font-bold text-lg text-gray-900 mb-1">
                                                <span className="text-gray-600 font-medium">Paper Title:</span> {group.paper?.title || 'Untitled Paper'}
                                            </h3>
                                            <div className="flex items-center gap-3 text-sm text-gray-600">
                                                {group.track?.name && (
                                                    <span className="flex items-center gap-1">
                                                        <Badge variant="info">{group.track.name}</Badge>
                                                    </span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <span className="text-blue-600 font-semibold">{group.reviewers.length}</span> Reviewer{group.reviewers.length !== 1 ? 's' : ''} Assigned
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Reviewers List */}
                                <div className="space-y-3">
                                    <p className="text-sm font-medium text-gray-700 mb-2">Assigned Reviewers:</p>
                                    {group.reviewers.map((assignment) => (
                                        <div
                                            key={assignment._id}
                                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                                        >
                                            <div className="flex items-center gap-4 flex-1">
                                                {/* Reviewer Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-medium text-gray-900">
                                                        {assignment.reviewerId?.name || 'Unknown Reviewer'}
                                                    </div>
                                                    <div className="text-sm text-gray-500 truncate">
                                                        {assignment.reviewerId?.email || 'No email'}
                                                    </div>
                                                </div>

                                                {/* Match Score */}
                                                <div className="text-center px-3">
                                                    <div className={`text-lg font-bold ${assignment.matchScore >= 80 ? 'text-green-600' :
                                                            assignment.matchScore >= 50 ? 'text-yellow-600' : 'text-red-600'
                                                        }`}>
                                                        {assignment.matchScore}%
                                                    </div>
                                                    <div className="text-xs text-gray-500">Match</div>
                                                </div>

                                                {/* Source Badge */}
                                                <div className="text-center">
                                                    {getSourceBadge(assignment.source)}
                                                </div>

                                                {/* Assigned Date */}
                                                <div className="text-center hidden md:block">
                                                    <div className="text-sm text-gray-600">{formatDate(assignment.assignedAt)}</div>
                                                    <div className="text-xs text-gray-500">Assigned</div>
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 ml-4">
                                                <button
                                                    onClick={() => handleToggleLock(assignment._id, assignment.locked)}
                                                    className={`p-2 rounded-lg transition-colors ${assignment.locked
                                                            ? 'text-yellow-600 bg-yellow-50 hover:bg-yellow-100'
                                                            : 'text-gray-400 hover:bg-gray-200'
                                                        }`}
                                                    title={assignment.locked ? 'Unlock assignment' : 'Lock assignment'}
                                                >
                                                    {assignment.locked ? '🔒' : '🔓'}
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(assignment._id)}
                                                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                                                    disabled={assignment.locked}
                                                    title="Delete assignment"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
};

export default ManageAssignments;
