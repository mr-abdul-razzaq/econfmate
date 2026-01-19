import React, { useEffect, useState, useContext, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getAuthorSubmissions } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import Select from '../../components/Select';

export default function MySubmissions() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [submissions, setSubmissions] = useState([]);
  const [filteredSubmissions, setFilteredSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Separate submissions into primary author vs co-author
  const { mySubmissions, myPapers } = useMemo(() => {
    const userEmail = user?.email?.toLowerCase();
    const userId = user?.userId || user?.id;

    const primary = [];
    const coAuthored = [];

    submissions.forEach((submission) => {
      const isPrimaryAuthor = submission.authorId?._id === userId || submission.authorId === userId;
      
      // Check if user is a co-author
      const isCoAuthor = submission.coAuthors?.some((ca) => 
        ca.email?.toLowerCase() === userEmail || ca.userId === userId
      );

      // Only show in "My Papers" if user is co-author but NOT primary author
      if (isPrimaryAuthor) {
        primary.push(submission);
      } else if (isCoAuthor && (submission.status === 'under_review' || submission.status === 'accepted' || submission.status === 'rejected' || submission.status === 'revision')) {
        coAuthored.push(submission);
      }
    });

    return { mySubmissions: primary, myPapers: coAuthored };
  }, [submissions, user]);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  useEffect(() => {
    if (statusFilter) {
      setFilteredSubmissions(mySubmissions.filter((s) => s.status === statusFilter));
    } else {
      setFilteredSubmissions(mySubmissions);
    }
  }, [statusFilter, mySubmissions]);

  const fetchSubmissions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAuthorSubmissions();
      setSubmissions(data.data || data);
    } catch (err) {
      console.error('Error fetching submissions:', err);
      setError(err.response?.data?.message || 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      under_review: 'warning',
      accepted: 'success',
      rejected: 'danger',
      pending: 'info',
      submitted: 'info',
      revision: 'warning'
    };
    const statusLabels = {
      under_review: 'Under Review',
      accepted: 'Accepted',
      rejected: 'Rejected',
      pending: 'Pending',
      submitted: 'Submitted',
      revision: '⚠️ Revision Needed'
    };
    return <Badge variant={variants[status] || 'default'}>{statusLabels[status] || status?.replace('_', ' ')}</Badge>;
  };

  if (loading) return <Loading />;

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-blue-600 hover:text-blue-800 mb-4"
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-gray-900">My Submissions</h1>
          </div>
          <Button
            onClick={() => navigate('/author/discover')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Submit New Paper
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchSubmissions}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Filter */}
        <div className="mb-6 flex gap-4 items-center">
          <label className="text-sm font-medium text-gray-900">Filter by Status:</label>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="max-w-xs"
          >
            <option value="">All Statuses</option>
            <option value="submitted">Submitted</option>
            <option value="pending">Pending</option>
            <option value="under_review">Under Review</option>
            <option value="revision">Revision Needed</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </Select>
        </div>

        {/* My Submissions Section (Primary Author) */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">My Submissions</h2>
          <p className="text-sm text-gray-600 mb-4">Papers you submitted as primary author</p>
          
          {filteredSubmissions.length === 0 ? (
            <Card className="text-center py-12">
              <p className="text-gray-600 mb-4">No submissions found</p>
              <Button
                onClick={() => navigate('/author/discover')}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Submit Your First Paper
              </Button>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredSubmissions.map((submission) => (
                <Card
                  key={submission._id}
                  className="hover:shadow-lg transition cursor-pointer"
                  onClick={() => navigate(`/author/submissions/${submission._id}`)}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-gray-900 mb-2">
                        {submission.title}
                      </h3>
                      <p className="text-sm text-gray-600 mb-2">
                        Conference: {submission.conferenceId?.name || 'Unknown'}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        Track: {submission.trackId?.name || 'Unknown'}
                      </p>
                      <div className="flex gap-4 text-xs text-gray-500">
                        <span>Submitted: {new Date(submission.createdAt).toLocaleDateString()}</span>
                        {submission.feedback && (
                          <span className="text-gray-900 font-medium">Has Feedback</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(submission.status)}
                      <div className="flex gap-2">
                        {submission.status === 'revision' && (
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/author/submissions/${submission._id}`);
                            }}
                            className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-sm font-medium"
                          >
                            ✏️ Edit & Resubmit
                          </Button>
                        )}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/author/submissions/${submission._id}`);
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-sm"
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* My Papers Section (Co-Author) */}
        {myPapers.length > 0 && (
          <>
            <hr className="my-8 border-gray-300" />
            
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-2xl font-bold text-gray-900">My Papers</h2>
                <Badge variant="info">Co-Author</Badge>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Papers where you are listed as co-author (view-only access)
              </p>
              
              <div className="space-y-4">
                {myPapers.map((paper) => (
                  <Card
                    key={paper._id}
                    className="hover:shadow-lg transition cursor-pointer border-l-4 border-l-blue-400"
                    onClick={() => navigate(`/author/submissions/${paper._id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-lg font-bold text-gray-900">
                            {paper.title}
                          </h3>
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                            👥 Co-Author
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          Conference: {paper.conferenceId?.name || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-600 mb-2">
                          Track: {paper.trackId?.name || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-700 mb-2">
                          <span className="font-medium">Primary Author:</span> {paper.authorId?.name || 'Unknown'}
                        </p>
                        <div className="flex gap-4 text-xs text-gray-500">
                          <span>Submitted: {new Date(paper.createdAt).toLocaleDateString()}</span>
                          <span className="text-blue-600 font-medium">• View Only</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {getStatusBadge(paper.status)}
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/author/submissions/${paper._id}`);
                          }}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-sm"
                        >
                          View Details
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
