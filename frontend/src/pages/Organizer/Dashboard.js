import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { getOrganizerDashboard } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';

const OrganizerDashboard = () => {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConferences();
  }, []);

  const fetchConferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getOrganizerDashboard();
      // Handle nested response structure: response.data.conferences or response.conferences
      const data = response.data || response;
      const conferencesList = data.conferences || data || [];
      const allConferences = Array.isArray(conferencesList) ? conferencesList : [];
      
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
      console.error('Error fetching conferences:', err);
      setError(err.response?.data?.message || 'Failed to load conferences');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Organizer Dashboard</h1>
            <p className="text-gray-600 mt-1">Welcome, {user?.name || 'Organizer'}</p>
          </div>
          <Button
            onClick={() => navigate('/organizer/create-conference')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            + Create Conference
          </Button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchConferences}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Conferences Grid */}
        {conferences.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              No Active Conferences
            </h3>
            <p className="text-gray-600 mb-6">
              Create your first conference to get started. Expired conferences are automatically hidden.
            </p>
            <Button
              onClick={() => navigate('/organizer/create-conference')}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Conference
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {conferences.map((conference) => (
              <Card
                key={conference._id}
                hoverable
                className="flex flex-col cursor-pointer hover:shadow-lg transition"
                onClick={() => navigate(`/organizer/manage-conference/${conference._id}`)}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-bold text-gray-900 line-clamp-2 flex-1">
                    {conference.name}
                  </h3>
                  <Badge variant={conference.status === 'active' ? 'success' : 'info'}>
                    {conference.status || 'active'}
                  </Badge>
                </div>

                <p className="text-gray-600 text-sm line-clamp-2 mb-4">
                  {conference.description}
                </p>

                <div className="space-y-2 text-sm text-gray-700 mb-4">
                  <div className="flex items-center">
                    <span className="font-medium w-20">Venue:</span>
                    <span className="line-clamp-1">{conference.venue}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20">Date:</span>
                    <span>{formatDate(conference.startDate)}</span>
                  </div>
                  <div className="flex items-center">
                    <span className="font-medium w-20">Deadline:</span>
                    <span>{formatDate(conference.submissionDeadline)}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-3 gap-2 pt-4 border-t flex-grow">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {conference.stats?.total || 0}
                    </div>
                    <div className="text-xs text-gray-600">Submissions</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {conference.stats?.accepted || 0}
                    </div>
                    <div className="text-xs text-gray-600">Accepted</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {conference.stats?.pending || 0}
                    </div>
                    <div className="text-xs text-gray-600">Pending</div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t space-y-2">
                  <Button
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/organizer/manage-conference/${conference._id}`);
                    }}
                  >
                    Manage
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/organizer/submissions/${conference._id}`);
                    }}
                  >
                    View Submissions
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default OrganizerDashboard;
