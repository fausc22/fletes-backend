# API Sistema de Fletes

API REST para gestión de sistema de fletes con Express.js y MySQL.

## Requisitos

- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **MySQL** >= 5.7
- **PM2** (para producción)

## Instalación Local

```bash
# Clonar el repositorio
git clone <tu-repositorio>
cd fletes/backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar en modo desarrollo
npm run dev
```

## Configuración de Variables de Entorno

Crea un archivo `.env` basándote en `.env.example`:

```env
NODE_ENV=production
PORT=3001

# Base de datos
DB_HOST=localhost
DB_USER=tu_usuario
DB_PASSWORD=tu_contraseña
DB_DATABASE=sistema_fletes
DB_PORT=3306

# JWT (genera claves seguras de al menos 32 caracteres)
JWT_SECRET=tu_clave_secreta_jwt
JWT_REFRESH_SECRET=tu_clave_refresh_secret
```

### Generar claves JWT seguras

```bash
# En Linux/Mac
openssl rand -base64 32

# O usando Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Despliegue en VPS con PM2

### 1. Preparar el VPS

```bash
# Actualizar el sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verificar instalación
node -v
npm -v

# Instalar PM2 globalmente
sudo npm install -g pm2

# Instalar MySQL (si no está instalado)
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 2. Configurar MySQL

```bash
# Entrar a MySQL
sudo mysql -u root -p

# Crear base de datos y usuario
CREATE DATABASE sistema_fletes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fletes_user'@'localhost' IDENTIFIED BY 'tu_contraseña_segura';
GRANT ALL PRIVILEGES ON sistema_fletes.* TO 'fletes_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### 3. Clonar y configurar el proyecto

```bash
# Crear directorio de la aplicación
sudo mkdir -p /var/www/fletes
sudo chown -R $USER:$USER /var/www/fletes

# Clonar el repositorio
cd /var/www/fletes
git clone <tu-repositorio> .

# Ir al backend e instalar dependencias
cd backend
npm install --production

# Configurar variables de entorno
cp .env.example .env
nano .env  # Editar con tus credenciales de producción
```

### 4. Iniciar con PM2

```bash
# Iniciar la aplicación
pm2 start ecosystem.config.js --env production

# Guardar configuración de PM2
pm2 save

# Configurar PM2 para iniciar con el sistema
pm2 startup
# Ejecutar el comando que PM2 te muestre

# Ver estado
pm2 status

# Ver logs
pm2 logs fletes-api

# Ver monitoreo en tiempo real
pm2 monit
```

### 5. Comandos útiles de PM2

```bash
# Reiniciar la aplicación
pm2 restart fletes-api

# Detener la aplicación
pm2 stop fletes-api

# Recargar sin downtime
pm2 reload fletes-api

# Ver logs en tiempo real
pm2 logs fletes-api --lines 100

# Ver información detallada
pm2 show fletes-api

# Limpiar logs
pm2 flush
```

## Configuración de Nginx (Proxy Reverso)

Si deseas usar Nginx como proxy reverso:

```bash
# Instalar Nginx
sudo apt install -y nginx

# Crear configuración
sudo nano /etc/nginx/sites-available/fletes-api
```

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activar el sitio
sudo ln -s /etc/nginx/sites-available/fletes-api /etc/nginx/sites-enabled/

# Verificar configuración
sudo nginx -t

# Reiniciar Nginx
sudo systemctl restart nginx
```

## Configuración SSL con Certbot

```bash
# Instalar Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtener certificado SSL
sudo certbot --nginx -d tu-dominio.com

# Renovación automática (ya está configurada por defecto)
sudo certbot renew --dry-run
```

## Endpoints Disponibles

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/` | Información de la API |
| GET | `/health` | Estado de salud del servidor |
| POST | `/authFletes/login` | Iniciar sesión |
| POST | `/authFletes/refresh-token` | Renovar token |
| GET | `/authFletes/profile` | Obtener perfil (auth) |
| GET | `/camiones` | Listar camiones |
| POST | `/camiones` | Crear camión |
| PUT | `/camiones/:id` | Actualizar camión |
| DELETE | `/camiones/:id` | Eliminar camión |
| GET | `/viajes` | Listar viajes |
| POST | `/viajes` | Crear viaje |
| PUT | `/viajes/:id/finalizar` | Finalizar viaje |
| GET | `/dinero/gastos` | Listar gastos |
| GET | `/dinero/ingresos` | Listar ingresos |
| GET | `/reportes/dashboard` | Dashboard general |

## Estructura del Proyecto

```
backend/
├── controllers/
│   └── fletes/
│       ├── authController.js
│       ├── camionesController.js
│       ├── dineroController.js
│       ├── viajesController.js
│       ├── reportesController.js
│       ├── db.js
│       └── dbPromise.js
├── middlewares/
│   └── fletes/
│       └── authMiddleware.js
├── routes/
│   └── fletes/
│       ├── authRoutes.js
│       ├── camionesRoutes.js
│       ├── dineroRoutes.js
│       ├── viajesRoutes.js
│       └── reportesRoutes.js
├── logs/
├── .env.example
├── .gitignore
├── ecosystem.config.js
├── package.json
├── server.js
└── README.md
```

## Solución de Problemas

### Error de conexión a MySQL

```bash
# Verificar que MySQL esté corriendo
sudo systemctl status mysql

# Verificar credenciales
mysql -u tu_usuario -p -h localhost
```

### Error de permisos

```bash
# Verificar permisos del directorio
ls -la /var/www/fletes

# Ajustar permisos si es necesario
sudo chown -R $USER:$USER /var/www/fletes
```

### PM2 no inicia con el sistema

```bash
# Regenerar script de startup
pm2 unstartup
pm2 startup
# Ejecutar el comando que muestra
pm2 save
```

### Ver logs de errores

```bash
# Logs de PM2
pm2 logs fletes-api --err --lines 50

# Logs del sistema
sudo journalctl -u pm2-$USER -f
```

## Licencia

ISC
