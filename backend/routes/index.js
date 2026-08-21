const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));
router.use('/users', require('./users'));
router.use('/admin/coaches', require('./adminCoaches'));
router.use('/courses', require('./courses'));

module.exports = router;
