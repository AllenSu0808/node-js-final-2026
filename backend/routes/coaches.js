const express = require('express');
const router = express.Router();
const skillsController = require('../controllers/skillsController');

// M1：技能路由必須放在最前面，避免之後 M4 的 GET /:coachId 把 "skill" 當成 coachId 攔截掉
router.get('/skill', skillsController.listSkills);
router.post('/skill', skillsController.createSkill);
router.delete('/skill/:skillId', skillsController.deleteSkill);

module.exports = router;
