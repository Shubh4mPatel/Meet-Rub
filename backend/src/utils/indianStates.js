const INDIAN_STATES = [
  { name: 'Andaman and Nicobar Islands', code: 'AN' },
  { name: 'Andhra Pradesh', code: 'AP' },
  { name: 'Arunachal Pradesh', code: 'AR' },
  { name: 'Assam', code: 'AS' },
  { name: 'Bihar', code: 'BR' },
  { name: 'Chandigarh', code: 'CH' },
  { name: 'Chhattisgarh', code: 'CT' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DN' },
  { name: 'Delhi', code: 'DL' },
  { name: 'Goa', code: 'GA' },
  { name: 'Gujarat', code: 'GJ' },
  { name: 'Haryana', code: 'HR' },
  { name: 'Himachal Pradesh', code: 'HP' },
  { name: 'Jammu and Kashmir', code: 'JK' },
  { name: 'Jharkhand', code: 'JH' },
  { name: 'Karnataka', code: 'KA' },
  { name: 'Kerala', code: 'KL' },
  { name: 'Ladakh', code: 'LA' },
  { name: 'Lakshadweep', code: 'LD' },
  { name: 'Madhya Pradesh', code: 'MP' },
  { name: 'Maharashtra', code: 'MH' },
  { name: 'Manipur', code: 'MN' },
  { name: 'Meghalaya', code: 'ML' },
  { name: 'Mizoram', code: 'MZ' },
  { name: 'Nagaland', code: 'NL' },
  { name: 'Odisha', code: 'OR' },
  { name: 'Puducherry', code: 'PY' },
  { name: 'Punjab', code: 'PB' },
  { name: 'Rajasthan', code: 'RJ' },
  { name: 'Sikkim', code: 'SK' },
  { name: 'Tamil Nadu', code: 'TN' },
  { name: 'Telangana', code: 'TG' },
  { name: 'Tripura', code: 'TR' },
  { name: 'Uttar Pradesh', code: 'UP' },
  { name: 'Uttarakhand', code: 'UT' },
  { name: 'West Bengal', code: 'WB' },
];

const STATE_NAME_TO_CODE = Object.fromEntries(
  INDIAN_STATES.map(s => [s.name, s.code])
);

const VALID_STATE_NAMES = new Set(INDIAN_STATES.map(s => s.name));

const toStateCode = (state) =>
  STATE_NAME_TO_CODE[state?.trim()] || state?.trim().toUpperCase();

module.exports = { INDIAN_STATES, STATE_NAME_TO_CODE, VALID_STATE_NAMES, toStateCode };
