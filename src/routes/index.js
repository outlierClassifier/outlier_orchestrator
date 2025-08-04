const express = require('express');
const multer = require('multer');
const orchestratorController = require('../controllers/orchestrator.controller');
const { validatedischargealData, validateModelConfig } = require('../middleware/validation.middleware');

const upload = multer();
const router = express.Router();

// Ruta para realizar predicciones
router.post('/predict', validatedischargealData, orchestratorController.predict);

// Ruta para entrenamiento de modelos
router.post('/train', validatedischargealData, orchestratorController.train);
router.post('/train/raw', upload.any(), orchestratorController.trainRaw);
router.post('/trainingCompleted', orchestratorController.trainingCompleted);

// Ruta para verificar la salud de los servicios
router.get('/health', orchestratorController.health);

// Rutas para la gestión de configuración
router.get('/config', orchestratorController.getConfig);
router.post('/config/model', validateModelConfig, orchestratorController.updateModelConfig);
router.post('/config/url', orchestratorController.updateModelUrl);
router.post('/config/model/name', orchestratorController.updateModelName);
router.post('/config/model/add', orchestratorController.addModel);
router.post('/config/model/delete', orchestratorController.deleteModel);

module.exports = router;
