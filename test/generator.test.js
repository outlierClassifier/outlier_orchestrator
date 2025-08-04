const orchestratorService = require('../src/services/orchestrator.service');
const axios = require('axios');

jest.mock('axios');

describe('prepareTrainingStream', () => {
  test('yields parsed discharges', async () => {
    const raw = [
      { id: 'd1', files: [{ name: 's1.txt', content: '0 1\n1 2' }] },
      { id: 'd2', files: [{ name: 's2.txt', content: '0 3\n1 4' }] }
    ];

    const stream = orchestratorService.prepareTrainingStream(raw);
    const out = [];
    for await (const d of stream) {
      out.push(d);
    }

    expect(out.length).toBe(2);
    expect(out[0].signals.length).toBe(1);
    expect(out[0].times.length).toBe(2);
  });
});

describe('trainModel', () => {
  beforeEach(() => {
    axios.mockClear();
    orchestratorService.models.test = {
      enabled: true,
      trainingUrl: 'http://localhost:9999/train'
    };
  });

  afterEach(() => {
    delete orchestratorService.models.test;
  });

  test('posts each discharge from the stream', async () => {
    axios.mockResolvedValue({ data: { expectedDischarges: 2 } });

    const discharges = [
      { id: 'd1', signals: [{ values: [1, 2] }], times: [0, 1], length: 2 },
      { id: 'd2', signals: [{ values: [3, 4] }], times: [0, 1], length: 2 }
    ];

    const stream = orchestratorService.prepareTrainingStream(discharges);
    await orchestratorService.trainModel('test', stream, discharges.length);

    expect(axios).toHaveBeenCalledTimes(3);
    expect(axios.mock.calls[0][0].url).toBe('http://localhost:9999/train');
    expect(axios.mock.calls[1][0].url).toBe('http://localhost:9999/train/1');
    expect(axios.mock.calls[2][0].url).toBe('http://localhost:9999/train/2');
  });
});
