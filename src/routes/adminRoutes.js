const expess = require('express')
const { approveProfile, getServices, addServices } = require('../controller')
const router = expess.Router()

router.post('/userApproval', approveProfile)
router.get('/getServices', getServices)
router.post('/addServices', addServices)


module.exports = router