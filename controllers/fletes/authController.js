const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
require('dotenv').config();

// ✅ CONFIGURACIÓN DE BASE DE DATOS PARA FLETES
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE || 'sistema_fletes',
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: 'utf8mb4',
    timezone: 'local'
});

// ✅ CONFIGURACIÓN PARA TOKENS - PWA COMPATIBLE
const getTokenExpiration = () => {
    const isDevelopment = process.env.NODE_ENV === 'development';
    return {
        accessToken: isDevelopment ? '2h' : '1h',
        refreshToken: '7d' // 7 días para PWA
    };
};

// ✅ Validar que los secrets estén configurados correctamente
const validateSecrets = () => {
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
        console.error('❌ JWT_SECRET debe tener al menos 32 caracteres');
        process.exit(1);
    }
    if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
        console.error('❌ JWT_REFRESH_SECRET debe tener al menos 32 caracteres');
        process.exit(1);
    }
};

validateSecrets();

// ✅ Función helper para crear tokens
const createTokens = (usuario, remember = false) => {
    const { accessToken: accessExp, refreshToken: refreshExp } = getTokenExpiration();

    const tokenPayload = { 
        id: usuario.id, 
        usuario: usuario.usuario,
        iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: accessExp });
    
    // ✅ CREAR refresh token SIEMPRE que remember sea true
    let refreshToken = null;
    if (remember) {
        refreshToken = jwt.sign(
            { 
                id: usuario.id, 
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000) 
            }, 
            process.env.JWT_REFRESH_SECRET, 
            { expiresIn: refreshExp }
        );
    }

    return { accessToken, refreshToken, accessExp, refreshExp };
};

