import { dbNameFromUri, DEFAULT_DB_NAME } from './client';

describe('dbNameFromUri', () => {
  it.each([
    ['mongodb://localhost:27017/servicedesk?directConnection=true', 'servicedesk'],
    ['mongodb://localhost:27017/sd_test', 'sd_test'],
    ['mongodb+srv://u:p@cluster0.example.net/prod?retryWrites=true', 'prod'],
    ['mongodb://h1:27017,h2:27017/multi?replicaSet=rs0', 'multi'],
    ['mongodb://localhost:27017', DEFAULT_DB_NAME],
    ['mongodb://localhost:27017/', DEFAULT_DB_NAME],
    ['mongodb://localhost:27017/?directConnection=true', DEFAULT_DB_NAME],
  ])('%s → %s', (uri, expected) => {
    expect(dbNameFromUri(uri)).toBe(expected);
  });
});
