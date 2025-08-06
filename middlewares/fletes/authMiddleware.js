// middlewares/authMiddleware.js - ADAPTADO PARA SISTEMA DE FLETES
const jwt = require('jsonwebtoken');

// ✅ Middleware para verificar JWT simplificado para tabla usuarios
const authenticateToken = (req, res, next) => {
    // Acepta tanto 'Bearer TOKEN' como solo 'TOKEN'
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;
    
    if (!token) {
        console.log('❌ Token no proporcionado en:', req.originalUrl);
        return res.status(401).json({ 
            message: 'Acceso denegado - Token requerido',
            code: 'NO_TOKEN'
        });
    }

    // Verificar que el JWT_SECRET esté configurado
    if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET no configurado');
        return res.status(500).json({ 
            message: 'Error de configuración del servidor',
            code: 'CONFIG_ERROR'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.log('❌ Error verificando token:', {
                error: err.name,
                message: err.message,
                url: req.originalUrl,
                tokenStart: token.substring(0, 20) + '...'
            });

            // Diferentes tipos de errores de JWT
            switch (err.name) {
                case 'TokenExpiredError':
                    return res.status(401).json({ 
                        message: 'Token expirado - Por favor renueva tu sesión',
                        code: 'TOKEN_EXPIRED',
                        expiredAt: err.expiredAt
                    });
                case 'JsonWebTokenError':
                    return res.status(403).json({ 
                        message: 'Token inválido - Por favor inicia sesión nuevamente',
                        code: 'TOKEN_INVALID'
                    });
                case 'NotBeforeError':
                    return res.status(403).json({ 
                        message: 'Token no activo aún',
                        code: 'TOKEN_NOT_ACTIVE'
                    });
                default:
                    return res.status(403).json({ 
                        message: 'Error de autenticación',
                        code: 'AUTH_ERROR'
                    });
            }
        }

        // ✅ Verificar que el token tenga la estructura esperada para fletes
        if (!user.id || !user.usuario) {
            console.log('❌ Token con estructura inválida:', user);
            return res.status(403).json({ 
                message: 'Token con formato inválido',
                code: 'TOKEN_FORMAT_INVALID'
            });
        }

        req.user = user;
        
        // Log exitoso en desarrollo
        if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Usuario autenticado: ${user.usuario} (ID: ${user.id}) en ${req.originalUrl}`);
        }
        
        next();
    });
};

// ✅ Middleware para debug de tokens en desarrollo
const debugToken = (req, res, next) => {
    if (process.env.NODE_ENV === 'development') {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') 
            ? authHeader.slice(7) 
            : authHeader;

        if (token) {
            try {
                // Decodificar sin verificar para debug
                const decoded = jwt.decode(token, { complete: true });
                console.log('🔍 Token debug:', {
                    header: decoded?.header,
                    payload: {
                        ...decoded?.payload,
                        exp: decoded?.payload?.exp ? new Date(decoded.payload.exp * 1000).toISOString() : undefined,
                        iat: decoded?.payload?.iat ? new Date(decoded.payload.iat * 1000).toISOString() : undefined
                    }
                });
            } catch (e) {
                console.log('❌ Token no decodificable:', token.substring(0, 20) + '...');
            }
        }
    }
    next();
};

// ✅ Middleware para verificar tokens con renovación automática (opcional)
const authenticateWithRefresh = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : authHeader;
    
    if (!token) {
        return res.status(401).json({ 
            message: 'Token requerido',
            code: 'NO_TOKEN'
        });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
        if (err && err.name === 'TokenExpiredError') {
            // Si el token expiró, sugerir renovación
            return res.status(401).json({ 
                message: 'Token expirado',
                code: 'TOKEN_EXPIRED',
                shouldRefresh: true
            });
        } else if (err) {
            return res.status(403).json({ 
                message: 'Token inválido',
                code: 'TOKEN_INVALID'
            });
        }

        req.user = user;
        next();
    });
};

// ✅ Middleware para verificar si el usuario es propietario del recurso
const requireOwnership = (req, res, next) => {
    // Para futuras implementaciones de control de acceso por usuario
    // Por ahora todos los usuarios autenticados tienen acceso a todo
    next();
};

// ✅ Middleware para logging de requests autenticados
const logAuthenticatedRequest = (req, res, next) => {
    if (req.user) {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] API REQUEST: ${req.method} ${req.originalUrl} - Usuario: ${req.user.usuario} (ID: ${req.user.id})`);
    }
    next();
};

// ✅ Middleware para validar parámetros de camión
const validateCamionAccess = async (req, res, next) => {
    // Para implementaciones futuras donde se restrinja acceso por camión
    // Por ahora todos los usuarios pueden acceder a todos los camiones
    next();
};

// ✅ Middleware combinado para casos comunes en fletes
const requireAuth = [authenticateToken, logAuthenticatedRequest];
const requireAuthWithDebug = [debugToken, authenticateToken, logAuthenticatedRequest];

// ✅ Middleware para endpoints que requieren validación de camión
const requireCamionAccess = [authenticateToken, validateCamionAccess, logAuthenticatedRequest];

module.exports = { 
    authenticateToken, 
    debugToken,
    authenticateWithRefresh,
    requireOwnership,
    logAuthenticatedRequest,
    validateCamionAccess,
    requireAuth,
    requireAuthWithDebug,
    requireCamionAccess
};