// ✅ Función para logging de auditoría básica
const logAuth = (action, usuario, status, details = '') => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] AUTH: ${action} - Usuario: ${usuario || 'UNKNOWN'} - Status: ${status} - ${details}`);
};

// ✅ LOGIN ADAPTADO PARA TABLA USUARIOS SIMPLIFICADA
exports.login = async (req, res) => {
    const { username, password, remember = false } = req.body;

    // ✅ Convertir a boolean si viene como string
    const rememberBool = remember === true || remember === 'true';

    if (!username || !password) {
        logAuth('LOGIN_FAILED', username, 'FALLIDO', 'Datos incompletos - usuario y/o contraseña faltante');
        return res.status(400).json({ message: 'Usuario y contraseña son obligatorios' });
    }

    try {
        // ✅ Buscar usuario en la tabla simplificada
        const [usuarios] = await pool.execute(
            'SELECT * FROM usuarios WHERE usuario = ?', 
            [username]
        );

        if (usuarios.length === 0) {
            logAuth('LOGIN_FAILED', username, 'FALLIDO', 'Usuario no encontrado');
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        const usuario = usuarios[0];

        // ✅ Verificar contraseña
        const validPassword = await bcrypt.compare(password, usuario.password);
        if (!validPassword) {
            logAuth('LOGIN_FAILED', username, 'FALLIDO', 'Contraseña incorrecta');
            return res.status(401).json({ message: 'Usuario o contraseña incorrectos' });
        }

        // ✅ Crear tokens
        const { accessToken, refreshToken, accessExp, refreshExp } = createTokens(usuario, rememberBool);

        // ✅ Log de login exitoso
        logAuth('LOGIN', username, 'EXITOSO', 
            `Remember: ${rememberBool ? 'Sí (7d)' : 'No'}, AccessTokenExp: ${accessExp}, RefreshToken: ${refreshToken ? 'CREADO' : 'NO CREADO'}`
        );

        console.log(`✅ Login PWA exitoso para ${usuario.usuario} - Remember: ${rememberBool} - AccessToken expira en: ${accessExp} - RefreshToken: ${refreshToken ? `CREADO (${refreshExp})` : 'NO CREADO'}`);

        // ✅ RESPUESTA PWA COMPATIBLE: Incluir refresh token en la respuesta
        res.json({ 
            token: accessToken,
            refreshToken: refreshToken,
            expiresIn: accessExp,
            refreshExpiresIn: refreshToken ? refreshExp : null,
            hasRefreshToken: !!refreshToken,
            usuario: {
                id: usuario.id,
                usuario: usuario.usuario
            }
        });

    } catch (error) {
        console.error('❌ Error en login:', error);
        logAuth('LOGIN_FAILED', username, 'FALLIDO', `Error interno: ${error.message}`);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// ✅ REFRESH TOKEN ADAPTADO PARA TABLA USUARIOS
exports.refreshToken = async (req, res) => {
    const refreshToken = req.body.refreshToken || req.headers['x-refresh-token'];
    
    console.log('🔄 PWA: Intentando renovar token...');
    console.log('🔑 Refresh token recibido:', refreshToken ? 'SÍ (localStorage)' : 'NO');
    
    if (!refreshToken) {
        console.log('❌ No se encontró refresh token en body ni headers');
        return res.status(401).json({ 
            message: 'No autorizado - Refresh token requerido',
            code: 'NO_REFRESH_TOKEN'
        });
    }

    try {
        // ✅ Verificar refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
            console.log('✅ PWA: Refresh token verificado correctamente - Expira en:', new Date(decoded.exp * 1000));
        } catch (jwtError) {
            console.log('❌ Error verificando refresh token:', jwtError.message);
            
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ 
                    message: 'Refresh token expirado - Por favor inicia sesión nuevamente',
                    code: 'REFRESH_TOKEN_EXPIRED',
                    expired_at: jwtError.expiredAt
                });
            }
            
            return res.status(403).json({ 
                message: 'Refresh token inválido',
                code: 'REFRESH_TOKEN_INVALID'
            });
        }
        
        // ✅ Verificar que sea un refresh token válido
        if (decoded.type !== 'refresh') {
            console.log('❌ Token no es de tipo refresh');
            return res.status(403).json({ 
                message: 'Token inválido',
                code: 'INVALID_TOKEN_TYPE'
            });
        }
        
        // ✅ Obtener información actualizada del usuario
        const [usuarios] = await pool.execute(
            'SELECT * FROM usuarios WHERE id = ?', 
            [decoded.id]
        );
        
        if (usuarios.length === 0) {
            logAuth('TOKEN_REFRESH_FAILED', `ID:${decoded.id}`, 'FALLIDO', 'Usuario no encontrado');
            return res.status(404).json({ 
                message: 'Usuario no encontrado',
                code: 'USER_NOT_FOUND'
            });
        }

        const usuario = usuarios[0];

        // ✅ Generar nuevo access token
        const { accessToken: accessExp } = getTokenExpiration();
        const tokenPayload = { 
            id: usuario.id, 
            usuario: usuario.usuario,
            iat: Math.floor(Date.now() / 1000)
        };

        const newAccessToken = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: accessExp });
        
        // ✅ Log de refresh exitoso
        logAuth('TOKEN_REFRESH', usuario.usuario, 'EXITOSO', 
            `AccessToken exp: ${accessExp}, RefreshToken restante: ${Math.round((decoded.exp * 1000 - Date.now()) / (1000 * 60 * 60 * 24))} días`
        );

        console.log(`✅ PWA Token renovado para ${usuario.usuario} - AccessToken expira en: ${accessExp}`);
        
        // ✅ RESPUESTA PWA: Solo access token (refresh token se mantiene igual)
        res.json({ 
            accessToken: newAccessToken,
            expiresIn: accessExp,
            refreshTokenExpiresIn: Math.round((decoded.exp * 1000 - Date.now()) / 1000),
            usuario: {
                id: usuario.id,
                usuario: usuario.usuario
            }
        });

    } catch (error) {
        console.error('❌ Error en PWA refresh token:', error);
        logAuth('TOKEN_REFRESH_FAILED', 'UNKNOWN', 'FALLIDO', `Error: ${error.message}`);
        
        res.status(500).json({ 
            message: 'Error interno del servidor',
            code: 'INTERNAL_ERROR'
        });
    }
};

// ✅ LOGOUT SIMPLIFICADO PARA PWA
exports.logout = async (req, res) => {
    try {
        // ✅ Log de logout PWA
        if (req.user) {
            logAuth('LOGOUT', req.user.usuario, 'EXITOSO', 'PWA Logout exitoso - localStorage');
            console.log(`👋 PWA Logout para ${req.user.usuario}`);
        }
        
        // ✅ PWA: No hay cookies que limpiar, el frontend maneja localStorage
        res.json({ 
            message: 'Logout exitoso',
            timestamp: new Date().toISOString(),
            method: 'localStorage_cleanup'
        });
    } catch (error) {
        console.error('❌ Error en PWA logout:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// ✅ OBTENER PERFIL ADAPTADO PARA TABLA USUARIOS
exports.getProfile = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        
        const [usuarios] = await pool.execute(
            'SELECT id, usuario FROM usuarios WHERE id = ?', 
            [usuarioId]
        );

        if (usuarios.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.json({ usuario: usuarios[0] });

    } catch (error) {
        console.error('❌ Error al obtener perfil:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// ✅ CAMBIAR CONTRASEÑA ADAPTADO PARA TABLA USUARIOS
exports.changePassword = async (req, res) => {
    try {
        const usuarioId = req.user.id;
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Contraseña actual y nueva son obligatorias' });
        }

        if (newPassword.length < 4) {
            return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 4 caracteres' });
        }

        // ✅ Verificar contraseña actual
        const [usuarios] = await pool.execute(
            'SELECT password FROM usuarios WHERE id = ?', 
            [usuarioId]
        );
        
        if (usuarios.length === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        const validPassword = await bcrypt.compare(currentPassword, usuarios[0].password);
        if (!validPassword) {
            logAuth('PASSWORD_CHANGE', req.user.usuario, 'FALLIDO', 'Contraseña actual incorrecta');
            return res.status(401).json({ message: 'Contraseña actual incorrecta' });
        }

        // ✅ Encriptar nueva contraseña
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        // ✅ Actualizar contraseña
        await pool.execute(
            'UPDATE usuarios SET password = ? WHERE id = ?', 
            [hashedNewPassword, usuarioId]
        );

        // ✅ Log de cambio exitoso de contraseña
        logAuth('PASSWORD_CHANGE', req.user.usuario, 'EXITOSO', 'Contraseña actualizada');

        res.json({ message: 'Contraseña actualizada exitosamente' });

    } catch (error) {
        console.error('❌ Error al cambiar contraseña:', error);
        
        if (req.user) {
            logAuth('PASSWORD_CHANGE', req.user.usuario, 'FALLIDO', `Error interno: ${error.message}`);
        }
        
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

// ✅ ENDPOINT DE SALUD PARA VERIFICAR CONEXIÓN
exports.health = async (req, res) => {
    try {
        // ✅ Verificar conexión a base de datos
        const [result] = await pool.execute('SELECT 1 as health');
        
        res.json({ 
            status: 'OK',
            message: 'Sistema de fletes funcionando correctamente',
            timestamp: new Date().toISOString(),
            database: 'connected',
            version: '1.0.0'
        });
    } catch (error) {
        console.error('❌ Error en health check:', error);
        res.status(500).json({ 
            status: 'ERROR',
            message: 'Error de conexión a base de datos',
            error: error.message
        });
    }
};