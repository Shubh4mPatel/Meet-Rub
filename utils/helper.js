const jwt = require('jsonwebtoken');
const decodedToken = (token) => {
    return  jwt.verify(token, process.env.JWT_SECRET);             
}
function getObjectNameFromUrl(url, bucketName) {
    try {
      const parsedUrl = new URL(url);
      // Example: pathname = "/my-bucket/uploads/freelancer-1/work1.png"
      const path = parsedUrl.pathname;
      // Remove leading '/' and bucket name prefix
      return path.replace(`/${bucketName}/`, '');
    } catch (err) {
      console.error("Invalid URL:", err);
      return err;
    }
  }
  function addAssetsPrefix(rawUrl) {
  const u = new URL(rawUrl);
  // Normalize existing path (remove leading slash for split)
  const parts = u.pathname.replace(/^\/+/, '').split('/');
  // If it already starts with 'assets', do nothing
  if (parts[0] !== 'assets') parts.unshift('assets');
  u.pathname = '/' + parts.join('/');
  return u.toString();
}
module.exports = {decodedToken,getObjectNameFromUrl,addAssetsPrefix};