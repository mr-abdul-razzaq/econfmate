import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const MyRegistrations = () => {
  const navigate = useNavigate();
  const [data, setData] = useState({
    upcomingRegistrations: [],
    pastRegistrations: []
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRegistrations();
  }, []);

  const fetchRegistrations = async () => {
    try {
      const response = await api.get('/participant/dashboard');
      setData({
        upcomingRegistrations: response.data.data.upcomingConferences,
        pastRegistrations: response.data.data.pastConferences
      });
    } catch (error) {
      console.error('Error fetching registrations:', error);
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

  const formatDateTime = (date) => {
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
        <Loading fullScreen message="Loading registrations..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Registrations</h1>
          <p className="text-gray-600 mt-1">View and manage your conference registrations</p>
        </div>

        {/* Upcoming Registrations */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Upcoming Conferences</h2>
          {data.upcomingRegistrations.length === 0 ? (
            <Card>
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4">You haven't registered for any upcoming conferences.</p>
                <Button onClick={() => navigate('/participant/events')}>
                  Browse Events
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.upcomingRegistrations.map((reg) => (
                <Card key={reg._id} hoverable>
                  <div className="mb-3">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-gray-900 text-lg line-clamp-2 flex-1">
                        {reg.conferenceId?.name}
                      </h3>
                      <Badge variant="success">Registered</Badge>
                    </div>
                    <Badge variant={reg.registrationType === 'presenter' ? 'primary' : 'default'}>
                      {reg.registrationType}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Venue:</span> {reg.conferenceId?.venue}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Date:</span> {formatDate(reg.conferenceId?.startDate)} - {formatDate(reg.conferenceId?.endDate)}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Registered:</span> {formatDateTime(reg.registeredAt)}
                    </p>
                    {reg.paymentStatus && (
                      <div className="pt-2">
                        <Badge variant={
                          reg.paymentStatus === 'completed' ? 'success' :
                          reg.paymentStatus === 'not_required' ? 'default' : 'warning'
                        }>
                          Payment: {reg.paymentStatus === 'not_required' ? 'Not Required' : reg.paymentStatus}
                        </Badge>
                      </div>
                    )}
                  </div>

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
          )}
        </div>

        {/* Past Registrations */}
        {data.pastRegistrations.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Past Conferences</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.pastRegistrations.map((reg) => (
                <Card key={reg._id} hoverable className="opacity-75">
                  <div className="mb-3">
                    <h3 className="font-bold text-gray-900 text-lg line-clamp-2 mb-2">
                      {reg.conferenceId?.name}
                    </h3>
                    <Badge variant="default">Completed</Badge>
                  </div>

                  <div className="space-y-2 mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Venue:</span> {reg.conferenceId?.venue}
                    </p>
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Date:</span> {formatDate(reg.conferenceId?.endDate)}
                    </p>
                    {reg.attendanceMarked && (
                      <Badge variant="success">Attendance Marked</Badge>
                    )}
                  </div>

                  <Button
                    size="sm"
                    fullWidth
                    variant="outline"
                    onClick={() => navigate(`/participant/event/${reg.conferenceId?._id}`)}
                  >
                    View Details
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

export default MyRegistrations;
