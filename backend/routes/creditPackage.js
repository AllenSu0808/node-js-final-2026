const express = require('express');
const router = express.Router();
const creditPackagesController = require('../controllers/creditPackagesController');
const { verifyToken } = require('../middlewares/auth');

router.get('/', creditPackagesController.listCreditPackages);
router.post('/', creditPackagesController.createCreditPackage);
router.post('/:creditPackageId', verifyToken, creditPackagesController.buyCreditPackage);
router.delete('/:creditPackageId', creditPackagesController.deleteCreditPackage);

module.exports = router;
