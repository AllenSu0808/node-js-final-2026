const express = require('express');
const router = express.Router();
const adminCoachesController = require('../controllers/adminCoachesController');
const { verifyToken, requireCoach } = require('../middlewares/auth');

// 順序地雷：/courses 系列必須放在 /:userId 之前，
// 否則 POST /courses 會被 /:userId 攔截（把字串 "courses" 當成 userId）
router.get('/courses', verifyToken, requireCoach, adminCoachesController.listMyCourses);
router.post('/courses', verifyToken, requireCoach, adminCoachesController.createCourse);
router.get('/courses/:courseId', verifyToken, adminCoachesController.getMyCourseById);
router.put('/courses/:courseId', verifyToken, adminCoachesController.updateMyCourse);

router.get('/', verifyToken, requireCoach, adminCoachesController.getMyCoachProfile);
router.put('/', verifyToken, requireCoach, adminCoachesController.updateMyCoachProfile);

router.post('/:userId', adminCoachesController.promoteToCoach);

module.exports = router;
