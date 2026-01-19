import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { discoverConferences } from '../../utils/api';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Loading from '../../components/Loading';

const DiscoverConferences = () => {
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [filteredConferences, setFilteredConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    venue: '',
    domain: '',
  });

  useEffect(() => {
    fetchConferences();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [conferences, searchTerm, filters]);

  const fetchConferences = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await discoverConferences();
      const allConferences = response.data?.conferences || response.data || [];
      
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

  const applyFilters = () => {
    let filtered = conferences;

    // Search term
    if (searchTerm) {
      filtered = filtered.filter((conf) =>
        conf.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        conf.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Venue filter
    if (filters.venue) {
      filtered = filtered.filter((conf) =>
        conf.venue?.toLowerCase().includes(filters.venue.toLowerCase())
      );
    }

    // Domain filter
    if (filters.domain) {
      filtered = filtered.filter((conf) =>
        conf.domain?.toLowerCase().includes(filters.domain.toLowerCase())
      );
    }

    setFilteredConferences(filtered);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const isDeadlineApproaching = (deadline) => {
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const daysLeft = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
    return daysLeft <= 7 && daysLeft >= 0;
  };

  const isDeadlinePassed = (deadline) => {
    return new Date(deadline) < new Date();
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
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(-1)}
            className="text-blue-600 hover:text-blue-800 mb-4"
          >
            ← Back
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Discover Conferences</h1>
          <p className="text-gray-600 mt-2">Find and submit papers to conferences</p>
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

        {/* Search & Filters */}
        <Card className="mb-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900 mb-2">
                Search Conferences
              </label>
              <Input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name or description..."
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Venue"
                name="venue"
                type="text"
                value={filters.venue}
                onChange={handleFilterChange}
                placeholder="Search by location..."
              />
              <Input
                label="Domain"
                name="domain"
                type="text"
                value={filters.domain}
                onChange={handleFilterChange}
                placeholder="e.g., AI, ML, Security..."
              />
            </div>
          </div>
        </Card>

        {/* Results Count */}
        <div className="mb-4">
          <p className="text-sm text-gray-600">
            Found {filteredConferences.length} conference{filteredConferences.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Conferences Grid */}
        {filteredConferences.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-4xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Conferences Available</h3>
            <p className="text-gray-600">Try adjusting your filters or search terms</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredConferences.map((conference) => (
              <Card key={conference._id} className="flex flex-col h-full hover:shadow-lg transition">
                {/* Status Badge */}
                <div className="flex gap-2 mb-3">
                  {isDeadlinePassed(conference.submissionDeadline) && (
                    <Badge variant="danger">Deadline Passed</Badge>
                  )}
                  {isDeadlineApproaching(conference.submissionDeadline) && (
                    !isDeadlinePassed(conference.submissionDeadline) && (
                      <Badge variant="warning">Closing Soon</Badge>
                    )
                  )}
                </div>

                {/* Content */}
                <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2">
                  {conference.name}
                </h3>
                <p className="text-sm text-gray-600 mb-4 flex-grow line-clamp-2">
                  {conference.description}
                </p>

                {/* Info */}
                <div className="space-y-2 mb-4 text-sm text-gray-600">
                  <div>📍 Venue: {conference.venue}</div>
                  <div>📅 Date: {conference.startDate ? formatDate(conference.startDate) : 'TBD'}</div>
                  <div className="font-medium text-gray-900">
                    Deadline: {formatDate(conference.submissionDeadline)}
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => navigate(`/author/conference/${conference._id}`)}
                  disabled={isDeadlinePassed(conference.submissionDeadline)}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isDeadlinePassed(conference.submissionDeadline) ? 'Deadline Passed' : 'View & Submit'}
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default DiscoverConferences;
