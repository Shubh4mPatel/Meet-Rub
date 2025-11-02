const express = require('express');
const upload = require('../../config/multer');
const router = express.Router();
const {uploadBeforeAfter,getBeforeAfter}= require('../controller')


router.post('/upload', upload.fields([
    {   
        name: 'before', 
        maxCount: 1
     },
    {
        name: 'after',
        maxCount: 1,
    }
]),uploadBeforeAfter)
router.get('/get-after-before',getBeforeAfter)

module.exports={router}