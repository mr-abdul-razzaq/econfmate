import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import Loading from '../../components/Loading';
import Modal from '../../components/Modal';
import api from '../../utils/api';

const Participants = () => {
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedConference, setSelectedConference] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [showParticipantsModal, setShowParticipantsModal] = useState(false);
  const [loadingParticipants, setLoadingParticipants] = useState(false);

  useEffect(() => {
    fetchConferences();
  }, []);

  const fetchConferences = async () => {
    try {
      const response = await api.get('/organizer/conferences');
      setConferences(response.data.data.conferences);
    } catch (error) {
      console.error('Error fetching conferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchParticipants = async (conferenceId) => {
    setLoadingParticipants(true);
    try {
      const response = await api.get(`/organizer/conferences/${conferenceId}/participants`);
      setParticipants(response.data.data.registrations);
      setSelectedConference(response.data.data.conference);
      setShowParticipantsModal(true);
    } catch (error) {
      console.error('Error fetching participants:', error);
      alert(error.response?.data?.message || 'Failed to fetch participants');
    } finally {
      setLoadingParticipants(false);
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
        <Loading fullScreen message="Loading conferences..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Conference Participants</h1>
          <p className="text-gray-600 mt-1">View registered participants for your conferences</p>
        </div>

        {conferences.length === 0 ? (
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">You haven't created any conferences yet.</p>
              <Button onClick={() => navigate('/organizer/create-conference')}>
                Create Conference
              </Button>
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
                </div>

                <div className="space-y-2 mb-4">
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Venue:</span> {conference.venue}
                  </p>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Date:</span> {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
                  </p>
                  {conference.stats && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Submissions:</span> {conference.stats.submissions || 0}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Button
                    size="sm"
                    fullWidth
                    onClick={() => fetchParticipants(conference._id)}
                    disabled={loadingParticipants}
                  >
                    {loadingParticipants ? 'Loading...' : 'View Participants'}
                  </Button>
                  <Button
                    size="sm"
                    fullWidth
                    variant="outline"
                    onClick={() => navigate(`/organizer/conference/${conference._id}`)}
                  >
                    Manage Conference
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Participants Modal */}
      <Modal
        isOpen={showParticipantsModal}
        onClose={() => {
          setShowParticipantsModal(false);
          setSelectedConference(null);
          setParticipants([]);
        }}
        title="Registered Participants"
        size="large"
      >
        {selectedConference && (
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-lg text-gray-900 mb-2">
                {selectedConference.name}
              </h3>
              <p className="text-sm text-gray-600">
                {formatDate(selectedConference.startDate)} - {formatDate(selectedConference.endDate)}
              </p>
              <p className="text-sm font-medium text-gray-900 mt-2">
                Total Participants: {participants.length}
              </p>
            </div>

            {participants.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No participants registered yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Email
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Registered
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {participants.map((registration) => (
                      <tr key={registration._id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {registration.participantId?.name || 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-sm text-gray-600">
                            {registration.participantId?.email || 'N/A'}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={registration.registrationType === 'presenter' ? 'primary' : 'default'}>
                            {registration.registrationType}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          {formatDateTime(registration.registeredAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={
                            registration.paymentStatus === 'completed' ? 'success' :
                            registration.paymentStatus === 'not_required' ? 'default' : 'warning'
                          }>
                            {registration.paymentStatus === 'not_required' ? 'Confirmed' : registration.paymentStatus}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowParticipantsModal(false);
                  setSelectedConference(null);
                  setParticipants([]);
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

export default Participants;
