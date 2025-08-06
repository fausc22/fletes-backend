// routes/reportesRoutes.js - SISTEMA DE FLETES
const express = require('express');
const router = express.Router();
const reportesController = require('../../controllers/fletes/reportesController');
const { requireAuth } = require('../../middlewares/fletes/authMiddleware');

// ✅ OBTENER DASHBOARD PRINCIPAL DE REPORTES
// GET /api/reportes/dashboard?año=2024&mes=8
router.get('/dashboard', requireAuth, reportesController.getDashboard);

// ✅ OBTENER REPORTE POR CAMIÓN
// GET /api/reportes/por-camion?año=2024&mes=8
router.get('/por-camion', requireAuth, reportesController.getReportePorCamion);

// ✅ OBTENER REPORTE DE RUTAS MÁS RENTABLES  
// GET /api/reportes/rutas?limit=10
router.get('/rutas', requireAuth, reportesController.getReporteRutas);

// ✅ OBTENER REPORTE MENSUAL COMPARATIVO
// GET /api/reportes/mensual?año=2024
router.get('/mensual', requireAuth, reportesController.getReporteMensual);

module.exports = router;