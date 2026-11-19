const express = require('express');
const controller = require('../controllers/userController');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, requireRole('administrador'));
router.get('/', controller.listUsers);
router.post('/', controller.createUser);
router.put('/:id', controller.updateUser);
router.patch('/:id/estado', controller.updateUserStatus);

module.exports = router;
