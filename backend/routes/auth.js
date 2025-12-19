const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const axios = require('axios');
const User = require('../models/User');
const { generateToken } = require('../utils/jwt');
const { auth } = require('../middleware/auth');

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['organizer', 'author', 'reviewer', 'participant']).withMessage('Invalid role')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, email, password, role, expertiseDomains } = req.body;

    // Check if user already exists
    const existingUsers = await User.find({ email });
    if (existingUsers.length > 0) {
      // Email exists - check role restrictions
      const hasOrganizerAccount = existingUsers.some(u => u.role === 'organizer');
      
      if (hasOrganizerAccount) {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered as an organizer. Please use a different email.'
        });
      }
      
      if (role === 'organizer') {
        return res.status(400).json({
          success: false,
          message: 'This email is already registered with other roles. Organizers must use a unique email.'
        });
      }
      
      // For author/reviewer/participant, if same role exists, show error
      const sameRoleExists = existingUsers.some(u => u.role === role);
      if (sameRoleExists) {
        return res.status(400).json({
          success: false,
          message: `You already have an account with this email as ${role}. Please login instead.`
        });
      }
      
      // Different role (author/reviewer/participant) - this shouldn't happen in typical flow
      // but if it does, we'll return an error to use existing account
      return res.status(400).json({
        success: false,
        message: 'This email is already registered. Please login to access different roles.'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      passwordHash: password,
      role,
      expertiseDomains: expertiseDomains || []
    });

    await user.save();

    // Generate token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user
 * @access  Private
 */
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user',
      error: error.message
    });
  }
});

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', auth, [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('expertiseDomains').optional().isArray().withMessage('Expertise domains must be an array')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { name, expertiseDomains } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (expertiseDomains) updateData.expertiseDomains = expertiseDomains;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updateData,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/auth/google/callback
 * @desc    Handle Google OAuth callback
 * @access  Public
 */
router.post('/google/callback', [
  body('code').notEmpty().withMessage('Authorization code is required'),
  body('role').optional().isIn(['organizer', 'author', 'reviewer', 'participant']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { code, role } = req.body;

    // Exchange authorization code for access token
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        'https://oauth2.googleapis.com/token',
        {
          code,
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI,
          grant_type: 'authorization_code'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    } catch (tokenError) {
      console.error('Google token exchange error:', tokenError.response?.data || tokenError.message);
      
      // Handle specific Google OAuth errors
      if (tokenError.response?.data?.error === 'invalid_grant') {
        return res.status(400).json({
          success: false,
          message: 'The authorization code has expired or was already used. Please try logging in again.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange authorization code with Google',
        error: tokenError.response?.data?.error_description || tokenError.message
      });
    }

    const { access_token, refresh_token } = tokenResponse.data;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve access token from Google'
      });
    }

    // Fetch user profile from Google
    const profileResponse = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          'Authorization': `Bearer ${access_token}`
        }
      }
    );

    const { id: googleId, email, name, picture } = profileResponse.data;

    if (!googleId) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve Google ID'
      });
    }

    // Role-based login restrictions
    const allowedRoles = ['author', 'reviewer', 'participant']; // These can share email
    const requestedRole = role || 'author';

    // Check if user already exists with this Google ID
    let user = await User.findOne({ googleId });

    if (user) {
      // User exists with this Google ID
      // Check if trying to change role to/from organizer (not allowed)
      if (role && user.role !== requestedRole) {
        // Trying to login with different role
        if (user.role === 'organizer' || requestedRole === 'organizer') {
          return res.status(403).json({
            success: false,
            message: `This account is registered as ${user.role}. Organizer accounts cannot be used for other roles.`
          });
        }
        // Allow role switch between author/reviewer/participant
        user.role = requestedRole;
      }
      
      // Update tokens
      user.googleAccessToken = access_token;
      if (refresh_token) {
        user.googleRefreshToken = refresh_token;
      }
      await user.save();
    } else {
      // Check if user exists with this email
      const existingUsers = await User.find({ email });
      
      if (existingUsers.length > 0) {
        // Email exists - check role restrictions
        const hasOrganizerAccount = existingUsers.some(u => u.role === 'organizer');
        
        if (hasOrganizerAccount) {
          return res.status(403).json({
            success: false,
            message: 'This email is already registered as an organizer. Please use a different email.'
          });
        }
        
        if (requestedRole === 'organizer') {
          return res.status(403).json({
            success: false,
            message: 'This email is already registered with other roles. Organizers must use a unique email.'
          });
        }
        
        // Email exists with author/reviewer/participant - find and link
        user = existingUsers[0];
        user.googleId = googleId;
        user.googleAccessToken = access_token;
        if (refresh_token) {
          user.googleRefreshToken = refresh_token;
        }
        if (picture && !user.profilePicture) {
          user.profilePicture = picture;
        }
        // Update role if specified
        if (role && allowedRoles.includes(requestedRole)) {
          user.role = requestedRole;
        }
        await user.save();
      } else {
        // Create new user
        user = new User({
          name: name || `Google User ${googleId}`,
          email,
          googleId,
          googleAccessToken: access_token,
          googleRefreshToken: refresh_token,
          profilePicture: picture,
          role: requestedRole,
          expertiseDomains: []
        });

        await user.save();
      }
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'Google authentication successful',
      data: {
        user: user.toJSON(),
        token,
        isNewUser: !user.googleAccessToken
      }
    });

  } catch (error) {
    console.error('Google authentication error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error authenticating with Google',
      error: error.response?.data?.error_description || error.message
    });
  }
});

