require('dotenv').config();

// Configuración persistente (se guarda en memoria durante la ejecución)
let persistentConfig = {
  models: {
    svm: {
      url: process.env.SVM_MODEL_URL || 'http://localhost:8001/predict',
      enabled: true,
      trainingUrl: process.env.SVM_TRAINING_URL || 'http://localhost:8001/train',
      healthUrl: process.env.SVM_HEALTHCHECK_URL || 'http://localhost:8001/health',
      displayName: 'SVM'
    },
    lstm: {
      url: process.env.LSTM_MODEL_URL || 'http://localhost:8002/predict',
      enabled: true,
      trainingUrl: process.env.LSTM_TRAINING_URL || 'http://localhost:8002/train',
      healthUrl: process.env.LSTM_HEALTHCHECK_URL || 'http://localhost:8002/health',
      displayName: 'LSTM'
    },
    xgboost: {
      url: process.env.XGBOOST_MODEL_URL || 'http://localhost:8003/predict',
      enabled: true,
      trainingUrl: process.env.XGBOOST_TRAINING_URL || 'http://localhost:8003/train',
      healthUrl: process.env.XGBOOST_HEALTHCHECK_URL || 'http://localhost:8003/health',
      displayName: 'XGBoost'
    }
  }
};

module.exports = {
  // Server configuration
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  // Model endpoints - referencias a la configuración persistente
  get models() {
    return persistentConfig.models;
  },
  
  // Función para actualizar las URLs de los modelos
  updateModelUrl(modelName, url, type = 'predict') {
    if (!persistentConfig.models[modelName]) {
      throw new Error(`Modelo '${modelName}' no encontrado`);
    }
    
    if (type === 'predict') {
      persistentConfig.models[modelName].url = url;
    } else if (type === 'train') {
      persistentConfig.models[modelName].trainingUrl = url;
    } else if (type === 'health') {
      persistentConfig.models[modelName].healthUrl = url;
    }
  },

  // Actualiza el nombre visible de un modelo
  updateModelDisplayName(modelName, displayName) {
    if (!persistentConfig.models[modelName]) {
      throw new Error(`Modelo '${modelName}' no encontrado`);
    }
    persistentConfig.models[modelName].displayName = displayName;
  },

  // Agrega un nuevo modelo a la configuración
  addModel(name, urls) {
    const key = name.toLowerCase().replace(/\s+/g, '_');
    if (persistentConfig.models[key]) {
      throw new Error(`El modelo '${name}' ya existe`);
    }
    persistentConfig.models[key] = {
      url: urls.url,
      trainingUrl: urls.trainingUrl,
      healthUrl: urls.healthUrl,
      enabled: true,
      displayName: name
    };
    return key;
  },

  // Elimina un modelo de la configuración
  removeModel(modelName) {
    if (!persistentConfig.models[modelName]) {
      throw new Error(`Modelo '${modelName}' no encontrado`);
    }
    delete persistentConfig.models[modelName];
  },
  
  // Request timeouts
  timeouts: {
    model: parseInt(process.env.MODEL_TIMEOUT || 10000), // 10 seconds
    training: parseInt(process.env.TRAINING_TIMEOUT || 60000) // 1 minute
  },
  
  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
};