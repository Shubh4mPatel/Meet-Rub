const CryptoJS = require("crypto-js");
const { logger } = require('../utils/logger');

const secretKey = process.env.CRYPTOJS_SECRET;

const encryptId = (id) => {
    try {
        const encrypted = CryptoJS.AES.encrypt(id.toString(), secretKey).toString();
        return encrypted.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    } catch (error) {
        throw new Error("Failed to encrypt the ID: " + error.message);
    }
};

const decryptId = (encryptedId) => {
    try {
        let standardBase64 = encryptedId.replace(/-/g, "+").replace(/_/g, "/");

        // Add back the padding if it's missing
        const padding = standardBase64.length % 4 === 0 ? '' : '='.repeat(4 - (standardBase64.length % 4));
        standardBase64 += padding;

        const bytes = CryptoJS.AES.decrypt(standardBase64, secretKey);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        if (!decrypted) throw new Error("Decryption failed or invalid ID");
        return decrypted;
    } catch (error) {
        throw new Error("Failed to decrypt the ID: " + error.message);
    }
};

const SECRET_KEY = 'mysecretkey12345mysecretkey12345';
const IV = CryptoJS.enc.Utf8.parse('initialvector123'.substring(0, 16));

const decryptAES = (encryptedText) => {
    try {
        const key = CryptoJS.enc.Utf8.parse(SECRET_KEY);

        const decrypted = CryptoJS.AES.decrypt(encryptedText, key, {
            iv: IV,
            mode: CryptoJS.mode.CBC,
            padding: CryptoJS.pad.Pkcs7
        });

        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        logger.error('Decryption error:', error);
        throw new Error('Failed to decrypt data');
    }
};

// Export all functions for CommonJS
module.exports = {
    encryptId,
    decryptId,
    decryptAES
};
