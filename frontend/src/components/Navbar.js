import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const navLinks = {
    organizer: [
      { to: '/organizer/dashboard', label: 'Dashboard' },
      { to: '/organizer/create-conference', label: 'Create Conference' },
      { to: '/organizer/participants', label: 'Participants' }
    ],
    author: [
      { to: '/author/dashboard', label: 'Dashboard' },
      { to: '/author/discover', label: 'Discover Conferences' },
      { to: '/author/submissions', label: 'My Submissions' }
    ],
    reviewer: [
      { to: '/reviewer/dashboard', label: 'Dashboard' },
      { to: '/reviewer/conferences', label: 'Browse Conferences' },
      { to: '/reviewer/bids', label: 'My Bids' },
      { to: '/reviewer/reviews', label: 'My Reviews' }
    ],
    participant: [
      { to: '/participant/dashboard', label: 'Dashboard' },
      { to: '/participant/events', label: 'Browse Events' },
      { to: '/participant/registrations', label: 'My Registrations' },
      { to: '/participant/certificates', label: 'My Certificates' }
    ]
  };

  const links = user ? navLinks[user.role] || [] : [];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const handleViewProfile = () => {
    setIsDropdownOpen(false);
    navigate('/profile');
  };

  const handleLogout = () => {
    setIsDropdownOpen(false);
    logout();
  };

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold text-primary-600">
              CMS
            </Link>
            <div className="hidden md:flex ml-10 space-x-8">
              {links.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-gray-700 hover:text-primary-600 px-3 py-2 text-sm font-medium transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {user && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center space-x-3 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors"
                  aria-haspopup="true"
                  aria-expanded={isDropdownOpen}
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-sm">
                    {getInitials(user.name)}
                  </div>
                  {/* User Info */}
                  <div className="hidden md:block text-left">
                    <div className="text-sm font-medium text-gray-900">{user.name}</div>
                    <div className="text-xs text-gray-500 capitalize">{user.role}</div>
                  </div>
                  {/* Dropdown Arrow */}
                  <svg
                    className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg ring-1 ring-black ring-opacity-5 z-50 animate-fadeIn">
                    <div className="py-2">
                      {/* Profile Option */}
                      <button
                        onClick={handleViewProfile}
                        className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-3 transition-colors"
                      >
                        <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <div>
                          <div className="font-medium">View Profile</div>
                          <div className="text-xs text-gray-500">Manage your account</div>
                        </div>
                      </button>

                      <div className="border-t my-1"></div>

                      {/* Logout Option */}
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3 text-sm text-red-600 hover:bg-red-50 flex items-center space-x-3 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span className="font-medium">Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
