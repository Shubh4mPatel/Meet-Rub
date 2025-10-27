const express = require('express');
const upload = require('../../config/multer');
const router = express.Router();
const {uploadBeforeAfter}= require('../controller')


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