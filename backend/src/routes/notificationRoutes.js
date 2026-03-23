const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead } = require('../controller/notification/notificationController');

router.use((req, _res, next) => {
  console.log(`[notificationRoutes] ${req.method} ${req.originalUrl} user=${req.user?.user_id}`);
  next();
});

// GET /notifications?page=1&limit=20&unreadOnly=false
router.get('/', getNotifications);

// POST /notifications/read-all
router.post('/read-all', markAllAsRead);

// POST /notifications/:id/read
router.post('/:id/read', markAsRead);

module.exports = router;
