import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getAuthorDashboard, discoverConferences } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Loading from '../../components/Loading';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';

const AuthorDashboard = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [dashboardData, setDashboardData] = useState(null);
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getAuthorDashboard();
      setDashboardData(data.data || data);

      // Fetch conferences for discovery section
      const confData = await discoverConferences();
      const allConferences = confData.data?.conferences || confData.data || [];
      
      // Filter out expired conferences (endDate in the past OR today)
      const activeConferences = allConferences.filter(conf => {
        if (!conf.endDate) return true;
        const endDate = new Date(conf.endDate);
        const today = new Date();
        // Normalize both to start of day for accurate comparison
        today.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        // Conference is active only if endDate is AFTER today (not equal)
        return endDate > today;
      });
      
      setConferences(activeConferences);
    } catch (err) {
      console.error('Error fetching dashboard:', err);
      setError(err.response?.data?.message || 'Failed to load dashboard');
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
      revision: 'default'
    };
    const statusLabels = {
      under_review: 'Under Review',
      accepted: 'Accepted',
      rejected: 'Rejected',
      pending: 'Pending',
      submitted: 'Submitted',
      revision: 'Revision Needed'
    };
    return <Badge variant={variants[status] || 'default'}>{statusLabels[status] || status?.replace('_', ' ')}</Badge>;
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading dashboard..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Author Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user?.name || 'Author'}</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchDashboard}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Stats */}
        {dashboardData && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <Card>
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {dashboardData?.submissions?.length || 0}
                </div>
                <p className="text-gray-600 text-sm mt-2">Total Submissions</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-3xl font-bold text-green-600">
                  {dashboardData?.submissions?.filter(s => s.status === 'accepted').length || 0}
                </div>
                <p className="text-gray-600 text-sm mt-2">Accepted</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600">
                  {dashboardData?.submissions?.filter(s => ['submitted', 'under_review', 'revision'].includes(s.status)).length || 0}
                </div>
                <p className="text-gray-600 text-sm mt-2">Under Review</p>
              </div>
            </Card>
            <Card>
              <div className="text-center">
                <div className="text-3xl font-bold text-red-600">
                  {dashboardData?.submissions?.filter(s => s.status === 'rejected').length || 0}
                </div>
                <p className="text-gray-600 text-sm mt-2">Rejected</p>
              </div>
            </Card>
          </div>
        )}

        {/* My Submissions */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">My Submissions</h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/author/submissions')}>
              View All
            </Button>
          </div>

          {!dashboardData?.submissions || dashboardData.submissions.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-gray-600">No submissions yet</p>
              <Button
                className="mt-4 bg-blue-600 hover:bg-blue-700"
                onClick={() => navigate('/author/discover')}
              >
                Submit Your First Paper
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dashboardData.submissions.slice(0, 4).map((submission) => (
                <Card key={submission._id} hoverable>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900 line-clamp-1 flex-1">
                      {submission.title}
                    </h3>
                    {getStatusBadge(submission.status)}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    {submission.conferenceId?.name || 'Unknown Conference'}
                  </p>
                  <p className="text-xs text-gray-500">
                    Submitted: {new Date(submission.createdAt).toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Active Conferences */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Active Conferences</h2>
            <Button onClick={() => navigate('/author/discover')}>
              Discover More
            </Button>
          </div>

          {conferences.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-gray-600">No active conferences at this time</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {conferences.slice(0, 3).map((conference) => (
                <Card
                  key={conference._id}
                  hoverable
                  onClick={() => navigate(`/author/conference/${conference._id}`)}
                >
                  <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">
                    {conference.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">{conference.venue}</p>
                  <p className="text-xs text-gray-500">
                    Deadline: {new Date(conference.submissionDeadline).toLocaleDateString()}
                  </p>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AuthorDashboard;
