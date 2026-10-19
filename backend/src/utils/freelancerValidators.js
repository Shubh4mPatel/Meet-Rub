// Shared freelancer field validators — rules mirror what Razorpay Route onboarding requires,
// so bad values are rejected when the freelancer enters them, not when admin creates the linked account.

// +91 followed by exactly 10 digits; Indian mobile numbers start with 6-9
const PHONE_REGEX = /^\+91[6-9]\d{9}$/;
// 5 letters, 4 digits, 1 letter; 4th letter must be P (individual)
const PAN_REGEX = /^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/;
const POSTAL_CODE_REGEX = /^[1-9]\d{5}$/;

const PHONE_MESSAGE = 'Phone number must be in the format +91 followed by exactly 10 digits (e.g. +919876543210)';
const PAN_MESSAGE = 'PAN must be 10 characters in the format AAAPA1234A (4th character must be "P" for individuals)';
const POSTAL_CODE_MESSAGE = 'Postal code must be exactly 6 digits';
const STREET_MESSAGE = 'Street address must be between 10 and 100 characters';
const CITY_MESSAGE = 'City must be between 2 and 100 characters and contain only letters, spaces, dots, hyphens or apostrophes';

// Drops spaces and hyphens so "+91 98765-43210" is accepted
const normalizePhone = (value) => String(value ?? '').replace(/[\s-]/g, '');
const normalizePan = (value) => String(value ?? '').trim().toUpperCase();

const isValidPhone = (value) => PHONE_REGEX.test(normalizePhone(value));
const isValidPan = (value) => PAN_REGEX.test(normalizePan(value));
const isValidPostalCode = (value) => POSTAL_CODE_REGEX.test(String(value ?? '').trim());
const isValidStreet = (value) => {
  const len = String(value ?? '').trim().length;
  return len >= 10 && len <= 100;
};
const isValidCity = (value) => {
  const city = String(value ?? '').trim();
  return city.length >= 2 && city.length <= 100 && /^[A-Za-z][A-Za-z .'-]*$/.test(city);
};

// Joi custom validators: return the normalized value, or an error with a clear message
const joiPhone = (value, helpers) =>
  isValidPhone(value) ? normalizePhone(value) : helpers.message(PHONE_MESSAGE);
const joiPan = (value, helpers) =>
  isValidPan(value) ? normalizePan(value) : helpers.message(PAN_MESSAGE);
const joiPostalCode = (value, helpers) =>
  isValidPostalCode(value) ? String(value).trim() : helpers.message(POSTAL_CODE_MESSAGE);
const joiStreet = (value, helpers) =>
  isValidStreet(value) ? value.trim() : helpers.message(STREET_MESSAGE);
const joiCity = (value, helpers) =>
  isValidCity(value) ? value.trim() : helpers.message(CITY_MESSAGE);

module.exports = {
  PHONE_MESSAGE,
  PAN_MESSAGE,
  POSTAL_CODE_MESSAGE,
  STREET_MESSAGE,
  CITY_MESSAGE,
  normalizePhone,
  normalizePan,
  isValidPhone,
  isValidPan,
  isValidPostalCode,
  isValidStreet,
  isValidCity,
  joiPhone,
  joiPan,
  joiPostalCode,
  joiStreet,
  joiCity,
};
