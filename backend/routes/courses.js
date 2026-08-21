const express = require('express');
const router = express.Router();
const publicCoursesController = require('../controllers/publicCoursesController');

router.get('/', publicCoursesController.listOngoingCourses);

module.exports = router;
