const express = require('express');
const router = express.Router();
const UserActivityController = require('./userActivity.controller');

router.post('/register', UserActivityController.post);
router.get('/:userId', UserActivityController.get);

module.exports = router;