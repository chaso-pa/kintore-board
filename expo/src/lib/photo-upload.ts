import * as ImagePicker from 'expo-image-picker';

import { api } from '@/lib/api';

/**
 * Uploading a photo is three round trips, not one: ask the server to sign an upload URL,
 * PUT the bytes straight to storage, then tell the server a row now points at them.
 *
 * The sequence was copy-pasted into the gym and machine detail screens, and the
 * registration forms would have made four copies. The last step is the one that matters
 * most — the server treats the row, not the upload, as the thing being moderated, and it
 * rejects any URL that does not point into our own bucket.
 */

/** What a photo can be attached to. The two differ only in their URL prefix. */
export type PhotoTarget =
  | { kind: 'gym'; gymId: string }
  | { kind: 'machine'; machineId: string };

function basePath(target: PhotoTarget): string {
  return target.kind === 'gym'
    ? `/api/v1/gyms/${target.gymId}`
    : `/api/v1/machines/${target.machineId}`;
}

/** An image chosen but not yet uploaded. Registration forms hold these until the row exists. */
export interface PickedPhoto {
  uri: string;
  filename: string;
  contentType: string;
}

// React Native's XMLHttpRequest accepts this shape in place of a Blob, which is how a file
// is streamed from the device without reading it into memory first.
type RNFile = { uri: string; type: string; name: string };

function toPicked(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  return {
    uri: asset.uri,
    filename: asset.fileName ?? asset.uri.split('/').pop() ?? 'photo.jpg',
    contentType: asset.mimeType ?? 'image/jpeg',
  };
}

/** Opens the library and returns what was chosen. Empty when the user backed out. */
export async function pickPhotos(options?: { multiple?: boolean }): Promise<PickedPhoto[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    quality: 0.8,
    allowsMultipleSelection: options?.multiple ?? false,
  });
  if (result.canceled) return [];
  return result.assets.map(toPicked);
}

/** PUTs the bytes to the signed URL. Rejects on anything other than a 2xx. */
function putBytes(uploadURL: string, photo: PickedPhoto): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadURL);
    xhr.setRequestHeader('Content-Type', photo.contentType);
    xhr.timeout = 30000;
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`MinIO PUT failed: ${xhr.status} ${xhr.responseText}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send({
      uri: photo.uri,
      type: photo.contentType,
      name: photo.filename,
    } as unknown as RNFile & XMLHttpRequestBodyInit);
  });
}

/**
 * Uploads one photo and attaches it to the target.
 *
 * The row is created pending, so nobody but its author and an admin sees it until it is
 * reviewed. The caller does not have to care, except that a freshly uploaded photo will
 * not appear to anyone else.
 */
export async function uploadPhoto(target: PhotoTarget, photo: PickedPhoto): Promise<void> {
  const { data } = await api.post(`${basePath(target)}/photos/presign`, {
    filename: photo.filename,
    content_type: photo.contentType,
  });
  await putBytes(data.upload_url, photo);
  await api.post(`${basePath(target)}/photos`, { image_url: data.public_url });
}

/** The outcome of uploading a batch: how many landed, and why the rest did not. */
export interface BatchUploadResult {
  uploaded: number;
  failed: number;
  firstError?: unknown;
}

/**
 * Uploads photos one at a time, carrying on past a failure.
 *
 * Sequential rather than parallel: these run right after a gym or machine was created, on
 * whatever connection the phone has in a basement gym, and a burst of parallel PUTs there
 * fails more of them than it saves time.
 *
 * A failure is reported rather than thrown because of what has already happened by this
 * point. The gym exists, and there is no endpoint to delete it — so treating a failed
 * photo as a failed registration would tell the user their gym was not saved while it sits
 * in the review queue.
 */
export async function uploadPhotos(
  target: PhotoTarget,
  photos: PickedPhoto[]
): Promise<BatchUploadResult> {
  let uploaded = 0;
  let failed = 0;
  let firstError: unknown;

  for (const photo of photos) {
    try {
      await uploadPhoto(target, photo);
      uploaded += 1;
    } catch (e) {
      failed += 1;
      if (firstError === undefined) firstError = e;
      console.warn('[uploadPhotos] failed for', photo.filename, e);
    }
  }
  return { uploaded, failed, firstError };
}
