import { uploadPhotos, type PickedPhoto } from './photo-upload';

jest.mock('@/lib/api', () => ({ api: { post: jest.fn() } }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const { api } = jest.requireMock('@/lib/api') as { api: { post: jest.Mock } };

function photo(name: string): PickedPhoto {
  return { uri: `file:///${name}`, filename: name, contentType: 'image/jpeg' };
}

// XMLHttpRequest is the upload transport, and jsdom's version will not PUT to a file:// URI.
// Replacing it lets the batching behaviour be tested without a network or a real image.
class FakeXHR {
  static failOn: string[] = [];
  static sent: string[] = [];
  private url = '';
  status = 200;
  responseText = '';
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  open(_method: string, url: string) {
    this.url = url;
  }
  setRequestHeader() {}
  send(body: { name: string }) {
    FakeXHR.sent.push(body.name);
    if (FakeXHR.failOn.includes(body.name)) {
      this.status = 500;
      this.responseText = 'boom';
    }
    // Resolve on the next tick so the promise in putBytes is already awaited.
    setTimeout(() => this.onload?.(), 0);
  }
}

beforeEach(() => {
  FakeXHR.failOn = [];
  FakeXHR.sent = [];
  api.post.mockReset();
  api.post.mockImplementation((path: string) => {
    if (path.endsWith('/presign')) {
      return Promise.resolve({
        data: { upload_url: 'https://cdn.example.com/put', public_url: 'https://cdn.example.com/kintore/a.jpg' },
      });
    }
    return Promise.resolve({ data: {} });
  });
  // @ts-expect-error - swapping the global transport for the fake above
  global.XMLHttpRequest = FakeXHR;
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('uploadPhotos', () => {
  it('uploads every photo and reports the count', async () => {
    const result = await uploadPhotos({ kind: 'gym', gymId: 'g1' }, [photo('a.jpg'), photo('b.jpg')]);
    expect(result).toEqual({ uploaded: 2, failed: 0, firstError: undefined });
  });

  it('sends them one at a time, in order', async () => {
    await uploadPhotos({ kind: 'gym', gymId: 'g1' }, [photo('a.jpg'), photo('b.jpg'), photo('c.jpg')]);
    // Sequential rather than parallel: these run right after a registration, often on a
    // poor connection, where a burst of parallel PUTs loses more than it saves.
    expect(FakeXHR.sent).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  // The gym or machine already exists by this point and cannot be deleted, so one bad
  // photo must not read as a failed registration.
  it('carries on past a failure and reports it', async () => {
    FakeXHR.failOn = ['b.jpg'];
    const result = await uploadPhotos({ kind: 'gym', gymId: 'g1' }, [
      photo('a.jpg'),
      photo('b.jpg'),
      photo('c.jpg'),
    ]);
    expect(result.uploaded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.firstError).toBeDefined();
    // The photo after the failure was still attempted.
    expect(FakeXHR.sent).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });

  it('never rejects, even when every photo fails', async () => {
    FakeXHR.failOn = ['a.jpg', 'b.jpg'];
    await expect(
      uploadPhotos({ kind: 'gym', gymId: 'g1' }, [photo('a.jpg'), photo('b.jpg')])
    ).resolves.toEqual(expect.objectContaining({ uploaded: 0, failed: 2 }));
  });

  it('does nothing when there is nothing to upload', async () => {
    const result = await uploadPhotos({ kind: 'machine', machineId: 'm1' }, []);
    expect(result).toEqual({ uploaded: 0, failed: 0, firstError: undefined });
    expect(api.post).not.toHaveBeenCalled();
  });

  it('addresses the right endpoints for each target kind', async () => {
    await uploadPhotos({ kind: 'gym', gymId: 'g1' }, [photo('a.jpg')]);
    expect(api.post).toHaveBeenCalledWith('/api/v1/gyms/g1/photos/presign', expect.anything());
    expect(api.post).toHaveBeenCalledWith('/api/v1/gyms/g1/photos', {
      image_url: 'https://cdn.example.com/kintore/a.jpg',
    });

    api.post.mockClear();
    await uploadPhotos({ kind: 'machine', machineId: 'm1' }, [photo('a.jpg')]);
    expect(api.post).toHaveBeenCalledWith('/api/v1/machines/m1/photos/presign', expect.anything());
    expect(api.post).toHaveBeenCalledWith('/api/v1/machines/m1/photos', expect.anything());
  });

  // The server only accepts a URL inside our own bucket, so the value it handed back at
  // presign time is the one that has to be sent on — not the upload URL, which is signed
  // and temporary.
  it('attaches the public url, not the signed upload url', async () => {
    await uploadPhotos({ kind: 'gym', gymId: 'g1' }, [photo('a.jpg')]);
    const attach = api.post.mock.calls.find(([p]) => p === '/api/v1/gyms/g1/photos');
    expect(attach?.[1]).toEqual({ image_url: 'https://cdn.example.com/kintore/a.jpg' });
  });
});
