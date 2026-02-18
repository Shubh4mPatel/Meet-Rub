const express = require('express');
const router = express.Router();
const {getBalance,createLoadOrder,verifyLoadPayment,getTransactions,getTransaction} = require('../controller/razor-pay-controllers/walletController');


router.get('/balance', getBalance);


router.post('/load/create-order', createLoadOrder);


router.post('/load/verify', verifyLoadPayment);


router.get('/transactions', getTransactions);


router.get('/transactions/:id', getTransaction);

module.exports = router;
