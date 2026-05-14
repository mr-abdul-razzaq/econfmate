import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSubmissionDetailsAuthor, uploadRevision, uploadPaper } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Textarea from '../../components/Textarea';
import { viewPdfInNewTab, downloadPdfFile, extractFilename } from '../../utils/pdfHelper';

export default function SubmissionDetails() {
    const { id: submissionId } = useParams();
    const navigate = useNavigate();
    const [submission, setSubmission] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Revision form state
    const [showRevisionForm, setShowRevisionForm] = useState(false);
    const [revisionAbstract, setRevisionAbstract] = useState('');
    const [revisionFile, setRevisionFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const fetchSubmission = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await getSubmissionDetailsAuthor(submissionId);
            const submissionData = data.data || data;
            setSubmission(submissionData);
            setRevisionAbstract(submissionData.abstract || '');
        } catch (err) {
            console.error('Error fetching submission:', err);
            setError(err.response?.data?.message || 'Failed to load submission details');
        } finally {
            setLoading(false);
        }
    }, [submissionId]);

    useEffect(() => {
        fetchSubmission();
    }, [fetchSubmission]);

    const handleRevisionSubmit = async (e) => {
        e.preventDefault();
        if (!revisionFile) {
            setUploadError('Please select a file to upload');
            return;
        }

        try {
            setUploading(true);
            setUploadError(null);

            // First upload the file
            const uploadResult = await uploadPaper(revisionFile);
            const fileUrl = uploadResult.data?.fileUrl || uploadResult.fileUrl;

            // Then submit the revision
            await uploadRevision(submissionId, {
                abstract: revisionAbstract,
                fileUrl: fileUrl
            });

            // Refresh the submission data
            await fetchSubmission();
            setShowRevisionForm(false);
            setRevisionFile(null);
        } catch (err) {
            console.error('Error uploading revision:', err);
            setUploadError(err.response?.data?.message || 'Failed to upload revision');
        } finally {
            setUploading(false);
        }
    };

    const getStatusBadge = (status) => {
        const variants = {
            submitted: 'info',
            submitted_pending_dup_check: 'warning',
            submitted_dup_ok: 'info',
            submitted_dup_suspect: 'danger',
            under_review: 'warning',
            accepted: 'success',
            rejected: 'danger',
            rejected_duplicate: 'danger',
            revision: 'default',
            pending: 'info',
            manual_review_required: 'warning',
        };
        const statusLabels = {
            submitted: 'Submitted',
            submitted_pending_dup_check: 'Checking for Duplicates',
            submitted_dup_ok: 'Submitted (Original)',
            submitted_dup_suspect: 'Submitted (Flagged)',
            under_review: 'Under Review',
            accepted: 'Accepted',
            rejected: 'Rejected',
            rejected_duplicate: 'Rejected (Duplicate)',
            revision: 'Revision Requested',
            pending: 'Pending',
            manual_review_required: 'Manual Review Required',
        };
        return <Badge variant={variants[status] || 'default'}>{statusLabels[status] || status}</Badge>;
    };

    // PDF helper functions imported from utils/pdfHelper

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    // Status timeline configuration
    const statusSteps = [
        { key: 'submitted', label: 'Submitted' },
        { key: 'dup_check', label: 'Dup Check' },
        { key: 'under_review', label: 'Under Review' },
        { key: 'decision', label: 'Decision' }
    ];

    const getStatusProgress = (status) => {
        if (status === 'submitted' || status === 'submitted_pending_dup_check') return 1;
        if (status === 'submitted_dup_ok' || status === 'submitted_dup_suspect') return 2;
        if (status === 'under_review') return 3;
        if (status === 'revision') return 3;
        if (['accepted', 'rejected', 'rejected_duplicate'].includes(status)) return 4;
        return 1;
    };

    if (loading) return <Loading />;

    return (
        <>
            <Navbar />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 page-transition">
                <div className="mb-6">
                    <button
                        onClick={() => navigate(-1)}
                        className="text-primary-600 hover:text-primary-800 mb-4 flex items-center gap-2 transition-colors"
                    >
                        <span>←</span> Back to Submissions
                    </button>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg animate-fade-in">
                        <p className="text-red-800">{error}</p>
                        <button
                            onClick={fetchSubmission}
                            className="text-red-600 hover:text-red-800 font-medium mt-2"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {submission && (
                    <>
                        {/* Co-Author Banner */}
                        {submission.isCoAuthor && (
                            <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg animate-fade-in">
                                <div className="flex items-center gap-2">
                                    <span className="text-2xl">👥</span>
                                    <div>
                                        <p className="font-semibold text-blue-900">Co-Author View</p>
                                        <p className="text-sm text-blue-700">
                                            You are viewing this submission as a co-author.
                                            Primary author: <span className="font-medium">{submission.authorId?.name || 'Unknown'}</span>
                                        </p>
                                        <p className="text-xs text-blue-600 mt-1">
                                            ℹ️ You have view-only access. Only the primary author can edit or resubmit this paper.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Header */}
                        <Card className="mb-6 card-hover">
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex-1">
                                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                                        {submission.title}
                                    </h1>
                                    <div className="flex items-center gap-3">
                                        {getStatusBadge(submission.status)}
                                        <span className="text-xs sm:text-sm text-gray-600">
                                            Submitted: {formatDate(submission.createdAt || submission.submittedAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <h3 className="text-sm font-medium text-gray-600">Conference</h3>
                                    <p className="text-gray-900 font-medium">{submission.conferenceId?.name || 'Unknown'}</p>
                                </div>
                                <div>
                                    <h3 className="text-sm font-medium text-gray-600">Track</h3>
                                    <p className="text-gray-900 font-medium">{submission.trackId?.name || 'Unknown'}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Modern Status Timeline */}
                        <Card className="mb-6 overflow-hidden">
                            <div className="bg-gradient-to-r from-primary-600 to-primary-800 -mx-6 -mt-6 px-6 py-4 mb-6">
                                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    Paper Lifecycle
                                </h2>
                            </div>

                            <div className="flex flex-col md:flex-row gap-4 relative">
                                {/* Connecting line for desktop */}
                                <div className="hidden md:block absolute top-8 left-[15%] right-[15%] h-1 bg-gray-200 rounded-full">
                                    <div
                                        className="h-full bg-gradient-to-r from-primary-500 to-green-500 rounded-full transition-all duration-700"
                                        style={{ width: `${((getStatusProgress(submission.status) - 1) / (statusSteps.length - 1)) * 100}%` }}
                                    />
                                </div>

                                {statusSteps.map((step, index) => {
                                    const currentProgress = getStatusProgress(submission.status);
                                    const isCompleted = index + 1 < currentProgress;
                                    const isActive = index + 1 === currentProgress;
                                    const isFinal = step.key === 'decision' && ['accepted', 'rejected', 'revision'].includes(submission.status);

                                    const getStepIcon = () => {
                                        if (step.key === 'submitted') {
                                            return (
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            );
                                        }
                                        if (step.key === 'under_review') {
                                            return (
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                </svg>
                                            );
                                        }
                                        if (isFinal && submission.status === 'accepted') {
                                            return (
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            );
                                        }
                                        if (isFinal && submission.status === 'rejected') {
                                            return (
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                            );
                                        }
                                        if (isFinal && submission.status === 'revision') {
                                            return (
                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                            );
                                        }
                                        return (
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                        );
                                    };

                                    const getStatusColor = () => {
                                        if (isCompleted) return 'from-green-500 to-green-600';
                                        if (isActive && submission.status === 'accepted') return 'from-green-500 to-green-600';
                                        if (isActive && submission.status === 'rejected') return 'from-red-500 to-red-600';
                                        if (isActive && submission.status === 'revision') return 'from-yellow-500 to-yellow-600';
                                        if (isActive) return 'from-primary-500 to-primary-600';
                                        return 'from-gray-300 to-gray-400';
                                    };

                                    const getLabel = () => {
                                        if (isFinal) {
                                            if (submission.status === 'accepted') return '✓ Accepted';
                                            if (submission.status === 'rejected') return '✗ Rejected';
                                            return '↻ Revision Needed';
                                        }
                                        return step.label;
                                    };

                                    return (
                                        <div
                                            key={step.key}
                                            className={`flex-1 flex flex-col items-center relative z-10 transition-all duration-300 ${isActive ? 'transform md:scale-110' : ''
                                                }`}
                                        >
                                            {/* Icon Circle */}
                                            <div
                                                className={`w-16 h-16 rounded-full bg-gradient-to-br ${getStatusColor()} 
                                                    flex items-center justify-center shadow-lg transition-all duration-500
                                                    ${isActive ? 'ring-4 ring-offset-2 ring-primary-300 animate-pulse-soft' : ''}
                                                    ${isCompleted ? 'ring-2 ring-offset-1 ring-green-200' : ''}`}
                                            >
                                                <div className="text-white">
                                                    {isCompleted ? (
                                                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    ) : getStepIcon()}
                                                </div>
                                            </div>

                                            {/* Label */}
                                            <div className={`mt-3 text-center px-2 ${isActive || isCompleted || isFinal
                                                ? 'text-gray-900 font-semibold'
                                                : 'text-gray-400'
                                                }`}>
                                                <span className="text-sm block">{getLabel()}</span>
                                                {isActive && !isCompleted && (
                                                    <span className="text-xs text-primary-600 font-medium mt-1 block">
                                                        Current Stage
                                                    </span>
                                                )}
                                            </div>

                                            {/* Mobile connecting line */}
                                            {index < statusSteps.length - 1 && (
                                                <div className="md:hidden w-0.5 h-8 bg-gray-200 my-2">
                                                    <div
                                                        className={`w-full bg-gradient-to-b from-green-500 to-primary-500 transition-all duration-500
                                                            ${isCompleted ? 'h-full' : 'h-0'}`}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Status Description */}
                            <div className={`mt-6 p-4 rounded-xl text-center ${submission.status === 'accepted' ? 'bg-green-50 border border-green-200' :
                                submission.status === 'rejected' ? 'bg-red-50 border border-red-200' :
                                    submission.status === 'revision' ? 'bg-yellow-50 border border-yellow-200' :
                                        'bg-blue-50 border border-blue-200'
                                }`}>
                                <p className={`font-medium ${submission.status === 'accepted' ? 'text-green-800' :
                                    submission.status === 'rejected' || submission.status === 'rejected_duplicate' ? 'text-red-800' :
                                        submission.status === 'revision' ? 'text-yellow-800' :
                                            'text-blue-800'
                                    }`}>
                                    {submission.status === 'submitted' && '📄 Your paper has been submitted and is awaiting review.'}
                                    {submission.status === 'submitted_pending_dup_check' && '⏳ Your paper is being checked for originality...'}
                                    {submission.status === 'submitted_dup_ok' && '✅ Your paper passed the originality check and is awaiting organizer review.'}
                                    {submission.status === 'submitted_dup_suspect' && '⚠️ Your paper has been flagged for review. The organizer will assess it shortly.'}
                                    {submission.status === 'under_review' && '🔍 Reviewers are currently evaluating your paper.'}
                                    {submission.status === 'accepted' && '🎉 Congratulations! Your paper has been accepted.'}
                                    {submission.status === 'rejected' && '📝 Unfortunately, your paper was not accepted this time.'}
                                    {submission.status === 'rejected_duplicate' && '🔴 Your paper was rejected due to duplication concerns.'}
                                    {submission.status === 'revision' && '✏️ Please submit a revised version of your paper.'}
                                </p>
                            </div>

                            {/* Scheduled Presentation Section - only shown for accepted papers with schedule */}
                            {submission.status === 'accepted' && submission.scheduled && submission.scheduled.date && (
                                <div className="mt-6 p-5 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300">
                                    <div className="flex items-start gap-4">
                                        <div className="text-4xl">🗓️</div>
                                        <div className="flex-1">
                                            <h3 className="text-lg font-bold text-green-800 mb-3">📍 Scheduled Presentation</h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="bg-white p-3 rounded-lg border border-green-200">
                                                    <p className="text-sm text-gray-600 mb-1">📅 Date</p>
                                                    <p className="text-lg font-semibold text-gray-900">
                                                        {formatDate(submission.scheduled.date)}
                                                    </p>
                                                </div>
                                                {(submission.scheduled.startTime || submission.scheduled.time) && (
                                                    <div className="bg-white p-3 rounded-lg border border-green-200">
                                                        <p className="text-sm text-gray-600 mb-1">⏰ Time</p>
                                                        <p className="text-lg font-semibold text-gray-900">
                                                            {submission.scheduled.startTime || submission.scheduled.time}
                                                            {submission.scheduled.endTime && ` - ${submission.scheduled.endTime}`}
                                                        </p>
                                                    </div>
                                                )}
                                                {submission.scheduled.venue && (
                                                    <div className="bg-white p-3 rounded-lg border border-green-200 md:col-span-2">
                                                        <p className="text-sm text-gray-600 mb-1">📍 Venue</p>
                                                        <p className="text-lg font-semibold text-gray-900">
                                                            {submission.scheduled.venue}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-4 text-sm text-green-700">
                                                ✨ Please prepare your presentation and arrive at least 15 minutes early.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* Abstract */}
                        <Card className="mb-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-3">Abstract</h2>
                            <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{submission.abstract}</p>
                        </Card>

                        {/* Keywords */}
                        {submission.keywords && submission.keywords.length > 0 && (
                            <Card className="mb-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-3">Keywords</h2>
                                <div className="flex flex-wrap gap-2">
                                    {submission.keywords.map((keyword, index) => (
                                        <span
                                            key={index}
                                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                                        >
                                            {keyword}
                                        </span>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Co-Authors */}
                        {submission.coAuthors && submission.coAuthors.length > 0 && (
                            <Card className="mb-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-3">Co-Authors</h2>
                                <div className="space-y-3">
                                    {submission.coAuthors.map((coAuthor, index) => (
                                        <div
                                            key={index}
                                            className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                                        >
                                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                                <span className="text-blue-600 font-semibold">
                                                    {coAuthor.name.charAt(0).toUpperCase()}
                                                </span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-gray-900">{coAuthor.name}</p>
                                                <p className="text-sm text-gray-600">{coAuthor.email}</p>
                                                {coAuthor.orcid && (
                                                    <p className="text-xs text-gray-500 mt-1">
                                                        ORCID: {coAuthor.orcid}
                                                    </p>
                                                )}
                                                {coAuthor.userId && (
                                                    <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                                        ✓ Registered User
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Paper File */}
                        {submission.fileUrl && (
                            <Card className="mb-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-3">Submitted Paper</h2>
                                <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-lg">
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-600">
                                            <span className="font-medium">File:</span> {submission.fileUrl.split('/').pop()}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => viewPdfInNewTab(submission.fileUrl)}
                                        className="hidden px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md"
                                    >
                                        📄 View Paper
                                    </button>
                                    <button
                                        onClick={() => downloadPdfFile(submission.fileUrl, extractFilename(submission.fileUrl, submission.title))}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition shadow-md"
                                    >
                                        ⬇️ Download
                                    </button>
                                </div>
                            </Card>
                        )}

                        {/* Revision Request Banner */}
                        {submission.status === 'revision' && !submission.isCoAuthor && (
                            <Card className="mb-6 border-2 border-yellow-400 bg-yellow-50">
                                <div className="flex items-start gap-4">
                                    <div className="text-3xl">📝</div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold text-yellow-800 mb-2">Revision Requested</h2>
                                        <p className="text-yellow-700 mb-4">
                                            The reviewer has requested revisions to your paper. Please review the feedback below and submit an updated version.
                                        </p>
                                        {!showRevisionForm ? (
                                            <Button onClick={() => setShowRevisionForm(true)}>
                                                📤 Upload Revised Paper
                                            </Button>
                                        ) : (
                                            <form onSubmit={handleRevisionSubmit} className="space-y-4 mt-4 p-4 bg-white rounded-lg border border-yellow-300">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        Updated Abstract <span className="text-red-500">*</span>
                                                    </label>
                                                    <Textarea
                                                        value={revisionAbstract}
                                                        onChange={(e) => setRevisionAbstract(e.target.value)}
                                                        placeholder="Update your abstract if needed..."
                                                        rows={4}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                                        Revised Paper (PDF) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="file"
                                                        accept=".pdf"
                                                        onChange={(e) => setRevisionFile(e.target.files[0])}
                                                        className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                                                    />
                                                    {revisionFile && (
                                                        <p className="mt-2 text-sm text-green-600">✓ {revisionFile.name}</p>
                                                    )}
                                                </div>
                                                {uploadError && (
                                                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                                                        <p className="text-red-700 text-sm">{uploadError}</p>
                                                    </div>
                                                )}
                                                <div className="flex gap-3">
                                                    <Button type="submit" disabled={uploading}>
                                                        {uploading ? 'Uploading...' : 'Submit Revision'}
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setShowRevisionForm(false);
                                                            setUploadError(null);
                                                        }}
                                                    >
                                                        Cancel
                                                    </Button>
                                                </div>
                                            </form>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Decision & Feedback */}
                        {(submission.decision || submission.feedback) && (
                            <Card className="mb-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-3">Organizer Feedback</h2>
                                {submission.decision?.decidedAt && (
                                    <p className="text-sm text-gray-600 mb-2">
                                        Decision made on: {formatDate(submission.decision.decidedAt)}
                                    </p>
                                )}
                                {(submission.decision?.feedback || submission.feedback) && (
                                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                        <p className="text-gray-700 leading-relaxed">
                                            {submission.decision?.feedback || submission.feedback}
                                        </p>
                                    </div>
                                )}
                            </Card>
                        )}

                        {/* Duplicate Rejection Details */}
                        {submission.status === 'rejected_duplicate' && submission.rejectionDetails && (
                            <Card className="mb-6 border-2 border-red-300 bg-red-50">
                                <div className="flex items-start gap-4">
                                    <div className="text-3xl">🔴</div>
                                    <div className="flex-1">
                                        <h2 className="text-lg font-bold text-red-800 mb-2">Rejected — Duplicate Detected</h2>
                                        <div className="space-y-2 text-sm">
                                            <p className="text-red-700">
                                                <span className="font-medium">Reason:</span> {submission.rejectionDetails.reason}
                                            </p>
                                            {submission.duplicationCheck?.similarityScore != null && (
                                                <div>
                                                    <span className="font-medium text-red-700">Similarity Score:</span>
                                                    <span className="ml-2 px-2 py-0.5 bg-red-200 text-red-900 rounded-full font-bold text-xs">
                                                        {submission.duplicationCheck.similarityScore}%
                                                    </span>
                                                </div>
                                            )}
                                            {submission.duplicationCheck?.matchedPaperId && (
                                                <p className="text-red-700">
                                                    <span className="font-medium">Matched Reference:</span>{' '}
                                                    <code className="bg-red-200 px-1 rounded text-xs">{submission.duplicationCheck.matchedPaperId}</code>
                                                </p>
                                            )}
                                            {submission.rejectionDetails.rejectedAt && (
                                                <p className="text-red-600">
                                                    <span className="font-medium">Rejected on:</span> {formatDate(submission.rejectionDetails.rejectedAt)}
                                                </p>
                                            )}
                                        </div>
                                        <p className="mt-3 text-sm text-red-600">
                                            If you believe this is in error, please contact the conference organizer.
                                        </p>
                                    </div>
                                </div>
                            </Card>
                        )}

                        {/* Reviewer Feedback (Comments Only) */}
                        {submission.reviews && submission.reviews.length > 0 && (
                            <Card className="mb-6">
                                <h2 className="text-lg font-bold text-gray-900 mb-4">
                                    Reviewer Suggestions
                                    <span className="ml-2 text-sm font-normal text-gray-500">
                                        ({submission.reviews.length} review{submission.reviews.length > 1 ? 's' : ''})
                                    </span>
                                </h2>
                                <div className="space-y-4">
                                    {submission.reviews.map((review, index) => (
                                        <div
                                            key={review.reviewNumber || index}
                                            className="border rounded-lg p-4 bg-gradient-to-r from-gray-50 to-white animate-fade-in"
                                            style={{ animationDelay: `${index * 100}ms` }}
                                        >
                                            <div className="flex items-center gap-2 mb-3">
                                                <span className="w-8 h-8 flex items-center justify-center bg-primary-100 text-primary-700 rounded-full text-sm font-bold">
                                                    {review.reviewNumber || index + 1}
                                                </span>
                                                <span className="text-sm text-gray-600">
                                                    Reviewer #{review.reviewNumber || index + 1}
                                                </span>
                                                {review.submittedAt && (
                                                    <span className="text-xs text-gray-400 ml-auto">
                                                        {formatDate(review.submittedAt)}
                                                    </span>
                                                )}
                                            </div>
                                            {review.comments ? (
                                                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                                                    {review.comments}
                                                </p>
                                            ) : (
                                                <p className="text-gray-400 italic">No comments provided</p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Actions */}
                        <div className="mt-6 flex gap-4">
                            <Button
                                onClick={() => navigate('/author/submissions')}
                                variant="outline"
                            >
                                ← Back to All Submissions
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
