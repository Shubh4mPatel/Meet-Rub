const INDIAN_STATES = [
  { name: 'Andaman and Nicobar Islands', code: 'ANDAMAN AND NICOBAR ISLANDS' },
  { name: 'Andhra Pradesh', code: 'ANDHRA PRADESH' },
  { name: 'Arunachal Pradesh', code: 'ARUNACHAL PRADESH' },
  { name: 'Assam', code: 'ASSAM' },
  { name: 'Bihar', code: 'BIHAR' },
  { name: 'Chandigarh', code: 'CHANDIGARH' },
  { name: 'Chhattisgarh', code: 'CHHATTISGARH' },
  { name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU' },
  { name: 'Delhi', code: 'DELHI' },
  { name: 'Goa', code: 'GOA' },
  { name: 'Gujarat', code: 'GUJARAT' },
  { name: 'Haryana', code: 'HARYANA' },
  { name: 'Himachal Pradesh', code: 'HIMACHAL PRADESH' },
  { name: 'Jammu and Kashmir', code: 'JAMMU AND KASHMIR' },
  { name: 'Jharkhand', code: 'JHARKHAND' },
  { name: 'Karnataka', code: 'KARNATAKA' },
  { name: 'Kerala', code: 'KERALA' },
  { name: 'Ladakh', code: 'LADAKH' },
  { name: 'Lakshadweep', code: 'LAKSHADWEEP' },
  { name: 'Madhya Pradesh', code: 'MADHYA PRADESH' },
  { name: 'Maharashtra', code: 'MAHARASHTRA' },
  { name: 'Manipur', code: 'MANIPUR' },
  { name: 'Meghalaya', code: 'MEGHALAYA' },
  { name: 'Mizoram', code: 'MIZORAM' },
  { name: 'Nagaland', code: 'NAGALAND' },
  { name: 'Odisha', code: 'ODISHA' },
  { name: 'Puducherry', code: 'PUDUCHERRY' },
  { name: 'Punjab', code: 'PUNJAB' },
  { name: 'Rajasthan', code: 'RAJASTHAN' },
  { name: 'Sikkim', code: 'SIKKIM' },
  { name: 'Tamil Nadu', code: 'TAMIL NADU' },
  { name: 'Telangana', code: 'TELANGANA' },
  { name: 'Tripura', code: 'TRIPURA' },
  { name: 'Uttar Pradesh', code: 'UTTAR PRADESH' },
  { name: 'Uttarakhand', code: 'UTTARAKHAND' },
  { name: 'West Bengal', code: 'WEST BENGAL' },
];

const STATE_NAME_TO_CODE = Object.fromEntries(
  INDIAN_STATES.map(s => [s.name, s.code])
);

const VALID_STATE_NAMES = new Set(INDIAN_STATES.map(s => s.name));

const toStateCode = (state) =>
  STATE_NAME_TO_CODE[state?.trim()] || state?.trim().toUpperCase();

module.exports = { INDIAN_STATES, STATE_NAME_TO_CODE, VALID_STATE_NAMES, toStateCode };
