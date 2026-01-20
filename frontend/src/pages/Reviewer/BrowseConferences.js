import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import api from '../../utils/api';

const MyAssignedPapers = () => {
  const navigate = useNavigate();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [pdfUrl, setPdfUrl] = useState('');
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  // Helper function to get the correct file URL
  const getFileUrl = (fileUrl, forDownload = false) => {
    // If it's already a full URL (from Cloudinary), use it directly
    if (fileUrl && (fileUrl.startsWith('http://') || fileUrl.startsWith('https://'))) {
      // For Cloudinary URLs, add attachment flag for downloads
      if (fileUrl.includes('cloudinary.com') && forDownload) {
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

  useEffect(() => {
    fetchAssignedSubmissions();
  }, []);

  const fetchAssignedSubmissions = async () => {
    try {
      // Use bids endpoint - bid submissions are effectively assigned to reviewers
      const response = await api.get('/reviewer/bids');
      setSubmissions(response.data.data || []);
    } catch (error) {
      console.error('Error fetching submissions:', error);
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

  const getStatusBadge = (status) => {
    const variants = {
      submitted: 'info',
      under_review: 'warning',
      review_completed: 'success',
      accepted: 'success',
      rejected: 'danger'
    };
    return variants[status] || 'default';
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading assigned submissions..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Assigned Papers</h1>
            <p className="text-gray-600 mt-1">Review papers assigned to you</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/reviewer/browse-conferences')}>
            Browse Conferences
          </Button>
        </div>

        {submissions.length === 0 ? (
          <Card className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No papers assigned yet</p>
            <Button variant="primary" onClick={() => navigate('/reviewer/browse-conferences')}>
              Browse Available Papers
            </Button>
          </Card>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <Card key={submission._id}>
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900 mb-1">
                      {submission.title}
                    </h3>
                    <p className="text-sm text-gray-600 mb-1">
                      Conference: <span className="font-medium">{submission.conferenceId?.name}</span>
                    </p>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span className="font-medium text-blue-600">{submission.authorId?.name}</span>
                      <span>•</span>
                      <span>{submission.authorId?.email}</span>
                    </div>
                    {submission.theme && (
                      <Badge variant="info" className="text-xs mt-2">
                        Theme: {submission.theme}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    <Badge variant={getStatusBadge(submission.status)}>
                      {submission.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {submission.hasReviewed ? (
                      <Badge variant="success">✓ Reviewed</Badge>
                    ) : (
                      <Badge variant="warning">Pending Review</Badge>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                  {submission.abstract}
                </p>

                {/* Paper File Info */}
                <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-blue-900">Paper Document Available</p>
                    <p className="text-xs text-blue-700">{submission.fileUrl?.split('/').pop()}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-3 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs">Submitted</p>
                    <p className="font-medium text-gray-900 text-xs">{formatDate(submission.submittedAt)}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Progress</p>
                    <p className="font-medium text-gray-900">{submission.progress}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Status</p>
                    <p className="font-medium text-gray-900 text-xs">
                      {submission.hasReviewed ? 'Completed' : 'Pending'}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setPdfUrl(getFileUrl(submission.fileUrl));
                      setSelectedSubmission(submission);
                      setShowPdfModal(true);
                    }}
                  >
                    📄 View
                  </Button>
                  <a
                    href={getFileUrl(submission.fileUrl, true)}
                    download
                    className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 border border-blue-600 hover:border-blue-700 rounded-md transition-colors"
                  >
                    ⬇️ Download
                  </a>
                  <Button
                    size="sm"
                    variant={submission.hasReviewed ? 'outline' : 'success'}
                    onClick={() => navigate(`/reviewer/review/${submission._id}`)}
                  >
                    {submission.hasReviewed ? 'View Review' : 'Submit Review'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* PDF Preview Modal */}
      <Modal
        isOpen={showPdfModal}
        onClose={() => {
          setShowPdfModal(false);
          setPdfUrl('');
        }}
        title={selectedSubmission ? `${selectedSubmission.title} - ${selectedSubmission.authorId?.name}` : 'Paper Preview'}
        size="large"
      >
        {selectedSubmission && (
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="text-sm font-medium text-gray-900">Author: {selectedSubmission.authorId?.name}</p>
                <p className="text-xs text-gray-600">{selectedSubmission.authorId?.email}</p>
                {selectedSubmission.theme && (
                  <p className="text-xs text-gray-600 mt-1">Theme: {selectedSubmission.theme}</p>
                )}
              </div>
              <div className="flex gap-2">
                <a
                  href={pdfUrl}
                  download
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Download PDF
                </a>
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-sm font-medium text-blue-600 border border-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Open in New Tab
                </a>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden" style={{ height: '70vh' }}>
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="Paper Preview"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant={selectedSubmission.hasReviewed ? 'outline' : 'primary'}
                onClick={() => {
                  setShowPdfModal(false);
                  navigate(`/reviewer/review/${selectedSubmission._id}`);
                }}
              >
                {selectedSubmission.hasReviewed ? 'View Your Review' : 'Submit Review'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPdfModal(false);
                  setPdfUrl('');
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
};

export default MyAssignedPapers;
