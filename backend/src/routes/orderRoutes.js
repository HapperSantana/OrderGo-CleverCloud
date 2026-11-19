const express = require('express');
const controller = require('../controllers/orderController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);
router.get('/', controller.listOrders);
router.get('/:id', controller.getOrder);
router.post('/', controller.createOrder);
router.patch('/:id/estado', controller.updateOrderState);
router.delete('/:id', requireRole('administrador'), controller.deleteOrder);

module.exports = router;
