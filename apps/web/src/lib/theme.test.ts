import { parsePreference, resolveTheme, THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

describe('theme', () => {
  it('unknown or missing stored values mean "system"', () => {
    expect(parsePreference('dark')).toBe('dark');
    expect(parsePreference('light')).toBe('light');
    expect(parsePreference(null)).toBe('system');
    expect(parsePreference('purple')).toBe('system');
  });

  it('an explicit choice wins; "system" follows the OS', () => {
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('the pre-paint script reads the same storage key and is safe to inline', () => {
    expect(THEME_INIT_SCRIPT).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
    expect(THEME_INIT_SCRIPT).not.toContain('</script');
  });
});
