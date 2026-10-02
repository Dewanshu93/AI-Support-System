import { API_BASE_PATH, APP_NAME } from './index';

describe('@sd/shared smoke', () => {
  it('exports the app name and API base path', () => {
    expect(APP_NAME).toBe('AI Service Desk Front Door');
    expect(API_BASE_PATH).toBe('/api');
  });
});
