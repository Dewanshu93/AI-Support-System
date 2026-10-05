import { documentSparseVector, querySparseVector, termIndex, tokenize } from './bm25';

describe('tokenize', () => {
  it('lowercases, strips accents and punctuation, drops stopwords', () => {
    expect(tokenize('The GlobalProtect VPN — résumé, Wi-Fi & 16 weeks!')).toEqual([
      'globalprotect',
      'vpn',
      'resume',
      'wi',
      'fi',
      '16',
      'weeks',
    ]);
  });

  it('keeps single digits but drops single letters', () => {
    expect(tokenize('a b 5 x 401 k')).toEqual(['5', '401']);
  });
});

describe('sparse vectors', () => {
  it('maps the same term to the same index in documents and queries', () => {
    const doc = documentSparseVector('Parental leave is 16 weeks of paid leave');
    const query = querySparseVector('how many weeks parental leave');
    for (const term of ['parental', 'leave', 'weeks']) {
      expect(doc.indices).toContain(termIndex(term));
      expect(query.indices).toContain(termIndex(term));
    }
  });

  it('has sorted, unique indices and one value per index', () => {
    const v = documentSparseVector('leave leave leave policy policy vpn');
    expect(v.indices).toEqual([...new Set(v.indices)].sort((a, b) => a - b));
    expect(v.values).toHaveLength(v.indices.length);
    for (const i of v.indices) expect(i).toBeLessThan(2 ** 32);
  });

  it('weights repeated terms higher, with saturation', () => {
    const v = documentSparseVector('leave leave leave vpn');
    const weight = (term: string) => v.values[v.indices.indexOf(termIndex(term))]!;
    expect(weight('leave')).toBeGreaterThan(weight('vpn'));
    expect(weight('leave')).toBeLessThan(3 * weight('vpn'));
  });

  it('gives every query term weight 1 and ignores stopwords', () => {
    expect(querySparseVector('the VPN the VPN')).toEqual({
      indices: [termIndex('vpn')],
      values: [1],
    });
    expect(querySparseVector('the and of')).toEqual({ indices: [], values: [] });
  });

  it('is deterministic', () => {
    expect(documentSparseVector('Annual leave carry over')).toEqual(
      documentSparseVector('Annual leave carry over'),
    );
  });
});
