import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Loading from '../../components/Loading';
import api from '../../utils/api';

const ActiveConferences = () => {
  const navigate = useNavigate();
  const [conferences, setConferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    domain: '',
    sortBy: 'deadline'
  });
  const [filteredConferences, setFilteredConferences] = useState([]);

  useEffect(() => {
    fetchConferences();
  }, []);

  const applyFilters = useCallback(() => {
    let filtered = [...conferences];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(
        conf =>
          conf.name.toLowerCase().includes(searchLower) ||
          conf.venue.toLowerCase().includes(searchLower) ||
          conf.description.toLowerCase().includes(searchLower)
      );
    }

    // Domain filter
    if (filters.domain) {
      const domainLower = filters.domain.toLowerCase();
      filtered = filtered.filter(conf =>
        conf.domains?.some(d => d.toLowerCase().includes(domainLower))
      );
    }

    // Sort
    if (filters.sortBy === 'deadline') {
      filtered.sort((a, b) => new Date(a.submissionDeadline) - new Date(b.submissionDeadline));
    } else if (filters.sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (filters.sortBy === 'startDate') {
      filtered.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    } else if (filters.sortBy === 'papers') {
      filtered.sort((a, b) => (b.approvedSubmissionCount || 0) - (a.approvedSubmissionCount || 0));
    }

    setFilteredConferences(filtered);
  }, [conferences, filters]);

  useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  const fetchConferences = async () => {
    try {
      const response = await api.get('/reviewer/conferences');
      const allConferences = response.data.data?.conferences || response.data.conferences || [];
      
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

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isSubmissionOpen = (deadline) => {
    return new Date(deadline) > new Date();
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading active conferences..." />
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Active Conferences</h1>
          <p className="text-gray-600 mt-1">Browse approved submissions and bid on papers to review</p>
        </div>

        {/* Filters */}
        <Card className="mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Search"
              name="search"
              type="text"
              value={filters.search}
              onChange={handleFilterChange}
              placeholder="Search by name, venue, description..."
            />

            <Input
              label="Domain"
              name="domain"
              type="text"
              value={filters.domain}
              onChange={handleFilterChange}
              placeholder="e.g., AI, ML, IoT"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sort By
              </label>
              <select
                name="sortBy"
                value={filters.sortBy}
                onChange={handleFilterChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="deadline">Deadline</option>
                <option value="newest">Newest</option>
                <option value="startDate">Start Date</option>
                <option value="papers">Most Papers</option>
              </select>
            </div>
          </div>
        </Card>

        {filteredConferences.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {conferences.length === 0 ? 'No Active Conferences' : 'No Conferences Found'}
            </h3>
            <p className="text-gray-600">
              {conferences.length === 0
                ? 'Check back later for available conferences'
                : 'Try adjusting your filters'}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredConferences.map((conference) => (
              <Card
                key={conference._id}
                hoverable
                onClick={() => navigate(`/reviewer/conferences/${conference._id}/submissions`)}
                className="cursor-pointer"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-xl font-bold text-gray-900">
                    {conference.name}
                  </h3>
                  <Badge variant={conference.status === 'active' ? 'success' : 'default'}>
                    {conference.status}
                  </Badge>
                </div>

                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {conference.description}
                </p>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-gray-700">{conference.venue}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-gray-700">
                      {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className={`font-medium ${isSubmissionOpen(conference.submissionDeadline) ? 'text-green-600' : 'text-red-600'}`}>
                      Deadline: {formatDate(conference.submissionDeadline)}
                    </span>
                  </div>

                  {conference.approvedSubmissionCount !== undefined && (
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="font-medium text-blue-600">
                        {conference.approvedSubmissionCount} approved paper{conference.approvedSubmissionCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  {conference.domains && conference.domains.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {conference.domains.slice(0, 3).map((domain, idx) => (
                        <Badge key={idx} variant="info" className="text-xs">
                          {domain}
                        </Badge>
                      ))}
                      {conference.domains.length > 3 && (
                        <Badge variant="default" className="text-xs">
                          +{conference.domains.length - 3} more
                        </Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t">
                  <Button
                    size="sm"
                    variant="primary"
                    fullWidth
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/reviewer/conferences/${conference._id}/submissions`);
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

export default ActiveConferences;
