import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate, useParams } from 'react-router-dom';
import { getTracks, submitPaper, discoverConferences, uploadPaper } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Input from '../../components/Input';
import Textarea from '../../components/Textarea';
import Select from '../../components/Select';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { useToast } from '../../context/ToastContext';

export default function SubmitPaper() {
  const [searchParams] = useSearchParams();
  const { conferenceId: pathConferenceId } = useParams();
  const navigate = useNavigate();

  // Get conferenceId from path param (primary) or query param (fallback)
  const conferenceId = pathConferenceId || searchParams.get('conferenceId');
  const trackId = searchParams.get('trackId');
  const toast = useToast();

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
    keywords: [],
    coAuthors: [],
    file: null,
  });

  // States for adding co-authors
  const [newCoAuthor, setNewCoAuthor] = useState({
    name: '',
    email: '',
    orcid: ''
  });
  const [keywordInput, setKeywordInput] = useState('');

  const fetchInitialData = useCallback(async () => {
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
  }, [conferenceId]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

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

  const handleAddKeyword = (e) => {
    if (e.key === 'Enter' && keywordInput.trim()) {
      e.preventDefault();
      if (!form.keywords.includes(keywordInput.trim())) {
        setForm({ ...form, keywords: [...form.keywords, keywordInput.trim()] });
      }
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (index) => {
    setForm({
      ...form,
      keywords: form.keywords.filter((_, i) => i !== index)
    });
  };

  const handleAddCoAuthor = (e) => {
    e.preventDefault();
    if (!newCoAuthor.name.trim() || !newCoAuthor.email.trim()) {
      toast.warning('Please provide at least name and email for the co-author');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newCoAuthor.email)) {
      toast.warning('Please provide a valid email address');
      return;
    }

    setForm({
      ...form,
      coAuthors: [...form.coAuthors, { ...newCoAuthor }]
    });
    setNewCoAuthor({ name: '', email: '', orcid: '' });
  };

  const handleRemoveCoAuthor = (index) => {
    setForm({
      ...form,
      coAuthors: form.coAuthors.filter((_, i) => i !== index)
    });
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
        keywords: form.keywords,
        coAuthors: form.coAuthors,
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

          {/* Keywords */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Keywords
            </label>
            <Input
              type="text"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={handleAddKeyword}
              placeholder="Type a keyword and press Enter"
            />
            {form.keywords.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {form.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                  >
                    {keyword}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(index)}
                      className="text-blue-600 hover:text-blue-800 font-bold"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Co-Authors */}
          <div className="border-t pt-6">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Co-Authors
            </label>
            <p className="text-sm text-gray-600 mb-4">
              Add co-authors for this paper. If they're registered on the platform, they'll be able to view this submission.
            </p>

            {/* Co-Author Input Form */}
            <div className="bg-gray-50 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <Input
                  type="text"
                  placeholder="Full Name *"
                  value={newCoAuthor.name}
                  onChange={(e) => setNewCoAuthor({ ...newCoAuthor, name: e.target.value })}
                />
                <Input
                  type="email"
                  placeholder="Email *"
                  value={newCoAuthor.email}
                  onChange={(e) => setNewCoAuthor({ ...newCoAuthor, email: e.target.value })}
                />
                <Input
                  type="text"
                  placeholder="ORCID (optional)"
                  value={newCoAuthor.orcid}
                  onChange={(e) => setNewCoAuthor({ ...newCoAuthor, orcid: e.target.value })}
                />
              </div>
              <Button
                type="button"
                onClick={handleAddCoAuthor}
                className="bg-green-600 hover:bg-green-700"
              >
                + Add Co-Author
              </Button>
            </div>

            {/* Co-Authors List */}
            {form.coAuthors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Added Co-Authors ({form.coAuthors.length}):</p>
                {form.coAuthors.map((coAuthor, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-3"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{coAuthor.name}</p>
                      <p className="text-sm text-gray-600">{coAuthor.email}</p>
                      {coAuthor.orcid && (
                        <p className="text-xs text-gray-500">ORCID: {coAuthor.orcid}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveCoAuthor(index)}
                      className="text-red-600 hover:text-red-800 px-3 py-1 rounded hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
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