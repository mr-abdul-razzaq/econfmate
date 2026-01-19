import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserProfile, updateUserProfile } from '../utils/api';
import Navbar from '../components/Navbar';
import Button from '../components/Button';
import Input from '../components/Input';
import Textarea from '../components/Textarea';
import Card from '../components/Card';
import Loading from '../components/Loading';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [profileData, setProfileData] = useState(null);
  const [editedData, setEditedData] = useState({});

  // Fetch profile on mount only
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError('');
        
        // Always fetch fresh data from backend
        const data = await getUserProfile();
        const freshUser = data.user || data;
        
        setProfileData(freshUser);
        setEditedData(freshUser);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load profile');
        // Fallback to user from context if API fails
        if (user) {
          setProfileData(user);
          setEditedData(user);
        }
      } finally {
        setLoading(false);
      }
    };
    
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount to avoid infinite loop

  const handleEdit = () => {
    setIsEditing(true);
    setSuccess('');
    setError('');
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedData(profileData);
    setError('');
    setSuccess('');
  };

  const handleChange = (field, value) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      // Only send fields supported by backend /auth/profile endpoint
      const updatePayload = {
        name: editedData.name,
      };

      // Add expertiseDomains for reviewers (backend supports this)
      if (profileData?.role === 'reviewer' && editedData.expertiseDomains) {
        updatePayload.expertiseDomains = Array.isArray(editedData.expertiseDomains) 
          ? editedData.expertiseDomains 
          : editedData.expertiseDomains.split(',').map(d => d.trim()).filter(d => d);
      }

      // Update profile via API
      await updateUserProfile(updatePayload);
      
      // For safety and consistency, refetch complete user data from backend
      const freshUserData = await getUserProfile();
      const completeUser = freshUserData.user || freshUserData;
      
      // Update AuthContext and localStorage immediately
      if (updateUser) {
        updateUser(completeUser);
      }
      
      // Update local component state
      setProfileData(completeUser);
      setEditedData(completeUser);

      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getOAuthProvider = () => {
    if (profileData?.orcidId) return 'ORCID';
    if (profileData?.googleId) return 'Google';
    return 'Local';
  };

  const getRoleSpecificStats = () => {
    const role = profileData?.role;
    
    switch (role) {
      case 'organizer':
        return [
          { label: 'Conferences Created', value: profileData?.conferencesCreated || 0, icon: '🎪' },
        ];
      case 'author':
        return [
          { label: 'Total Submissions', value: profileData?.submissionsCount || 0, icon: '📄' },
        ];
      case 'reviewer':
        return [
          { label: 'Reviews Completed', value: profileData?.reviewsCount || 0, icon: '✅' },
          { label: 'Average Rating', value: profileData?.reviewerRating ? `${profileData.reviewerRating}/5` : 'N/A', icon: '⭐' },
        ];
      case 'participant':
        return [
          { label: 'Registered Conferences', value: profileData?.registeredConferences || 0, icon: '🎫' },
          { label: 'Certificates Earned', value: profileData?.certificatesEarned || 0, icon: '🏆' },
        ];
      default:
        return [];
    }
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="flex items-center justify-center min-h-screen">
          <Loading />
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Profile</h1>
          <p className="mt-2 text-gray-600">Manage your account information and preferences</p>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
            {success}
          </div>
        )}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Profile Summary Card */}
          <div className="lg:col-span-1">
            <Card className="text-center">
              {/* Avatar */}
              <div className="mb-4">
                <div className="w-32 h-32 mx-auto bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white text-4xl font-bold shadow-lg">
                  {getInitials(profileData?.name)}
                </div>
              </div>

              {/* Name & Role */}
              <h2 className="text-2xl font-bold text-gray-900 mb-1">{profileData?.name}</h2>
              <p className="text-sm text-gray-500 mb-4 capitalize">{profileData?.role}</p>

              {/* Quick Stats */}
              <div className="space-y-3 pt-4 border-t">
                {getRoleSpecificStats().map((stat, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{stat.icon} {stat.label}</span>
                    <span className="font-semibold text-gray-900">{stat.value}</span>
                  </div>
                ))}
              </div>

              {/* Action Button */}
              {!isEditing && (
                <Button onClick={handleEdit} className="w-full mt-6">
                  Edit Profile
                </Button>
              )}
            </Card>
          </div>

          {/* Right: Detailed Information */}
          <div className="lg:col-span-2">
            <Card>
              <h3 className="text-xl font-semibold text-gray-900 mb-6 pb-4 border-b">
                {isEditing ? 'Edit Information' : 'Account Information'}
              </h3>

              {isEditing && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <span className="font-medium">Note:</span> Currently, only <strong>Name</strong> and <strong>Expertise Domains</strong> (for reviewers) are saved to the backend. 
                    Other fields are display-only and will not persist after page reload.
                  </p>
                </div>
              )}

              <div className="space-y-6">
                {/* Common Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Full Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Full Name
                    </label>
                    {isEditing ? (
                      <Input
                        value={editedData?.name || ''}
                        onChange={(e) => handleChange('name', e.target.value)}
                        placeholder="Enter your full name"
                      />
                    ) : (
                      <p className="text-gray-900 py-2">{profileData?.name || 'N/A'}</p>
                    )}
                  </div>

                  {/* Email (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email Address
                    </label>
                    <p className="text-gray-900 py-2">{profileData?.email || 'N/A'}</p>
                    <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                  </div>

                  {/* Role (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Role
                    </label>
                    <p className="text-gray-900 py-2 capitalize">{profileData?.role || 'N/A'}</p>
                  </div>

                  {/* OAuth Provider (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sign-in Method
                    </label>
                    <p className="text-gray-900 py-2">{getOAuthProvider()}</p>
                  </div>

                  {/* Account Created (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Member Since
                    </label>
                    <p className="text-gray-900 py-2">{formatDate(profileData?.createdAt)}</p>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t pt-6"></div>

                {/* Role-Specific Fields */}
                <h4 className="text-lg font-semibold text-gray-900 mb-4">
                  {profileData?.role === 'organizer' && 'Organization Details'}
                  {profileData?.role === 'author' && 'Academic Profile'}
                  {profileData?.role === 'reviewer' && 'Reviewer Details'}
                  {profileData?.role === 'participant' && 'Participant Details'}
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Organizer Fields */}
                  {profileData?.role === 'organizer' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Organization / Institution
                        </label>
                        {isEditing ? (
                          <Input
                            value={editedData?.organization || ''}
                            onChange={(e) => handleChange('organization', e.target.value)}
                            placeholder="Enter organization name"
                          />
                        ) : (
                          <p className="text-gray-900 py-2">{profileData?.organization || 'Not specified'}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Contact Number
                        </label>
                        {isEditing ? (
                          <Input
                            value={editedData?.contactNumber || ''}
                            onChange={(e) => handleChange('contactNumber', e.target.value)}
                            placeholder="Enter contact number"
                          />
                        ) : (
                          <p className="text-gray-900 py-2">{profileData?.contactNumber || 'Not specified'}</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Author Fields */}
                  {profileData?.role === 'author' && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Affiliation / Institution
                        </label>
                        {isEditing ? (
                          <Input
                            value={editedData?.affiliation || ''}
                            onChange={(e) => handleChange('affiliation', e.target.value)}
                            placeholder="Enter your affiliation"
                          />
                        ) : (
                          <p className="text-gray-900 py-2">{profileData?.affiliation || 'Not specified'}</p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Research Domains
                        </label>
                        {isEditing ? (
                          <Textarea
                            value={Array.isArray(editedData?.researchDomains) 
                              ? editedData.researchDomains.join(', ') 
                              : editedData?.researchDomains || ''}
                            onChange={(e) => handleChange('researchDomains', e.target.value.split(',').map(d => d.trim()))}
                            placeholder="Enter domains separated by commas (e.g., AI, Machine Learning)"
                            rows={2}
                          />
                        ) : (
                          <p className="text-gray-900 py-2">
                            {Array.isArray(profileData?.researchDomains) && profileData.researchDomains.length > 0
                              ? profileData.researchDomains.join(', ')
                              : 'Not specified'}
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          ORCID iD
                        </label>
                        <p className="text-gray-900 py-2">{profileData?.orcidId || 'Not linked'}</p>
                        {profileData?.orcidId && (
                          <p className="text-xs text-gray-500 mt-1">Linked via OAuth</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Reviewer Fields */}
                  {profileData?.role === 'reviewer' && (
                    <>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Expertise Domains
                        </label>
                        {isEditing ? (
                          <Textarea
                            value={Array.isArray(editedData?.expertiseDomains) 
                              ? editedData.expertiseDomains.join(', ') 
                              : editedData?.expertiseDomains || ''}
                            onChange={(e) => handleChange('expertiseDomains', e.target.value.split(',').map(d => d.trim()))}
                            placeholder="Enter domains separated by commas (e.g., Computer Vision, NLP)"
                            rows={2}
                          />
                        ) : (
                          <p className="text-gray-900 py-2">
                            {Array.isArray(profileData?.expertiseDomains) && profileData.expertiseDomains.length > 0
                              ? profileData.expertiseDomains.join(', ')
                              : 'Not specified'}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Participant Fields */}
                  {profileData?.role === 'participant' && (
                    <div className="md:col-span-2">
                      <p className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <span className="font-medium">👥 Participant Account</span>
                        <br />
                        Your participation statistics are automatically tracked. Register for conferences to earn certificates!
                      </p>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                {isEditing && (
                  <div className="flex justify-end space-x-3 pt-6 border-t">
                    <Button variant="outline" onClick={handleCancel} disabled={saving}>
                      Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={saving}>
                      {saving ? 'Saving...' : 'Save Changes'}
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
};

export default Profile;
