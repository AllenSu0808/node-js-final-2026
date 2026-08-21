const express = require('express');
const router = express.Router();
const skillsController = require('../controllers/skillsController');
const publicCoachesController = require('../controllers/publicCoachesController');

// M1：技能路由必須放在最前面，避免被下面 /:coachId 攔截
router.get('/skill', skillsController.listSkills);
router.post('/skill', skillsController.createSkill);
router.delete('/skill/:skillId', skillsController.deleteSkill);

// M4：公開教練瀏覽
router.get('/', publicCoachesController.listCoaches);
router.get('/:coachId', publicCoachesController.getCoachDetail);
router.get('/:coachId/courses', publicCoachesController.listCoachCourses);

module.exports = router;
