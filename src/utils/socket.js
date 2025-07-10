const logger = require('./logger');
const orchestratorService = require('../services/orchestrator.service');

/**
 * Configura la comunicación en tiempo real con socket.io
 * @param {SocketIO.Server} io - Instancia del servidor de Socket.io
 */
module.exports = function(io) {
  // Mantener registro del estado de los modelos
  const modelStatus = {};
  function syncModelStatusKeys() {
    // Remove deleted models
    Object.keys(modelStatus).forEach(name => {
      if (!orchestratorService.models[name]) delete modelStatus[name];
    });
    // Add new models with unknown status
    Object.keys(orchestratorService.models).forEach(name => {
      if (!modelStatus[name]) {
        modelStatus[name] = { status: 'unknown', lastCheck: null };
      }
    });
  }

  syncModelStatusKeys();

  // Registro de predicciones realizadas
  const predictionLog = [];

  // Mantener un máximo de 100 registros en el historial
  function addPrediction(prediction) {
    predictionLog.unshift(prediction);
    if (predictionLog.length > 100) {
      predictionLog.pop();
    }
  }

  // Monitorear el estado de los modelos periodicamente
  const healthCheckInterval = setInterval(async () => {
    try {
      const health = await orchestratorService.healthCheck();

      syncModelStatusKeys();

      health.models.forEach(model => {
        modelStatus[model.model] = {
          status: model.status,
          lastCheck: new Date()
        };
      });
      
      io.emit('health-update', modelStatus);
    } catch (error) {
      logger.error(`Error en health check programado: ${error.message}`);
    }
  }, (process.env.HEALTHCHECK_TIMEOUT || 5000));

  // Gestionar conexiones de clientes
  io.on('connection', (socket) => {
    logger.info(`Cliente conectado: ${socket.id}`);
    
    // Enviar estado inicial
    socket.emit('health-update', modelStatus);
    socket.emit('prediction-history', predictionLog);
    
    // Manejar solicitud de estado actual
    socket.on('request-health', async () => {
      try {
        const health = await orchestratorService.healthCheck();

        syncModelStatusKeys();

        health.models.forEach(model => {
          modelStatus[model.model] = {
            status: model.status,
            lastCheck: new Date()
          };
        });
        
        socket.emit('health-update', modelStatus);
      } catch (error) {
        logger.error(`Error al obtener estado de salud: ${error.message}`);
        socket.emit('error', { message: 'Error al obtener estado de los modelos' });
      }
    });
    
    // Manejar solicitud de predicción manual desde el dashboard
    socket.on('run-prediction', async (data) => {
      try {
        let payload = data;
        if (data && Array.isArray(data.files)) {
          payload = orchestratorService.parsePredictionFiles(data.files);
        }
        const result = await orchestratorService.orchestrate(payload);
        
        const predictionRecord = {
          timestamp: new Date(),
          result: result.voting.decision,
          confidence: result.voting.confidence,
          votes: result.voting.votes,
          details: result
        };
        
        addPrediction(predictionRecord);
        io.emit('new-prediction', predictionRecord);
        socket.emit('prediction-result', result);
      } catch (error) {
        logger.error(`Error en predicción manual: ${error.message}`);
        socket.emit('error', { message: `Error al procesar la predicción: ${error.message}` });
      }
    });
    
    // Manejar solicitudes de habilitación/deshabilitación de modelos
    socket.on('toggle-model', async ({ modelName, enabled }) => {
      try {
        // Este evento actualizará la configuración sin necesidad de reiniciar el servidor
        if (orchestratorService.models[modelName]) {
          orchestratorService.models[modelName].enabled = enabled;
          io.emit('config-update', {
            models: Object.keys(orchestratorService.models).map(model => ({
              name: model,
              enabled: orchestratorService.models[model].enabled
            }))
          });
          
          socket.emit('success', { message: `Model ${modelName} ${enabled ? 'enabled' : 'disabled'}` });
        } else {
          socket.emit('error', { message: `Model ${modelName} not found` });
        }
      } catch (error) {
        logger.error(`Error at updating configuration: ${error.message}`);
        socket.emit('error', { message: 'Error at updating configuration' });
      }
    });
    
    // Manejar errores de socket para evitar desconexiones
    socket.on('error', (error) => {
      logger.error(`Error de socket para cliente ${socket.id}: ${error.message}`);
    });
    
    // Manejar desconexiones
    socket.on('disconnect', (reason) => {
      logger.info(`Cliente desconectado: ${socket.id}, razón: ${reason}`);
    });
  });

  // Agregar manejo de errores a nivel del servidor socket.io
  io.engine.on('connection_error', (err) => {
    logger.error(`Error de conexión Socket.IO: ${err.message}`);
  });

  // Limpiar intervalo al detener el servidor
  process.on('SIGINT', () => {
    clearInterval(healthCheckInterval);
    process.exit(0);
  });

  // Exponer funcionalidad para registrar nuevas predicciones desde la API
  return {
    registerPrediction: (prediction) => {
      addPrediction(prediction);
      io.emit('new-prediction', prediction);
    }
  };
};