/**
 * @route   POST /api/auth/orcid/callback
 * @desc    Handle ORCID OAuth callback
 * @access  Public
 */
router.post('/orcid/callback', [
  body('code').notEmpty().withMessage('Authorization code is required'),
  body('role').optional().isIn(['organizer', 'author', 'reviewer', 'participant']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const { code, role } = req.body;

    // Exchange authorization code for access token
    let tokenResponse;
    try {
      tokenResponse = await axios.post(
        'https://orcid.org/oauth/token',
        null,
        {
          params: {
            client_id: process.env.ORCID_CLIENT_ID,
            client_secret: process.env.ORCID_CLIENT_SECRET,
            grant_type: 'authorization_code',
            code,
            redirect_uri: process.env.ORCID_REDIRECT_URI
          },
          headers: {
            'Accept': 'application/json'
          }
        }
      );
    } catch (tokenError) {
      console.error('ORCID token exchange error:', tokenError.response?.data || tokenError.message);
      
      // Handle specific ORCID OAuth errors
      if (tokenError.response?.data?.error === 'invalid_grant') {
        return res.status(400).json({
          success: false,
          message: 'The authorization code has expired or was already used. Please try logging in again.'
        });
      }
      
      return res.status(400).json({
        success: false,
        message: 'Failed to exchange authorization code with ORCID',
        error: tokenError.response?.data?.error_description || tokenError.message
      });
    }

    const { orcid, access_token, name } = tokenResponse.data;

    if (!orcid) {
      return res.status(400).json({
        success: false,
        message: 'Failed to retrieve ORCID iD'
      });
    }

    // Role-based login restrictions
    const allowedRoles = ['author', 'reviewer', 'participant']; // These can share email
    const requestedRole = role || 'author';

    // Check if user already exists with this ORCID
    let user = await User.findOne({ orcid });

    if (user) {
      // User exists with this ORCID
      // Check if trying to change role to/from organizer (not allowed)
      if (role && user.role !== requestedRole) {
        // Trying to login with different role
        if (user.role === 'organizer' || requestedRole === 'organizer') {
          return res.status(403).json({
            success: false,
            message: `This account is registered as ${user.role}. Organizer accounts cannot be used for other roles.`
          });
        }
        // Allow role switch between author/reviewer/participant
        user.role = requestedRole;
      }
      
      // Update access token
      user.orcidAccessToken = access_token;
      await user.save();
    } else {
      // Fetch additional profile data from ORCID
      let profileData = { name, affiliation: '' };
      
      try {
        const profileResponse = await axios.get(
          `https://pub.orcid.org/v3.0/${orcid}/person`,
          {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${access_token}`
            }
          }
        );

        // Extract name if available
        if (profileResponse.data.name && profileResponse.data.name['given-names']) {
          const givenNames = profileResponse.data.name['given-names'].value;
          const familyName = profileResponse.data.name['family-name']?.value || '';
          profileData.name = `${givenNames} ${familyName}`.trim();
        }

        // Extract affiliation if available
        if (profileResponse.data.employments?.['affiliation-group']?.length > 0) {
          const latestEmployment = profileResponse.data.employments['affiliation-group'][0];
          const orgName = latestEmployment['summaries']?.[0]?.['employment-summary']?.organization?.name;
          if (orgName) {
            profileData.affiliation = orgName;
          }
        }
      } catch (profileError) {
        console.warn('Could not fetch ORCID profile data:', profileError.message);
        // Continue with basic data even if profile fetch fails
      }

      // Generate email from ORCID
      const email = `${orcid.replace(/-/g, '')}@orcid.user`;
      
      // Check if email exists with another account
      const existingUsers = await User.find({ email });
      
      if (existingUsers.length > 0) {
        // Email exists - check role restrictions
        const hasOrganizerAccount = existingUsers.some(u => u.role === 'organizer');
        
        if (hasOrganizerAccount) {
          return res.status(403).json({
            success: false,
            message: 'This ORCID is already registered as an organizer. Please use a different ORCID.'
          });
        }
        
        if (requestedRole === 'organizer') {
          return res.status(403).json({
            success: false,
            message: 'This ORCID is already registered with other roles. Organizers must use a unique ORCID.'
          });
        }
        
        // Use existing account and link ORCID
        user = existingUsers[0];
        user.orcid = orcid;
        user.orcidAccessToken = access_token;
        user.name = profileData.name || name || user.name;
        if (profileData.affiliation) {
          user.affiliation = profileData.affiliation;
        }
        // Update role if specified
        if (role && allowedRoles.includes(requestedRole)) {
          user.role = requestedRole;
        }
        await user.save();
      } else {
        // Create new user
        user = new User({
          name: profileData.name || name || `ORCID User ${orcid}`,
          email,
          orcid,
          orcidAccessToken: access_token,
          affiliation: profileData.affiliation,
          role: requestedRole,
          expertiseDomains: []
        });

        await user.save();
      }
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id,
      email: user.email,
      role: user.role
    });

    res.json({
      success: true,
      message: 'ORCID authentication successful',
      data: {
        user: user.toJSON(),
        token,
        isNewUser: !user.orcidAccessToken
      }
    });

  } catch (error) {
    console.error('ORCID authentication error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: 'Error authenticating with ORCID',
      error: error.response?.data?.error_description || error.message
    });
  }
});

module.exports = router;
