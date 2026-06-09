const { query } = require('../../../../config/dbConfig');
const AppError = require('../../../../utils/appError');
const { logger } = require('../../../../utils/logger');
const { generateTokens } = require('../../../../utils/helper');

const socialLoginUser = async (req, res, next) => {
  try {
    const { provider, providerId, name, email, picture, accessToken } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!provider || !email || !accessToken) {
      return next(
        new AppError('Missing required fields: provider, email, and accessToken are required', 400)
      );
    }

    if (provider !== 'google') {
      return next(new AppError('Unsupported OAuth provider', 400));
    }

    // ── Verify Google access token via Google's tokeninfo endpoint ────────────
    // This prevents forged requests where an attacker fabricates the payload.
    const tokenInfoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    const tokenInfo = await tokenInfoRes.json();

    if (tokenInfo.error_description || !tokenInfo.email) {
      logger.warn('Google tokeninfo validation failed:', tokenInfo);
      return next(new AppError('Invalid or expired Google access token', 401));
    }

    // ── LOGIN-TIME ENV DIAGNOSTIC (temporary) ──────────────────────────────
    console.log("[SOCIAL-LOGIN] token aud (from Google):", tokenInfo.aud);
    console.log(
      "[SOCIAL-LOGIN] process.env.GOOGLE_CLIENT_ID:",
      process.env.GOOGLE_CLIENT_ID
        ? `SET -> "${process.env.GOOGLE_CLIENT_ID.slice(0, 16)}…"`
        : "❌ UNDEFINED (this is the bug — env not loaded into process)"
    );
    // ────────────────────────────────────────────────────────────────────────

    // Verify the token was issued for OUR app (prevents token-substitution attacks)
    if (tokenInfo.aud !== process.env.GOOGLE_CLIENT_ID) {
      logger.warn(
        `Google token audience mismatch: expected ${process.env.GOOGLE_CLIENT_ID}, got ${tokenInfo.aud}`
      );
      return next(new AppError('Google token audience mismatch', 401));
    }

    // Verify the email in the token matches what was sent in the request body
    if (tokenInfo.email.toLowerCase() !== email.toLowerCase().trim()) {
      return next(new AppError('Google token email mismatch', 401));
    }

    const normalizedEmail = email.toLowerCase().trim();

    // ── Look up existing user ─────────────────────────────────────────────────
    const { rows: existingUsers } = await query(
      'SELECT * FROM users WHERE user_email = $1',
      [normalizedEmail]
    );
    let user = existingUsers[0];
    let roleWiseId = null;

    if (user) {
      // User exists — if they registered with a password (local account), block Google login
      // auth_provider NULL means old account created before this column was added → treat as local
      if (!user.auth_provider || user.auth_provider !== 'google') {
        return next(
          new AppError(
            'An account with this email already exists. Please sign in with your email and password.',
            409
          )
        );
      }

      // Check if the returning user's account is suspended
      if (user.user_role === 'freelancer') {
        const { rows: freelancerRows } = await query(
          'SELECT verification_status FROM freelancer WHERE user_id = $1',
          [user.id]
        );
        if (freelancerRows[0]?.verification_status === 'SUSPENDED') {
          logger.warn(`Google login blocked: Freelancer account suspended (user_id=${user.id})`);
          return next(new AppError('Your account has been suspended. Please contact support for assistance.', 403));
        }
      } else if (user.user_role === 'creator') {
        const { rows: creatorRows } = await query(
          'SELECT account_status FROM creators WHERE user_id = $1',
          [user.id]
        );
        if (creatorRows[0]?.account_status === 'SUSPENDED') {
          logger.warn(`Google login blocked: Creator account suspended (user_id=${user.id})`);
          return next(new AppError('Your account has been suspended. Please contact support for assistance.', 403));
        }
      }

      logger.info(`Google login: returning user user_id=${user.id}`);
    } else {
      // ── New user — create account ─────────────────────────────────────────
      // Generate a unique username from the Google display name
      const baseName = (name || normalizedEmail.split('@')[0])
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase() || 'user';

      let username = baseName;
      // Retry up to 5 times to find a unique username
      for (let attempt = 0; attempt < 5; attempt++) {
        const { rows: taken } = await query(
          'SELECT id FROM users WHERE user_name = $1',
          [username]
        );
        if (taken.length === 0) break;
        username = `${baseName}_${Date.now().toString().slice(-6)}${attempt}`;
      }

      const { rows: newUserRows } = await query(
        `INSERT INTO users (user_email, user_role, user_password, user_name, auth_provider)
         VALUES ($1, 'freelancer', NULL, $2, 'google')
         RETURNING *`,
        [normalizedEmail, username]
      );
      user = newUserRows[0];
      logger.info(`Google registration: new user created user_id=${user.id}, username=${username}`);

      // Create the corresponding freelancer record
      await query(
        'INSERT INTO freelancer (user_id, freelancer_email) VALUES ($1, $2)',
        [user.id, normalizedEmail]
      );
    }

    // ── Fetch roleWiseId ──────────────────────────────────────────────────────
    if (user.user_role === 'freelancer') {
      const result = await query(
        'SELECT freelancer_id FROM freelancer WHERE user_id = $1',
        [user.id]
      );
      roleWiseId = result.rows[0]?.freelancer_id || null;
    } else if (user.user_role === 'creator') {
      const result = await query(
        'SELECT creator_id FROM creators WHERE user_id = $1',
        [user.id]
      );
      roleWiseId = result.rows[0]?.creator_id || null;
    }

    // ── Generate tokens and set response locals ───────────────────────────────
    const { accessToken: jwtAccessToken, refreshToken } = generateTokens(user, roleWiseId);

    res.locals.accessToken = jwtAccessToken;
    res.locals.refreshToken = refreshToken;
    res.locals.user = {
      user_id: user.id,
      email: user.user_email,
      name: user.user_name,
      role: user.user_role,
      roleWiseId,
    };

    return next();
  } catch (err) {
    logger.error('Social login error:', err);
    return next(new AppError('Social login failed. Please try again.', 500));
  }
};

module.exports = { socialLoginUser };
