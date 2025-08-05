// routes/viajesRoutes.js - SISTEMA DE FLETES
const express = require('express');
const router = express.Router();
const viajesController = require('../controllers/viajesController');
const rutasController = require('../controllers/rutasController');
const { requireAuth } = require('../middlewares/authMiddleware');

// ===== RUTAS DE ESTADÍSTICAS (ANTES de :id para evitar conflictos) =====

// ✅ OBTENER ESTADÍSTICAS DE VIAJES
// GET /api/viajes/estadisticas
router.get('/estadisticas', requireAuth, viajesController.getEstadisticasViajes);

// ✅ OBTENER VIAJES ACTIVOS
// GET /api/viajes/activos
router.get('/activos', requireAuth, viajesController.getViajesActivos);

// ===== RUTAS PRINCIPALES DE VIAJES =====

// ✅ OBTENER TODOS LOS VIAJES CON FILTROS
// GET /api/viajes?limit=20&offset=0&camion_id=1&estado=EN_CURSO&desde=2024-01-01&hasta=2024-12-31&mes=8&año=2024
router.get('/', requireAuth, viajesController.getViajes);

// ✅ OBTENER UN VIAJE POR ID
// GET /api/viajes/:id
router.get('/:id', requireAuth, viajesController.getViajeById);

// ✅ CREAR NUEVO VIAJE
// POST /api/viajes
router.post('/', requireAuth, viajesController.createViaje);

// ✅ FINALIZAR VIAJE
// PUT /api/viajes/:id/finalizar
router.put('/:id/finalizar', requireAuth, viajesController.finalizarViaje);

// ✅ CANCELAR VIAJE
// PUT /api/viajes/:id/cancelar
router.put('/:id/cancelar', requireAuth, viajesController.cancelarViaje);

// ===== RUTAS DE RUTAS (Sub-módulo) =====

// ✅ OBTENER ESTADÍSTICAS DE RUTAS
// GET /api/viajes/rutas/estadisticas
router.get('/rutas/estadisticas', requireAuth, rutasController.getEstadisticasRutas);

// ✅ OBTENER RUTAS MÁS RENTABLES
// GET /api/viajes/rutas/rentables?limit=10
router.get('/rutas/rentables', requireAuth, rutasController.getRutasRentables);

// ✅ OBTENER TODAS LAS RUTAS
// GET /api/viajes/rutas?activo=true
router.get('/rutas', requireAuth, rutasController.getRutas);

// ✅ OBTENER UNA RUTA POR ID
// GET /api/viajes/rutas/:id
router.get('/rutas/:id', requireAuth, rutasController.getRutaById);

// ✅ CREAR NUEVA RUTA
// POST /api/viajes/rutas
router.post('/rutas', requireAuth, rutasController.createRuta);

// ✅ ACTUALIZAR RUTA
// PUT /api/viajes/rutas/:id
router.put('/rutas/:id', requireAuth, rutasController.updateRuta);

// ✅ ELIMINAR RUTA
// DELETE /api/viajes/rutas/:id
router.delete('/rutas/:id', requireAuth, rutasController.deleteRuta);

module.exports = router;