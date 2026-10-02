import { MongoServerError } from 'mongodb';
import { nextSequence } from './counters';

const duplicateKey = () => new MongoServerError({ message: 'E11000 duplicate key', code: 11000 });

describe('nextSequence', () => {
  it('increments with an upsert and returns the new value', async () => {
    const findOneAndUpdate = jest.fn().mockResolvedValue({ _id: 'IT', seq: 7 });
    await expect(nextSequence({ findOneAndUpdate } as never, 'IT')).resolves.toBe(7);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'IT' },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' },
    );
  });

  it('retries once after losing a first-insert race', async () => {
    const findOneAndUpdate = jest
      .fn()
      .mockRejectedValueOnce(duplicateKey())
      .mockResolvedValueOnce({ _id: 'HR', seq: 2 });
    await expect(nextSequence({ findOneAndUpdate } as never, 'HR')).resolves.toBe(2);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('does not retry other errors, or a second duplicate-key error', async () => {
    const other = jest.fn().mockRejectedValue(new Error('network'));
    await expect(nextSequence({ findOneAndUpdate: other } as never, 'IT')).rejects.toThrow(
      'network',
    );
    expect(other).toHaveBeenCalledTimes(1);

    const dup = jest.fn().mockRejectedValue(duplicateKey());
    await expect(nextSequence({ findOneAndUpdate: dup } as never, 'IT')).rejects.toThrow('E11000');
    expect(dup).toHaveBeenCalledTimes(2);
  });
});
