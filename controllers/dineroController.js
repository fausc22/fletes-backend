// controllers/dineroController.js - SISTEMA DE FLETES
const pool = require('./dbPromise');

// ✅ CATEGORÍAS PREDEFINIDAS
const CATEGORIAS_GASTOS = [
    { id: 'COMBUSTIBLE', nombre: 'Combustible' },
    { id: 'MANTENIMIENTO', nombre: 'Mantenimiento' },
    { id: 'PEAJES', nombre: 'Peajes' },
    { id: 'NEUMÁTICOS', nombre: 'Neumáticos' },
    { id: 'SEGURO', nombre: 'Seguro' },
    { id: 'DOCUMENTACIÓN', nombre: 'Documentación' },
    { id: 'COMIDA/VIÁTICOS', nombre: 'Comida/Viáticos' },
    { id: 'MULTAS', nombre: 'Multas' },
    { id: 'OTROS_GASTO', nombre: 'Otros' }
];

const CATEGORIAS_INGRESOS = [
    { id: 'FLETE', nombre: 'Flete' },
    { id: 'ADICIONALES', nombre: 'Adicionales' },
    { id: 'OTROS_INGRESO', nombre: 'Otros' }
];

// ===== GESTIÓN DE GASTOS =====

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
        if (!fecha || !nombre || !total) {
            return res.status(400).json({ 
                message: 'Campos requeridos: fecha, nombre, total' 
            });
        }
        
        // Validar monto
        if (total <= 0) {
            return res.status(400).json({ 
                message: 'El monto debe ser mayor a 0' 
            });
        }

        if (total > 500000) {
            return res.status(400).json({ 
                message: 'El monto no puede superar $500,000' 
            });
        }
        
        // Validar fecha no futura
        const fechaGasto = new Date(fecha);
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        
        if (fechaGasto > hoy) {
            return res.status(400).json({ 
                message: 'La fecha no puede ser futura' 
            });
        }
        
        // Validar fecha no muy antigua (1 año)
        const unAñoAtras = new Date();
        unAñoAtras.setFullYear(unAñoAtras.getFullYear() - 1);
        
        if (fechaGasto < unAñoAtras) {
            return res.status(400).json({ 
                message: 'La fecha no puede ser anterior a un año' 
            });
        }
        
        // Verificar que el camión existe si se especifica
        if (camion_id) {
            const [camionExists] = await pool.execute(
                'SELECT id FROM camiones WHERE id = ? AND activo = 1', 
                [camion_id]
            );
            
            if (camionExists.length === 0) {
                return res.status(404).json({ message: 'Camión no encontrado o inactivo' });
            }
        }
        
        // Verificar categoría
        if (categoria_id) {
            const [categoriaExists] = await pool.execute(
                'SELECT id FROM categorias WHERE id = ? AND tipo = "GASTO" AND activo = 1', 
                [categoria_id]
            );
            
            if (categoriaExists.length === 0) {
                return res.status(404).json({ message: 'Categoría no encontrada' });
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
            parseFloat(total),
            observaciones?.trim() || null,
            camion_id || null,
            categoria_id || null,
            viaje_id || null,
            kilometraje_actual || null
        ]);
        
        // Obtener el gasto creado con información completa
        const [nuevoGasto] = await pool.execute(`
            SELECT g.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM gastos g
            LEFT JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.id = ?
        `, [result.insertId]);
        
        console.log(`✅ Gasto creado: ID ${result.insertId} - $${total}`);
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

