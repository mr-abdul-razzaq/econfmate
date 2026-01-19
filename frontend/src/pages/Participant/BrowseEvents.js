import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const BrowseEvents = () => {
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConferences();
  }, []);

  const fetchConferences = async () => {
    try {
      const response = await api.get('/participant/conferences');
      const allConferences = response.data.data.conferences || [];
      
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
    } catch (error) {
      console.error('Error fetching conferences:', error);
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

  const handleRegisterClick = (conferenceId) => {
    navigate(`/participant/register/${conferenceId}`);
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading conferences..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Active Conferences</h1>
          <p className="text-gray-600 mt-1">Browse and register for upcoming conferences</p>
        </div>

        {conferences.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">No active conferences available at the moment.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {conferences.map((conference) => (
              <Card key={conference._id} hoverable>
                <div className="mb-3">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-900 text-lg line-clamp-2 flex-1">
                      {conference.name}
                    </h3>
                    <Badge variant={conference.status === 'active' ? 'success' : 'default'}>
                      {conference.status}
                    </Badge>
                  </div>
                  {conference.isRegistered && (
                    <Badge variant="primary" className="mb-2">Registered</Badge>
                  )}
                </div>

                <div className="space-y-2 mb-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Venue:</span> {conference.venue}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Date:</span> {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
                  </p>
                  {conference.domains && conference.domains.length > 0 && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Domains:</span> {conference.domains.join(', ')}
                    </p>
                  )}
                  {conference.fee > 0 && (
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Fee:</span> ${conference.fee}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() => navigate(`/participant/event/${conference._id}`)}
                    variant="outline"
                  >
                    View Details
                  </Button>
                  {!conference.isRegistered && (
                    <Button
                      size="sm"
                      fullWidth
                      onClick={() => handleRegisterClick(conference._id)}
                    >
                      Register Now
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default BrowseEvents;
