const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const SensorData = require('../models/sensor-data.model');

/**
 * Clase que implementa la orquestación de modelos y el mecanismo de votación
 */
class OrchestratorService {
  constructor() {
    this.models = config.models;
    this.timeout = config.timeouts.model;
    this.trainingTimeout = config.timeouts.training;
  }

  /**
   * Inicia una sesión de entrenamiento en un nodo
   * @param {string} modelName - Nombre del modelo
   * @param {number} totalDischarges - Cantidad total de descargas
   * @returns {Promise<Object>} - Respuesta del nodo
   */
  async startTrainingSession(modelName, totalDischarges) {
    const modelConfig = this.models[modelName];
    const body = {
      totalDischarges,
      timeoutSeconds: Math.ceil(this.trainingTimeout / 1000)
    };

    const response = await axios({
      method: 'post',
      url: modelConfig.trainingUrl,
      data: body,
      timeout: this.trainingTimeout
    });

    return response.data;
  }

  /**
   * Envía una descarga a un nodo de entrenamiento
   * @param {string} modelName - Nombre del modelo
   * @param {number} ordinal - Índice de la descarga (1..N)
   * @param {Object} discharge - Datos de la descarga
   * @returns {Promise<Object>} - Acknowledgement
   */
  async pushDischarge(modelName, ordinal, discharge) {
    const modelConfig = this.models[modelName];

    const response = await axios({
      method: 'post',
      url: `${modelConfig.trainingUrl}/${ordinal}`,
      data: discharge,
      timeout: this.trainingTimeout
    });

    return response.data;
  }

  /**
   * Envía los datos a un modelo específico
   * @param {string} modelName - Nombre del modelo
   * @param {Object} data - Datos para la predicción (formato discharges)
   * @returns {Promise} - Promesa con la respuesta del modelo
   */
  async callModel(modelName, discharge) {
    try {
      const modelConfig = this.models[modelName];

      if (!modelConfig || !modelConfig.enabled) {
        logger.warn(`Model ${modelName} is not enabled or does not exist`);
        return { error: `Model ${modelName} is not available`, modelName };
      }

      logger.info(`Sending data to ${modelName} model at ${modelConfig.url}`);

      const response = await axios({
        method: 'post',
        url: modelConfig.url,
        data: discharge,
        timeout: this.timeout
      });

      logger.info(`Received response from ${modelName} model`);
      return {
        result: response.data,
        modelName,
        status: 'success'
      };
    } catch (error) {
      logger.error(`Error calling ${modelName} model: ${error.message}`);
      return {
        error: error.message,
        modelName,
        status: 'error'
      };
    }
  }

  /**
   * Envía datos de entrenamiento a un modelo específico
   * @param {string} modelName - Nombre del modelo
   * @param {Object} data - Datos para entrenamiento (formato discharges)
   * @returns {Promise} - Promesa con la respuesta del modelo
   */
  async trainModel(modelName, data) {
    try {
      const modelConfig = this.models[modelName];

      if (!modelConfig || !modelConfig.enabled) {
        logger.warn(`Model ${modelName} is not enabled or does not exist for training`);
        return { error: `Model ${modelName} is not available`, modelName };
      }

      const total = data.discharges.length;
      logger.info(`Starting training session on ${modelName} with ${total} discharges`);

      const startResp = await this.startTrainingSession(modelName, total);

      if (startResp.expectedDischarges !== total) {
        logger.error(`Model ${modelName} expected ${startResp.expectedDischarges} discharges but ${total} were sent`);
        return {
          error: 'mismatched discharge count',
          modelName,
          status: 'error'
        };
      }

      for (let i = 0; i < total; i += 1) {
        const ordinal = i + 1;
        await this.pushDischarge(modelName, ordinal, data.discharges[i]);
      }

      return {
        result: startResp,
        modelName,
        status: 'success'
      };
    } catch (error) {
      logger.error(`Error training ${modelName} model: ${error.message}`);
      return {
        error: error.message,
        modelName,
        status: 'error'
      };
    }
  }

  /**
   * Distribuye los datos a todos los modelos habilitados
   * @param {Object} data - Datos para la predicción (formato discharges)
   * @returns {Promise<Object>} - Resultados de todos los modelos y votación final
   */
  async orchestrate(data) {
    logger.info('Starting orchestration process');
    
    // Validar formato de datos
    if (!data.discharges || !Array.isArray(data.discharges)) {
      logger.error('Formato de datos inválido: se espera un objeto con array "discharges"');
      throw new Error('Formato de datos inválido: se espera un objeto con array "discharges"');
    }
    
    logger.info(`Procesando predicción con ${data.discharges.length} descargas`);
    
    const enabledModels = Object.keys(this.models)
      .filter(model => this.models[model].enabled);
    
    logger.info(`Enabled models: ${enabledModels.join(', ')}`);
    
    if (enabledModels.length === 0) {
      logger.error('No models are enabled');
      throw new Error('No models are enabled for prediction');
    }
    
    const discharge = data.discharges[0];
    // Llamadas en paralelo a todos los modelos con el nuevo protocolo
    const modelPromises = enabledModels.map(model =>
      this.callModel(model, discharge)
    );
    
    // Esperar todas las respuestas (con timeout)
    const responses = await Promise.all(modelPromises);
    
    // Aplicar mecanismo de votación
    const votingResult = this.applyVoting(responses);
    
    return {
      models: responses,
      voting: votingResult
    };
  }

