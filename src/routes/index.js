const express = require('express');
const multer = require('multer');
const os = require('os');
const orchestratorController = require('../controllers/orchestrator.controller');
const { validatedischargealData, validateModelConfig } = require('../middleware/validation.middleware');

const memoryUpload = multer();
const diskUpload = multer({ dest: os.tmpdir() });
const router = express.Router();

// Ruta para realizar predicciones
router.post('/predict', validatedischargealData, orchestratorController.predict);
router.post('/automated-predicts', diskUpload.any(), orchestratorController.automatedPredicts);
router.post('/automated-predicts/session', orchestratorController.startAutomatedPredictsSession);
router.post('/automated-predicts/session/:sessionId', diskUpload.single('file'), orchestratorController.uploadAutomatedPredict);
router.get('/automated-predicts/session/:sessionId/zip', orchestratorController.finalizeAutomatedPredicts);

// Ruta para entrenamiento de modelos
router.post('/train', validatedischargealData, orchestratorController.train);
router.post('/train/raw', memoryUpload.any(), orchestratorController.trainRaw);
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
