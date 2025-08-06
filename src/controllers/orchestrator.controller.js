const { StatusCodes } = require('http-status-codes');
const orchestratorService = require('../services/orchestrator.service');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Controlador para la orquestación de modelos y predicciones
 */
class OrchestratorController {
  /**
   * Realiza una predicción utilizando todos los modelos disponibles
   * @param {Request} req - Objeto de solicitud HTTP
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async predict(req, res) {
    try {
      const dischargeData = req.body;
      
      // Validar que se recibieron datos experimentales
      if (!dischargeData || !dischargeData.discharges) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requieren datos en formato discharges para realizar la predicción'
        });
      }
      
      logger.info(`Recibida petición de predicción con ${dischargeData.discharges.length} descargas`);
      
      // Procesar predicción con el orquestador
      const result = await orchestratorService.orchestrate(dischargeData);
      
      // Determinar el código de estado según el resultado
      if (result.voting.decision === null) {
        return res.status(StatusCodes.CONFLICT).json({
          message: 'No se pudo determinar una predicción clara',
          result
        });
      }
      
      return res.status(StatusCodes.OK).json({
        message: 'Predicción completada con éxito',
        class: result.voting.decision,
        confidence: result.voting.confidence,
        details: result
      });
    } catch (error) {
      logger.error(`Error en predicción: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Error al procesar la predicción',
        message: error.message
      });
    }
  }

  /**
   * Envía datos de entrenamiento a todos los modelos
   * @param {Request} req - Objeto de solicitud HTTP 
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async train(req, res) {
    try {
      const trainingData = req.body;
      
      // Validar que se recibieron datos de entrenamiento
      if (!trainingData) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requieren datos de entrenamiento'
        });
      }
      
      // Validar que el formato sea discharges
      if (!trainingData.discharges || !Array.isArray(trainingData.discharges) || trainingData.discharges.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Formato de datos inválido. Se espera un objeto con un array de "discharges"'
        });
      }
      
      logger.info(`Recibida petición de entrenamiento con ${trainingData.discharges.length} descargas`);

      try {
        let summary;
        if (!orchestratorService.trainingSession) {
          const hasTotal = typeof trainingData.totalDischarges === 'number';
          const total = hasTotal ? trainingData.totalDischarges : trainingData.discharges.length;
          summary = await orchestratorService.startTrainingSession(total, hasTotal);
        } else if (!orchestratorService.trainingSession.autoFinish && typeof trainingData.totalDischarges === 'number') {
          orchestratorService.trainingSession.autoFinish = true;
          orchestratorService.trainingSession.totalDischarges = trainingData.totalDischarges;
        } else if (orchestratorService.trainingSession.autoFinish) {
          if (trainingData.totalDischarges && trainingData.totalDischarges > orchestratorService.trainingSession.totalDischarges) {
            orchestratorService.trainingSession.totalDischarges = trainingData.totalDischarges;
          }
        } else {
          orchestratorService.trainingSession.totalDischarges += trainingData.discharges.length;
        }
        await orchestratorService.sendTrainingBatch(trainingData.discharges);

        if (orchestratorService.trainingSession &&
            orchestratorService.trainingSession.autoFinish &&
            orchestratorService.trainingSession.enqueued >= orchestratorService.trainingSession.totalDischarges) {
          orchestratorService.finishTraining();
        }

        return res.status(StatusCodes.OK).json({
          message: 'Entrenamiento batch procesado correctamente',
          details: summary
        });
      } catch (error) {
        logger.error(`Error al enviar datos a modelos: ${error.message}`);
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Error al enviar datos a los modelos',
          message: error.message
        });
      }
    } catch (error) {
      logger.error(`Error en entrenamiento: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Error al procesar la petición de entrenamiento',
        message: error.message
      });
    }
  }

  /**
   * Procesa descargas en bruto y las envía a los modelos para entrenamiento
   * @param {Request} req
   * @param {Response} res
   */
  async trainRaw(req, res) {
    try {
      const meta = req.body.metadata ? JSON.parse(req.body.metadata) : null;

      if (!meta || !Array.isArray(meta.discharges) || meta.discharges.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Discharge metadata is required'
        });
      }

      const discharges = meta.discharges.map((d, idx) => ({
        id: d.id || `discharge_${idx + 1}`,
        anomalyTime: d.anomalyTime !== undefined ? d.anomalyTime : null,
        files: []
      }));

