const orchestratorService = require('../src/services/orchestrator.service');
const axios = require('axios');

jest.mock('axios');

describe('discharge memory release', () => {
  beforeEach(() => {
    axios.mockClear();
    orchestratorService.models = {
      a: { enabled: true, trainingUrl: 'http://localhost:1111/train' },
      b: { enabled: true, trainingUrl: 'http://localhost:2222/train' }
    };
  });

  afterEach(async () => {
    orchestratorService.models = {};
    orchestratorService.finishTraining();
    await new Promise(r => setTimeout(r, 0));
  });

  test('frees discharge after all models send', async () => {
    axios.mockResolvedValue({ data: { expectedDischarges: 1 } });
    const d = { id: 'd1', signals: [{ values: [1] }], times: [0], length: 1 };
    await orchestratorService.startTrainingSession(1);
    await orchestratorService.sendTrainingBatch([d]);
    // Esperar a que las colas se procesen completamente
    while (!orchestratorService.allQueuesEmpty()) {
      await new Promise(r => setTimeout(r, 0));
    }
    expect(d.signals).toBeNull();
    expect(d.times).toBeNull();
  });
});
