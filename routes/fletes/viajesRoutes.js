// routes/viajesRoutes.js - ORDEN CORREGIDO
const express = require('express');
const router = express.Router();
const viajesController = require('../../controllers/fletes/viajesController');
const rutasController = require('../../controllers/fletes/rutasController');
const { requireAuth } = require('../../middlewares/fletes/authMiddleware');

// ✅ RUTAS ESPECÍFICAS PRIMERO (antes de :id)
router.get('/estadisticas', requireAuth, viajesController.getEstadisticasViajes);
router.get('/activos', requireAuth, viajesController.getViajesActivos);

// ✅ RUTAS DE RUTAS (Sub-módulo) - ANTES de :id
router.get('/rutas/estadisticas', requireAuth, rutasController.getEstadisticasRutas);
router.get('/rutas/rentables', requireAuth, rutasController.getRutasRentables);
router.get('/rutas', requireAuth, rutasController.getRutas);
router.get('/rutas/:id', requireAuth, rutasController.getRutaById);
router.post('/rutas', requireAuth, rutasController.createRuta);
router.put('/rutas/:id', requireAuth, rutasController.updateRuta);
router.delete('/rutas/:id', requireAuth, rutasController.deleteRuta);

// ✅ RUTAS PRINCIPALES - DESPUÉS de las específicas
router.get('/', requireAuth, viajesController.getViajes);
router.get('/:id', requireAuth, viajesController.getViajeById); // AHORA AL FINAL
router.post('/', requireAuth, viajesController.createViaje);
router.put('/:id/finalizar', requireAuth, viajesController.finalizarViaje);
router.put('/:id/cancelar', requireAuth, viajesController.cancelarViaje);

module.exports = router;