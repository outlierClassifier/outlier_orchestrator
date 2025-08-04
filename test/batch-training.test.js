const orchestratorService = require('../src/services/orchestrator.service');
const axios = require('axios');

jest.mock('axios');

describe('batch training session', () => {
  beforeEach(() => {
    axios.mockClear();
    orchestratorService.models = {
      test: {
        enabled: true,
        trainingUrl: 'http://localhost:9999/train'
      }
    };
  });

  afterEach(() => {
    orchestratorService.models = {};
    orchestratorService.finishTraining();
  });

  test('processes multiple batches without restarting', async () => {
    axios.mockResolvedValue({ data: { expectedDischarges: 2 } });

    await orchestratorService.startTrainingSession(2);
    await orchestratorService.sendTrainingBatch([
      { id: 'd1', signals: [{ values: [1] }], times: [0], length: 1 }
    ]);
    await orchestratorService.sendTrainingBatch([
      { id: 'd2', signals: [{ values: [2] }], times: [0], length: 1 }
    ]);

    await Promise.all(
      Object.values(orchestratorService.trainingSession.models).map(m => m.queue)
    );

    expect(axios).toHaveBeenCalledTimes(3);
    expect(axios.mock.calls[0][0].url).toBe('http://localhost:9999/train');
    expect(axios.mock.calls[1][0].url).toBe('http://localhost:9999/train/1');
    expect(axios.mock.calls[2][0].url).toBe('http://localhost:9999/train/2');
  });
});
