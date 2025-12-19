import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Button from '../components/Button';

const Navbar = () => {
  const { user, logout } = useAuth();

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
              <>
                <span className="text-sm text-gray-700">
                  {user.name} <span className="text-gray-500">({user.role})</span>
                </span>
                <Button variant="outline" size="sm" onClick={logout}>
                  Logout
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
