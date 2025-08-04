// routes/authRoutes.js - ADAPTADO PARA SISTEMA DE FLETES
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken, debugToken, requireAuth } = require('../middlewares/authMiddleware');

// ✅ RUTAS PÚBLICAS - No requieren autenticación
router.post('/login', authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', authController.logout);

// ✅ ENDPOINT DE SALUD - Para verificar que el servidor funciona
router.get('/health', authController.health);

// ✅ RUTAS PROTEGIDAS - Requieren autenticación
router.get('/profile', requireAuth, authController.getProfile);
router.put('/change-password', requireAuth, authController.changePassword);

// ✅ RUTAS DE DEBUG (solo en desarrollo)
if (process.env.NODE_ENV === 'development') {
    // Endpoint para verificar token sin operaciones
    router.get('/verify-token', [debugToken, authenticateToken], (req, res) => {
        res.json({
            message: 'Token válido',
            user: req.user,
            timestamp: new Date().toISOString()
        });
    });

    // Endpoint para obtener información del token
    router.get('/token-info', authenticateToken, (req, res) => {
        res.json({
            user: req.user,
            tokenValid: true,
            serverTime: new Date().toISOString(),
            environment: 'development'
        });
    });
}

module.exports = router;