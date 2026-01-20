import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';

const EventDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchEventDetails();
  }, [id]);

  const fetchEventDetails = async () => {
    try {
      const response = await api.get(`/participant/conferences/${id}`);
      setData(response.data.data);
    } catch (error) {
      console.error('Error fetching event details:', error);
      toast.error('Event not found');
      navigate('/participant/events');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading event details..." />
      </>
    );
  }

  if (!data || !data.conference) {
    return (
      <>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">Event not found</p>
              <Button onClick={() => navigate('/participant/events')} className="mt-4">
                Back to Events
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  const { conference, isRegistered, registration, schedule } = data;

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/participant/events')}
          >
            ← Back to Events
          </Button>
        </div>

        {/* Main Conference Info */}
        <Card className="mb-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start mb-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-3">{conference.name}</h1>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant={conference.status === 'active' ? 'success' : 'default'}>
                  {conference.status}
                </Badge>
                {isRegistered && (
                  <Badge variant="primary">Registered</Badge>
                )}
              </div>
            </div>
            {!isRegistered && (
              <Button onClick={() => navigate(`/participant/register/${id}`)}>
                Register Now
              </Button>
            )}
          </div>

          <div className="prose max-w-none mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">About</h3>
            <p className="text-gray-700 whitespace-pre-line">{conference.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Venue</p>
              <p className="text-base text-gray-900">{conference.venue}</p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Conference Dates</p>
              <p className="text-base text-gray-900">
                {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
              </p>
            </div>

            <div>
              <p className="text-sm font-medium text-gray-500 mb-1">Submission Deadline</p>
              <p className="text-base text-gray-900">{formatDate(conference.submissionDeadline)}</p>
            </div>

            {conference.fee !== undefined && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Registration Fee</p>
                <p className="text-base font-semibold text-gray-900">
                  {conference.fee > 0 ? `$${conference.fee}` : 'Free'}
                </p>
              </div>
            )}

            {conference.maxAttendees && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Max Attendees</p>
                <p className="text-base text-gray-900">{conference.maxAttendees}</p>
              </div>
            )}

            {conference.domains && conference.domains.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Domains</p>
                <div className="flex flex-wrap gap-1">
                  {conference.domains.map((domain, idx) => (
                    <Badge key={idx} variant="default">{domain}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {conference.organizerId && (
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-500 mb-1">Organized by</p>
              <p className="text-base text-gray-900">{conference.organizerId.name}</p>
              <p className="text-sm text-gray-600">{conference.organizerId.email}</p>
            </div>
          )}
        </Card>

        {/* Registration Details (if registered) */}
        {isRegistered && registration && (
          <Card className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Your Registration</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Registration Type</p>
                <Badge variant={registration.registrationType === 'presenter' ? 'primary' : 'default'}>
                  {registration.registrationType}
                </Badge>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Registration Date</p>
                <p className="text-base text-gray-900">{formatDateTime(registration.registeredAt)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">Payment Status</p>
                <Badge variant={
                  registration.paymentStatus === 'completed' ? 'success' :
                    registration.paymentStatus === 'not_required' ? 'default' : 'warning'
                }>
                  {registration.paymentStatus === 'not_required' ? 'Not Required' : registration.paymentStatus}
                </Badge>
              </div>
            </div>
          </Card>
        )}

        {/* Schedule (if available and registered) */}
        {isRegistered && schedule && schedule.length > 0 && (
          <Card>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Conference Schedule</h2>
            <div className="space-y-4">
              {schedule.map((item) => (
                <div key={item._id} className="border-l-4 border-primary-500 pl-4 py-2">
                  <p className="text-sm text-gray-500">
                    {formatDateTime(item.presentationSlot?.date)}
                  </p>
                  <h3 className="font-semibold text-gray-900">{item.title}</h3>
                  {item.authorId && (
                    <p className="text-sm text-gray-600">Presented by: {item.authorId.name}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Additional Information */}
        <Card className="mt-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Additional Information</h2>
          <div className="space-y-3 text-gray-700">
            <p>
              <span className="font-medium">Conference Type:</span>{' '}
              {conference.conferenceType || 'General Conference'}
            </p>
            {conference.website && (
              <p>
                <span className="font-medium">Website:</span>{' '}
                <a href={conference.website} target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:underline">
                  {conference.website}
                </a>
              </p>
            )}
            <p className="text-sm text-gray-500 mt-4">
              Created on {formatDate(conference.createdAt)}
            </p>
          </div>
        </Card>

        {/* Call to Action */}
        {!isRegistered && (
          <div className="mt-6 bg-primary-50 border border-primary-200 rounded-lg p-6 text-center">
            <h3 className="text-lg font-semibold text-primary-900 mb-2">
              Ready to Join?
            </h3>
            <p className="text-primary-700 mb-4">
              Register now to secure your spot at this conference
            </p>
            <Button onClick={() => navigate(`/participant/register/${id}`)}>
              Register for This Conference
            </Button>
          </div>
        )}
      </div>
    </>
  );
};

export default EventDetails;
