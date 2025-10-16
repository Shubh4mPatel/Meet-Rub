const jwt = require('jsonwebtoken');
const decodedToken = (token) => {
    return  jwt.verify(token, process.env.JWT_SECRET);             
}

module.exports = {decodedToken};