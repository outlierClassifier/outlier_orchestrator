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
    await new Promise(res => setImmediate(res));
    await orchestratorService.sendTrainingBatch([
      { id: 'd2', signals: [{ values: [2] }], times: [0], length: 1 }
    ]);
    await new Promise(res => setImmediate(res));

    expect(axios).toHaveBeenCalledTimes(3);
    expect(axios.mock.calls[0][0].url).toBe('http://localhost:9999/train');
    expect(axios.mock.calls[1][0].url).toBe('http://localhost:9999/train/1');
    expect(axios.mock.calls[2][0].url).toBe('http://localhost:9999/train/2');
  });

  test('retries on network error', async () => {
    axios
      .mockResolvedValueOnce({ data: { expectedDischarges: 1 } })
      .mockRejectedValueOnce({ message: 'NetworkError', response: null })
      .mockResolvedValueOnce({});

    await orchestratorService.startTrainingSession(1);
    await orchestratorService.sendTrainingBatch([
      { id: 'd1', signals: [{ values: [1] }], times: [0], length: 1 }
    ]);

    await new Promise(res => setTimeout(res, 600));
    expect(axios).toHaveBeenCalledTimes(3); // start + retry
  });
});
