const { INDIAN_STATES } = require('../../utils/indianStates');

const getIndianStates = (req, res) => {
  return res.status(200).json({
    status: 'success',
    data: INDIAN_STATES,
  });
};

module.exports = { getIndianStates };