      for (const file of req.files || []) {
        const match = file.fieldname.match(/^discharge(\d+)$/);
        if (match) {
          const index = parseInt(match[1], 10);
          if (discharges[index]) {
            discharges[index].files.push({
              name: file.originalname,
              buffer: file.buffer
            });
          }
        }
      }

      let summary;
      if (!orchestratorService.trainingSession) {
        const hasTotal = typeof meta.totalDischarges === 'number';
        const total = hasTotal ? meta.totalDischarges : discharges.length;
        summary = await orchestratorService.startTrainingSession(total, hasTotal);
      } else if (!orchestratorService.trainingSession.autoFinish && typeof meta.totalDischarges === 'number') {
        orchestratorService.trainingSession.autoFinish = true;
        orchestratorService.trainingSession.totalDischarges = meta.totalDischarges;
      } else if (orchestratorService.trainingSession.autoFinish) {
        if (meta.totalDischarges && meta.totalDischarges > orchestratorService.trainingSession.totalDischarges) {
          orchestratorService.trainingSession.totalDischarges = meta.totalDischarges;
        }
      } else {
        orchestratorService.trainingSession.totalDischarges += discharges.length;
      }

      await orchestratorService.sendTrainingBatch(discharges);

      if (orchestratorService.trainingSession &&
          orchestratorService.trainingSession.autoFinish &&
          orchestratorService.trainingSession.enqueued >= orchestratorService.trainingSession.totalDischarges) {
        orchestratorService.finishTraining();
      }

