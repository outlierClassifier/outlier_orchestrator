const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const config = require('./src/config');
const logger = require('./src/utils/logger');
const routes = require('./src/routes');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  maxHttpBufferSize: 10e6 
});

// Configurar Socket.io
require('./src/utils/socket')(io);

// Configurar motor de plantillas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('combined', { stream: logger.stream }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules/chart.js', express.static(path.join(__dirname, 'node_modules/chart.js')));

// Routes
app.use('/api', routes);

// Vista principal del panel de control
app.get('/', (req, res) => {
  res.render('dashboard');
});

// React Flow dashboard
app.get('/flow', (req, res) => {
  res.render('dashboard_react');
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  res.status(err.status || 500);
  res.json({
    error: {
      message: err.message,
      status: err.status || 500
    }
  });
});

// Start server
const PORT = config.port || 3000;
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Dashboard UI available at: http://localhost:${PORT}`);
});

module.exports = app;