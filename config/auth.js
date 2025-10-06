import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

// In-memory token storage (replace with database in production)
const tokenStorage = new Map();

function isLocalStorageAvailable(req) {
    // Since this is server-side, we'll check if client supports localStorage
    // This can be determined from headers or client capability flags
    const userAgent = req.headers['user-agent'] || '';
    const supportsLocalStorage = req.headers['x-supports-localstorage'] === 'true';
    
    if (!supportsLocalStorage) {
        return false;
    }
    return true;
}

const generateAccessToken = (userId, email, name, designation) =>
    jwt.sign({ sub: userId, email, name, designation }, JWT_SECRET, { expiresIn: "1h" }); // 1 hours

const generateRefreshToken = () =>
    crypto.randomBytes(32).toString("hex"); // Random secure string

const generateAccessTokenMobile = (userId, email, name, designation) =>
    jwt.sign({ sub: userId, email, name, designation }, JWT_SECRET);

module.exports = { generateRefreshToken ,generateAccessTokenMobile ,generateAccessToken };