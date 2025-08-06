// controllers/reportesController.js - SISTEMA DE FLETES
const pool = require('./dbPromise');

// ✅ OBTENER DASHBOARD PRINCIPAL DE REPORTES
exports.getDashboard = async (req, res) => {
    try {
        const { año, mes } = req.query;
        
        // Usar fecha actual si no se especifica
        const añoActual = año || new Date().getFullYear();
        const mesActual = mes || (new Date().getMonth() + 1);
        
        // ✅ ESTADÍSTICAS RÁPIDAS DEL MES
        const [estadisticasMes] = await pool.execute(`
            SELECT 
                -- Viajes del mes
                (SELECT COUNT(*) FROM viajes 
                 WHERE YEAR(fecha_inicio) = ? AND MONTH(fecha_inicio) = ?
                 AND estado IN ('COMPLETADO', 'EN_CURSO')) as viajes_mes,
                
                -- Viajes del mes anterior para comparación
                (SELECT COUNT(*) FROM viajes 
                 WHERE YEAR(fecha_inicio) = YEAR(DATE_SUB(MAKEDATE(?, ?), INTERVAL 1 MONTH))
                 AND MONTH(fecha_inicio) = MONTH(DATE_SUB(MAKEDATE(?, ?), INTERVAL 1 MONTH))
                 AND estado IN ('COMPLETADO', 'EN_CURSO')) as viajes_mes_anterior,
                
                -- Kilómetros recorridos
                (SELECT COALESCE(SUM(v.km_final - v.km_inicial), 0) 
                 FROM viajes v 
                 WHERE YEAR(v.fecha_inicio) = ? AND MONTH(v.fecha_inicio) = ?
                 AND v.estado = 'COMPLETADO'
                 AND v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL) as km_mes,
                
                -- Ingresos del mes
                (SELECT COALESCE(SUM(total), 0) FROM ingresos 
                 WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as ingresos_mes,
                
                -- Gastos del mes
                (SELECT COALESCE(SUM(total), 0) FROM gastos 
                 WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as gastos_mes,
                
                -- Promedio de ganancia por viaje
                (SELECT COUNT(*) FROM viajes 
                 WHERE YEAR(fecha_inicio) = ? AND MONTH(fecha_inicio) = ?
                 AND estado = 'COMPLETADO') as viajes_completados_mes
        `, [
            añoActual, mesActual, // viajes_mes
            añoActual, mesActual, añoActual, mesActual, // viajes_mes_anterior
            añoActual, mesActual, // km_mes
            añoActual, mesActual, // ingresos_mes
            añoActual, mesActual, // gastos_mes
            añoActual, mesActual  // viajes_completados_mes
        ]);
        
        // ✅ RENDIMIENTO PROMEDIO DE COMBUSTIBLE
        const [rendimientoCombustible] = await pool.execute(`
            SELECT 
                COALESCE(AVG(
                    CASE 
                        WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                             AND g.total > 0 AND g.categoria_id = (
                                SELECT id FROM categorias WHERE nombre = 'Combustible' AND tipo = 'GASTO' LIMIT 1
                             )
                        THEN (v.km_final - v.km_inicial) / (g.total / 1000) -- Asumiendo precio promedio $1000/litro
                        ELSE NULL 
                    END
                ), 0) as rendimiento_promedio
            FROM viajes v
            LEFT JOIN gastos g ON v.id = g.viaje_id
            WHERE YEAR(v.fecha_inicio) = ? AND MONTH(v.fecha_inicio) = ?
            AND v.estado = 'COMPLETADO'
        `, [añoActual, mesActual]);
        
        // ✅ RESUMEN INGRESOS VS GASTOS VS GANANCIA
        const stats = estadisticasMes[0];
        const balance = stats.ingresos_mes - stats.gastos_mes;
        const gananciaPromedio = stats.viajes_completados_mes > 0 
            ? Math.round(balance / stats.viajes_completados_mes) 
            : 0;
        const variacionViajes = stats.viajes_mes_anterior > 0 
            ? Math.round(((stats.viajes_mes - stats.viajes_mes_anterior) / stats.viajes_mes_anterior) * 100)
            : 0;
        
        const dashboard = {
            año: parseInt(añoActual),
            mes: parseInt(mesActual),
            estadisticas_rapidas: {
                viajes_mes: stats.viajes_mes,
                variacion_viajes: variacionViajes,
                km_recorridos: Math.round(stats.km_mes),
                ganancia_promedio: gananciaPromedio,
                rendimiento_combustible: Math.round((rendimientoCombustible[0].rendimiento_promedio || 6.2) * 10) / 10
            },
            resumen_financiero: {
                ingresos: Math.round(stats.ingresos_mes),
                gastos: Math.round(stats.gastos_mes),
                ganancia: Math.round(balance),
                porcentaje_ingresos: Math.round((stats.ingresos_mes / Math.max(stats.ingresos_mes, stats.gastos_mes, balance)) * 100),
                porcentaje_gastos: Math.round((stats.gastos_mes / Math.max(stats.ingresos_mes, stats.gastos_mes, balance)) * 100),
                porcentaje_ganancia: Math.round((balance / Math.max(stats.ingresos_mes, stats.gastos_mes, balance)) * 100)
            }
        };
        
        console.log(`✅ Dashboard reportes obtenido: ${añoActual}/${mesActual}`);
        res.json(dashboard);
        
    } catch (error) {
        console.error('❌ Error obteniendo dashboard de reportes:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER REPORTE POR CAMIÓN
exports.getReportePorCamion = async (req, res) => {
    try {
        const { año, mes } = req.query;
        
        const añoActual = año || new Date().getFullYear();
        const mesActual = mes || (new Date().getMonth() + 1);
        
        const [reporteCamiones] = await pool.execute(`
            SELECT 
                c.id,
                c.patente,
                c.marca,
                c.modelo,
                c.kilometros as km_actuales,
                
                -- Estadísticas del mes
                COUNT(v.id) as viajes_mes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                
                -- Kilómetros recorridos
                COALESCE(SUM(
                    CASE 
                        WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                        THEN (v.km_final - v.km_inicial)
                        ELSE 0 
                    END
                ), 0) as km_recorridos,
                
                -- Ingresos del camión
                COALESCE(SUM(i.total), 0) as ingresos,
                
                -- Gastos del camión  
                COALESCE(SUM(g.total), 0) as gastos,
                
                -- Estado del camión
                CASE 
                    WHEN COUNT(CASE WHEN v.estado = 'EN_CURSO' THEN 1 END) > 0 THEN 'EN_VIAJE'
                    WHEN c.activo = 1 THEN 'DISPONIBLE'
                    ELSE 'INACTIVO'
                END as estado
                
            FROM camiones c
            LEFT JOIN viajes v ON c.id = v.camion_id 
                AND YEAR(v.fecha_inicio) = ? AND MONTH(v.fecha_inicio) = ?
            LEFT JOIN ingresos i ON v.id = i.viaje_id
            LEFT JOIN gastos g ON v.id = g.viaje_id
            WHERE c.activo = 1
            GROUP BY c.id, c.patente, c.marca, c.modelo, c.kilometros, c.activo
            ORDER BY viajes_mes DESC, ingresos DESC
        `, [añoActual, mesActual]);
        
        // ✅ Formatear respuesta con clasificación de rendimiento
        const camionesConRendimiento = reporteCamiones.map(camion => {
            const ganancia = camion.ingresos - camion.gastos;
            const rentabilidad = camion.ingresos > 0 
                ? Math.round((ganancia / camion.ingresos) * 100) 
                : 0;
            
            let clasificacion = 'Regular';
            if (rentabilidad >= 70) clasificacion = 'Excelente';
            else if (rentabilidad >= 50) clasificacion = 'Muy Bueno';
            else if (rentabilidad >= 30) clasificacion = 'Bueno';
            else if (rentabilidad < 10) clasificacion = 'Malo';
            
            return {
                ...camion,
                ganancia: Math.round(ganancia),
                rentabilidad,
                clasificacion,
                // Formatear números para mejor legibilidad
                ingresos: Math.round(camion.ingresos),
                gastos: Math.round(camion.gastos),
                km_recorridos: Math.round(camion.km_recorridos)
            };
        });
        
        console.log(`✅ Reporte por camión obtenido: ${camionesConRendimiento.length} camiones`);
        res.json({
            año: parseInt(añoActual),
            mes: parseInt(mesActual),
            camiones: camionesConRendimiento,
            total_camiones: camionesConRendimiento.length,
            camiones_activos: camionesConRendimiento.filter(c => c.estado !== 'INACTIVO').length
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo reporte por camión:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER REPORTE DE RUTAS MÁS RENTABLES
exports.getReporteRutas = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const [reporteRutas] = await pool.execute(`
            SELECT 
                r.id,
                r.nombre,
                r.origen,
                r.destino,
                r.distancia_km,
                
                -- Estadísticas de viajes
                COUNT(v.id) as total_viajes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                
                -- Últimos 6 meses
                COUNT(CASE 
                    WHEN v.fecha_inicio >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH) 
                    THEN 1 END) as viajes_ultimos_6_meses,
                
                -- Promedios financieros
                COALESCE(AVG(i.total), 0) as ingreso_promedio,
                COALESCE(AVG(g.total), 0) as gasto_promedio,
                COALESCE(SUM(i.total), 0) as ingresos_totales,
                COALESCE(SUM(g.total), 0) as gastos_totales,
                
                -- Kilómetros promedio real
                AVG(CASE 
                    WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial)
                    ELSE r.distancia_km 
                END) as km_promedio_real
                
            FROM rutas r
            LEFT JOIN viajes v ON r.id = v.ruta_id AND v.estado = 'COMPLETADO'
            LEFT JOIN ingresos i ON v.id = i.viaje_id
            LEFT JOIN gastos g ON v.id = g.viaje_id
            WHERE r.activo = 1
            GROUP BY r.id, r.nombre, r.origen, r.destino, r.distancia_km
            HAVING viajes_completados >= 1
            ORDER BY (COALESCE(AVG(i.total), 0) - COALESCE(AVG(g.total), 0)) DESC
            LIMIT ?
        `, [String(limit)]);
        
        // ✅ Formatear respuesta con análisis de rentabilidad
        const rutasFormateadas = reporteRutas.map(ruta => {
            const gananciaPromedio = ruta.ingreso_promedio - ruta.gasto_promedio;
            const gananciaTotal = ruta.ingresos_totales - ruta.gastos_totales;
            const margenRentabilidad = ruta.ingreso_promedio > 0 
                ? Math.round((gananciaPromedio / ruta.ingreso_promedio) * 100)
                : 0;
            
            return {
                id: ruta.id,
                nombre: ruta.nombre,
                origen: ruta.origen,
                destino: ruta.destino,
                distancia_km: Math.round(ruta.distancia_km || ruta.km_promedio_real || 0),
                total_viajes: ruta.total_viajes,
                viajes_completados: ruta.viajes_completados,
                viajes_ultimos_6_meses: ruta.viajes_ultimos_6_meses,
                ingreso_promedio: Math.round(ruta.ingreso_promedio),
                gasto_promedio: Math.round(ruta.gasto_promedio),
                ganancia_promedio: Math.round(gananciaPromedio),
                ganancia_total: Math.round(gananciaTotal),
                margen_rentabilidad,
                km_promedio_real: Math.round(ruta.km_promedio_real || ruta.distancia_km || 0)
            };
        });
        
        console.log(`✅ Reporte de rutas obtenido: ${rutasFormateadas.length} rutas`);
        res.json({
            rutas: rutasFormateadas,
            total_rutas: rutasFormateadas.length,
            fecha_consulta: new Date().toISOString().split('T')[0]
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo reporte de rutas:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER REPORTE MENSUAL COMPARATIVO

exports.getReporteMensual = async (req, res) => {
    try {
        const { año } = req.query;
        const añoActual = año || new Date().getFullYear();
        
        // ✅ FIX: Separar en dos consultas para evitar el error de GROUP BY
        
        // CONSULTA 1: Obtener ingresos y gastos por mes
        const [reporteFinanciero] = await pool.execute(`
            SELECT 
                YEAR(fecha) as año,
                MONTH(fecha) as mes,
                DATE_FORMAT(fecha, '%M') as nombre_mes,
                
                -- Ingresos del mes
                COALESCE(SUM(CASE WHEN tipo_mov = 'INGRESO' THEN total END), 0) as ingresos,
                COUNT(CASE WHEN tipo_mov = 'INGRESO' THEN 1 END) as cantidad_ingresos,
                
                -- Gastos del mes  
                COALESCE(SUM(CASE WHEN tipo_mov = 'GASTO' THEN total END), 0) as gastos,
                COUNT(CASE WHEN tipo_mov = 'GASTO' THEN 1 END) as cantidad_gastos
                
            FROM (
                SELECT fecha, total, 'INGRESO' as tipo_mov FROM ingresos
                UNION ALL
                SELECT fecha, total, 'GASTO' as tipo_mov FROM gastos
            ) movimientos
            WHERE YEAR(fecha) = ? 
            AND fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            GROUP BY YEAR(fecha), MONTH(fecha), DATE_FORMAT(fecha, '%M')
            ORDER BY año DESC, mes DESC
            LIMIT 6
        `, [añoActual]);
        
        // CONSULTA 2: Obtener viajes por mes/año
        const [reporteViajes] = await pool.execute(`
            SELECT 
                YEAR(fecha_inicio) as año,
                MONTH(fecha_inicio) as mes,
                COUNT(*) as viajes
            FROM viajes v
            WHERE YEAR(fecha_inicio) = ?
            AND fecha_inicio >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            AND estado IN ('COMPLETADO', 'EN_CURSO')
            GROUP BY YEAR(fecha_inicio), MONTH(fecha_inicio)
            ORDER BY año DESC, mes DESC
        `, [añoActual]);
        
        // ✅ COMBINAR RESULTADOS EN MEMORIA
        const mesesMap = new Map();
        
        // Procesar datos financieros
        reporteFinanciero.forEach(mes => {
            const key = `${mes.año}-${mes.mes}`;
            mesesMap.set(key, {
                año: mes.año,
                mes: mes.mes,
                nombre_mes: mes.nombre_mes,
                ingresos: mes.ingresos,
                gastos: mes.gastos,
                cantidad_ingresos: mes.cantidad_ingresos,
                cantidad_gastos: mes.cantidad_gastos,
                viajes: 0 // Default
            });
        });
        
        // Agregar datos de viajes
        reporteViajes.forEach(viaje => {
            const key = `${viaje.año}-${viaje.mes}`;
            if (mesesMap.has(key)) {
                const mesData = mesesMap.get(key);
                mesData.viajes = viaje.viajes;
            } else {
                // Si hay viajes pero no movimientos financieros
                const nombreMes = new Date(viaje.año, viaje.mes - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
                mesesMap.set(key, {
                    año: viaje.año,
                    mes: viaje.mes,
                    nombre_mes: nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1),
                    ingresos: 0,
                    gastos: 0,
                    cantidad_ingresos: 0,
                    cantidad_gastos: 0,
                    viajes: viaje.viajes
                });
            }
        });
        
        // ✅ Convertir Map a Array y ordenar
        const mesesArray = Array.from(mesesMap.values())
            .sort((a, b) => {
                if (a.año !== b.año) return b.año - a.año;
                return b.mes - a.mes;
            })
            .slice(0, 6)
            .reverse(); // Para mostrar cronológicamente
        
        // ✅ Formatear datos para el gráfico
        const mesesFormateados = mesesArray.map(mes => {
            const balance = mes.ingresos - mes.gastos;
            const margen = mes.ingresos > 0 ? Math.round((balance / mes.ingresos) * 100) : 0;
            
            return {
                año: mes.año,
                mes: mes.mes,
                nombre_mes: mes.nombre_mes,
                ingresos: Math.round(mes.ingresos),
                gastos: Math.round(mes.gastos),
                balance: Math.round(balance),
                margen_rentabilidad: margen,
                viajes: mes.viajes,
                cantidad_ingresos: mes.cantidad_ingresos,
                cantidad_gastos: mes.cantidad_gastos,
                // Para el gráfico de barras
                porcentaje_ingresos: Math.round((mes.ingresos / Math.max(mes.ingresos, mes.gastos, Math.abs(balance))) * 100),
                porcentaje_gastos: Math.round((mes.gastos / Math.max(mes.ingresos, mes.gastos, Math.abs(balance))) * 100),
                porcentaje_balance: Math.round((Math.abs(balance) / Math.max(mes.ingresos, mes.gastos, Math.abs(balance))) * 100)
            };
        });
        
        // ✅ Calcular tendencias solo si hay datos suficientes
        let tendencia = {
            ingresos: 0,
            gastos: 0,
            viajes: 0
        };
        
        if (mesesFormateados.length >= 2) {
            const mesActual = mesesFormateados[mesesFormateados.length - 1];
            const mesAnterior = mesesFormateados[mesesFormateados.length - 2];
            
            if (mesAnterior && mesActual) {
                tendencia = {
                    ingresos: mesAnterior.ingresos > 0 
                        ? Math.round(((mesActual.ingresos - mesAnterior.ingresos) / mesAnterior.ingresos) * 100)
                        : 0,
                    gastos: mesAnterior.gastos > 0
                        ? Math.round(((mesActual.gastos - mesAnterior.gastos) / mesAnterior.gastos) * 100)  
                        : 0,
                    viajes: mesAnterior.viajes > 0
                        ? Math.round(((mesActual.viajes - mesAnterior.viajes) / mesAnterior.viajes) * 100)
                        : 0
                };
            }
        }
        
        // ✅ Calcular resumen
        const resumen = {
            mejor_mes: mesesFormateados.length > 0 
                ? mesesFormateados.reduce((prev, current) => 
                    prev.balance > current.balance ? prev : current
                  )
                : null,
            total_ingresos_periodo: mesesFormateados.reduce((sum, mes) => sum + mes.ingresos, 0),
            total_gastos_periodo: mesesFormateados.reduce((sum, mes) => sum + mes.gastos, 0),
            promedio_viajes: mesesFormateados.length > 0 
                ? Math.round(mesesFormateados.reduce((sum, mes) => sum + mes.viajes, 0) / mesesFormateados.length)
                : 0
        };
        
        console.log(`✅ Reporte mensual obtenido: ${mesesFormateados.length} meses`);
        res.json({
            año: parseInt(añoActual),
            meses: mesesFormateados,
            tendencia_mes_actual: tendencia,
            resumen
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo reporte mensual:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};