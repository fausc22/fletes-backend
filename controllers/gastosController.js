// controllers/gastosController.js - SISTEMA DE FLETES - MÓDULO BÁSICO
const pool = require('./dbPromise');

// ✅ OBTENER TODOS LOS GASTOS
exports.getGastos = async (req, res) => {
    try {
        const { limit = 20, offset = 0, camion_id, categoria_id, desde, hasta } = req.query;
        
        let query = `
            SELECT 
                g.*,
                c.patente,
                c.marca,
                c.modelo,
                cat.nombre as categoria_nombre,
                cat.tipo as categoria_tipo
            FROM gastos g
            JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE 1=1
        `;
        const params = [];
        
        // Filtros opcionales
        if (camion_id) {
            query += ' AND g.camion_id = ?';
            params.push(camion_id);
        }
        
        if (categoria_id) {
            query += ' AND g.categoria_id = ?';
            params.push(categoria_id);
        }
        
        if (desde) {
            query += ' AND DATE(g.fecha) >= ?';
            params.push(desde);
        }
        
        if (hasta) {
            query += ' AND DATE(g.fecha) <= ?';
            params.push(hasta);
        }
        
        query += ' ORDER BY g.fecha DESC, g.fecha_creacion DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));
        
        const [gastos] = await pool.execute(query, params);
        
        // Obtener total para paginación
        let countQuery = `
            SELECT COUNT(*) as total
            FROM gastos g
            WHERE 1=1
        `;
        const countParams = [];
        
        if (camion_id) {
            countQuery += ' AND g.camion_id = ?';
            countParams.push(camion_id);
        }
        if (categoria_id) {
            countQuery += ' AND g.categoria_id = ?';
            countParams.push(categoria_id);
        }
        if (desde) {
            countQuery += ' AND DATE(g.fecha) >= ?';
            countParams.push(desde);
        }
        if (hasta) {
            countQuery += ' AND DATE(g.fecha) <= ?';
            countParams.push(hasta);
        }
        
        const [totalResult] = await pool.execute(countQuery, countParams);
        
        console.log(`✅ Obtenidos ${gastos.length} gastos`);
        res.json({
            gastos,
            total: totalResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo gastos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER UN GASTO POR ID
exports.getGastoById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                g.*,
                c.patente,
                c.marca,
                c.modelo,
                cat.nombre as categoria_nombre
            FROM gastos g
            JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.id = ?
        `;
        
        const [gastos] = await pool.execute(query, [id]);
        
        if (gastos.length === 0) {
            return res.status(404).json({ message: 'Gasto no encontrado' });
        }
        
        console.log(`✅ Obtenido gasto ID ${id}`);
        res.json(gastos[0]);
        
    } catch (error) {
        console.error('❌ Error obteniendo gasto por ID:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CREAR NUEVO GASTO
exports.createGasto = async (req, res) => {
    try {
        const { 
            fecha, 
            nombre, 
            descripcion, 
            total, 
            observaciones, 
            camion_id, 
            categoria_id, 
            viaje_id, 
            kilometraje_actual 
        } = req.body;
        
        // Validaciones básicas
        if (!fecha || !nombre || !total || !camion_id) {
            return res.status(400).json({ 
                message: 'Campos requeridos: fecha, nombre, total, camion_id' 
            });
        }
        
        // Validar que el total sea positivo
        if (total <= 0) {
            return res.status(400).json({ 
                message: 'El total debe ser mayor a cero' 
            });
        }
        
        // Verificar que el camión existe
        const [camion] = await pool.execute(
            'SELECT id FROM camiones WHERE id = ? AND activo = 1', 
            [camion_id]
        );
        
        if (camion.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado o inactivo' });
        }
        
        // Verificar categoría si se proporciona
        if (categoria_id) {
            const [categoria] = await pool.execute(
                'SELECT id FROM categorias WHERE id = ? AND tipo = "GASTO" AND activo = 1', 
                [categoria_id]
            );
            
            if (categoria.length === 0) {
                return res.status(404).json({ message: 'Categoría de gasto no encontrada' });
            }
        }
        
        const query = `
            INSERT INTO gastos 
            (fecha, nombre, descripcion, total, observaciones, camion_id, categoria_id, viaje_id, kilometraje_actual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(query, [
            fecha,
            nombre.trim(),
            descripcion?.trim() || null,
            total,
            observaciones?.trim() || null,
            camion_id,
            categoria_id || null,
            viaje_id || null,
            kilometraje_actual || null
        ]);
        
        // Obtener el gasto creado con información completa
        const [nuevoGasto] = await pool.execute(`
            SELECT 
                g.*,
                c.patente,
                c.marca,
                c.modelo,
                cat.nombre as categoria_nombre
            FROM gastos g
            JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.id = ?
        `, [result.insertId]);
        
        console.log(`✅ Gasto creado: ID ${result.insertId} - ${nombre} - $${total}`);
        res.status(201).json({
            message: 'Gasto registrado exitosamente',
            gasto: nuevoGasto[0]
        });
        
    } catch (error) {
        console.error('❌ Error creando gasto:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ FUNCIÓN INTERNA PARA CREAR GASTO DESDE MANTENIMIENTO
exports.createGastoFromMantenimiento = async (mantenimientoData) => {
    try {
        const { 
            camion_id, 
            fecha, 
            tipo, 
            descripcion, 
            costo, 
            kilometraje 
        } = mantenimientoData;
        
        // Solo crear gasto si hay costo
        if (!costo || costo <= 0) {
            return { success: false, message: 'No hay costo para registrar como gasto' };
        }
        
        // Buscar o crear categoría "Mantenimiento"
        let [categoria] = await pool.execute(
            'SELECT id FROM categorias WHERE nombre = "Mantenimiento" AND tipo = "GASTO"'
        );
        
        if (categoria.length === 0) {
            // Crear categoría automáticamente
            const [categoriaResult] = await pool.execute(`
                INSERT INTO categorias (nombre, tipo, descripcion, activo)
                VALUES ('Mantenimiento', 'GASTO', 'Gastos de mantenimiento de camiones', 1)
            `);
            categoria = [{ id: categoriaResult.insertId }];
        }
        
        const gastoData = {
            fecha,
            nombre: `Mantenimiento - ${tipo}`,
            descripcion: descripcion || `Mantenimiento tipo ${tipo}`,
            total: costo,
            observaciones: kilometraje ? `Kilometraje: ${kilometraje} km` : null,
            camion_id,
            categoria_id: categoria[0].id,
            viaje_id: null,
            kilometraje_actual: kilometraje
        };
        
        // Crear el gasto usando la función interna
        const query = `
            INSERT INTO gastos 
            (fecha, nombre, descripcion, total, observaciones, camion_id, categoria_id, viaje_id, kilometraje_actual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(query, [
            gastoData.fecha,
            gastoData.nombre,
            gastoData.descripcion,
            gastoData.total,
            gastoData.observaciones,
            gastoData.camion_id,
            gastoData.categoria_id,
            gastoData.viaje_id,
            gastoData.kilometraje_actual
        ]);
        
        console.log(`✅ Gasto creado automáticamente desde mantenimiento: ID ${result.insertId}`);
        return { 
            success: true, 
            gastoId: result.insertId,
            message: 'Gasto registrado automáticamente'
        };
        
    } catch (error) {
        console.error('❌ Error creando gasto desde mantenimiento:', error);
        return { 
            success: false, 
            message: 'Error registrando gasto automático',
            error: error.message 
        };
    }
};

// ✅ ACTUALIZAR GASTO
exports.updateGasto = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, nombre, descripcion, total, observaciones, categoria_id } = req.body;
        
        // Verificar que el gasto existe
        const [gastoExistente] = await pool.execute(
            'SELECT * FROM gastos WHERE id = ?', 
            [id]
        );
        
        if (gastoExistente.length === 0) {
            return res.status(404).json({ message: 'Gasto no encontrado' });
        }
        
        // Construir query dinámico
        const campos = [];
        const valores = [];
        
        if (fecha !== undefined) {
            campos.push('fecha = ?');
            valores.push(fecha);
        }
        if (nombre !== undefined) {
            campos.push('nombre = ?');
            valores.push(nombre.trim());
        }
        if (descripcion !== undefined) {
            campos.push('descripcion = ?');
            valores.push(descripcion?.trim() || null);
        }
        if (total !== undefined) {
            if (total <= 0) {
                return res.status(400).json({ message: 'El total debe ser mayor a cero' });
            }
            campos.push('total = ?');
            valores.push(total);
        }
        if (observaciones !== undefined) {
            campos.push('observaciones = ?');
            valores.push(observaciones?.trim() || null);
        }
        if (categoria_id !== undefined) {
            campos.push('categoria_id = ?');
            valores.push(categoria_id);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE gastos SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener el gasto actualizado
        const [gastoActualizado] = await pool.execute(`
            SELECT 
                g.*,
                c.patente,
                c.marca,
                c.modelo,
                cat.nombre as categoria_nombre
            FROM gastos g
            JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.id = ?
        `, [id]);
        
        console.log(`✅ Gasto actualizado: ID ${id}`);
        res.json({
            message: 'Gasto actualizado exitosamente',
            gasto: gastoActualizado[0]
        });
        
    } catch (error) {
        console.error('❌ Error actualizando gasto:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ELIMINAR GASTO
exports.deleteGasto = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el gasto existe
        const [gastoExistente] = await pool.execute(
            'SELECT * FROM gastos WHERE id = ?', 
            [id]
        );
        
        if (gastoExistente.length === 0) {
            return res.status(404).json({ message: 'Gasto no encontrado' });
        }
        
        // Eliminar el gasto
        await pool.execute('DELETE FROM gastos WHERE id = ?', [id]);
        
        console.log(`✅ Gasto eliminado: ID ${id}`);
        res.json({ message: 'Gasto eliminado exitosamente' });
        
    } catch (error) {
        console.error('❌ Error eliminando gasto:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER CATEGORÍAS DE GASTOS
exports.getCategoriasGastos = async (req, res) => {
    try {
        const [categorias] = await pool.execute(
            'SELECT * FROM categorias WHERE tipo = "GASTO" AND activo = 1 ORDER BY nombre'
        );
        
        console.log(`✅ Obtenidas ${categorias.length} categorías de gastos`);
        res.json(categorias);
        
    } catch (error) {
        console.error('❌ Error obteniendo categorías de gastos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER ESTADÍSTICAS BÁSICAS DE GASTOS
exports.getEstadisticasGastos = async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_gastos,
                SUM(total) as total_gastado,
                AVG(total) as promedio_gasto,
                COUNT(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN 1 END) as gastos_mes_actual,
                SUM(CASE WHEN MONTH(fecha) = MONTH(CURDATE()) AND YEAR(fecha) = YEAR(CURDATE()) THEN total ELSE 0 END) as total_mes_actual
            FROM gastos
            WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
        `);
        
        const [categoriaStats] = await pool.execute(`
            SELECT 
                cat.nombre,
                COUNT(g.id) as cantidad,
                SUM(g.total) as total
            FROM gastos g
            JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.fecha >= DATE_SUB(CURDATE(), INTERVAL 1 YEAR)
            GROUP BY cat.id, cat.nombre
            ORDER BY total DESC
            LIMIT 5
        `);
        
        const estadisticas = {
            ...stats[0],
            total_gastado: Math.round(stats[0].total_gastado || 0),
            promedio_gasto: Math.round(stats[0].promedio_gasto || 0),
            total_mes_actual: Math.round(stats[0].total_mes_actual || 0),
            por_categoria: categoriaStats
        };
        
        console.log(`✅ Estadísticas de gastos obtenidas`);
        res.json(estadisticas);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas de gastos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};