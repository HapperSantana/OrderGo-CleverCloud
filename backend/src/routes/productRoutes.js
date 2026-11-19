const express = require('express');
const controller = require('../controllers/productController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);
router.get('/', controller.listProducts);
router.post('/', requireRole('administrador'), controller.createProduct);
router.put('/:id', requireRole('administrador'), controller.updateProduct);
router.patch('/:id/disponibilidad', requireRole('administrador'), controller.changeProductAvailability);
router.delete('/:id', requireRole('administrador'), controller.deleteProduct);

module.exports = router;
