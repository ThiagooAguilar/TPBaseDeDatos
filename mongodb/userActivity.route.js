const express = require('express');
const router = express.Router();
const UserActivity = require('./userActivity.module');

router.post('/register', UserActivity.registerActivity);
router.get('/:userId', UserActivity.getUserActivity);

module.exports = router;
