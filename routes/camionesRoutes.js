// routes/camionesRoutes.js - SISTEMA DE FLETES
const express = require('express');
const router = express.Router();
const camionesController = require('../controllers/camionesController');
const mantenimientosController = require('../controllers/mantenimientosController');
const { requireAuth } = require('../middlewares/authMiddleware');

// ===== RUTAS DE CAMIONES =====

// ✅ OBTENER TODOS LOS CAMIONES
// GET /api/camiones?activo=true
router.get('/', requireAuth, camionesController.getCamiones);

// ✅ OBTENER ESTADÍSTICAS DE CAMIONES
// GET /api/camiones/estadisticas
router.get('/estadisticas', requireAuth, camionesController.getEstadisticasCamiones);

// ✅ OBTENER UN CAMIÓN POR ID
// GET /api/camiones/:id
router.get('/:id', requireAuth, camionesController.getCamionById);

// ✅ CREAR NUEVO CAMIÓN
// POST /api/camiones
router.post('/', requireAuth, camionesController.createCamion);

// ✅ ACTUALIZAR CAMIÓN
// PUT /api/camiones/:id
router.put('/:id', requireAuth, camionesController.updateCamion);

// ✅ ELIMINAR CAMIÓN
// DELETE /api/camiones/:id
router.delete('/:id', requireAuth, camionesController.deleteCamion);

// ===== RUTAS DE MANTENIMIENTOS =====

// ✅ OBTENER MANTENIMIENTOS POR CAMIÓN
// GET /api/camiones/:camionId/mantenimientos?limit=10&offset=0
router.get('/:camionId/mantenimientos', requireAuth, mantenimientosController.getMantenimientosByCamion);

// ✅ CREAR MANTENIMIENTO PARA UN CAMIÓN
// POST /api/camiones/:camionId/mantenimientos
router.post('/:camionId/mantenimientos', requireAuth, mantenimientosController.createMantenimiento);

// ===== RUTAS GLOBALES DE MANTENIMIENTOS =====

// ✅ OBTENER TODOS LOS MANTENIMIENTOS
// GET /api/camiones/mantenimientos/todos?limit=20&offset=0&tipo=SERVICE&desde=2024-01-01&hasta=2024-12-31
router.get('/mantenimientos/todos', requireAuth, mantenimientosController.getAllMantenimientos);

// ✅ OBTENER PRÓXIMOS MANTENIMIENTOS (ALERTAS)
// GET /api/camiones/mantenimientos/proximos
router.get('/mantenimientos/proximos', requireAuth, mantenimientosController.getProximosMantenimientos);

// ✅ OBTENER ESTADÍSTICAS DE MANTENIMIENTOS
// GET /api/camiones/mantenimientos/estadisticas
router.get('/mantenimientos/estadisticas', requireAuth, mantenimientosController.getEstadisticasMantenimientos);

// ✅ ACTUALIZAR MANTENIMIENTO
// PUT /api/camiones/mantenimientos/:id
router.put('/mantenimientos/:id', requireAuth, mantenimientosController.updateMantenimiento);

// ✅ ELIMINAR MANTENIMIENTO
// DELETE /api/camiones/mantenimientos/:id
router.delete('/mantenimientos/:id', requireAuth, mantenimientosController.deleteMantenimiento);

module.exports = router;