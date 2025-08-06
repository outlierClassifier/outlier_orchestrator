const { StatusCodes } = require('http-status-codes');
const orchestratorService = require('../services/orchestrator.service');
const logger = require('../utils/logger');
const config = require('../config');
const archiver = require('archiver');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { exec } = require('child_process');
const QuickChart = require('quickchart-js');

// Sessions to accumulate automated prediction results without keeping everything in memory
const automatedPredictSessions = {};

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
   * Start a session for sequential automated predictions
   * @param {Request} _req
   * @param {Response} res
   */
  startAutomatedPredictsSession(_req, res) {
    const id = randomUUID();
    const dir = path.join(os.tmpdir(), `automated_predicts_${id}`);
    fs.mkdirSync(path.join(dir, 'raw'), { recursive: true });
    automatedPredictSessions[id] = { dir, stats: {}, dischargeOrder: [] };
    res.json({ sessionId: id });
  }

  /**
   * Process a batch of prediction files for a session
   * @param {Request} req
   * @param {Response} res
   */
  async uploadAutomatedPredict(req, res) {
    const { sessionId } = req.params;
    const session = automatedPredictSessions[sessionId];
    if (!session) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid session' });
    }

    const files = req.files || [];
    if (!files.length) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'No prediction files uploaded' });
    }

    const thresholds = req.body.thresholds ? JSON.parse(req.body.thresholds) : {};
    const dischargeId = req.body.dischargeId || files[0].originalname;

    try {
      const fileData = [];
      for (const f of files) {
        try {
          const content = await fs.promises.readFile(f.path, 'utf8');
          fileData.push({ name: f.originalname, content });
        } finally {
          fs.unlink(f.path, () => {});
        }
      }

      const { signals, times, length } = orchestratorService.parseSensorFiles(fileData);
      const discharge = { id: dischargeId, signals, times, length };

      const result = await orchestratorService.orchestrate({ discharges: [discharge] });

      const rawDir = path.join(session.dir, 'raw');
      const safeName = dischargeId.replace(/[^a-zA-Z0-9_-]/g, '_');
      await fs.promises.writeFile(path.join(rawDir, `${safeName}.json`), JSON.stringify(result, null, 2));

      (result.models || []).forEach(modelResp => {
        const name = modelResp.modelName;
        const cfg = thresholds[name] || {};
        const justThresh = parseFloat(cfg.justification) || 0;
        const countThresh = parseInt(cfg.count) || 1;

        const rawJust = modelResp.result && modelResp.result.justification;
        const justArray = modelResp.result && modelResp.result.windows 
          ? modelResp.result.windows
              .map(window => window.justification)
              .filter(justification => justification !== undefined && justification !== null)
              .map(justification => parseFloat(justification))
          : [];

        if (!session.stats[name]) {
          session.stats[name] = { discharges: {}, dischargeIds: [], count: countThresh };
        }
        if (!session.stats[name].discharges[dischargeId]) {
          session.stats[name].discharges[dischargeId] = { justifications: [], thresholds: [], count_thresholds: [] };
          session.stats[name].dischargeIds.push(dischargeId);
        }

        const dStats = session.stats[name].discharges[dischargeId];
        justArray.forEach(justification => {
          const pass = justification > justThresh ? 1 : 0;
          dStats.justifications.push(justification);
          dStats.thresholds.push(pass);
          const history = dStats.thresholds;
          const countPass =
            history.length >= countThresh && history.slice(-countThresh).every(v => v === 1) ? 1 : 0;
          dStats.count_thresholds.push(countPass);
        });
      });

      if (!session.dischargeOrder.includes(dischargeId)) {
        session.dischargeOrder.push(dischargeId);
      }

      res.json({ ok: true });
    } catch (error) {
      logger.warn(`Error processing discharge ${dischargeId}: ${error.message}`);
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Invalid prediction files',
        message: error.message
      });
    }
  }

  /**
   * Finalize session and send ZIP with accumulated results
   * @param {Request} req
   * @param {Response} res
   */
  async finalizeAutomatedPredicts(req, res) {
    const { sessionId } = req.params;
    const session = automatedPredictSessions[sessionId];
    if (!session) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid session' });
    }

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', 'attachment; filename="automated_predicts.zip"');

    const archive = archiver('zip');
    archive.on('error', err => { throw err; });
    archive.pipe(res);

    const rawDir = path.join(session.dir, 'raw');
    for (const file of await fs.promises.readdir(rawDir)) {
      archive.file(path.join(rawDir, file), { name: `raw/${file}` });
    }

    Object.entries(session.stats).forEach(([model, data]) => {
      const headers = [];
      data.dischargeIds.forEach(id => {
        const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
        headers.push(
          `${safeId}_justification`,
          `${safeId}_justification_threshold`,
          `${safeId}_count_threshold`
        );
      });

      const maxRows = Math.max(
        0,
        ...data.dischargeIds.map(id => data.discharges[id].justifications.length)
      );
      const rows = [];
      for (let i = 0; i < maxRows; i++) {
        const row = [];
        data.dischargeIds.forEach(id => {
          const d = data.discharges[id];
          row.push(
            d.justifications[i] !== undefined ? d.justifications[i] : '',
            d.thresholds[i] !== undefined ? d.thresholds[i] : '',
            d.count_thresholds[i] !== undefined ? d.count_thresholds[i] : ''
          );
        });
        rows.push(row.join(','));
      }
      const csv = `${headers.join(',')}\n${rows.join('\n')}`;
      archive.append(csv, { name: `stats/${model}.csv` });
    });

    try {
      const pdfPath = await this.generatePdfReport(sessionId, session);
      archive.file(pdfPath, { name: 'report.pdf' });
    } catch (err) {
      logger.warn(`Failed to generate PDF report: ${err.message}`);
    }

    await archive.finalize();

    // Cleanup
    fs.rm(session.dir, { recursive: true, force: true }, () => {});
    delete automatedPredictSessions[sessionId];
  }

    async generatePdfReport(sessionId, session) {
      const reportDir = session.dir;
      const imgDir = path.join(reportDir, 'images');
      await fs.promises.mkdir(imgDir, { recursive: true });

      const models = Object.keys(session.stats);
      const discharges = session.dischargeOrder;

      for (const dischargeId of discharges) {
        for (const model of models) {
          const d = session.stats[model].discharges[dischargeId];
          if (!d) continue;
          const qc = new QuickChart();
          qc.setWidth(600);
          qc.setHeight(200);
          qc.setConfig({
            type: 'line',
            data: {
              labels: d.justifications.map((_, i) => i + 1),
              datasets: [
                { label: 'Justification', data: d.justifications, borderColor: 'blue', fill: false },
                { label: 'Threshold', data: d.thresholds, borderColor: 'red', fill: false },
                { label: 'Count Threshold', data: d.count_thresholds, borderColor: 'green', fill: false }
              ]
            },
            options: { scales: { y: { beginAtZero: true } } }
          });
          const img = await qc.toBinary();
          const safeModel = model.replace(/[^a-zA-Z0-9_-]/g, '_');
          const safeDischarge = dischargeId.replace(/[^a-zA-Z0-9_-]/g, '_');
          await fs.promises.writeFile(path.join(imgDir, `${safeModel}_${safeDischarge}.png`), img);
        }
      }

      let tex = `\\documentclass{article}\n\\usepackage{graphicx}\n\\usepackage{booktabs}\n\\begin{document}\n`;
      tex += `Report ${sessionId}\\\\\n`;
      tex += `Total predictions: ${discharges.length}\\\\\n`;
      tex += `Models (${models.length}): ${models.join(', ')}\\\\\n`;

      for (const dischargeId of discharges) {
        const safeDischarge = dischargeId.replace(/[^a-zA-Z0-9_-]/g, '_');
        tex += `\\section*{Discharge ${dischargeId}}\\n`;
        tex += `\\begin{tabular}{lll}\\toprule\\nModel & First detection window & Total windows\\\\\\midrule\\n`;
        for (const model of models) {
          const d = session.stats[model].discharges[dischargeId];
          let first = '-';
          let total = '-';
          if (d) {
            const idx = d.count_thresholds.findIndex(v => v === 1);
            first = idx === -1 ? '-' : idx + 1;
            total = d.justifications.length;
          }
          tex += `${model} & ${first} & ${total}\\\\\n`;
        }
        tex += `\\bottomrule\\end{tabular}\\n`;
        for (const model of models) {
          const safeModel = model.replace(/[^a-zA-Z0-9_-]/g, '_');
          const imgPath = path.join('images', `${safeModel}_${safeDischarge}.png`);
          tex += `\\begin{figure}[h]\\centering\\includegraphics[width=\\textwidth]{${imgPath}}\\caption{${model} - ${dischargeId}}\\end{figure}\\n`;
        }
      }

      tex += `\\end{document}`;

      const texPath = path.join(reportDir, 'report.tex');
      await fs.promises.writeFile(texPath, tex);

      await new Promise((resolve, reject) => {
        exec('pdflatex -interaction=nonstopmode report.tex', { cwd: reportDir }, (err) => {
          if (err) return reject(err);
          resolve();
        });
      });

      return path.join(reportDir, 'report.pdf');
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
