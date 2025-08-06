const request = require('supertest');
const JSZip = require('jszip');

jest.mock('../src/services/orchestrator.service');
const orchestratorService = require('../src/services/orchestrator.service');
const app = require('../index');

describe('POST /api/automated-predicts', () => {
  beforeEach(() => {
    orchestratorService.orchestrate.mockResolvedValue({
      models: [{ modelName: 'model1', result: { justification: 0.6 } }],
      voting: { decision: 1, confidence: 0.9, votes: { 1: 1 } }
    });
  });

  afterEach(() => {
    orchestratorService.orchestrate.mockReset();
  });

  test('returns zip with raw and stats', async () => {
    const res = await request(app)
      .post('/api/automated-predicts')
      .send({
        predictions: [{ name: 'test', content: { discharges: [] } }],
        thresholds: { model1: { justificationThreshold: 0.5, countThreshold: 1 } }
      })
      .buffer()
      .parse((res, callback) => {
        res.setEncoding('binary');
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => callback(null, Buffer.from(data, 'binary')));
      });

    expect(res.status).toBe(200);
    const zip = await JSZip.loadAsync(res.body);
    expect(zip.file('raw/test.json')).toBeTruthy();
    expect(zip.file('stats/model1.csv')).toBeTruthy();
  });
});
