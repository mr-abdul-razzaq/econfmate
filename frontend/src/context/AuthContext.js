import React, { createContext, useState, useContext } from 'react';
import axios from 'axios';
import { setAuthToken } from '../utils/api';

const base = process.env.REACT_APP_API_URL || 'https://cms-backend-fjdo.onrender.com/api';

export const AuthContext = createContext();

const initialToken = localStorage.getItem('token') || null;
let initialUser = null;
try {
  const u = localStorage.getItem('user');
  initialUser = u ? JSON.parse(u) : null;
} catch (e) {
  initialUser = null;
}

// set axios global and api instance header synchronously so children see it on first render
if (initialToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${initialToken}`;
  setAuthToken(initialToken);
}

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState({
    token: initialToken,
    user: initialUser,
    isAuthenticated: !!initialToken
  });

  async function login(email, password) {
    try {
      const res = await axios.post(`${base}/auth/login`, { email, password });
      const body = res.data || {};
      const token = body.token || body.data?.token || body.data?.accessToken || body.accessToken;
      const user = body.user || body.data?.user || body.data || null;
      if (token) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user || {}));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setAuthToken(token);
        setAuth({ token, user, isAuthenticated: true });
      }
      return { success: true, token, user, raw: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message || 'Login failed' };
    }
  }

  async function register(payload) {
    try {
      const res = await axios.post(`${base}/auth/register`, payload);
      const body = res.data || {};
      const token = body.token || body.data?.token || body.data?.accessToken || body.accessToken;
      const user = body.user || body.data?.user || body.data || null;
      if (token) {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user || {}));
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setAuthToken(token);
        setAuth({ token, user, isAuthenticated: true });
      }
      return { success: true, token, user, raw: res.data };
    } catch (err) {
      return { success: false, message: err.response?.data?.message || err.message || 'Registration failed' };
    }
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setAuthToken(null);
    setAuth({ token: null, user: null, isAuthenticated: false });
  }

  function updateUser(updatedUser) {
    if (!updatedUser) return;
    
    const currentToken = auth.token;
    
    // Update localStorage
    localStorage.setItem('user', JSON.stringify(updatedUser));
    
    // Force state update with new object reference to trigger re-renders
    setAuth({
      token: currentToken,
      user: { ...updatedUser }, // Create new object reference
      isAuthenticated: true
    });
  }

  return (
    <AuthContext.Provider value={{ ...auth, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

export default AuthProvider;
