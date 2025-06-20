const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

/**
 * Middleware para validar el formato de los datos experimentales (formato discharges)
 * @param {Request} req - Objeto de solicitud HTTP
 * @param {Response} res - Objeto de respuesta HTTP
 * @param {Function} next - Función para continuar con el siguiente middleware
 */
function validatedischargealData(req, res, next) {
  const data = req.body;
  
  try {
    // Validar formato discharges
    if (!data || !data.discharges || !Array.isArray(data.discharges)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Formato de datos no válido. Se espera un objeto con un array "discharges"'
      });
    }
    
    // Verificar que hay al menos un descarga
    if (data.discharges.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: 'Se requiere al menos un descarga'
      });
    }
    
    // Validar cada descarga
    for (const discharge of data.discharges) {
      // Verificar que tiene ID y señales
      if (!discharge.id) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: 'Cada descarga debe tener un ID'
        });
      }
      
      if (!discharge.signals || !Array.isArray(discharge.signals) || discharge.signals.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: `La descarga ${discharge.id} debe tener al menos un sensor`
        });
      }

      if (!Array.isArray(discharge.times) || discharge.times.length === 0) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: `La descarga ${discharge.id} debe incluir un array de tiempos`
        });
      }

      if (discharge.times.some(value => typeof value !== 'number' || isNaN(value))) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: `La descarga ${discharge.id} tiene valores de tiempo no numéricos`
        });
      }

      // Validar señales
      for (const sensor of discharge.signals) {
        // Verificar nombre de archivo
        if (!sensor.filename) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            error: `Sensor sin nombre de archivo en descarga ${discharge.id}`
          });
        }

        // Verificar valores
        if (!Array.isArray(sensor.values) || sensor.values.length === 0) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            error: `El sensor ${sensor.filename} del descarga ${discharge.id} debe tener un array de valores no vacío`
          });
        }

        if (discharge.times.length !== sensor.values.length) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            error: `El sensor ${sensor.filename} del descarga ${discharge.id} tiene una longitud de valores (${sensor.values.length}) que no coincide con la longitud de tiempos (${discharge.times.length})`
          });
        }

        if (sensor.values.some(value => typeof value !== 'number' || isNaN(value))) {
          return res.status(StatusCodes.BAD_REQUEST).json({
            error: `El sensor ${sensor.filename} del descarga ${discharge.id} tiene valores no numéricos`
          });
        }
      }
    }
    
    logger.info(`Validación exitosa: ${data.discharges.length} descargas con datos de señales`);
    next();
  } catch (error) {
    logger.error(`Error en validación de datos: ${error.message}`);
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: 'Error en la validación de los datos dischargeales',
      details: error.message
    });
  }
}

/**
 * Middleware para validar los datos de configuración de modelo
 * @param {Request} req - Objeto de solicitud HTTP
 * @param {Response} res - Objeto de respuesta HTTP
 * @param {Function} next - Función para continuar con el siguiente middleware
 */
function validateModelConfig(req, res, next) {
  const { modelName, enabled } = req.body;
  
  if (!modelName || typeof modelName !== 'string') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: 'Se requiere un nombre de modelo válido'
    });
  }
  
  if (typeof enabled !== 'boolean') {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: 'La propiedad "enabled" debe ser un valor booleano'
    });
  }
  
  next();
}

module.exports = {
  validatedischargealData,
  validateModelConfig
};