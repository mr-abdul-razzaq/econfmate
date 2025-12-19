import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import Textarea from '../../components/Textarea';
import Loading from '../../components/Loading';
import Badge from '../../components/Badge';
import api from '../../utils/api';

const RegisterForConference = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [conference, setConference] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    registrationType: 'attendee',
    specialRequirements: '',
    dietaryRestrictions: '',
    emergencyContact: '',
    emergencyPhone: ''
  });

  useEffect(() => {
    fetchConference();
  }, [id]);

  const fetchConference = async () => {
    try {
      const response = await api.get(`/participant/conferences/${id}`);
      if (response.data.data.isRegistered) {
        alert('You are already registered for this conference');
        navigate(`/participant/event/${id}`);
        return;
      }
      setConference(response.data.data.conference);
    } catch (error) {
      console.error('Error fetching conference:', error);
      alert('Conference not found');
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

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      const response = await api.post('/participant/registrations', {
        conferenceId: id,
        ...formData
      });

      if (response.data.success) {
        alert('Registration successful! You are now registered for this conference.');
        navigate('/participant/registrations');
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <Loading fullScreen message="Loading conference details..." />
      </>
    );
  }

  if (!conference) {
    return (
      <>
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Card>
            <div className="text-center py-12">
              <p className="text-gray-500">Conference not found</p>
              <Button onClick={() => navigate('/participant/events')} className="mt-4">
                Back to Events
              </Button>
            </div>
          </Card>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/participant/events')}
          >
            ← Back to Events
          </Button>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">Register for Conference</h1>
        <p className="text-gray-600 mb-8">Please fill out the registration form below</p>

        {/* Conference Information */}
        <Card className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{conference.name}</h2>
              <Badge variant="success">{conference.status}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Venue</p>
              <p className="text-base text-gray-900">{conference.venue}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Dates</p>
              <p className="text-base text-gray-900">
                {formatDate(conference.startDate)} - {formatDate(conference.endDate)}
              </p>
            </div>
            {conference.fee > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500">Registration Fee</p>
                <p className="text-base font-semibold text-gray-900">${conference.fee}</p>
              </div>
            )}
            {conference.domains && conference.domains.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-500">Domains</p>
                <p className="text-base text-gray-900">{conference.domains.join(', ')}</p>
              </div>
            )}
          </div>

          {conference.description && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-gray-500 mb-2">About this Conference</p>
              <p className="text-gray-700">{conference.description}</p>
            </div>
          )}
        </Card>

        {/* Registration Form */}
        <Card>
          <h3 className="text-xl font-bold text-gray-900 mb-6">Registration Details</h3>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <Select
              label="Registration Type"
              name="registrationType"
              value={formData.registrationType}
              onChange={handleChange}
              required
              helperText="Select whether you're attending as a participant or presenting"
            >
              <option value="attendee">Attendee</option>
              <option value="presenter">Presenter</option>
            </Select>

            <Textarea
              label="Special Requirements"
              name="specialRequirements"
              value={formData.specialRequirements}
              onChange={handleChange}
              placeholder="Any accessibility requirements or special needs..."
              rows={3}
              helperText="Optional: Let us know if you need any special accommodations"
            />

            <Input
              label="Dietary Restrictions"
              name="dietaryRestrictions"
              value={formData.dietaryRestrictions}
              onChange={handleChange}
              placeholder="E.g., vegetarian, vegan, allergies..."
              helperText="Optional: For meal planning purposes"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Emergency Contact Name"
                name="emergencyContact"
                value={formData.emergencyContact}
                onChange={handleChange}
                placeholder="Full name"
                helperText="Optional: Someone we can contact in case of emergency"
              />

              <Input
                label="Emergency Contact Phone"
                name="emergencyPhone"
                value={formData.emergencyPhone}
                onChange={handleChange}
                placeholder="+1 (555) 123-4567"
                helperText="Optional: Phone number of emergency contact"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2">Registration Summary</h4>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Conference: {conference.name}</li>
                <li>• Type: {formData.registrationType === 'attendee' ? 'Attendee' : 'Presenter'}</li>
                {conference.fee > 0 ? (
                  <li>• Fee: ${conference.fee} (Payment required)</li>
                ) : (
                  <li>• Fee: Free</li>
                )}
              </ul>
            </div>

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => navigate('/participant/events')}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                fullWidth
                disabled={submitting}
              >
                {submitting ? 'Registering...' : 'Complete Registration'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </>
  );
};

export default RegisterForConference;
