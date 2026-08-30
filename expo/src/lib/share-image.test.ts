import { shareErrorMessage, shareViewAsImage } from './share-image';

const deps = (over?: Partial<Parameters<typeof shareViewAsImage>[0]>) => ({
  capture: jest.fn(async () => 'file:///tmp/shot.png'),
  isAvailable: jest.fn(async () => true),
  share: jest.fn(async () => {}),
  ...over,
});

describe('shareViewAsImage', () => {
  it('captures, then shares what it captured', async () => {
    const d = deps();
    await expect(shareViewAsImage(d)).resolves.toEqual({ ok: true });
    expect(d.capture).toHaveBeenCalled();
    expect(d.share).toHaveBeenCalledWith('file:///tmp/shot.png');
  });

  // Sharing is absent on web and can be turned off on a managed device. Calling into it
  // there throws, which would read as a broken button rather than an unsupported device.
  it('stops before capturing when the device cannot share', async () => {
    const d = deps({ isAvailable: jest.fn(async () => false) });
    await expect(shareViewAsImage(d)).resolves.toEqual({ ok: false, reason: 'unavailable' });
    expect(d.capture).not.toHaveBeenCalled();
  });

  it('does not open the sheet when the capture failed', async () => {
    const d = deps({
      capture: jest.fn(async () => {
        throw new Error('nope');
      }),
    });
    await expect(shareViewAsImage(d)).resolves.toEqual({ ok: false, reason: 'capture-failed' });
    expect(d.share).not.toHaveBeenCalled();
  });

  it('reports a failure from the sheet itself', async () => {
    const d = deps({
      share: jest.fn(async () => {
        throw new Error('nope');
      }),
    });
    await expect(shareViewAsImage(d)).resolves.toEqual({ ok: false, reason: 'share-failed' });
  });

  // Every failure resolves rather than throwing. The caller puts the button into a
  // spinner before calling this, and a rejection would leave it there.
  it('resolves rather than throwing when the availability check itself fails', async () => {
    const d = deps({
      isAvailable: jest.fn(async () => {
        throw new Error('boom');
      }),
    });
    await expect(shareViewAsImage(d)).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });
});

describe('shareErrorMessage', () => {
  it.each(['unavailable', 'capture-failed', 'share-failed'] as const)(
    'has something to say about %s',
    (reason) => {
      expect(shareErrorMessage(reason).length).toBeGreaterThan(0);
    }
  );
});
