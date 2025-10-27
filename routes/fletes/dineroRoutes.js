// routes/dineroRoutes.js - SISTEMA DE FLETES
const express = require('express');
const router = express.Router();
const dineroController = require('../../controllers/fletes/dineroController');
const { requireAuth } = require('../../middlewares/fletes/authMiddleware');
const pdfController = require('../../controllers/fletes/pdfController');
// ===== RUTAS DE GASTOS =====

// ✅ CREAR NUEVO GASTO
// POST /api/dinero/gastos
router.post('/gastos', requireAuth, dineroController.createGasto);

// ✅ OBTENER GASTOS CON FILTROS
// GET /api/dinero/gastos?limit=20&offset=0&camion_id=1&categoria_id=2&desde=2024-01-01&hasta=2024-12-31&mes=8&año=2024
router.get('/gastos', requireAuth, dineroController.getGastos);

// ✅ ACTUALIZAR GASTO
// PUT /api/dinero/gastos/:id
router.put('/gastos/:id', requireAuth, dineroController.updateGasto);

// ✅ ELIMINAR GASTO
// DELETE /api/dinero/gastos/:id
router.delete('/gastos/:id', requireAuth, dineroController.deleteGasto);

// ===== RUTAS DE INGRESOS =====

// ✅ CREAR NUEVO INGRESO
// POST /api/dinero/ingresos
router.post('/ingresos', requireAuth, dineroController.createIngreso);

// ✅ OBTENER INGRESOS CON FILTROS
// GET /api/dinero/ingresos?limit=20&offset=0&camion_id=1&categoria_id=2&desde=2024-01-01&hasta=2024-12-31&mes=8&año=2024
router.get('/ingresos', requireAuth, dineroController.getIngresos);

// ✅ ACTUALIZAR INGRESO
// PUT /api/dinero/ingresos/:id
router.put('/ingresos/:id', requireAuth, dineroController.updateIngreso);

// ✅ ELIMINAR INGRESO
// DELETE /api/dinero/ingresos/:id
router.delete('/ingresos/:id', requireAuth, dineroController.deleteIngreso);

// ===== RUTAS DE RESÚMENES Y ESTADÍSTICAS =====

// ✅ OBTENER RESUMEN MENSUAL
// GET /api/dinero/resumen-mensual?año=2024&mes=8
router.get('/resumen-mensual', requireAuth, dineroController.getResumenMensual);

// ✅ OBTENER MOVIMIENTOS UNIFICADOS (INGRESOS + GASTOS)
// GET /api/dinero/movimientos?limit=20&offset=0&camion_id=1&desde=2024-01-01&hasta=2024-12-31
router.get('/movimientos', requireAuth, dineroController.getMovimientos);

// ✅ OBTENER ESTADÍSTICAS GENERALES
// GET /api/dinero/estadisticas
router.get('/estadisticas', requireAuth, dineroController.getEstadisticasGenerales);

// ===== RUTAS DE CATEGORÍAS =====

// ✅ OBTENER CATEGORÍAS
// GET /api/dinero/categorias?tipo=GASTO|INGRESO
router.get('/categorias', requireAuth, dineroController.getCategorias);


router.get('/pdf', requireAuth, pdfController.generarPDFBalance);
module.exports = router;