const express = require('express');
const { rateLimit } = require('express-rate-limit');
const controller = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { mensaje: 'Demasiados intentos de inicio de sesion. Intenta nuevamente mas tarde.' }
});

router.post('/login', loginLimiter, controller.login);
router.get('/perfil', verifyToken, controller.profile);
router.post('/logout', verifyToken, controller.logout);

module.exports = router;
