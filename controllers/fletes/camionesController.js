// controllers/camionesController.js - SISTEMA DE FLETES
const pool = require('./dbPromise');

// ✅ OBTENER TODOS LOS CAMIONES
exports.getCamiones = async (req, res) => {
    try {
        const { activo } = req.query;
        
        let query = `
            SELECT 
                c.*,
                (SELECT COUNT(*) FROM viajes v WHERE v.camion_id = c.id AND v.estado = 'EN_CURSO') as viajes_activos,
                (SELECT MAX(fecha) FROM mantenimientos m WHERE m.camion_id = c.id) as ultimo_mantenimiento,
                (SELECT COUNT(*) FROM mantenimientos m WHERE m.camion_id = c.id) as total_mantenimientos
            FROM camiones c 
        `;
        
        const params = [];
        
        // Filtrar por estado activo si se especifica
        if (activo !== undefined) {
            query += ' WHERE c.activo = ?';
            params.push(activo === 'true' ? 1 : 0);
        }
        
        query += ' ORDER BY c.fecha_creacion DESC';
        
        const [camiones] = await pool.execute(query, params);
        
        // Formatear respuesta
        const camionesFormateados = camiones.map(camion => ({
            ...camion,
            tiene_viaje_activo: camion.viajes_activos > 0,
            ultimo_mantenimiento: camion.ultimo_mantenimiento || null,
            total_mantenimientos: camion.total_mantenimientos || 0,
            estado: camion.viajes_activos > 0 ? 'EN_VIAJE' : 'DISPONIBLE'
        }));
        
        console.log(`✅ Obtenidos ${camionesFormateados.length} camiones`);
        res.json(camionesFormateados);
        
    } catch (error) {
        console.error('❌ Error obteniendo camiones:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ OBTENER UN CAMIÓN POR ID
exports.getCamionById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                c.*,
                (SELECT COUNT(*) FROM viajes v WHERE v.camion_id = c.id AND v.estado = 'EN_CURSO') as viajes_activos,
                (SELECT MAX(fecha) FROM mantenimientos m WHERE m.camion_id = c.id) as ultimo_mantenimiento,
                (SELECT COUNT(*) FROM mantenimientos m WHERE m.camion_id = c.id) as total_mantenimientos,
                (SELECT COUNT(*) FROM viajes v WHERE v.camion_id = c.id AND v.estado = 'COMPLETADO') as viajes_completados
            FROM camiones c 
            WHERE c.id = ?
        `;
        
        const [camiones] = await pool.execute(query, [id]);
        
        if (camiones.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        const camion = {
            ...camiones[0],
            tiene_viaje_activo: camiones[0].viajes_activos > 0,
            ultimo_mantenimiento: camiones[0].ultimo_mantenimiento || null,
            total_mantenimientos: camiones[0].total_mantenimientos || 0,
            viajes_completados: camiones[0].viajes_completados || 0,
            estado: camiones[0].viajes_activos > 0 ? 'EN_VIAJE' : 'DISPONIBLE'
        };
        
        console.log(`✅ Obtenido camión ID ${id}`);
        res.json(camion);
        
    } catch (error) {
        console.error('❌ Error obteniendo camión por ID:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ CREAR NUEVO CAMIÓN
exports.createCamion = async (req, res) => {
    try {
        const { marca, modelo, año, kilometros = 0, patente, ultimo_service } = req.body;
        
        // Validaciones básicas
        if (!marca || !modelo || !año || !patente) {
            return res.status(400).json({ 
                message: 'Campos requeridos: marca, modelo, año, patente' 
            });
        }
        
        // Validar año
        const añoActual = new Date().getFullYear();
        if (año < 1990 || año > añoActual + 1) {
            return res.status(400).json({ 
                message: 'Año debe estar entre 1990 y ' + (añoActual + 1)
            });
        }
        
        // Validar kilómetros
        if (kilometros < 0) {
            return res.status(400).json({ 
                message: 'Los kilómetros no pueden ser negativos' 
            });
        }
        
        // Verificar que la patente no exista
        const [existente] = await pool.execute(
            'SELECT id FROM camiones WHERE patente = ?', 
            [patente]
        );
        
        if (existente.length > 0) {
            return res.status(400).json({ 
                message: 'Ya existe un camión con esa patente' 
            });
        }
        
        const query = `
            INSERT INTO camiones (marca, modelo, año, kilometros, patente, ultimo_service, activo)
            VALUES (?, ?, ?, ?, ?, ?, 1)
        `;
        
        const [result] = await pool.execute(query, [
            marca.trim(),
            modelo.trim(), 
            año,
            kilometros,
            patente.trim().toUpperCase(),
            ultimo_service || null
        ]);
        
        // Obtener el camión creado
        const [nuevoCamion] = await pool.execute(
            'SELECT * FROM camiones WHERE id = ?', 
            [result.insertId]
        );
        
        console.log(`✅ Camión creado: ID ${result.insertId} - ${patente}`);
        res.status(201).json({
            message: 'Camión creado exitosamente',
            camion: {
                ...nuevoCamion[0],
                tiene_viaje_activo: false,
                estado: 'DISPONIBLE',
                total_mantenimientos: 0
            }
        });
        
    } catch (error) {
        console.error('❌ Error creando camión:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'La patente ya existe' });
        }
        
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ACTUALIZAR CAMIÓN
exports.updateCamion = async (req, res) => {
    try {
        const { id } = req.params;
        const { marca, modelo, año, kilometros, patente, ultimo_service, activo } = req.body;
        
        // Verificar que el camión existe
        const [camionExistente] = await pool.execute(
            'SELECT * FROM camiones WHERE id = ?', 
            [id]
        );
        
        if (camionExistente.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        // Verificar si el camión tiene viajes activos y se intenta desactivar
        if (activo === false || activo === 0) {
            const [viajesActivos] = await pool.execute(
                'SELECT id FROM viajes WHERE camion_id = ? AND estado = "EN_CURSO"', 
                [id]
            );
            
            if (viajesActivos.length > 0) {
                return res.status(400).json({ 
                    message: 'No se puede desactivar un camión con viajes en curso' 
                });
            }
        }
        
        // Verificar patente duplicada (excluyendo el camión actual)
        if (patente && patente !== camionExistente[0].patente) {
            const [duplicado] = await pool.execute(
                'SELECT id FROM camiones WHERE patente = ? AND id != ?', 
                [patente, id]
            );
            
            if (duplicado.length > 0) {
                return res.status(400).json({ 
                    message: 'Ya existe un camión con esa patente' 
                });
            }
        }
        
        // Construir query dinámico
        const campos = [];
        const valores = [];
        
        if (marca !== undefined) {
            campos.push('marca = ?');
            valores.push(marca.trim());
        }
        if (modelo !== undefined) {
            campos.push('modelo = ?');
            valores.push(modelo.trim());
        }
        if (año !== undefined) {
            campos.push('año = ?');
            valores.push(año);
        }
        if (kilometros !== undefined) {
            if (kilometros < camionExistente[0].kilometros) {
                return res.status(400).json({ 
                    message: 'Los kilómetros no pueden ser menores a los actuales' 
                });
            }
            campos.push('kilometros = ?');
            valores.push(kilometros);
        }
        if (patente !== undefined) {
            campos.push('patente = ?');
            valores.push(patente.trim().toUpperCase());
        }
        if (ultimo_service !== undefined) {
            campos.push('ultimo_service = ?');
            valores.push(ultimo_service);
        }
        if (activo !== undefined) {
            campos.push('activo = ?');
            valores.push(activo ? 1 : 0);
        }
        
        if (campos.length === 0) {
            return res.status(400).json({ message: 'No hay campos para actualizar' });
        }
        
        valores.push(id);
        
        const query = `UPDATE camiones SET ${campos.join(', ')} WHERE id = ?`;
        await pool.execute(query, valores);
        
        // Obtener el camión actualizado
        const [camionActualizado] = await pool.execute(
            `SELECT c.*,
                (SELECT COUNT(*) FROM viajes v WHERE v.camion_id = c.id AND v.estado = 'EN_CURSO') as viajes_activos
             FROM camiones c WHERE c.id = ?`, 
            [id]
        );
        
        console.log(`✅ Camión actualizado: ID ${id}`);
        res.json({
            message: 'Camión actualizado exitosamente',
            camion: {
                ...camionActualizado[0],
                tiene_viaje_activo: camionActualizado[0].viajes_activos > 0,
                estado: camionActualizado[0].viajes_activos > 0 ? 'EN_VIAJE' : 'DISPONIBLE'
            }
        });
        
    } catch (error) {
        console.error('❌ Error actualizando camión:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// ✅ ELIMINAR CAMIÓN (SOFT DELETE)
exports.deleteCamion = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar que el camión existe
        const [camionExistente] = await pool.execute(
            'SELECT * FROM camiones WHERE id = ?', 
            [id]
        );
        
        if (camionExistente.length === 0) {
            return res.status(404).json({ message: 'Camión no encontrado' });
        }
        
        // Verificar si tiene viajes activos
        const [viajesActivos] = await pool.execute(
            'SELECT id FROM viajes WHERE camion_id = ? AND estado = "EN_CURSO"', 
            [id]
        );
        
        if (viajesActivos.length > 0) {
            return res.status(400).json({ 
                message: 'No se puede eliminar un camión con viajes en curso' 
            });
        }
        
        // Verificar si tiene viajes históricos
        const [viajesHistoricos] = await pool.execute(
            'SELECT id FROM viajes WHERE camion_id = ?', 
            [id]
        );
        
        if (viajesHistoricos.length > 0) {
            // Soft delete si tiene historial
            await pool.execute(
                'UPDATE camiones SET activo = 0 WHERE id = ?', 
                [id]
            );
            
            console.log(`✅ Camión desactivado (soft delete): ID ${id}`);
            res.json({ 
                message: 'Camión desactivado exitosamente (manteniendo historial)',
                tipo: 'soft_delete'
            });
        } else {
            // Hard delete si no tiene historial
            await pool.execute('DELETE FROM camiones WHERE id = ?', [id]);
            
            console.log(`✅ Camión eliminado (hard delete): ID ${id}`);
            res.json({ 
                message: 'Camión eliminado exitosamente',
                tipo: 'hard_delete'
            });
        }
        
    } catch (error) {
        console.error('❌ Error eliminando camión:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


// ✅ OBTENER ESTADÍSTICAS BÁSICAS DE CAMIONES
exports.getEstadisticasCamiones = async (req, res) => {
    try {
        const [stats] = await pool.execute(`
            SELECT 
                COUNT(*) as total_camiones,
                COUNT(CASE WHEN activo = 1 THEN 1 END) as camiones_activos,
                COUNT(CASE WHEN activo = 0 THEN 1 END) as camiones_inactivos,
                AVG(kilometros) as promedio_kilometros,
                COUNT(CASE WHEN YEAR(ultimo_service) = YEAR(CURDATE()) THEN 1 END) as servicios_este_año
            FROM camiones
        `);
        
        const [viajesStats] = await pool.execute(`
            SELECT 
                COUNT(CASE WHEN v.estado = 'EN_CURSO' THEN 1 END) as camiones_en_viaje
            FROM camiones c
            LEFT JOIN viajes v ON c.id = v.camion_id AND v.estado = 'EN_CURSO'
        `);
        
        const estadisticas = {
            ...stats[0],
            camiones_en_viaje: viajesStats[0].camiones_en_viaje || 0,
            camiones_disponibles: (stats[0].camiones_activos || 0) - (viajesStats[0].camiones_en_viaje || 0),
            promedio_kilometros: Math.round(stats[0].promedio_kilometros || 0)
        };
        
        console.log(`✅ Estadísticas de camiones obtenidas`);
        res.json(estadisticas);
        
    } catch (error) {
        console.error('❌ Error obteniendo estadísticas:', error);
        res.status(500).json({ 
            message: 'Error interno del servidor',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};