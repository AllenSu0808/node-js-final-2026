const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { verifyToken } = require('../middlewares/auth');

router.post('/signup', usersController.signup);
router.post('/login', usersController.login);
router.get('/profile', verifyToken, usersController.getProfile);
router.put('/profile', verifyToken, usersController.updateProfile);
router.put('/password', verifyToken, usersController.updatePassword);
router.get('/credit-package', verifyToken, usersController.listMyCreditPackages);
router.get('/courses', verifyToken, usersController.getMyCourses);

module.exports = router;