  /**
   * Envía datos de entrenamiento a todos los modelos habilitados
   * @param {Object} data - Datos para entrenamiento (formato discharges)
   * @returns {Promise<Object>} - Resultados de todos los modelos
   */
  async trainModels(data) {
    logger.info('Starting training process for all models');
    
    // Validar formato de datos
    if (!data.discharges || !Array.isArray(data.discharges)) {
      logger.error('Formato de datos inválido: se espera un objeto con array "discharges"');
      throw new Error('Formato de datos inválido: se espera un objeto con array "discharges"');
    }
    
    logger.info(`Procesando entrenamiento con ${data.discharges.length} descargas`);
    
    const enabledModels = Object.keys(this.models)
      .filter(model => this.models[model].enabled);
    
    logger.info(`Enabled models for training: ${enabledModels.join(', ')}`);
    
    if (enabledModels.length === 0) {
      logger.error('No models are enabled');
      throw new Error('No models are enabled for training');
    }
    
    // Llamadas en paralelo a todos los modelos para entrenamiento
    const trainingPromises = enabledModels.map(model => 
      this.trainModel(model, data)
    );
    
    // Esperar todas las respuestas
    const responses = await Promise.all(trainingPromises);
    
    const summary = {
      successful: responses.filter(r => r.status === 'success').length,
      failed: responses.filter(r => r.status === 'error').length,
      details: responses
    };
    
    logger.info(`Training completed: ${summary.successful} successful, ${summary.failed} failed`);
    
    return summary;
  }

  /**
   * Aplica el mecanismo de votación basado en las respuestas de los modelos
   * @param {Array} modelResponses - Respuestas de los modelos
   * @returns {Object} - Resultado de la votación
   */
  applyVoting(modelResponses) {
    logger.info('Applying voting mechanism');
    
    // Filtrar solo los modelos que respondieron exitosamente
    const successfulResponses = modelResponses.filter(
      resp => resp.status === 'success' && resp.result && resp.result.prediction !== undefined
    );
    
    if (successfulResponses.length === 0) {
      logger.error('No successful model responses available for voting');
      return {
        decision: null,
        confidence: 0,
        message: 'No models returned valid predictions'
      };
    }
    
    // Conteo de votos por clase
    const votes = {
      0: 0, // Clase 0
      1: 0  // Clase 1
    };
    
    // Registrar confianza promedio por clase
    const confidences = {
      0: [],
      1: []
    };
    
    // Procesar votos
    successfulResponses.forEach(response => {
      let prediction = response.result.prediction;
      const confidence = response.result.confidence || 1.0;

      if (typeof prediction === 'string') {
        prediction = prediction === 'Anomaly' ? 1 : 0;
      }

      votes[prediction] += 1;
      confidences[prediction].push(confidence);
    });
    
    // Determinar la clase ganadora
    let winningClass;
    let isTie = false;
    
    if (votes[0] > votes[1]) {
      winningClass = 0;
    } else if (votes[1] > votes[0]) {
      winningClass = 1;
    } else {
      isTie = true;
    }
    
    // Calcular confianza promedio para la clase ganadora
    let avgConfidence = 0;
    if (!isTie && confidences[winningClass].length > 0) {
      avgConfidence = confidences[winningClass].reduce((sum, conf) => sum + conf, 0) / 
                      confidences[winningClass].length;
    }
    
    // Construir resultado
    const result = {
      votes,
      totalVotes: successfulResponses.length,
      totalModels: modelResponses.length
    };
    
    if (isTie) {
      result.decision = null;
      result.confidence = 0;
      result.message = 'Tie in voting, unable to make prediction';
    } else {
      result.decision = winningClass;
      result.confidence = avgConfidence;
      result.message = `Class ${winningClass} won by ${votes[winningClass]} votes`;
    }
    
    logger.info(`Voting result: ${result.message}`);
    return result;
  }

  /**
   * Verifica la salud de todos los endpoints de modelos
   * @returns {Promise<Object>} - Estado de salud de cada modelo
   */
  async healthCheck() {
    logger.info('Performing health check on all model endpoints');
    
    const modelChecks = Object.keys(this.models).map(async modelName => {
      const modelConfig = this.models[modelName];
      
      if (!modelConfig.enabled) {
        return {
          model: modelName,
          status: 'disabled',
          available: false
        };
      }
      
      try {
        const response = await axios({
          method: 'get',
          url: modelConfig.healthUrl,
          timeout: this.timeout
        });
        
        return {
          model: modelName,
          status: 'online',
          available: true,
          details: response.data
        };
      } catch (error) {
        logger.error(`Health check failed for ${modelName}: ${error.message}`);
        return {
          model: modelName,
          status: 'offline',
          available: false,
          error: error.message
        };
      }
    });
    
    const results = await Promise.all(modelChecks);
    
    return {
      timestamp: new Date(),
      models: results,
      availableModels: results.filter(m => m.available).length
    };
  }

  /**
   * Parsea un conjunto de archivos de texto de señales
   * @param {Array<Object>} files - Array de objetos con {name, content}
   * @param {Object} anomalyTimes - Objeto con los tiempos de anomalía por nombre de archivo
   * @returns {Object} - Objeto con los datos en formato para API
   */
  parseSensorFiles(files, anomalyTimes = {}) {
    const signals = [];
    
    for (const file of files) {
      try {
        const anomalyTime = anomalyTimes[file.name] || null;
        const sensorData = SensorData.fromTextFile(file.name, file.content, anomalyTime);
        signals.push(sensorData);
      } catch (error) {
        logger.error(`Error parsing sensor file ${file.name}: ${error.message}`);
        throw new Error(`Error parsing sensor file ${file.name}: ${error.message}`);
      }
    }
    
    return { signals };
  }
}

module.exports = new OrchestratorService();