const {registerUser} = require('./auth/register/register');
const {loginUser} = require('./auth/login/login');

module.exports = {
    registerUser,
    loginUser
};