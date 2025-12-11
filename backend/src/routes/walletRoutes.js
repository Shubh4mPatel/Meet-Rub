const express = require('express');
const router = express.Router();
const walletController = require('../controller/razor-pay-controllers/walletController');


router.get('/balance', walletController.getBalance);
router.post('/load/create-order', walletController.createLoadOrder);
router.post('/load/verify', walletController.verifyLoadPayment);
router.get('/transactions', walletController.getTransactions);
router.get('/transactions/:id', walletController.getTransaction);

module.exports = router;
