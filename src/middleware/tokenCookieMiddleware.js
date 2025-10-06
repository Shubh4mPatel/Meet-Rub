function setTokenCookies(req, res, next) {
    const isProduction = process.env.NODE_ENV === 'production';
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
    const ACCESS_TOKEN_DURATION_WEB = 15 * 60 * 1000;  // 15 minutes
    const REFRESH_TOKEN_DURATION_WEB = 4 * 60 * 60 * 1000; // 4 hours

    // Mobile durations (use browser’s ~400 day cap instead of 10 years)
    const MOBILE_MAX_AGE = 400 * 24 * 60 * 60 * 1000; // ~400 days

    if (res.locals.accessToken) {
        res.cookie('orangeAccessToken', res.locals.accessToken, {
            maxAge: res.locals.isMobile ? MOBILE_MAX_AGE : ACCESS_TOKEN_DURATION_WEB,
            httpOnly: isProduction ? true : false,
            secure: isHttps,
            sameSite: 'lax',
            path: '/',
        });
    }

    if (res.locals.refreshToken) {
        res.cookie('orangeRefreshToken', res.locals.refreshToken, {
            maxAge: res.locals.isMobile ? MOBILE_MAX_AGE : REFRESH_TOKEN_DURATION_WEB,
            httpOnly: isProduction ? true : false,
            secure: isHttps,
            sameSite: 'lax',
            path: '/',
        });
    }


    next();
}

module.exports = {setTokenCookies};