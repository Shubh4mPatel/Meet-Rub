const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead } = require('../controller/notification/notificationController');

// GET /notifications?page=1&limit=20&unreadOnly=false
router.get('/', getNotifications);

// POST /notifications/read-all
router.post('/read-all', markAllAsRead);

// POST /notifications/:id/read
router.post('/:id/read', markAsRead);

module.exports = router;
