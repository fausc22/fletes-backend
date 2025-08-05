// controllers/rutasController.js - SISTEMA DE FLETES
const pool = require('./dbPromise');

// ✅ OBTENER TODAS LAS RUTAS
exports.getRutas = async (req, res) => {
    try {
        const { activo } = req.query;
        
        let query = `
            SELECT 
                r.*,
                COUNT(v.id) as total_viajes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                AVG(CASE WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial) END) as promedio_km_real,
                (SELECT AVG(i.total) FROM ingresos i 
                 JOIN viajes v2 ON i.viaje_id = v2.id 
                 WHERE v2.ruta_id = r.id AND v2.estado = 'COMPLETADO') as promedio_ingresos
            FROM rutas r
            LEFT JOIN viajes v ON r.id = v.ruta_id AND v.fecha_inicio >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
        `;
        
        const params = [];
        
        if (activo !== undefined) {
            query += ' WHERE r.activo = ?';
            params.push(activo === 'true' ? 1 : 0);
        } else {
            query += ' WHERE r.activo = 1';
        }
        
        query += ` 
            GROUP BY r.id, r.nombre, r.origen, r.destino, r.distancia_km, r.tiempo_estimado_horas, r.activo, r.fecha_creacion
            ORDER BY total_viajes DESC, r.nombre ASC
        `;
        
        const [rutas] = await pool.execute(query, params);
        
        // Formatear respuesta
        const rutasFormateadas = rutas.map(ruta => ({
            ...ruta,
            promedio_km_real: Math.round(ruta.promedio_km_real || ruta.distancia_km || 0),
            promedio_ingresos: Math.round(ruta.promedio_ingresos || 0),
            es_rentable: ruta.total_viajes >= 2 && ruta.promedio_ingresos > 0
        }));
        
        console.log(`✅ Obtenidas ${rutasFormateadas.length} rutas`);
        res.json(rutasFormateadas);
        
    } catch (error) {
        console.error('❌ Error obteniendo rutas:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER RUTA POR ID
exports.getRutaById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                r.*,
                COUNT(v.id) as total_viajes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                COUNT(CASE WHEN v.estado = 'EN_CURSO' THEN 1 END) as viajes_activos,
                AVG(CASE WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial) END) as promedio_km_real,
                AVG(CASE WHEN v.fecha_fin IS NOT NULL 
                    THEN DATEDIFF(v.fecha_fin, v.fecha_inicio) END) as promedio_dias,
                (SELECT AVG(i.total) FROM ingresos i 
                 JOIN viajes v2 ON i.viaje_id = v2.id 
                 WHERE v2.ruta_id = r.id AND v2.estado = 'COMPLETADO') as promedio_ingresos,
                (SELECT SUM(i.total) FROM ingresos i 
                 JOIN viajes v3 ON i.viaje_id = v3.id 
                 WHERE v3.ruta_id = r.id AND v3.estado = 'COMPLETADO') as ingresos_totales
            FROM rutas r
            LEFT JOIN viajes v ON r.id = v.ruta_id
            WHERE r.id = ?
            GROUP BY r.id
        `;
        
        const [rutas] = await pool.execute(query, [id]);
        
        if (rutas.length === 0) {
            return res.status(404).json({ message: 'Ruta no encontrada' });
        }
        
        const ruta = {
            ...rutas[0],
            promedio_km_real: Math.round(rutas[0].promedio_km_real || rutas[0].distancia_km || 0),
            promedio_dias: Math.round(rutas[0].promedio_dias || 0),
            promedio_ingresos: Math.round(rutas[0].promedio_ingresos || 0),
            ingresos_totales: Math.round(rutas[0].ingresos_totales || 0)
        };
        
        console.log(`✅ Obtenida ruta ID ${id}`);
        res.json(ruta);
        
    } catch (error) {
        console.error('❌ Error obteniendo ruta por ID:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CREAR NUEVA RUTA
exports.createRuta = async (req, res) => {
    try {
        const { 
            nombre, 
            origen, 
            destino, 
            distancia_km, 
            tiempo_estimado_horas 
        } = req.body;
        
        // Validaciones básicas
        if (!nombre || !origen || !destino) {
            return res.status(400).json({ 
                message: 'Campos requeridos: nombre, origen, destino' 
            });
        }
        
        // Verificar que no exista una ruta similar
        const [rutaExistente] = await pool.execute(
            'SELECT id FROM rutas WHERE nombre = ? OR (origen = ? AND destino = ?)', 
            [nombre.trim(), origen.trim(), destino.trim()]
        );
        
        if (rutaExistente.length > 0) {
            return res.status(400).json({ 
                message: 'Ya existe una ruta con ese nombre o mismo origen-destino' 
            });
        }
        
        // Validar distancia y tiempo
        if (distancia_km && distancia_km <= 0) {
            return res.status(400).json({ 
                message: 'La distancia debe ser mayor a 0' 
            });
        }
        
        if (tiempo_estimado_horas && tiempo_estimado_horas <= 0) {
            return res.status(400).json({ 
                message: 'El tiempo estimado debe ser mayor a 0' 
            });
        }
        
        const query = `
            INSERT INTO rutas (nombre, origen, destino, distancia_km, tiempo_estimado_horas, activo)
            VALUES (?, ?, ?, ?, ?, 1)
        `;
        
        const [result] = await pool.execute(query, [
            nombre.trim(),
            origen.trim(),
            destino.trim(),
            distancia_km || null,
            tiempo_estimado_horas || null
        ]);
        
        // Obtener la ruta creada
        const [nuevaRuta] = await pool.execute(
            'SELECT * FROM rutas WHERE id = ?', 
            [result.insertId]
        );
        
        console.log(`✅ Ruta creada: ID ${result.insertId} - ${nombre}`);
        res.status(201).json({
            message: 'Ruta creada exitosamente',
            ruta: {
                ...nuevaRuta[0],
                total_viajes: 0,
                viajes_completados: 0,
                promedio_km_real: distancia_km || 0,
                promedio_ingresas: 0
            }
        });
        
    } catch (error) {
        console.error('❌ Error creando ruta:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ACTUALIZAR RUTA
exports.updateRuta = async (req, res) => {
    try {
        const { id } = req.params;
        const { nombre, origen, destino, distancia_km, tiempo_estimado_horas, activo } = req.body;
        
        // Verificar que la ruta existe
        const [rutaExistente] = await pool.execute(
            'SELECT * FROM rutas WHERE id = ?', 
            [id]
        );
        
        if (rutaExistente.length === 0) {
            return res.status(404).json({ message: 'Ruta no encontrada' });
        }
        
        // Verificar si hay viajes activos y se intenta desactivar
        if (activo === false || activo === 0) {
            const [viajesActivos] = await pool.execute(
                'SELECT id FROM viajes WHERE ruta_id = ? AND estado = "EN_CURSO"', 
                [id]
            );
            
            if (viajesActivos.length > 0) {
                return res.status(400).json({ 
                    message: 'No se puede desactivar una ruta con viajes en curso' 
                });
            }
        }
        
        // Construir query dinámico
        const campos = [];
        const valores = [];
        
        if (nombre !== undefined) {
            campos.push('nombre = ?');
            valores.push(nombre.trim());
        }
        if (origen !== undefined) {
            campos.push('origen = ?');
            valores.push(origen.trim());
        }
        if (destino !== undefined) {
            campos.push('destino = ?');
            valores.push(destino.trim());
        }
        if (distancia_km !== undefined) {
            if (distancia_km < 0) {
                return res.status(400).json({ message: 'La distancia no puede ser negativa' });
            }
            campos.push('distancia_km = ?');
            valores.push(distancia_km);
        }
        if (tiempo_estimado_horas !== undefined) {
            if (tiempo_estimado_horas < 0) {
                return res.status(400).json({ message: 'El tiempo estimado no puede ser negativo' });
            }
            campos.push('tiempo_estimado_horas = ?');
            valores.push(tiempo_estimado_horas);
        }
        if (activo !== undefined) {
            campos.push('activo = ?');
            valores.push(activo ? 1 : 0);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE rutas SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener la ruta actualizada
        const [rutaActualizada] = await pool.execute(
            'SELECT * FROM rutas WHERE id = ?', 
            [id]
        );
        
        console.log(`✅ Ruta actualizada: ID ${id}`);
        res.json({
            message: 'Ruta actualizada exitosamente',
            ruta: rutaActualizada[0]
        });
        
    } catch (error) {
        console.error('❌ Error actualizando ruta:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ELIMINAR RUTA (SOFT DELETE)
exports.deleteRuta = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que la ruta existe
        const [rutaExistente] = await pool.execute(
            'SELECT * FROM rutas WHERE id = ?', 
            [id]
        );
        
        if (rutaExistente.length === 0) {
            return res.status(404).json({ message: 'Ruta no encontrada' });
        }
        
        // Verificar si tiene viajes activos
        const [viajesActivos] = await pool.execute(
            'SELECT id FROM viajes WHERE ruta_id = ? AND estado = "EN_CURSO"', 
            [id]
        );
        
        if (viajesActivos.length > 0) {
            return res.status(400).json({ 
                message: 'No se puede eliminar una ruta con viajes en curso' 
            });
        }
        
        // Verificar si tiene viajes históricos
        const [viajesHistoricos] = await pool.execute(
            'SELECT id FROM viajes WHERE ruta_id = ?', 
            [id]
        );
        
        if (viajesHistoricos.length > 0) {
            // Soft delete si tiene historial
            await pool.execute(
                'UPDATE rutas SET activo = 0 WHERE id = ?', 
                [id]
            );
            
            console.log(`✅ Ruta desactivada (soft delete): ID ${id}`);
            res.json({ 
                message: 'Ruta desactivada exitosamente (manteniendo historial)',
                tipo: 'soft_delete'
            });
        } else {
            // Hard delete si no tiene historial
            await pool.execute('DELETE FROM rutas WHERE id = ?', [id]);
            
            console.log(`✅ Ruta eliminada (hard delete): ID ${id}`);
            res.json({ 
                message: 'Ruta eliminada exitosamente',
                tipo: 'hard_delete'
            });
        }
        
    } catch (error) {
        console.error('❌ Error eliminando ruta:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER RUTAS MÁS RENTABLES
exports.getRutasRentables = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const query = `
            SELECT 
                r.*,
                COUNT(v.id) as total_viajes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                AVG(CASE WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial) END) as promedio_km_real,
                AVG(CASE WHEN v.fecha_fin IS NOT NULL 
                    THEN DATEDIFF(v.fecha_fin, v.fecha_inicio) END) as promedio_dias,
                COALESCE(AVG(i.total), 0) as promedio_ingresos,
                COALESCE(SUM(i.total), 0) as ingresos_totales,
                COALESCE(AVG(g.total), 0) as promedio_gastos,
                COALESCE(SUM(g.total), 0) as gastos_totales,
                COALESCE(AVG(i.total), 0) - COALESCE(AVG(g.total), 0) as ganancia_promedio,
                CASE 
                    WHEN COALESCE(AVG(i.total), 0) > 0 
                    THEN ((COALESCE(AVG(i.total), 0) - COALESCE(AVG(g.total), 0)) / COALESCE(AVG(i.total), 0)) * 100
                    ELSE 0 
                END as margen_promedio
            FROM rutas r
            LEFT JOIN viajes v ON r.id = v.ruta_id AND v.estado = 'COMPLETADO'
            LEFT JOIN ingresos i ON v.id = i.viaje_id
            LEFT JOIN gastos g ON v.id = g.viaje_id
            WHERE r.activo = 1
            GROUP BY r.id, r.nombre, r.origen, r.destino, r.distancia_km, r.tiempo_estimado_horas, r.activo, r.fecha_creacion
            HAVING viajes_completados >= 2
            ORDER BY ganancia_promedio DESC, margen_promedio DESC
            LIMIT ?
        `;
        
        const [rutas] = await pool.execute(query, [String(limit)]);
        
        // Formatear respuesta
        const rutasRentables = rutas.map(ruta => ({
            ...ruta,
            promedio_km_real: Math.round(ruta.promedio_km_real || ruta.distancia_km || 0),
            promedio_dias: Math.round(ruta.promedio_dias || 0),
            promedio_ingresos: Math.round(ruta.promedio_ingresos || 0),
            promedio_gastos: Math.round(ruta.promedio_gastos || 0),
            ganancia_promedio: Math.round(ruta.ganancia_promedio || 0),
            margen_promedio: Math.round(ruta.margen_promedio || 0),
            rentabilidad: ruta.ganancia_promedio > 0 ? 'ALTA' : 
                         ruta.ganancia_promedio === 0 ? 'NEUTRAL' : 'BAJA'
        }));
        
        console.log(`✅ Obtenidas ${rutasRentables.length} rutas rentables`);
        res.json(rutasRentables);
        
    } catch (error) {
        console.error('❌ Error obteniendo rutas rentables:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER ESTADÍSTICAS DE RUTAS
exports.getEstadisticasRutas = async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_rutas,
                COUNT(CASE WHEN activo = 1 THEN 1 END) as rutas_activas,
                COUNT(CASE WHEN activo = 0 THEN 1 END) as rutas_inactivas,
                AVG(distancia_km) as distancia_promedio,
                AVG(tiempo_estimado_horas) as tiempo_promedio
            FROM rutas
        `);
        
        // Estadísticas de uso
        const [usoStats] = await pool.execute(`
            SELECT 
                COUNT(DISTINCT r.id) as rutas_con_viajes,
                COUNT(v.id) as total_viajes_con_ruta,
                AVG(viajes_por_ruta.cantidad) as promedio_viajes_por_ruta
            FROM rutas r
            LEFT JOIN viajes v ON r.id = v.ruta_id
            LEFT JOIN (
                SELECT ruta_id, COUNT(*) as cantidad
                FROM viajes 
                WHERE ruta_id IS NOT NULL
                GROUP BY ruta_id
            ) viajes_por_ruta ON r.id = viajes_por_ruta.ruta_id
        `);
        
        const estadisticas = {
            ...stats[0],
            ...usoStats[0],
            distancia_promedio: Math.round(stats[0].distancia_promedio || 0),
            tiempo_promedio: Math.round((stats[0].tiempo_promedio || 0) * 10) / 10,
            promedio_viajes_por_ruta: Math.round((usoStats[0].promedio_viajes_por_ruta || 0) * 10) / 10
        };
        
        console.log(`✅ Estadísticas de rutas obtenidas`);
        res.json(estadisticas);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de rutas:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};