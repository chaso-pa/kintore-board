import { sumTotalVolume } from '@/utils/volume';

describe('sumTotalVolume', () => {
  it('multiplies weight, reps and set count', () => {
    expect(sumTotalVolume([{ weight: 50, reps: 10, sets: 3 }])).toBe(1500);
  });

  // sets is nullable in the schema and arrives as 0 when unset. Multiplying straight
  // through would drop the row from the total without any visible error.
  it('treats a zero set count as one', () => {
    expect(sumTotalVolume([{ weight: 50, reps: 10, sets: 0 }])).toBe(500);
  });

  it('sums across sets', () => {
    expect(
      sumTotalVolume([
        { weight: 100, reps: 5, sets: 1 },
        { weight: 90, reps: 8, sets: 1 },
      ])
    ).toBe(1220);
  });

  it('contributes nothing for bodyweight sets', () => {
    expect(sumTotalVolume([{ weight: 0, reps: 20, sets: 1 }])).toBe(0);
  });

  it('returns zero for an empty list', () => {
    expect(sumTotalVolume([])).toBe(0);
  });
});
