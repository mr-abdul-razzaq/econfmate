import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';
import {
    getConferenceAuthors,
    getConferenceParticipants,
    markAuthorAttendance,
    markAttendance,
    getCertificateStats,
    generateCertificates
} from '../../utils/api';

const ManageAuthors = () => {
    const { id, conferenceId: confId } = useParams();
    const conferenceId = id || confId;
    const navigate = useNavigate();
    const toast = useToast();

    const [submissions, setSubmissions] = useState([]);
    const [participants, setParticipants] = useState([]);
    const [conference, setConference] = useState(null);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);
    const [updatingParticipant, setUpdatingParticipant] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('authors');

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const [authorsRes, statsRes, participantsRes] = await Promise.all([
                getConferenceAuthors(conferenceId),
                getCertificateStats(conferenceId),
                getConferenceParticipants(conferenceId)
            ]);

            setSubmissions(authorsRes.data?.submissions || []);
            setConference(authorsRes.data?.conference || null);
            setParticipants(participantsRes.data?.registrations || participantsRes.data?.data?.registrations || []);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error('Error fetching data:', err);
            setError(err.response?.data?.message || 'Failed to load data');
        } finally {
            setLoading(false);
        }
    }, [conferenceId]);

    useEffect(() => {
        if (conferenceId) {
            fetchData();
        }
    }, [conferenceId, fetchData]);

    const handleAttendanceToggle = async (submission) => {
        try {
            setUpdating(submission._id);
            await markAuthorAttendance(submission._id, !submission.authorAttendanceMarked);

            // Update local state
            setSubmissions(prev => prev.map(s =>
                s._id === submission._id
                    ? { ...s, authorAttendanceMarked: !s.authorAttendanceMarked, authorAttendanceMarkedAt: new Date() }
                    : s
            ));

            toast.success(`Attendance ${submission.authorAttendanceMarked ? 'unmarked' : 'marked'} for ${submission.authorId?.name}`);

            // Refresh stats
            const statsRes = await getCertificateStats(conferenceId);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error('Error updating attendance:', err);
            toast.error(err.response?.data?.message || 'Failed to update attendance');
        } finally {
            setUpdating(null);
        }
    };

    const handleMarkAllAttendance = async () => {
        try {
            setUpdating('all');
            const unmarked = submissions.filter(s => !s.authorAttendanceMarked);

            for (const sub of unmarked) {
                await markAuthorAttendance(sub._id, true);
            }

            setSubmissions(prev => prev.map(s => ({
                ...s,
                authorAttendanceMarked: true,
                authorAttendanceMarkedAt: new Date()
            })));

            toast.success(`Marked attendance for ${unmarked.length} authors`);

            // Refresh stats
            const statsRes = await getCertificateStats(conferenceId);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error('Error marking all attendance:', err);
            toast.error('Failed to mark all attendance');
        } finally {
            setUpdating(null);
        }
    };

    const handleGenerateCertificates = async () => {
        try {
            setGenerating(true);
            const response = await generateCertificates(conferenceId);

            const created = response.data?.createdCount || 0;
            toast.success(`Successfully generated ${created} certificate(s)!`);

            // Refresh stats
            const statsRes = await getCertificateStats(conferenceId);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error('Error generating certificates:', err);
            toast.error(err.response?.data?.message || 'Failed to generate certificates');
        } finally {
            setGenerating(false);
        }
    };

    const handleParticipantAttendanceToggle = async (registration) => {
        try {
            setUpdatingParticipant(registration._id);
            const attended = !registration.attendanceMarked;

            await markAttendance(registration._id, attended);

            setParticipants(prev =>
                prev.map((p) =>
                    p._id === registration._id
                        ? {
                            ...p,
                            attendanceMarked: attended,
                            attendedAt: attended ? new Date().toISOString() : null
                        }
                        : p
                )
            );

            toast.success(
                attended
                    ? `Marked attendance for ${registration.participantId?.name || 'participant'}`
                    : `Attendance removed for ${registration.participantId?.name || 'participant'}`
            );

            // Refresh stats after participant attendance changes
            const statsRes = await getCertificateStats(conferenceId);
            setStats(statsRes.data || null);
        } catch (err) {
            console.error('Error updating participant attendance:', err);
            toast.error(err.response?.data?.message || 'Failed to update participant attendance');
        } finally {
            setUpdatingParticipant(null);
        }
    };

    const formatDate = (date) => {
        if (!date) return 'Not marked';
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <Loading fullScreen message="Loading authors..." />
            </>
        );
    }

    const attendedCount = submissions.filter(s => s.authorAttendanceMarked).length;
    const pendingCount = submissions.length - attendedCount;

    const participantAttendedCount = participants.filter(p => p.attendanceMarked).length;
    const participantPendingCount = participants.length - participantAttendedCount;

    // Dynamic counts based on active tab
    const displayAttendedCount = activeTab === 'authors' ? attendedCount : participantAttendedCount;
    const displayTotalCount = activeTab === 'authors' ? submissions.length : participants.length;
    const displayPendingCount = activeTab === 'authors' ? pendingCount : participantPendingCount;

    return (
        <>
            <Navbar />
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <div className="mb-8">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                        <Link to="/organizer/dashboard" className="hover:text-gray-900">Dashboard</Link>
                        <span>/</span>
                        <Link to={`/organizer/conference/${conferenceId}`} className="hover:text-gray-900">
                            {conference?.name || 'Conference'}
                        </Link>
                        <span>/</span>
                        <span className="text-gray-900">Manage Attendance & Certificates</span>
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900">Manage Attendance & Certificates</h1>
                    <p className="text-gray-600 mt-1">Mark attendance for authors with accepted papers to enable certificate generation</p>
                    <Button
                        variant="secondary"
                        className="mt-4"
                        onClick={() => navigate(`/organizer/conference/${conferenceId}`)}
                    >
                        ← Back to Conference
                    </Button>
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

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <Card className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white">
                            <h3 className="text-lg font-medium opacity-90">Authors</h3>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-3xl font-bold">{stats.eligible?.authors || 0}</span>
                                <span className="text-sm opacity-80">eligible</span>
                            </div>
                            <p className="text-sm mt-2 opacity-80">
                                {stats.existing?.authors || 0} certificates generated
                            </p>
                        </Card>

                        <Card className="bg-gradient-to-r from-blue-500 to-purple-500 text-white">
                            <h3 className="text-lg font-medium opacity-90">Participants</h3>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-3xl font-bold">{stats.eligible?.participants || 0}</span>
                                <span className="text-sm opacity-80">eligible</span>
                            </div>
                            <p className="text-sm mt-2 opacity-80">
                                {stats.existing?.participants || 0} certificates generated
                            </p>
                        </Card>

                        <Card className="bg-gradient-to-r from-rose-500 to-pink-500 text-white">
                            <h3 className="text-lg font-medium opacity-90">Reviewers</h3>
                            <div className="mt-2 flex items-baseline gap-2">
                                <span className="text-3xl font-bold">{stats.eligible?.reviewers || 0}</span>
                                <span className="text-sm opacity-80">eligible</span>
                            </div>
                            <p className="text-sm mt-2 opacity-80">
                                {stats.existing?.reviewers || 0} certificates generated
                            </p>
                        </Card>
                    </div>
                )}

                {/* Actions Bar */}
                <Card className="mb-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div>
                                <span className="text-2xl font-bold text-gray-900">{displayAttendedCount}</span>
                                <span className="text-gray-600 ml-1">/ {displayTotalCount} attended</span>
                            </div>
                            {displayPendingCount > 0 && (
                                <Badge variant="warning">{displayPendingCount} pending</Badge>
                            )}
                        </div>

                        <div className="flex gap-3">
                            {activeTab === 'authors' && pendingCount > 0 && (
                                <Button
                                    variant="secondary"
                                    onClick={handleMarkAllAttendance}
                                    disabled={updating === 'all'}
                                >
                                    {updating === 'all' ? 'Marking...' : `Mark All (${pendingCount})`}
                                </Button>
                            )}

                            <Button
                                onClick={handleGenerateCertificates}
                                disabled={generating || (stats?.pending?.authors === 0 && stats?.pending?.participants === 0 && stats?.pending?.reviewers === 0)}
                                className="bg-emerald-600 hover:bg-emerald-700"
                            >
                                {generating ? (
                                    <>
                                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                        </svg>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        📜 Generate All Certificates
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Tab Navigation */}
                <Card className="mb-6">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setActiveTab('authors')}
                            className={`flex-1 px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${activeTab === 'authors'
                                ? 'bg-emerald-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            👨‍💼 Author Attendance
                        </button>
                        <button
                            onClick={() => setActiveTab('participants')}
                            className={`flex-1 px-6 py-3 font-semibold rounded-lg transition-all duration-200 ${activeTab === 'participants'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                        >
                            👥 Participant Attendance
                        </button>
                    </div>
                </Card>

                {/* Authors Attendance List */}
                {activeTab === 'authors' && (submissions.length === 0 ? (
                    <Card className="text-center py-12">
                        <div className="text-6xl mb-4">📝</div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">
                            No Accepted Submissions
                        </h3>
                        <p className="text-gray-600 mb-6">
                            There are no accepted submissions for this conference yet. Accept submissions to mark author attendance.
                        </p>
                        <Button onClick={() => navigate(`/organizer/conference/${conferenceId}/submissions`)}>
                            View Submissions
                        </Button>
                    </Card>
                ) : (
                    <Card>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Author
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Paper Title
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Track
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Attendance
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {submissions.map((submission) => (
                                        <tr key={submission._id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div>
                                                    <div className="font-medium text-gray-900">
                                                        {submission.authorId?.name || 'Unknown Author'}
                                                    </div>
                                                    <div className="text-sm text-gray-500">
                                                        {submission.authorId?.email}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 line-clamp-2 max-w-md">
                                                    {submission.title}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <Badge variant="info">
                                                    {submission.trackId?.name || 'No Track'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {submission.authorAttendanceMarked ? (
                                                    <div>
                                                        <Badge variant="success">✓ Attended</Badge>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {formatDate(submission.authorAttendanceMarkedAt)}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Badge variant="warning">Pending</Badge>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <Button
                                                    size="sm"
                                                    variant={submission.authorAttendanceMarked ? 'secondary' : 'primary'}
                                                    onClick={() => handleAttendanceToggle(submission)}
                                                    disabled={updating === submission._id}
                                                >
                                                    {updating === submission._id ? (
                                                        'Updating...'
                                                    ) : submission.authorAttendanceMarked ? (
                                                        'Unmark'
                                                    ) : (
                                                        'Mark Present'
                                                    )}
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                ))}

                {/* Participants Attendance List */}
                {activeTab === 'participants' && (<div>
                    {participants.length === 0 ? (
                        <Card className="text-center py-10">
                            <div className="text-5xl mb-3">👥</div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-1">
                                No Participants Found
                            </h3>
                            <p className="text-gray-600 text-sm">
                                There are no participant registrations for this conference yet.
                            </p>
                        </Card>
                    ) : (
                        <>
                            <Card className="mb-4">
                                <div className="flex flex-wrap items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <div>
                                            <span className="text-2xl font-bold text-gray-900">
                                                {participantAttendedCount}
                                            </span>
                                            <span className="text-gray-600 ml-1">
                                                / {participants.length} attended
                                            </span>
                                        </div>
                                        {participantPendingCount > 0 && (
                                            <Badge variant="warning">
                                                {participantPendingCount} pending
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Attendance here controls eligibility for participant certificates.
                                    </p>
                                </div>
                            </Card>

                            <Card>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Participant
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Type
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Registered At
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Attendance
                                                </th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {participants.map((registration) => (
                                                <tr key={registration._id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div>
                                                            <div className="font-medium text-gray-900">
                                                                {registration.participantId?.name || 'N/A'}
                                                            </div>
                                                            <div className="text-sm text-gray-500">
                                                                {registration.participantId?.email || 'N/A'}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <Badge
                                                            variant={
                                                                registration.registrationType === 'presenter'
                                                                    ? 'primary'
                                                                    : 'default'
                                                            }
                                                        >
                                                            {registration.registrationType}
                                                        </Badge>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                        {registration.registeredAt
                                                            ? formatDate(registration.registeredAt)
                                                            : '—'}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        {registration.attendanceMarked ? (
                                                            <div>
                                                                <Badge variant="success">✓ Attended</Badge>
                                                                {registration.attendedAt && (
                                                                    <div className="text-xs text-gray-500 mt-1">
                                                                        {formatDate(registration.attendedAt)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <Badge variant="warning">Pending</Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <Button
                                                            size="sm"
                                                            variant={
                                                                registration.attendanceMarked ? 'secondary' : 'primary'
                                                            }
                                                            onClick={() =>
                                                                handleParticipantAttendanceToggle(registration)
                                                            }
                                                            disabled={updatingParticipant === registration._id}
                                                        >
                                                            {updatingParticipant === registration._id
                                                                ? 'Updating...'
                                                                : registration.attendanceMarked
                                                                    ? 'Unmark'
                                                                    : 'Mark Present'}
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>)}

                {/* Help Text */}
                <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h4 className="font-semibold text-blue-900 mb-2">💡 Certificate Generation Guide</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                        <li>• <strong>Authors:</strong> Mark attendance for each author who presented their paper at the conference above.</li>
                        <li>• <strong>Participants:</strong> Use the participant attendance section on this page; attendance here drives participation certificates.</li>
                        <li>• <strong>Reviewers:</strong> Certificates are automatically eligible for reviewers who submitted final verdicts (Accept/Reject).</li>
                        <li>• Click "Generate All Certificates" to create PDFs for all eligible users.</li>
                    </ul>
                </div>
            </div >
        </>
    );
};

export default ManageAuthors;
