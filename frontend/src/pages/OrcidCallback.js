import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Loading from '../components/Loading';

const OrcidCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Authenticating with ORCID...');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent duplicate API calls
      if (isProcessing) {
        return;
      }

      try {
        // Extract authorization code from URL
        const searchParams = new URLSearchParams(location.search);
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const errorParam = searchParams.get('error');

        if (errorParam) {
          setError('ORCID authentication was denied or failed');
          return;
        }

        if (!code) {
          setError('No authorization code received from ORCID');
          return;
        }

        // Mark as processing to prevent duplicate calls
        setIsProcessing(true);
        setStatus('Verifying with server...');

        // Parse state to get role if provided
        let role = null;
        if (state) {
          try {
            const stateData = JSON.parse(decodeURIComponent(state));
            role = stateData.role;
          } catch (e) {
            console.warn('Could not parse state:', e);
          }
        }

        // Send code to backend
        const response = await axios.post(
          `${process.env.REACT_APP_API_URL}/auth/orcid/callback`,
          { code, role }
        );

        if (response.data.success) {
          setStatus('Login successful! Redirecting...');
          
          // Store token and user data
          localStorage.setItem('token', response.data.data.token);
          localStorage.setItem('user', JSON.stringify(response.data.data.user));
          setUser(response.data.data.user);

          // Redirect to dashboard
          setTimeout(() => {
            navigate(`/${response.data.data.user.role}/dashboard`);
          }, 1000);
        } else {
          setError(response.data.message || 'Authentication failed');
        }

      } catch (err) {
        console.error('ORCID callback error:', err);
        setError(err.response?.data?.message || 'An error occurred during authentication');
      } finally {
        setIsProcessing(false);
      }
    };

    handleCallback();
  }, [location.search]); // Only depend on search params to avoid unnecessary re-runs

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8 text-center">
        {!error ? (
          <>
            <Loading size="large" />
            <h2 className="mt-6 text-xl font-semibold text-gray-900">{status}</h2>
            <p className="mt-2 text-sm text-gray-600">
              Please wait while we complete your authentication...
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-gray-900">Authentication Failed</h2>
            <p className="mt-2 text-sm text-red-600">{error}</p>
            <button
              onClick={() => navigate('/login')}
              className="mt-6 w-full inline-flex justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default OrcidCallback;
