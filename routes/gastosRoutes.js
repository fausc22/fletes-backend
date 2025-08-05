// routes/gastosRoutes.js - SISTEMA DE FLETES - RUTAS BÁSICAS
const express = require('express');
const router = express.Router();
const gastosController = require('../controllers/gastosController');
const { requireAuth } = require('../middlewares/authMiddleware');

// ===== RUTAS DE GASTOS =====

// ✅ OBTENER TODOS LOS GASTOS
// GET /api/gastos?limit=20&offset=0&camion_id=1&categoria_id=2&desde=2024-01-01&hasta=2024-12-31
router.get('/', requireAuth, gastosController.getGastos);

// ✅ OBTENER ESTADÍSTICAS DE GASTOS
// GET /api/gastos/estadisticas
router.get('/estadisticas', requireAuth, gastosController.getEstadisticasGastos);

// ✅ OBTENER CATEGORÍAS DE GASTOS
// GET /api/gastos/categorias
router.get('/categorias', requireAuth, gastosController.getCategoriasGastos);

// ✅ OBTENER UN GASTO POR ID
// GET /api/gastos/:id
router.get('/:id', requireAuth, gastosController.getGastoById);

// ✅ CREAR NUEVO GASTO
// POST /api/gastos
router.post('/', requireAuth, gastosController.createGasto);

// ✅ ACTUALIZAR GASTO
// PUT /api/gastos/:id
router.put('/:id', requireAuth, gastosController.updateGasto);

// ✅ ELIMINAR GASTO
// DELETE /api/gastos/:id
router.delete('/:id', requireAuth, gastosController.deleteGasto);

module.exports = router;