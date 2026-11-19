const express = require('express');
const controller = require('../controllers/clientController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken);
router.get('/', controller.listClients);
router.get('/:id', controller.getClient);
router.post('/', controller.createClient);
router.put('/:id', controller.updateClient);
router.delete('/:id', requireRole('administrador'), controller.deleteClient);

module.exports = router;
