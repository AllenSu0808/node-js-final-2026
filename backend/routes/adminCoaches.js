const express = require('express');
const router = express.Router();
const adminCoachesController = require('../controllers/adminCoachesController');
const revenueController = require('../controllers/revenueController');
const { verifyToken, requireCoach } = require('../middlewares/auth');

// 順序地雷：/courses、/revenue 這些具名單段路由必須放在 /:userId 之前，
// 否則會被 /:userId 攔截（把字面文字當成 userId）
router.get('/courses', verifyToken, requireCoach, adminCoachesController.listMyCourses);
router.post('/courses', verifyToken, requireCoach, adminCoachesController.createCourse);
router.get('/courses/:courseId', verifyToken, adminCoachesController.getMyCourseById);
router.put('/courses/:courseId', verifyToken, adminCoachesController.updateMyCourse);
router.get('/revenue', verifyToken, requireCoach, revenueController.getMonthlyRevenue);

router.get('/', verifyToken, requireCoach, adminCoachesController.getMyCoachProfile);
router.put('/', verifyToken, requireCoach, adminCoachesController.updateMyCoachProfile);

router.post('/:userId', adminCoachesController.promoteToCoach);

module.exports = router;
