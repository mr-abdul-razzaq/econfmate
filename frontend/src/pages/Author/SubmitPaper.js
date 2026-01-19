import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { getTracks, submitPaper, discoverConferences, uploadPaper } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Input from '../../components/Input';
import Textarea from '../../components/Textarea';
import Select from '../../components/Select';
import Button from '../../components/Button';
import Loading from '../../components/Loading';

export default function SubmitPaper() {
  const [searchParams] = useSearchParams();
  const { conferenceId: pathConferenceId } = useParams();
  const navigate = useNavigate();

  // Get conferenceId from path param (primary) or query param (fallback)
  const conferenceId = pathConferenceId || searchParams.get('conferenceId');
  const trackId = searchParams.get('trackId');

  const [conferences, setConferences] = useState([]);
  const [tracks, setTracks] = useState([]);
  const [selectedConference, setSelectedConference] = useState(conferenceId || '');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    title: '',
    abstract: '',
    trackId: trackId || '',
    file: null,
  });

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
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

      if (conferenceId) {
        const tracksData = await getTracks(conferenceId);
        setTracks(tracksData.data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load conferences and tracks');
    } finally {
      setLoading(false);
    }
  };

  const handleConferenceChange = async (e) => {
    const confId = e.target.value;
    setSelectedConference(confId);
    setForm({ ...form, trackId: '' });

    if (confId) {
      try {
        const tracksData = await getTracks(confId);
        setTracks(tracksData.data || []);
      } catch (err) {
        console.error('Error fetching tracks:', err);
        setTracks([]);
      }
    } else {
      setTracks([]);
    }
  };

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'file') {
      setForm({ ...form, file: files[0] });
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!selectedConference) {
      setError('Please select a conference');
      return;
    }
    if (!form.trackId) {
      setError('Please select a track');
      return;
    }
    if (!form.title.trim()) {
      setError('Please enter a paper title');
      return;
    }
    if (!form.abstract.trim()) {
      setError('Please enter an abstract');
      return;
    }
    if (!form.file) {
      setError('Please upload a paper file');
      return;
    }

    setSubmitting(true);
    try {
      // First upload the file
      let fileUrl = '';
      if (form.file) {
        const uploadRes = await uploadPaper(form.file);
        fileUrl = uploadRes.data?.fileUrl || uploadRes.fileUrl;
      }

      // Then submit with the fileUrl
      const submissionData = {
        title: form.title,
        abstract: form.abstract,
        trackId: form.trackId,
        fileUrl
      };

      await submitPaper(selectedConference, submissionData);
      navigate('/author/submissions');
    } catch (err) {
      console.error('Error submitting paper:', err);
      setError(err.response?.data?.message || 'Failed to submit paper');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Submit Your Paper</h1>
          <p className="text-gray-600 mt-2">
            Submit your paper to a conference track for peer review
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Conference Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Conference <span className="text-red-600">*</span>
            </label>
            <Select
              name="conference"
              value={selectedConference}
              onChange={handleConferenceChange}
              required
            >
              <option value="">-- Select a Conference --</option>
              {conferences.map((conf) => (
                <option key={conf._id} value={conf._id}>
                  {conf.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Track Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Track <span className="text-red-600">*</span>
            </label>
            {selectedConference && tracks.length > 0 ? (
              <Select
                name="trackId"
                value={form.trackId}
                onChange={handleChange}
                required
              >
                <option value="">-- Select a Track --</option>
                {tracks.map((track) => (
                  <option key={track._id} value={track._id}>
                    {track.name}
                  </option>
                ))}
              </Select>
            ) : (
              <p className="text-gray-600 text-sm">
                {selectedConference ? 'No tracks available' : 'Select a conference first'}
              </p>
            )}
          </div>

          {/* Paper Title */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Paper Title <span className="text-red-600">*</span>
            </label>
            <Input
              type="text"
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Enter your paper title"
              required
            />
          </div>

          {/* Abstract */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Abstract <span className="text-red-600">*</span>
            </label>
            <Textarea
              name="abstract"
              value={form.abstract}
              onChange={handleChange}
              placeholder="Enter your paper abstract"
              rows="6"
              required
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Paper File (PDF) <span className="text-red-600">*</span>
            </label>
            <input
              type="file"
              name="file"
              onChange={handleChange}
              accept=".pdf,.doc,.docx"
              required
              className="block w-full text-sm text-gray-600
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            <p className="text-xs text-gray-500 mt-2">Accepted formats: PDF, DOC, DOCX</p>
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? 'Submitting...' : 'Submit Paper'}
            </Button>
            <Button
              type="button"
              onClick={() => navigate('/author/submissions')}
              className="flex-1 bg-gray-600 hover:bg-gray-700"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}