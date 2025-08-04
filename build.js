const fs = require('fs');
const path = require('path');
const ejs = require('ejs');
const dotenv = require('dotenv');

dotenv.config();

const srcDir = path.join(__dirname, 'src', 'views');
const distDir = path.join(__dirname, 'dist');
const inputFile = path.join(srcDir, 'dashboard.ejs');
const outputFile = path.join(distDir, 'index.html');

// Definir la URL del servidor API y Socket.io para el entorno de producción
const API_SERVER_URL = process.env.API_SERVER_URL || 'http://localhost:30000';

// Crear la carpeta dist si no existe
if (!fs.existsSync(distDir)) {
  console.log('Creando carpeta dist...');
  fs.mkdirSync(distDir, { recursive: true });
}

// Renderizar EJS a HTML
console.log('Renderizando dashboard.ejs en HTML...');
ejs.renderFile(inputFile, {}, {}, (err, html) => {
  if (err) {
    console.error('Error al renderizar la plantilla EJS:', err);
    process.exit(1);
  }

  // Reemplazar la referencia local de socket.io con CDN
  console.log('Reemplazando rutas relativas con CDNs...');
  html = html.replace(
    '<script src="/socket.io/socket.io.js"></script>',
    '<script src="https://cdn.socket.io/4.8.1/socket.io.min.js"></script>'
  );

  // Modificar la inicialización de socket.io para que apunte al servidor API
  html = html.replace(
    'const socket = io();',
    `// Conectar con el servidor Socket.io (configurable)
    const SERVER_URL = '${API_SERVER_URL}';
    let socket;
    
    try {
      // Intentar conectar con el servidor
      socket = io(SERVER_URL);
      console.log('Intentando conectar con el servidor Socket.io en:', SERVER_URL);
      
      // Manejar error de conexión
      socket.on('connect_error', (err) => {
        console.error('Error de conexión con Socket.io:', err.message);
        showConnectionError();
      });
      
      // Manejar desconexión
      socket.on('disconnect', (reason) => {
        console.warn('Desconectado de Socket.io:', reason);
        showConnectionError();
      });
    } catch (err) {
      console.error('Error al inicializar Socket.io:', err);
      showConnectionError();
    }
    
    // Función para mostrar mensaje de error de conexión
    function showConnectionError() {
      const errorMsg = document.createElement('div');
      errorMsg.className = 'alert alert-danger';
      errorMsg.textContent = 'No se ha podido establecer conexión con el servidor. Las funcionalidades en tiempo real no están disponibles.';
      
      // Mostrar en la parte superior de la página si no existe ya
      if (!document.querySelector('#connection-error')) {
        errorMsg.id = 'connection-error';
        document.querySelector('.container').prepend(errorMsg);
      }
    }`
  );

  // Reemplazar las llamadas fetch para usar la URL del servidor API
  html = html.replace(
    /fetch\('\/api\//g,
    `fetch('${API_SERVER_URL}/api/`
  );

  // Guardar el HTML en dist/index.html
  console.log('Guardando HTML en dist/index.html...');
  fs.writeFileSync(outputFile, html);

  // Crear archivo de configuración para permitir cambiar la URL del servidor en producción
  const configJs = `
    // Archivo de configuración para el dashboard estático
    window.DASHBOARD_CONFIG = {
      API_SERVER_URL: '${API_SERVER_URL}'
    };
  `;
  fs.writeFileSync(path.join(distDir, 'dashboard-config.js'), configJs);

  console.log('Proceso de build completado exitosamente!');
  console.log(`El archivo HTML ha sido generado en: ${outputFile}`);
  console.log('--------------------------------');
  console.log(`NOTA: Esta versión estática está configurada para conectarse a: ${API_SERVER_URL}. Debes asegurar que el servidor esté en ejecución y accesible desde esta ubicación.`);
});

// Copiar archivos estáticos necesarios desde public/ a dist/ (si existen)
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {  
  const files = fs.readdirSync(publicDir);
  
  files.forEach(file => {
    const srcPath = path.join(publicDir, file);
    const destPath = path.join(distDir, file);
    
    // Verificar si es un archivo (no una carpeta)
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copiado archivo estático: ${file}`);
    }
  });
}