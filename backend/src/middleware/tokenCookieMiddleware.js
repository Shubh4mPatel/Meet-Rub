
function setTokenCookies(req, res, next) {
  const isProduction = process.env.NODE_ENV === "production";
  const isHttps = isProduction ? true : false;
  const sameSite = "Lax";
  const ACCESS_TOKEN_DURATION_WEB = 365 * 24 * 60 * 60 * 1000; // 15 minutes
  const REFRESH_TOKEN_DURATION_WEB = 365 * 24 * 60 * 60 * 1000; // 365 days

  if (res.locals.accessToken) {
    res.cookie("AccessToken", res.locals.accessToken, {
      maxAge: ACCESS_TOKEN_DURATION_WEB,
      httpOnly: true,
      secure: isHttps,
      sameSite,
      path: "/",
    });
  }
  if (res.locals.refreshToken) {
    res.cookie("RefreshToken", res.locals.refreshToken, {
      maxAge: REFRESH_TOKEN_DURATION_WEB,
      httpOnly: true,
      secure: isHttps,
      sameSite,
      path: "/",
    });
  }
  console.log("Tokens set in cookies");
  next();
}

module.exports = { setTokenCookies };
