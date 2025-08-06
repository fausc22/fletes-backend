// controllers/viajesController.js - SISTEMA DE FLETES
const pool = require('./dbPromise');

// ✅ OBTENER TODOS LOS VIAJES CON FILTROS
exports.getViajes = async (req, res) => {
    try {
        const { 
            limit = 20, 
            offset = 0, 
            camion_id, 
            estado, 
            desde, 
            hasta,
            mes,
            año 
        } = req.query;
        
        let query = `
            SELECT 
                v.*,
                c.patente, c.marca, c.modelo,
                r.nombre as ruta_nombre, r.origen, r.destino,
                DATEDIFF(COALESCE(v.fecha_fin, CURDATE()), v.fecha_inicio) as dias_viaje,
                CASE 
                    WHEN v.fecha_fin IS NOT NULL AND v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial)
                    ELSE NULL 
                END as km_recorridos
            FROM viajes v
            LEFT JOIN camiones c ON v.camion_id = c.id
            LEFT JOIN rutas r ON v.ruta_id = r.id
            WHERE 1=1
        `;
        const params = [];
        
        // Filtros opcionales
        if (camion_id) {
            query += ' AND v.camion_id = ?';
            params.push(camion_id);
        }
        
        if (estado) {
            query += ' AND v.estado = ?';
            params.push(estado);
        }
        
        if (desde) {
            query += ' AND DATE(v.fecha_inicio) >= ?';
            params.push(desde);
        }
        
        if (hasta) {
            query += ' AND DATE(v.fecha_inicio) <= ?';
            params.push(hasta);
        }
        
        if (mes && año) {
            query += ' AND YEAR(v.fecha_inicio) = ? AND MONTH(v.fecha_inicio) = ?';
            params.push(año, mes);
        }
        
        query += ' ORDER BY v.fecha_inicio DESC, v.fecha_creacion DESC LIMIT ? OFFSET ?';
        params.push(String(limit), String(offset));
        
        const [viajes] = await pool.execute(query, params);
        
        // Count para paginación
        let countQuery = `SELECT COUNT(*) as total FROM viajes v WHERE 1=1`;
        const countParams = [];
        
        if (camion_id) {
            countQuery += ' AND v.camion_id = ?';
            countParams.push(camion_id);
        }
        if (estado) {
            countQuery += ' AND v.estado = ?';
            countParams.push(estado);
        }
        if (desde) {
            countQuery += ' AND DATE(v.fecha_inicio) >= ?';
            countParams.push(desde);
        }
        if (hasta) {
            countQuery += ' AND DATE(v.fecha_inicio) <= ?';
            countParams.push(hasta);
        }
        if (mes && año) {
            countQuery += ' AND YEAR(v.fecha_inicio) = ? AND MONTH(v.fecha_inicio) = ?';
            countParams.push(año, mes);
        }
        
        const [totalResult] = await pool.execute(countQuery, countParams);
        
        console.log(`✅ Obtenidos ${viajes.length} viajes`);
        res.json({
            viajes,
            total: totalResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo viajes:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER VIAJES ACTIVOS (EN_CURSO)
exports.getViajesActivos = async (req, res) => {
    try {
        const query = `
            SELECT 
                v.*,
                c.patente, c.marca, c.modelo,
                r.nombre as ruta_nombre, r.origen, r.destino,
                DATEDIFF(CURDATE(), v.fecha_inicio) as dias_en_viaje,
                CASE 
                    WHEN v.km_inicial IS NOT NULL 
                    THEN (c.kilometros - v.km_inicial)
                    ELSE NULL 
                END as km_estimados_recorridos
            FROM viajes v
            JOIN camiones c ON v.camion_id = c.id
            LEFT JOIN rutas r ON v.ruta_id = r.id
            WHERE v.estado = 'EN_CURSO'
            ORDER BY v.fecha_inicio ASC
        `;
        
        const [viajesActivos] = await pool.execute(query);
        
        console.log(`✅ Obtenidos ${viajesActivos.length} viajes activos`);
        res.json(viajesActivos);
        
    } catch (error) {
        console.error('❌ Error obteniendo viajes activos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER UN VIAJE POR ID
exports.getViajeById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                v.*,
                c.patente, c.marca, c.modelo, c.kilometros as km_actuales_camion,
                r.nombre as ruta_nombre, r.origen, r.destino, r.distancia_km,
                DATEDIFF(COALESCE(v.fecha_fin, CURDATE()), v.fecha_inicio) as dias_viaje,
                CASE 
                    WHEN v.fecha_fin IS NOT NULL AND v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL 
                    THEN (v.km_final - v.km_inicial)
                    ELSE NULL 
                END as km_recorridos,
                -- Obtener ingresos asociados
                (SELECT SUM(total) FROM ingresos WHERE viaje_id = v.id) as ingresos_totales,
                (SELECT COUNT(*) FROM ingresos WHERE viaje_id = v.id) as cantidad_ingresos,
                -- Obtener gastos asociados  
                (SELECT SUM(total) FROM gastos WHERE viaje_id = v.id) as gastos_totales,
                (SELECT COUNT(*) FROM gastos WHERE viaje_id = v.id) as cantidad_gastos
            FROM viajes v
            JOIN camiones c ON v.camion_id = c.id
            LEFT JOIN rutas r ON v.ruta_id = r.id
            WHERE v.id = ?
        `;
        
        const [viajes] = await pool.execute(query, [id]);
        
        if (viajes.length === 0) {
            return res.status(404).json({ message: 'Viaje no encontrado' });
        }
        
        const viaje = {
            ...viajes[0],
            balance: (viajes[0].ingresos_totales || 0) - (viajes[0].gastos_totales || 0),
            rentabilidad_calculada: viajes[0].ingresos_totales && viajes[0].gastos_totales 
                ? ((viajes[0].ingresos_totales - viajes[0].gastos_totales) / viajes[0].ingresos_totales * 100).toFixed(2)
                : null
        };
        
        console.log(`✅ Obtenido viaje ID ${id}`);
        res.json(viaje);
        
    } catch (error) {
        console.error('❌ Error obteniendo viaje por ID:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CREAR NUEVO VIAJE
exports.createViaje = async (req, res) => {
    try {
        const { 
            camion_id, 
            ruta_id, 
            fecha_inicio, 
            km_inicial, 
            observaciones,
            destino_personalizado,
            precio_estimado 
        } = req.body;
        
        // Validaciones básicas
        if (!camion_id || !fecha_inicio) {
            return res.status(400).json({ 
                message: 'Campos requeridos: camion_id, fecha_inicio' 
            });
        }
        
        // Verificar que el camión existe y está disponible
        const [camion] = await pool.execute(
            'SELECT id, patente, marca, modelo, kilometros, activo FROM camiones WHERE id = ?', 
            [camion_id]
        );
        
        if (camion.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        if (!camion[0].activo) {
            return res.status(400).json({ message: 'El camión no está activo' });
        }
        
        // Verificar que el camión no tenga viajes activos
        const [viajesActivos] = await pool.execute(
            'SELECT id FROM viajes WHERE camion_id = ? AND estado = "EN_CURSO"', 
            [camion_id]
        );
        
        if (viajesActivos.length > 0) {
            return res.status(400).json({ 
                message: 'El camión ya tiene un viaje en curso' 
            });
        }
        
        // Validar ruta si se especifica
        if (ruta_id) {
            const [ruta] = await pool.execute(
                'SELECT id FROM rutas WHERE id = ? AND activo = 1', 
                [ruta_id]
            );
            
            if (ruta.length === 0) {
                return res.status(404).json({ message: 'Ruta no encontrada o inactiva' });
            }
        }
        
        // Validar km inicial
        const kmInicial = km_inicial || camion[0].kilometros;
        if (kmInicial < camion[0].kilometros) {
            return res.status(400).json({ 
                message: 'El kilometraje inicial no puede ser menor al actual del camión' 
            });
        }
        
        // Crear el viaje
        const query = `
            INSERT INTO viajes 
            (camion_id, ruta_id, fecha_inicio, km_inicial, observaciones, estado)
            VALUES (?, ?, ?, ?, ?, 'EN_CURSO')
        `;
        
        const [result] = await pool.execute(query, [
            camion_id,
            ruta_id || null,
            fecha_inicio,
            kmInicial,
            observaciones?.trim() || null
        ]);
        
        // Actualizar kilometraje del camión si es mayor
        if (kmInicial > camion[0].kilometros) {
            await pool.execute(
                'UPDATE camiones SET kilometros = ? WHERE id = ?',
                [kmInicial, camion_id]
            );
        }
        
        // Obtener el viaje creado con información completa
        const [nuevoViaje] = await pool.execute(`
            SELECT 
                v.*,
                c.patente, c.marca, c.modelo,
                r.nombre as ruta_nombre, r.origen, r.destino
            FROM viajes v
            JOIN camiones c ON v.camion_id = c.id
            LEFT JOIN rutas r ON v.ruta_id = r.id
            WHERE v.id = ?
        `, [result.insertId]);
        
        console.log(`✅ Viaje creado: ID ${result.insertId} - Camión ${camion[0].patente}`);
        res.status(201).json({
            message: 'Viaje iniciado exitosamente',
            viaje: nuevoViaje[0]
        });
        
    } catch (error) {
        console.error('❌ Error creando viaje:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ FINALIZAR VIAJE CON INTEGRACIÓN AUTOMÁTICA
exports.finalizarViaje = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            fecha_fin, 
            km_final, 
            observaciones_finales,
            crear_ingreso_automatico = true,
            monto_cobrado,
            descripcion_ingreso 
        } = req.body;
        
        // Verificar que el viaje existe y está activo
        const [viaje] = await pool.execute(
            'SELECT * FROM viajes WHERE id = ? AND estado = "EN_CURSO"', 
            [id]
        );
        
        if (viaje.length === 0) {
            return res.status(404).json({ 
                message: 'Viaje no encontrado o ya finalizado' 
            });
        }
        
        const viajeData = viaje[0];
        const fechaFin = fecha_fin || new Date().toISOString().split('T')[0];
        
        // Obtener info del camión
        const [camion] = await pool.execute(
            'SELECT patente, marca, modelo, kilometros FROM camiones WHERE id = ?',
            [viajeData.camion_id]
        );
        
        // Validar km final
        const kmFinal = km_final || camion[0].kilometros;
        if (kmFinal < viajeData.km_inicial) {
            return res.status(400).json({ 
                message: 'El kilometraje final no puede ser menor al inicial' 
            });
        }
        
        // TRANSACCIÓN: Finalizar viaje + crear ingreso + actualizar camión
        try {
            // 1. Finalizar viaje
            await pool.execute(`
                UPDATE viajes 
                SET fecha_fin = ?, km_final = ?, estado = 'COMPLETADO',
                    observaciones = CONCAT(COALESCE(observaciones, ''), 
                    CASE WHEN observaciones IS NOT NULL THEN '\n--- FINALIZACIÓN ---\n' ELSE '' END, 
                    COALESCE(?, ''))
                WHERE id = ?
            `, [fechaFin, kmFinal, observaciones_finales, id]);
            
            // 2. Actualizar kilometraje del camión
            if (kmFinal > camion[0].kilometros) {
                await pool.execute(
                    'UPDATE camiones SET kilometros = ? WHERE id = ?',
                    [kmFinal, viajeData.camion_id]
                );
            }
            
            let ingresoCreado = null;
            
            // 3. Crear ingreso automático si corresponde
            if (crear_ingreso_automatico && monto_cobrado && monto_cobrado > 0) {
                // Buscar categoría "Flete"
                const [categoriaFlete] = await pool.execute(
                    'SELECT id FROM categorias WHERE nombre = "Flete" AND tipo = "INGRESO"'
                );
                
                const queryIngreso = `
                    INSERT INTO ingresos 
                    (fecha, nombre, descripcion, total, camion_id, categoria_id, viaje_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `;
                
                const nombreIngreso = descripcion_ingreso || 
                    `Flete - Viaje ${camion[0].patente} (${(kmFinal - viajeData.km_inicial)} km)`;
                
                const [resultIngreso] = await pool.execute(queryIngreso, [
                    fechaFin,
                    nombreIngreso,
                    `Ingreso automático del viaje finalizado el ${fechaFin}`,
                    parseFloat(monto_cobrado),
                    viajeData.camion_id,
                    categoriaFlete.length > 0 ? categoriaFlete[0].id : null,
                    id
                ]);
                
                ingresoCreado = {
                    id: resultIngreso.insertId,
                    total: parseFloat(monto_cobrado),
                    mensaje: 'Ingreso registrado automáticamente'
                };
                
                console.log(`✅ Ingreso creado automáticamente: ID ${resultIngreso.insertId}`);
            }
            
            // 4. Obtener el viaje finalizado con información completa
            const [viajeCompleto] = await pool.execute(`
                SELECT 
                    v.*,
                    c.patente, c.marca, c.modelo,
                    r.nombre as ruta_nombre, r.origen, r.destino,
                    (v.km_final - v.km_inicial) as km_recorridos,
                    DATEDIFF(v.fecha_fin, v.fecha_inicio) as dias_viaje
                FROM viajes v
                JOIN camiones c ON v.camion_id = c.id
                LEFT JOIN rutas r ON v.ruta_id = r.id
                WHERE v.id = ?
            `, [id]);
            
            const response = {
                message: 'Viaje finalizado exitosamente',
                viaje: viajeCompleto[0]
            };
            
            if (ingresoCreado) {
                response.ingreso_creado = ingresoCreado;
            }
            
            console.log(`✅ Viaje finalizado: ID ${id} - ${kmFinal - viajeData.km_inicial} km recorridos`);
            res.json(response);
            
        } catch (transactionError) {
            throw transactionError;
        }
        
    } catch (error) {
        console.error('❌ Error finalizando viaje:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CANCELAR VIAJE
exports.cancelarViaje = async (req, res) => {
    try {
        const { id } = req.params;
        const { motivo_cancelacion } = req.body;
        
        // Verificar que el viaje existe y está activo
        const [viaje] = await pool.execute(
            'SELECT * FROM viajes WHERE id = ? AND estado = "EN_CURSO"', 
            [id]
        );
        
        if (viaje.length === 0) {
            return res.status(404).json({ 
                message: 'Viaje no encontrado o ya finalizado' 
            });
        }
        
        // Cancelar viaje
        await pool.execute(`
            UPDATE viajes 
            SET estado = 'CANCELADO',
                observaciones = CONCAT(COALESCE(observaciones, ''), 
                CASE WHEN observaciones IS NOT NULL THEN '\n--- CANCELACIÓN ---\n' ELSE '' END,
                'Motivo: ', COALESCE(?, 'No especificado'))
            WHERE id = ?
        `, [motivo_cancelacion, id]);
        
        console.log(`✅ Viaje cancelado: ID ${id}`);
        res.json({ 
            message: 'Viaje cancelado exitosamente',
            motivo: motivo_cancelacion || 'No especificado'
        });
        
    } catch (error) {
        console.error('❌ Error cancelando viaje:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER ESTADÍSTICAS DE VIAJES
exports.getEstadisticasViajes = async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_viajes,
                COUNT(CASE WHEN estado = 'EN_CURSO' THEN 1 END) as viajes_activos,
                COUNT(CASE WHEN estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                COUNT(CASE WHEN estado = 'CANCELADO' THEN 1 END) as viajes_cancelados,
                COUNT(CASE WHEN YEAR(fecha_inicio) = YEAR(CURDATE()) THEN 1 END) as viajes_este_año,
                COUNT(CASE WHEN MONTH(fecha_inicio) = MONTH(CURDATE()) AND YEAR(fecha_inicio) = YEAR(CURDATE()) THEN 1 END) as viajes_este_mes,
                AVG(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) END) as promedio_km_por_viaje,
                SUM(CASE WHEN km_final IS NOT NULL AND km_inicial IS NOT NULL THEN (km_final - km_inicial) END) as total_km_recorridos
            FROM viajes
            WHERE fecha_inicio >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
        `);
        
        // Top camiones por viajes
        const [topCamiones] = await pool.execute(`
            SELECT 
                c.patente, c.marca, c.modelo,
                COUNT(v.id) as total_viajes,
                COUNT(CASE WHEN v.estado = 'COMPLETADO' THEN 1 END) as viajes_completados,
                SUM(CASE WHEN v.km_final IS NOT NULL AND v.km_inicial IS NOT NULL THEN (v.km_final - v.km_inicial) END) as km_totales
            FROM camiones c
            LEFT JOIN viajes v ON c.id = v.camion_id AND v.fecha_inicio >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            WHERE c.activo = 1
            GROUP BY c.id, c.patente, c.marca, c.modelo
            ORDER BY total_viajes DESC
            LIMIT 5
        `);
        
        const estadisticas = {
            ...stats[0],
            promedio_km_por_viaje: Math.round(stats[0].promedio_km_por_viaje || 0),
            total_km_recorridos: Math.round(stats[0].total_km_recorridos || 0),
            top_camiones: topCamiones
        };
        
        console.log(`✅ Estadísticas de viajes obtenidas`);
        res.json(estadisticas);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de viajes:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};