// ✅ OBTENER GASTOS CON FILTROS
exports.getGastos = async (req, res) => {
    try {
        const { 
            limit = 20, 
            offset = 0, 
            camion_id, 
            categoria_id, 
            desde, 
            hasta,
            mes,
            año
        } = req.query;
        
        let whereConditions = ['1=1'];
        let params = [];
        
        // Filtros
        if (camion_id) {
            whereConditions.push('g.camion_id = ?');
            params.push(camion_id);
        }
        
        if (categoria_id) {
            whereConditions.push('g.categoria_id = ?');
            params.push(categoria_id);
        }
        
        if (desde) {
            whereConditions.push('g.fecha >= ?');
            params.push(desde);
        }
        
        if (hasta) {
            whereConditions.push('g.fecha <= ?');
            params.push(hasta);
        }
        
        if (mes && año) {
            whereConditions.push('YEAR(g.fecha) = ? AND MONTH(g.fecha) = ?');
            params.push(año, mes);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const query = `
            SELECT g.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM gastos g
            LEFT JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE ${whereClause}
            ORDER BY g.fecha DESC, g.fecha_creacion DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const [gastos] = await pool.execute(query, params);
        
        // Obtener total para paginación
        const countQuery = `
            SELECT COUNT(*) as total
            FROM gastos g
            WHERE ${whereClause}
        `;
        
        const [totalResult] = await pool.execute(countQuery, params.slice(0, -2));
        
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

// ===== GESTIÓN DE INGRESOS =====

// ✅ CREAR NUEVO INGRESO
exports.createIngreso = async (req, res) => {
    try {
        const { 
            fecha, 
            nombre, 
            descripcion, 
            total, 
            observaciones, 
            camion_id, 
            categoria_id,
            viaje_id 
        } = req.body;
        
        // Validaciones básicas (mismas que gastos)
        if (!fecha || !nombre || !total) {
            return res.status(400).json({ 
                message: 'Campos requeridos: fecha, nombre, total' 
            });
        }
        
        if (total <= 0) {
            return res.status(400).json({ 
                message: 'El monto debe ser mayor a 0' 
            });
        }

        if (total > 1000000) { // Límite mayor para ingresos
            return res.status(400).json({ 
                message: 'El monto no puede superar $1,000,000' 
            });
        }
        
        // Validar fecha
        const fechaIngreso = new Date(fecha);
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);
        
        if (fechaIngreso > hoy) {
            return res.status(400).json({ 
                message: 'La fecha no puede ser futura' 
            });
        }
        
        const unAñoAtras = new Date();
        unAñoAtras.setFullYear(unAñoAtras.getFullYear() - 1);
        
        if (fechaIngreso < unAñoAtras) {
            return res.status(400).json({ 
                message: 'La fecha no puede ser anterior a un año' 
            });
        }
        
        // Verificar camión si se especifica
        if (camion_id) {
            const [camionExists] = await pool.execute(
                'SELECT id FROM camiones WHERE id = ? AND activo = 1', 
                [camion_id]
            );
            
            if (camionExists.length === 0) {
                return res.status(404).json({ message: 'Camión no encontrado o inactivo' });
            }
        }
        
        // Verificar categoría
        if (categoria_id) {
            const [categoriaExists] = await pool.execute(
                'SELECT id FROM categorias WHERE id = ? AND tipo = "INGRESO" AND activo = 1', 
                [categoria_id]
            );
            
            if (categoriaExists.length === 0) {
                return res.status(404).json({ message: 'Categoría no encontrada' });
            }
        }
        
        const query = `
            INSERT INTO ingresos 
            (fecha, nombre, descripcion, total, observaciones, camion_id, categoria_id, viaje_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.execute(query, [
            fecha,
            nombre.trim(),
            descripcion?.trim() || null,
            parseFloat(total),
            observaciones?.trim() || null,
            camion_id || null,
            categoria_id || null,
            viaje_id || null
        ]);
        
        // Obtener el ingreso creado con información completa
        const [nuevoIngreso] = await pool.execute(`
            SELECT i.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM ingresos i
            LEFT JOIN camiones c ON i.camion_id = c.id
            LEFT JOIN categorias cat ON i.categoria_id = cat.id
            WHERE i.id = ?
        `, [result.insertId]);
        
        console.log(`✅ Ingreso creado: ID ${result.insertId} - $${total}`);
        res.status(201).json({
            message: 'Ingreso registrado exitosamente',
            ingreso: nuevoIngreso[0]
        });
        
    } catch (error) {
        console.error('❌ Error creando ingreso:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER INGRESOS CON FILTROS
exports.getIngresos = async (req, res) => {
    try {
        const { 
            limit = 20, 
            offset = 0, 
            camion_id, 
            categoria_id, 
            desde, 
            hasta,
            mes,
            año
        } = req.query;
        
        let whereConditions = ['1=1'];
        let params = [];
        
        // Aplicar mismos filtros que gastos
        if (camion_id) {
            whereConditions.push('i.camion_id = ?');
            params.push(camion_id);
        }
        
        if (categoria_id) {
            whereConditions.push('i.categoria_id = ?');
            params.push(categoria_id);
        }
        
        if (desde) {
            whereConditions.push('i.fecha >= ?');
            params.push(desde);
        }
        
        if (hasta) {
            whereConditions.push('i.fecha <= ?');
            params.push(hasta);
        }
        
        if (mes && año) {
            whereConditions.push('YEAR(i.fecha) = ? AND MONTH(i.fecha) = ?');
            params.push(año, mes);
        }
        
        const whereClause = whereConditions.join(' AND ');
        
        const query = `
            SELECT i.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM ingresos i
            LEFT JOIN camiones c ON i.camion_id = c.id
            LEFT JOIN categorias cat ON i.categoria_id = cat.id
            WHERE ${whereClause}
            ORDER BY i.fecha DESC, i.fecha_creacion DESC
            LIMIT ? OFFSET ?
        `;
        
        params.push(parseInt(limit), parseInt(offset));
        
        const [ingresos] = await pool.execute(query, params);
        
        // Obtener total para paginación
        const countQuery = `
            SELECT COUNT(*) as total
            FROM ingresos i
            WHERE ${whereClause}
        `;
        
        const [totalResult] = await pool.execute(countQuery, params.slice(0, -2));
        
        console.log(`✅ Obtenidos ${ingresos.length} ingresos`);
        res.json({
            ingresos,
            total: totalResult[0].total,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo ingresos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ===== RESÚMENES Y ESTADÍSTICAS =====

// ✅ OBTENER RESUMEN MENSUAL
exports.getResumenMensual = async (req, res) => {
    try {
        const { año, mes } = req.query;
        
        const añoActual = año || new Date().getFullYear();
        const mesActual = mes || (new Date().getMonth() + 1);
        
        // Obtener resumen de ingresos
        const [ingresos] = await pool.execute(`
            SELECT 
                COALESCE(SUM(total), 0) as total_ingresos,
                COUNT(*) as cantidad_ingresos,
                cat.nombre as categoria
            FROM ingresos i
            LEFT JOIN categorias cat ON i.categoria_id = cat.id
            WHERE YEAR(i.fecha) = ? AND MONTH(i.fecha) = ?
            GROUP BY cat.nombre
        `, [añoActual, mesActual]);
        
        // Obtener resumen de gastos
        const [gastos] = await pool.execute(`
            SELECT 
                COALESCE(SUM(total), 0) as total_gastos,
                COUNT(*) as cantidad_gastos,
                cat.nombre as categoria
            FROM gastos g
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE YEAR(g.fecha) = ? AND MONTH(g.fecha) = ?
            GROUP BY cat.nombre
        `, [añoActual, mesActual]);
        
        // Totales generales
        const [totales] = await pool.execute(`
            SELECT 
                (SELECT COALESCE(SUM(total), 0) FROM ingresos WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as total_ingresos,
                (SELECT COALESCE(SUM(total), 0) FROM gastos WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as total_gastos,
                (SELECT COUNT(*) FROM ingresos WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as cantidad_ingresos,
                (SELECT COUNT(*) FROM gastos WHERE YEAR(fecha) = ? AND MONTH(fecha) = ?) as cantidad_gastos
        `, [añoActual, mesActual, añoActual, mesActual, añoActual, mesActual, añoActual, mesActual]);
        
        const resumen = {
            año: parseInt(añoActual),
            mes: parseInt(mesActual),
            total_ingresos: totales[0].total_ingresos,
            total_gastos: totales[0].total_gastos,
            balance: totales[0].total_ingresos - totales[0].total_gastos,
            cantidad_ingresos: totales[0].cantidad_ingresos,
            cantidad_gastos: totales[0].cantidad_gastos,
            ingresos_por_categoria: ingresos,
            gastos_por_categoria: gastos
        };
        
        console.log(`✅ Resumen mensual obtenido: ${añoActual}/${mesActual}`);
        res.json(resumen);
        
    } catch (error) {
        console.error('❌ Error obteniendo resumen mensual:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER CATEGORÍAS
exports.getCategorias = async (req, res) => {
    try {
        const { tipo } = req.query;
        
        let query = 'SELECT * FROM categorias WHERE activo = 1';
        let params = [];
        
        if (tipo && (tipo === 'INGRESO' || tipo === 'GASTO')) {
            query += ' AND tipo = ?';
            params.push(tipo);
        }
        
        query += ' ORDER BY nombre';
        
        const [categorias] = await pool.execute(query, params);
        
        console.log(`✅ Obtenidas ${categorias.length} categorías`);
        res.json(categorias);
        
    } catch (error) {
        console.error('❌ Error obteniendo categorías:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER MOVIMIENTOS UNIFICADOS
exports.getMovimientos = async (req, res) => {
    try {
        const { limit = 20, offset = 0, camion_id, desde, hasta } = req.query;
        
        let whereConditions = [];
        let params = [];
        
        if (camion_id) {
            whereConditions.push('camion_id = ?');
            params.push(camion_id);
        }
        
        if (desde) {
            whereConditions.push('fecha >= ?');
            params.push(desde);
        }
        
        if (hasta) {
            whereConditions.push('fecha <= ?');
            params.push(hasta);
        }
        
        const whereClause = whereConditions.length > 0 ? 'WHERE ' + whereConditions.join(' AND ') : '';
        
        const query = `
            (SELECT 
                i.id, i.fecha, i.nombre, i.descripcion, i.total, 
                'INGRESO' as tipo, i.camion_id, i.categoria_id,
                c.patente, c.marca, c.modelo,
                cat.nombre as categoria_nombre
            FROM ingresos i
            LEFT JOIN camiones c ON i.camion_id = c.id
            LEFT JOIN categorias cat ON i.categoria_id = cat.id
            ${whereClause})
            
            UNION ALL
            
            (SELECT 
                g.id, g.fecha, g.nombre, g.descripcion, g.total,
                'GASTO' as tipo, g.camion_id, g.categoria_id,
                c.patente, c.marca, c.modelo,
                cat.nombre as categoria_nombre
            FROM gastos g
            LEFT JOIN camiones c ON g.camion_id = c.id
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            ${whereClause})
            
            ORDER BY fecha DESC, id DESC
            LIMIT ? OFFSET ?
        `;
        
        const queryParams = [...params, ...params, parseInt(limit), parseInt(offset)];
        const [movimientos] = await pool.execute(query, queryParams);
        
        console.log(`✅ Obtenidos ${movimientos.length} movimientos`);
        res.json({
            movimientos,
            limit: parseInt(limit),
            offset: parseInt(offset)
        });
        
    } catch (error) {
        console.error('❌ Error obteniendo movimientos:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ACTUALIZAR GASTO
exports.updateGasto = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, nombre, descripcion, total, observaciones, camion_id, categoria_id } = req.body;
        
        // Verificar que el gasto existe
        const [gastoExistente] = await pool.execute(
            'SELECT * FROM gastos WHERE id = ?', 
            [id]
        );
        
        if (gastoExistente.length === 0) {
            return res.status(404).json({ message: 'Gasto no encontrado' });
        }
        
        // Validar monto si se proporciona
        if (total !== undefined && (total <= 0 || total > 500000)) {
            return res.status(400).json({ 
                message: 'El monto debe estar entre $1 y $500,000' 
            });
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
            campos.push('total = ?');
            valores.push(parseFloat(total));
        }
        if (observaciones !== undefined) {
            campos.push('observaciones = ?');
            valores.push(observaciones?.trim() || null);
        }
        if (camion_id !== undefined) {
            campos.push('camion_id = ?');
            valores.push(camion_id || null);
        }
        if (categoria_id !== undefined) {
            campos.push('categoria_id = ?');
            valores.push(categoria_id || null);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE gastos SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener el gasto actualizado
        const [gastoActualizado] = await pool.execute(`
            SELECT g.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM gastos g
            LEFT JOIN camiones c ON g.camion_id = c.id
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

// ✅ ACTUALIZAR INGRESO
exports.updateIngreso = async (req, res) => {
    try {
        const { id } = req.params;
        const { fecha, nombre, descripcion, total, observaciones, camion_id, categoria_id } = req.body;
        
        // Verificar que el ingreso existe
        const [ingresoExistente] = await pool.execute(
            'SELECT * FROM ingresos WHERE id = ?', 
            [id]
        );
        
        if (ingresoExistente.length === 0) {
            return res.status(404).json({ message: 'Ingreso no encontrado' });
        }
        
        // Validar monto si se proporciona
        if (total !== undefined && (total <= 0 || total > 1000000)) {
            return res.status(400).json({ 
                message: 'El monto debe estar entre $1 y $1,000,000' 
            });
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
            campos.push('total = ?');
            valores.push(parseFloat(total));
        }
        if (observaciones !== undefined) {
            campos.push('observaciones = ?');
            valores.push(observaciones?.trim() || null);
        }
        if (camion_id !== undefined) {
            campos.push('camion_id = ?');
            valores.push(camion_id || null);
        }
        if (categoria_id !== undefined) {
            campos.push('categoria_id = ?');
            valores.push(categoria_id || null);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE ingresos SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener el ingreso actualizado
        const [ingresoActualizado] = await pool.execute(`
            SELECT i.*, 
                   c.patente, c.marca, c.modelo,
                   cat.nombre as categoria_nombre
            FROM ingresos i
            LEFT JOIN camiones c ON i.camion_id = c.id
            LEFT JOIN categorias cat ON i.categoria_id = cat.id
            WHERE i.id = ?
        `, [id]);
        
        console.log(`✅ Ingreso actualizado: ID ${id}`);
        res.json({
            message: 'Ingreso actualizado exitosamente',
            ingreso: ingresoActualizado[0]
        });
        
    } catch (error) {
        console.error('❌ Error actualizando ingreso:', error);
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

// ✅ ELIMINAR INGRESO
exports.deleteIngreso = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el ingreso existe
        const [ingresoExistente] = await pool.execute(
            'SELECT * FROM ingresos WHERE id = ?', 
            [id]
        );
        
        if (ingresoExistente.length === 0) {
            return res.status(404).json({ message: 'Ingreso no encontrado' });
        }
        
        // Eliminar el ingreso
        await pool.execute('DELETE FROM ingresos WHERE id = ?', [id]);
        
        console.log(`✅ Ingreso eliminado: ID ${id}`);
        res.json({ message: 'Ingreso eliminado exitosamente' });
        
    } catch (error) {
        console.error('❌ Error eliminando ingreso:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER ESTADÍSTICAS GENERALES
exports.getEstadisticasGenerales = async (req, res) => {
    try {
        const [estadisticas] = await pool.execute(`
            SELECT 
                -- Totales del mes actual
                (SELECT COALESCE(SUM(total), 0) FROM ingresos WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())) as ingresos_mes_actual,
                (SELECT COALESCE(SUM(total), 0) FROM gastos WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())) as gastos_mes_actual,
                
                -- Totales del año actual
                (SELECT COALESCE(SUM(total), 0) FROM ingresos WHERE YEAR(fecha) = YEAR(CURDATE())) as ingresos_año_actual,
                (SELECT COALESCE(SUM(total), 0) FROM gastos WHERE YEAR(fecha) = YEAR(CURDATE())) as gastos_año_actual,
                
                -- Promedios mensuales
                (SELECT COALESCE(AVG(total), 0) FROM ingresos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)) as promedio_ingresos_6_meses,
                (SELECT COALESCE(AVG(total), 0) FROM gastos WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)) as promedio_gastos_6_meses,
                
                -- Cantidades
                (SELECT COUNT(*) FROM ingresos WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())) as cantidad_ingresos_mes,
                (SELECT COUNT(*) FROM gastos WHERE YEAR(fecha) = YEAR(CURDATE()) AND MONTH(fecha) = MONTH(CURDATE())) as cantidad_gastos_mes
        `);
        
        // Obtener top categorías de gastos
        const [topCategorias] = await pool.execute(`
            SELECT 
                cat.nombre,
                SUM(g.total) as total,
                COUNT(*) as cantidad
            FROM gastos g
            LEFT JOIN categorias cat ON g.categoria_id = cat.id
            WHERE g.fecha >= DATE_SUB(CURDATE(), INTERVAL 3 MONTH)
            GROUP BY cat.nombre
            ORDER BY total DESC
            LIMIT 5
        `);
        
        const resultado = {
            ...estadisticas[0],
            balance_mes_actual: estadisticas[0].ingresos_mes_actual - estadisticas[0].gastos_mes_actual,
            balance_año_actual: estadisticas[0].ingresos_año_actual - estadisticas[0].gastos_año_actual,
            top_categorias_gastos: topCategorias
        };
        
        console.log(`✅ Estadísticas generales obtenidas`);
        res.json(resultado);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas generales:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};