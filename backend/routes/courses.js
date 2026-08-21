const express = require('express');
const router = express.Router();
const publicCoursesController = require('../controllers/publicCoursesController');
const courseBookingController = require('../controllers/courseBookingController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', publicCoursesController.listOngoingCourses);
router.post('/:courseId', verifyToken, courseBookingController.bookCourse);
router.delete('/:courseId', verifyToken, courseBookingController.cancelBooking);

module.exports = router;