      return res.status(StatusCodes.OK).json({
        message: 'Entrenamiento batch procesado correctamente',
        details: summary
      });
    } catch (error) {
      logger.error(`Error en entrenamiento raw: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: 'Error al procesar la petición de entrenamiento',
        message: error.message
      });
    }
  }

  /**
   * Recibe el resumen de entrenamiento de un nodo
   * @param {Request} req
   * @param {Response} res
   */
  async trainingCompleted(req, res) {
    try {
      const data = req.body;

      if (!data || !data.status) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Formato de TrainingResponse inválido'
        });
      }

      const entry = orchestratorService.handleTrainingCompleted(data);
      return res.status(StatusCodes.OK).json({ message: 'Training summary stored', entry });
    } catch (error) {
      logger.error(`Error en trainingCompleted: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Obtiene el estado de salud de los modelos
   * @param {Request} req - Objeto de solicitud HTTP
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async health(req, res) {
    try {
      const healthStatus = await orchestratorService.healthCheck();
      
      // Si no hay modelos disponibles, reportar servicio degradado
      const statusCode = healthStatus.availableModels > 0 
        ? StatusCodes.OK 
        : StatusCodes.SERVICE_UNAVAILABLE;
      
      return res.status(statusCode).json({
        serverStatus: 'online',
        ...healthStatus
      });
    } catch (error) {
      logger.error(`Error en health check: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        serverStatus: 'error',
        error: error.message
      });
    }
  }

  /**
   * Obtiene la configuración actual del sistema
   * @param {Request} req - Objeto de solicitud HTTP
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async getConfig(req, res) {
    try {
      // Devolver configuración relevante incluyendo las URLs
      const safeConfig = {
        models: Object.keys(config.models).map(modelName => ({
          name: modelName,
          enabled: config.models[modelName].enabled,
          url: config.models[modelName].url,
          trainingUrl: config.models[modelName].trainingUrl,
          healthUrl: config.models[modelName].healthUrl,
          displayName: config.models[modelName].displayName
        })),
        timeout: config.timeouts.model
      };
      
      return res.status(StatusCodes.OK).json(safeConfig);
    } catch (error) {
      logger.error(`Error al obtener configuración: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Actualiza la configuración para habilitar/deshabilitar modelos
   * @param {Request} req - Objeto de solicitud HTTP
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async updateModelConfig(req, res) {
    try {
      const { modelName, enabled } = req.body;
      
      if (!modelName || typeof enabled !== 'boolean') {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requiere nombre de modelo y estado de habilitación'
        });
      }
      
      if (!config.models[modelName]) {
        return res.status(StatusCodes.NOT_FOUND).json({
          error: `Modelo '${modelName}' no encontrado`
        });
      }
      
      // Actualizar configuración
      config.models[modelName].enabled = enabled;
      
      logger.info(`Modelo '${modelName}' ${enabled ? 'enabled' : 'disabled'}`);
      
      return res.status(StatusCodes.OK).json({
        message: `Modelo '${modelName}' ${enabled ? 'enabled' : 'disabled'}`,
        models: Object.keys(config.models).map(model => ({
          name: model,
          enabled: config.models[model].enabled,
          url: config.models[model].url,
          trainingUrl: config.models[model].trainingUrl,
          healthUrl: config.models[model].healthUrl,
          displayName: config.models[model].displayName
        }))
      });
    } catch (error) {
      logger.error(`Error al actualizar configuración: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Actualiza la URL de un modelo específico
   * @param {Request} req - Objeto de solicitud HTTP
   * @param {Response} res - Objeto de respuesta HTTP
   */
  async updateModelUrl(req, res) {
    try {
      const { modelName, url, type } = req.body;
      
      if (!modelName || !url || typeof url !== 'string') {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requiere nombre de modelo y URL válida'
        });
      }
      
      if (!config.models[modelName]) {
        return res.status(StatusCodes.NOT_FOUND).json({
          error: `Modelo '${modelName}' no encontrado`
        });
      }
      
      // Validar el tipo
      if (type && !['predict', 'train', 'health'].includes(type)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: "El tipo debe ser 'predict', 'train' o 'health'"
        });
      }
      
      // Actualizar configuración
      config.updateModelUrl(modelName, url, type || 'predict');
      
      logger.info(`URL de ${type || 'predict'} del modelo '${modelName}' actualizada a ${url}`);
      
      return res.status(StatusCodes.OK).json({
        message: `URL de ${type || 'predict'} del modelo '${modelName}' actualizada`,
        models: Object.keys(config.models).map(model => ({
          name: model,
          enabled: config.models[model].enabled,
          url: config.models[model].url,
          trainingUrl: config.models[model].trainingUrl,
          healthUrl: config.models[model].healthUrl,
          displayName: config.models[model].displayName
        }))
      });
    } catch (error) {
      logger.error(`Error al actualizar URL: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Actualiza el nombre visible de un modelo
   */
  async updateModelName(req, res) {
    try {
      const { modelName, displayName } = req.body;

      if (!modelName || !displayName) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requiere nombre de modelo y nuevo nombre'
        });
      }

      if (!config.models[modelName]) {
        return res.status(StatusCodes.NOT_FOUND).json({
          error: `Modelo '${modelName}' no encontrado`
        });
      }

      config.updateModelDisplayName(modelName, displayName);

      return res.status(StatusCodes.OK).json({
        message: `Nombre del modelo '${modelName}' actualizado`,
        models: Object.keys(config.models).map(model => ({
          name: model,
          enabled: config.models[model].enabled,
          url: config.models[model].url,
          trainingUrl: config.models[model].trainingUrl,
          healthUrl: config.models[model].healthUrl,
          displayName: config.models[model].displayName
        }))
      });
    } catch (error) {
      logger.error(`Error al actualizar nombre: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Agrega un nuevo modelo a la configuración
   */
  async addModel(req, res) {
    try {
      const { name, url, trainingUrl, healthUrl } = req.body;

      if (!name || !url || !trainingUrl || !healthUrl) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requiere nombre y todas las URLs del modelo'
        });
      }

      const key = config.addModel(name, { url, trainingUrl, healthUrl });

      return res.status(StatusCodes.OK).json({
        message: `Modelo '${name}' agregado`,
        key,
        models: Object.keys(config.models).map(model => ({
          name: model,
          enabled: config.models[model].enabled,
          url: config.models[model].url,
          trainingUrl: config.models[model].trainingUrl,
          healthUrl: config.models[model].healthUrl,
          displayName: config.models[model].displayName
        }))
      });
    } catch (error) {
      logger.error(`Error al agregar modelo: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }

  /**
   * Elimina un modelo de la configuración
   */
  async deleteModel(req, res) {
    try {
      const { modelName } = req.body;

      if (!modelName) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Se requiere nombre de modelo'
        });
      }

      if (!config.models[modelName]) {
        return res.status(StatusCodes.NOT_FOUND).json({
          error: `Modelo '${modelName}' no encontrado`
        });
      }

      config.removeModel(modelName);

      return res.status(StatusCodes.OK).json({
        message: `Modelo '${modelName}' eliminado`,
        models: Object.keys(config.models).map(model => ({
          name: model,
          enabled: config.models[model].enabled,
          url: config.models[model].url,
          trainingUrl: config.models[model].trainingUrl,
          healthUrl: config.models[model].healthUrl,
          displayName: config.models[model].displayName
        }))
      });
    } catch (error) {
      logger.error(`Error al eliminar modelo: ${error.message}`);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        error: error.message
      });
    }
  }
}

module.exports = new OrchestratorController();
