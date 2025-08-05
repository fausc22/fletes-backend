// controllers/mantenimientosController.js - SISTEMA DE FLETES - CORREGIDO
const pool = require('./dbPromise');
const { createGastoFromMantenimiento } = require('./gastosController');

// ✅ OBTENER MANTENIMIENTOS POR CAMIÓN
exports.getMantenimientosByCamion = async (req, res) => {
    try {
        const { camionId } = req.params;
        const { limit = 10, offset = 0 } = req.query;
        
        // Verificar que el camión existe
        const [camionExists] = await pool.execute(
            'SELECT id FROM camiones WHERE id = ?', 
            [camionId]
        );
        
        if (camionExists.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        const query = `
            SELECT m.*
            FROM mantenimientos m
            WHERE m.camion_id = ?
            ORDER BY m.fecha DESC, m.fecha_creacion DESC
            LIMIT ? OFFSET ?
        `;
        
        // ✅ FIX: Convertir todos los parámetros numéricos a string para evitar el error
        const [mantenimientos] = await pool.execute(query, [
            camionId, 
            String(limit), 
            String(offset)
        ]);
        
        // Obtener total para paginación
        const [totalResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM mantenimientos WHERE camion_id = ?',
            [camionId]
        );
        
        console.log(`✅ Obtenidos ${mantenimientos.length} mantenimientos para camión ${camionId}`);
        res.json({
            mantenimientos,
            total: totalResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo mantenimientos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CREAR NUEVO MANTENIMIENTO CON INTEGRACIÓN DE GASTOS
exports.createMantenimiento = async (req, res) => {
    try {
        const { camionId } = req.params;
        const { 
            fecha, 
            tipo, 
            descripcion, 
            costo, 
            kilometraje, 
            proximo_service_km, 
            observaciones,
            crear_gasto = true  // ✅ NUEVO CAMPO: por defecto crear gasto
        } = req.body;
        
        // Validaciones básicas
        if (!fecha || !tipo) {
            return res.status(400).json({ 
                message: 'Campos requeridos: fecha, tipo' 
            });
        }
        
        // Verificar que el camión existe
        const [camion] = await pool.execute(
            'SELECT id, kilometros FROM camiones WHERE id = ?', 
            [camionId]
        );
        
        if (camion.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        // Validar que el kilometraje no sea menor al actual del camión
        if (kilometraje && kilometraje < camion[0].kilometros) {
            return res.status(400).json({ 
                message: 'El kilometraje del mantenimiento no puede ser menor al actual del camión' 
            });
        }
        
        // Validar costo
        if (costo && costo < 0) {
            return res.status(400).json({ 
                message: 'El costo no puede ser negativo' 
            });
        }
        
        // ✅ USAR TRANSACCIÓN SIMPLE SIN CONEXIÓN MANUAL
        try {
            // 1. CREAR MANTENIMIENTO
            const queryMantenimiento = `
                INSERT INTO mantenimientos 
                (camion_id, fecha, tipo, descripcion, costo, kilometraje, proximo_service_km, observaciones)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            
            const [resultMantenimiento] = await pool.execute(queryMantenimiento, [
                camionId,
                fecha,
                tipo.trim(),
                descripcion?.trim() || null,
                costo || null,
                kilometraje || null,
                proximo_service_km || null,
                observaciones?.trim() || null
            ]);
            
            let gastoCreado = null;
            
            // 2. CREAR GASTO AUTOMÁTICAMENTE SI CORRESPONDE
            if (crear_gasto && costo && costo > 0) {
                const gastoResult = await createGastoFromMantenimiento({
                    camion_id: camionId,
                    fecha,
                    tipo,
                    descripcion,
                    costo,
                    kilometraje
                });
                
                if (gastoResult.success) {
                    gastoCreado = {
                        id: gastoResult.gastoId,
                        total: costo,
                        mensaje: gastoResult.message
                    };
                    console.log(`✅ Gasto creado automáticamente: ID ${gastoResult.gastoId}`);
                } else {
                    console.log(`⚠️ No se pudo crear gasto automático: ${gastoResult.message}`);
                }
            }
            
            // 3. ACTUALIZAR ÚLTIMO SERVICE Y KILOMETRAJE DEL CAMIÓN SI CORRESPONDE
            const updateFields = [];
            const updateValues = [];
            
            if (kilometraje && kilometraje > camion[0].kilometros) {
                updateFields.push('kilometros = ?');
                updateValues.push(kilometraje);
            }
            
            // Actualizar último service si es un service regular
            const tiposService = ['SERVICE', 'MANTENIMIENTO PREVENTIVO', 'REVISION'];
            if (tiposService.some(ts => tipo.toUpperCase().includes(ts.toUpperCase()))) {
                updateFields.push('ultimo_service = ?');
                updateValues.push(fecha);
            }
            
            if (updateFields.length > 0) {
                updateValues.push(camionId);
                await pool.execute(
                    `UPDATE camiones SET ${updateFields.join(', ')} WHERE id = ?`,
                    updateValues
                );
            }
            
            // 4. OBTENER EL MANTENIMIENTO CREADO CON INFORMACIÓN COMPLETA
            const [nuevoMantenimiento] = await pool.execute(
                'SELECT * FROM mantenimientos WHERE id = ?', 
                [resultMantenimiento.insertId]
            );
            
            console.log(`✅ Mantenimiento creado: ID ${resultMantenimiento.insertId} para camión ${camionId}`);
            
            const response = {
                message: 'Mantenimiento registrado exitosamente',
                mantenimiento: {
                    ...nuevoMantenimiento[0],
                    tiene_gasto_asociado: !!gastoCreado,
                    gasto_id: gastoCreado?.id || null,
                    gasto_total: gastoCreado?.total || null
                }
            };
            
            if (gastoCreado) {
                response.gasto_creado = gastoCreado;
            }
            
            res.status(201).json(response);
            
        } catch (transactionError) {
            throw transactionError;
        }
        
    } catch (error) {
        console.error('❌ Error creando mantenimiento:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER TODOS LOS MANTENIMIENTOS - CORREGIDO
exports.getAllMantenimientos = async (req, res) => {
    try {
        const { limit = 20, offset = 0, tipo, desde, hasta } = req.query;
        
        // ✅ FIX: Simplificar la consulta eliminando el LEFT JOIN problemático
        let query = `
            SELECT 
                m.*, 
                c.patente, 
                c.marca, 
                c.modelo
            FROM mantenimientos m
            JOIN camiones c ON m.camion_id = c.id
            WHERE 1=1
        `;
        const params = [];
        
        // Filtros opcionales
        if (tipo) {
            query += ' AND m.tipo LIKE ?';
            params.push(`%${tipo}%`);
        }
        
        if (desde) {
            query += ' AND m.fecha >= ?';
            params.push(desde);
        }
        
        if (hasta) {
            query += ' AND m.fecha <= ?';
            params.push(hasta);
        }
        
        query += ' ORDER BY m.fecha DESC, m.fecha_creacion DESC LIMIT ? OFFSET ?';
        
        // ✅ FIX: Convertir parámetros numéricos a string
        params.push(String(limit), String(offset));
        
        console.log('🔍 Ejecutando consulta:', query);
        console.log('🔍 Con parámetros:', params);
        
        const [mantenimientos] = await pool.execute(query, params);
        
        // Obtener total para paginación
        let countQuery = `
            SELECT COUNT(*) as total
            FROM mantenimientos m
            JOIN camiones c ON m.camion_id = c.id
            WHERE 1=1
        `;
        const countParams = [];
        
        if (tipo) {
            countQuery += ' AND m.tipo LIKE ?';
            countParams.push(`%${tipo}%`);
        }
        if (desde) {
            countQuery += ' AND m.fecha >= ?';
            countParams.push(desde);
        }
        if (hasta) {
            countQuery += ' AND m.fecha <= ?';
            countParams.push(hasta);
        }
        
        const [totalResult] = await pool.execute(countQuery, countParams);
        
        console.log(`✅ Obtenidos ${mantenimientos.length} mantenimientos`);
        res.json({
            mantenimientos,
            total: totalResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo todos los mantenimientos:', error);
        console.error('❌ Stack completo:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER PRÓXIMOS MANTENIMIENTOS (ALERTAS) - CORREGIDO
exports.getProximosMantenimientos = async (req, res) => {
    try {
        // ✅ FIX: Simplificar la consulta y usar CAST para asegurar tipos correctos
        const query = `
            SELECT 
                c.id as camion_id,
                c.patente,
                c.marca,
                c.modelo,
                CAST(c.kilometros as SIGNED) as km_actual,
                m.proximo_service_km,
                m.fecha as ultimo_mantenimiento,
                m.tipo as ultimo_tipo,
                CASE 
                    WHEN m.proximo_service_km IS NOT NULL 
                    THEN CAST((m.proximo_service_km - c.kilometros) as SIGNED)
                    ELSE NULL 
                END as km_restantes,
                CASE 
                    WHEN m.proximo_service_km IS NOT NULL AND (m.proximo_service_km - c.kilometros) <= 1000 THEN 'URGENTE'
                    WHEN m.proximo_service_km IS NOT NULL AND (m.proximo_service_km - c.kilometros) <= 3000 THEN 'PRÓXIMO'
                    WHEN DATEDIFF(CURDATE(), m.fecha) >= 180 THEN 'VENCIDO'
                    WHEN DATEDIFF(CURDATE(), m.fecha) >= 150 THEN 'PRÓXIMO'
                    ELSE 'OK'
                END as prioridad
            FROM camiones c
            LEFT JOIN (
                SELECT 
                    camion_id,
                    fecha,
                    tipo,
                    proximo_service_km,
                    ROW_NUMBER() OVER (PARTITION BY camion_id ORDER BY fecha DESC) as rn
                FROM mantenimientos
                WHERE proximo_service_km IS NOT NULL OR fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
            ) m ON c.id = m.camion_id AND m.rn = 1
            WHERE c.activo = 1
            HAVING prioridad IN ('URGENTE', 'PRÓXIMO', 'VENCIDO')
            ORDER BY 
                CASE prioridad 
                    WHEN 'URGENTE' THEN 1 
                    WHEN 'VENCIDO' THEN 2 
                    WHEN 'PRÓXIMO' THEN 3 
                END,
                km_restantes ASC
        `;
        
        const [alertas] = await pool.execute(query, []);
        
        console.log(`✅ Obtenidas ${alertas.length} alertas de mantenimiento`);
        res.json(alertas);
        
    } catch (error) {
        console.error('❌ Error obteniendo próximos mantenimientos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ACTUALIZAR MANTENIMIENTO
exports.updateMantenimiento = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, tipo, descripcion, costo, kilometraje, proximo_service_km, observaciones } = req.body;
        
        // Verificar que el mantenimiento existe
        const [mantenimientoExistente] = await pool.execute(
            'SELECT * FROM mantenimientos WHERE id = ?', 
            [id]
        );
        
        if (mantenimientoExistente.length === 0) {
            return res.status(404).json({ message: 'Mantenimiento no encontrado' });
        }
        
        // Construir query dinámico
        const campos = [];
        const valores = [];
        
        if (fecha !== undefined) {
            campos.push('fecha = ?');
            valores.push(fecha);
        }
        if (tipo !== undefined) {
            campos.push('tipo = ?');
            valores.push(tipo.trim());
        }
        if (descripcion !== undefined) {
            campos.push('descripcion = ?');
            valores.push(descripcion?.trim() || null);
        }
        if (costo !== undefined) {
            if (costo < 0) {
                return res.status(400).json({ message: 'El costo no puede ser negativo' });
            }
            campos.push('costo = ?');
            valores.push(costo);
        }
        if (kilometraje !== undefined) {
            campos.push('kilometraje = ?');
            valores.push(kilometraje);
        }
        if (proximo_service_km !== undefined) {
            campos.push('proximo_service_km = ?');
            valores.push(proximo_service_km);
        }
        if (observaciones !== undefined) {
            campos.push('observaciones = ?');
            valores.push(observaciones?.trim() || null);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE mantenimientos SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener el mantenimiento actualizado
        const [mantenimientoActualizado] = await pool.execute(
            'SELECT * FROM mantenimientos WHERE id = ?', 
            [id]
        );
        
        console.log(`✅ Mantenimiento actualizado: ID ${id}`);
        res.json({
            message: 'Mantenimiento actualizado exitosamente',
            mantenimiento: mantenimientoActualizado[0]
        });
        
    } catch (error) {
        console.error('❌ Error actualizando mantenimiento:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ELIMINAR MANTENIMIENTO
exports.deleteMantenimiento = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el mantenimiento existe
        const [mantenimientoExistente] = await pool.execute(
            'SELECT * FROM mantenimientos WHERE id = ?', 
            [id]
        );
        
        if (mantenimientoExistente.length === 0) {
            return res.status(404).json({ message: 'Mantenimiento no encontrado' });
        }
        
        // Eliminar el mantenimiento
        await pool.execute('DELETE FROM mantenimientos WHERE id = ?', [id]);
        
        console.log(`✅ Mantenimiento eliminado: ID ${id}`);
        res.json({ message: 'Mantenimiento eliminado exitosamente' });
        
    } catch (error) {
        console.error('❌ Error eliminando mantenimiento:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER ESTADÍSTICAS DE MANTENIMIENTOS - CORREGIDO
exports.getEstadisticasMantenimientos = async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_mantenimientos,
                COUNT(DISTINCT camion_id) as camiones_con_mantenimiento,
                AVG(costo) as costo_promedio,
                SUM(costo) as costo_total_año,
                COUNT(CASE WHEN YEAR(fecha) = YEAR(CURDATE()) THEN 1 END) as mantenimientos_este_año,
                COUNT(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN 1 END) as mantenimientos_este_mes
            FROM mantenimientos
            WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
        `);
        
        const [tiposStats] = await pool.execute(`
            SELECT 
                tipo,
                COUNT(*) as cantidad,
                AVG(costo) as costo_promedio
            FROM mantenimientos
            WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            GROUP BY tipo
            ORDER BY cantidad DESC
            LIMIT 5
        `);
        
        const estadisticas = {
            ...stats[0],
            costo_promedio: Math.round(stats[0].costo_promedio || 0),
            costo_total_año: Math.round(stats[0].costo_total_año || 0),
            tipos_frecuentes: tiposStats
        };
        
        console.log(`✅ Estadísticas de mantenimientos obtenidas`);
        res.json(estadisticas);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de mantenimientos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ NUEVA FUNCIÓN: CREAR GASTO MANUAL DESDE MANTENIMIENTO
exports.crearGastoDesdeMantenimiento = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Obtener el mantenimiento
        const [mantenimiento] = await pool.execute(
            'SELECT * FROM mantenimientos WHERE id = ?', 
            [id]
        );
        
        if (mantenimiento.length === 0) {
            return res.status(404).json({ message: 'Mantenimiento no encontrado' });
        }
        
        const m = mantenimiento[0];
        
        // Verificar que tenga costo
        if (!m.costo || m.costo <= 0) {
            return res.status(400).json({ 
                message: 'El mantenimiento no tiene costo para registrar como gasto' 
            });
        }
        
        // Verificar que no tenga gasto asociado ya
        const [gastoExistente] = await pool.execute(`
            SELECT id FROM gastos 
            WHERE nombre LIKE CONCAT('Mantenimiento - ', ?)
                AND camion_id = ?
                AND DATE(fecha) = DATE(?)
        `, [m.tipo, m.camion_id, m.fecha]);
        
        if (gastoExistente.length > 0) {
            return res.status(400).json({ 
                message: 'Ya existe un gasto asociado a este mantenimiento',
                gasto_id: gastoExistente[0].id
            });
        }
        
        // Crear el gasto
        const gastoResult = await createGastoFromMantenimiento({
            camion_id: m.camion_id,
            fecha: m.fecha,
            tipo: m.tipo,
            descripcion: m.descripcion,
            costo: m.costo,
            kilometraje: m.kilometraje
        });
        
        if (gastoResult.success) {
            console.log(`✅ Gasto creado manualmente desde mantenimiento: ID ${gastoResult.gastoId}`);
            res.json({
                message: 'Gasto creado exitosamente desde mantenimiento',
                gasto_id: gastoResult.gastoId,
                gasto_total: m.costo
            });
        } else {
            res.status(500).json({
                message: gastoResult.message,
                error: gastoResult.error
            });
        }
        
    } catch (error) {
        console.error('❌ Error creando gasto desde mantenimiento:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};