const express = require('express');
const router = express.Router();

router.use('/coaches', require('./coaches'));
router.use('/credit-package', require('./creditPackage'));

module.exports = router;
