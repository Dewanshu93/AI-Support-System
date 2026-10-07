import { site } from './site';

describe('@sd/web smoke', () => {
  it('uses the shared app name', () => {
    expect(site.name).toBe('Employee Hub');
  });
});
