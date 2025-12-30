const { none } = require("../../config/multer");

function setTokenCookies(req, res, next) {
  const isProduction = process.env.NODE_ENV === "production";
  // const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV !== 'production';
  const isHttps = false;
  const ACCESS_TOKEN_DURATION_WEB = 15 * 60 * 1000; // 15 minutes
  const REFRESH_TOKEN_DURATION_WEB = 4 * 60 * 60 * 1000; // 4 hours

  if (res.locals.accessToken) {
    res.cookie("AccessToken", res.locals.accessToken, {
      maxAge: ACCESS_TOKEN_DURATION_WEB,
      httpOnly: isProduction ? true : false,
      secure: isHttps,
      sameSite: isProduction ? "None" : "lax",
      path: "/",
    });
  }
  if (res.locals.refreshToken) {
    res.cookie("RefreshToken", res.locals.refreshToken, {
      maxAge: REFRESH_TOKEN_DURATION_WEB,
      httpOnly: isProduction ? true : false,
      secure: isHttps,
      sameSite: isProduction ? "None" : "lax",
      path: "/",
    });
  }
  console.log("Tokens set in cookies");
  next();
}

module.exports = { setTokenCookies };
