import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getConferenceDetailsAuthor, getTracks } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Loading from '../../components/Loading';

export default function ConferenceDetails() {
  const { id: conferenceId } = useParams();
  const navigate = useNavigate();
  const [conference, setConference] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDetails = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [confRes, tracksRes] = await Promise.all([
        getConferenceDetailsAuthor(conferenceId),
        getTracks(conferenceId),
      ]);
      // API returns { data: { conference: {...}, hasSubmitted, submission } }
      const confData = confRes.data?.conference || confRes.data || confRes;
      setConference(confData);
      setTracks((tracksRes && tracksRes.data) || []);
    } catch (err) {
      console.error('Error fetching conference details:', err);
      setError(err.response?.data?.message || 'Failed to load conference details');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  if (loading) return <Loading />;

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
            <button
              onClick={fetchDetails}
              className="text-red-600 hover:text-red-800 font-medium mt-2"
            >
              Try Again
            </button>
          </div>
        )}

        {conference && (
          <>
            {/* Header */}
            <div className="mb-8">
              <button
                onClick={() => navigate(-1)}
                className="text-blue-600 hover:text-blue-800 mb-4"
              >
                ← Back
              </button>
              <h1 className="text-3xl font-bold text-gray-900">{conference.name}</h1>
              <p className="text-gray-600 mt-2">{conference.description}</p>
            </div>

            {/* Conference Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <div className="text-sm text-gray-600">Submission Deadline</div>
                <div className="text-lg font-bold text-gray-900">
                  {new Date(conference.submissionDeadline).toLocaleDateString()}
                </div>
              </Card>
              <Card>
                <div className="text-sm text-gray-600">Conference Date</div>
                <div className="text-lg font-bold text-gray-900">
                  {conference.startDate ? new Date(conference.startDate).toLocaleDateString() : 'TBD'}
                  {conference.endDate && ` - ${new Date(conference.endDate).toLocaleDateString()}`}
                </div>
              </Card>
              <Card>
                <div className="text-sm text-gray-600">Venue</div>
                <div className="text-lg font-bold text-gray-900">{conference.venue}</div>
              </Card>
            </div>

            {/* Tracks */}
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Tracks</h2>
              {tracks.length === 0 ? (
                <Card className="text-center py-8">
                  <p className="text-gray-600">No tracks available for this conference</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {tracks.map((track) => (
                    <Card key={track._id} hoverable>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900">{track.name}</h3>
                          <p className="text-sm text-gray-600 mt-1">{track.description}</p>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button
                          onClick={() =>
                            navigate(
                              `/author/submit/${conferenceId}?trackId=${track._id}`
                            )
                          }
                          className="w-full bg-blue-600 hover:bg-blue-700"
                        >
                          Submit to this Track
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
