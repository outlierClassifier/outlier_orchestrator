const orchestratorService = require('../src/services/orchestrator.service');
const axios = require('axios');

jest.mock('axios');

describe('batch training session', () => {
  beforeEach(() => {
    axios.mockClear();
    orchestratorService.models = {
      test: { enabled: true, trainingUrl: 'http://localhost:9999/train' }
    };
  });

  afterEach(() => {
    orchestratorService.models = {};
    orchestratorService.trainingSession = null;
  });

  test('sends discharges across multiple batches maintaining order', async () => {
    axios.mockResolvedValue({ data: { expectedDischarges: 4 } });

    await orchestratorService.startTrainingSession(4);
    await orchestratorService.sendTrainingBatch([
      { id: 'd1', signals: [{ values: [1] }], times: [0], length: 1 },
      { id: 'd2', signals: [{ values: [2] }], times: [0], length: 1 }
    ]);
    await orchestratorService.sendTrainingBatch([
      { id: 'd3', signals: [{ values: [3] }], times: [0], length: 1 },
      { id: 'd4', signals: [{ values: [4] }], times: [0], length: 1 }
    ]);

    expect(axios).toHaveBeenCalledTimes(5);
    expect(axios.mock.calls[0][0].url).toBe('http://localhost:9999/train');
    expect(axios.mock.calls[1][0].url).toBe('http://localhost:9999/train/1');
    expect(axios.mock.calls[2][0].url).toBe('http://localhost:9999/train/2');
    expect(axios.mock.calls[3][0].url).toBe('http://localhost:9999/train/3');
    expect(axios.mock.calls[4][0].url).toBe('http://localhost:9999/train/4');
  });
});
