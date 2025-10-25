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
      return null;
    }
  }
  
module.exports = {decodedToken,getObjectNameFromUrl};