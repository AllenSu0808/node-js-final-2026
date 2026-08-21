const express = require('express');
const router = express.Router();
const creditPackagesController = require('../controllers/creditPackagesController');

router.get('/', creditPackagesController.listCreditPackages);
router.post('/', creditPackagesController.createCreditPackage);
router.delete('/:creditPackageId', creditPackagesController.deleteCreditPackage);

module.exports = router;
