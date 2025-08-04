// scripts/crearUsuarioInicial.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configurar la conexión a la base de datos
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '251199',
    database: 'sistema_fletes',
    connectionLimit: 10
});

const crearUsuarioInicial = async () => {
    try {
        console.log('🔗 Conectando a la base de datos...');

        // Datos del usuario inicial
        const datosUsuario = {
            
            usuario: 'marcos',
            password: '2025',
            
        };

        // Verificar si ya existe el usuario
        const [usuarioExistente] = await pool.execute(
            'SELECT id FROM usuarios WHERE usuario = ?',
            [datosUsuario.usuario]
        );

        if (usuarioExistente.length > 0) {
            console.log('⚠️  El usuario ya existe en la base de datos');
            return;
        }

        // Hashear la contraseña
        console.log('🔒 Hasheando contraseña...');
        const hashedPassword = await bcrypt.hash(datosUsuario.password, 10);

        // Insertar el usuario
        console.log('👤 Creando usuario inicial...');
        const query = `
            INSERT INTO usuarios (usuario, password) 
            VALUES (?, ?)
        `;

        const [result] = await pool.execute(query, [
            
            datosUsuario.usuario,
            hashedPassword,
            
        ]);

        console.log('✅ Usuario inicial creado exitosamente!');
        console.log(`📝 ID del empleado: ${result.insertId}`);
        console.log(`👤 Usuario: ${datosUsuario.usuario}`);
        console.log(`🔑 Contraseña: ${datosUsuario.password}`);
        

    } catch (error) {
        console.error('❌ Error al crear usuario inicial:', error);
    } finally {
        await pool.end();
        console.log('🔚 Conexión cerrada');
    }
};

// Ejecutar el script
crearUsuarioInicial();

// También exportar la función para uso en otros scripts
module.exports = { crearUsuarioInicial };