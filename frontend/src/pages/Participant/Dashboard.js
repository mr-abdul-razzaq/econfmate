import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const ParticipantDashboard = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({
    upcomingConferences: [],
    pastConferences: [],
    availableConferences: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const response = await api.get('/participant/dashboard');
      const dashboardData = response.data.data;
      
      // Filter out expired conferences from available conferences
      const activeAvailableConferences = (dashboardData.availableConferences || []).filter(conf => {
        if (!conf.endDate) return true;
        const endDate = new Date(conf.endDate);
        const today = new Date();
        // Normalize both to start of day for accurate comparison
        today.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);
        // Conference is active only if endDate is AFTER today (not equal)
        return endDate > today;
      });
      
      setData({
        ...dashboardData,
        availableConferences: activeAvailableConferences
      });
    } catch (error) {
      console.error('Error fetching dashboard:', error);
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
          <h1 className="text-3xl font-bold text-gray-900">Participant Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage your conference registrations</p>
        </div>

        {/* Upcoming Conferences */}
        {data.upcomingConferences.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Upcoming Conferences</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.upcomingConferences.map((reg) => (
                <Card key={reg._id} hoverable>
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-gray-900 line-clamp-2 flex-1">
                      {reg.conferenceId?.name}
                    </h3>
                    <Badge variant="success">Registered</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{reg.conferenceId?.venue}</p>
                  <p className="text-xs text-gray-500 mb-3">
                    {formatDate(reg.conferenceId?.startDate)} - {formatDate(reg.conferenceId?.endDate)}
                  </p>
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() => navigate(`/participant/event/${reg.conferenceId?._id}`)}
                  >
                    View Details
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Available Conferences */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Available Conferences</h2>
            <Button variant="outline" size="sm" onClick={() => navigate('/participant/events')}>
              View All
            </Button>
          </div>

          {data.availableConferences.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-gray-600">No available conferences at the moment</p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.availableConferences.map((conference) => (
                <Card key={conference._id} hoverable>
                  <h3 className="font-bold text-gray-900 mb-2 line-clamp-2">
                    {conference.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">{conference.venue}</p>
                  <p className="text-xs text-gray-500 mb-3">
                    {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
                  </p>
                  {conference.fee > 0 && (
                    <p className="text-sm font-medium text-gray-900 mb-3">
                      Fee: ${conference.fee}
                    </p>
                  )}
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() => navigate(`/participant/event/${conference._id}`)}
                  >
                    Learn More
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Past Conferences */}
        {data.pastConferences.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Past Conferences</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.pastConferences.map((reg) => (
                <Card key={reg._id} className="opacity-75">
                  <h3 className="font-bold text-gray-900 line-clamp-2 mb-2">
                    {reg.conferenceId?.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-2">{reg.conferenceId?.venue}</p>
                  <p className="text-xs text-gray-500">
                    {formatDate(reg.conferenceId?.endDate)}
                  </p>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default ParticipantDashboard;
