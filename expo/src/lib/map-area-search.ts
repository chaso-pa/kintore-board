/**
 * When the map offers "このエリアで検索".
 *
 * A nearby search returns the closest page of gyms to one point and nothing else, so once
 * the map has been moved somewhere else the pins on screen are the old area's and the new
 * one looks empty. The button re-runs the search around wherever the map now is.
 *
 * It appears only when the view has drifted far enough to matter: a small pan stays inside
 * the area already searched, and offering a search for it would be noise. Zooming in never
 * calls for one either — everything inside a smaller view was already in the larger one.
 */

export interface MapArea {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** How far the centre may move, as a share of the visible span, before it counts. */
const PAN_THRESHOLD = 0.3;
/** How much wider than the searched view the map may get before it counts. */
const ZOOM_OUT_THRESHOLD = 2;

/**
 * `searched` is the view the current results were fetched for, or null when they were not
 * fetched around a point at all (no location permission: the list is just newest first).
 * In that case any deliberate move is worth offering a search for.
 */
export function shouldOfferAreaSearch(searched: MapArea | null, visible: MapArea): boolean {
  if (!searched) return true;
  const panned =
    Math.abs(visible.latitude - searched.latitude) > visible.latitudeDelta * PAN_THRESHOLD ||
    Math.abs(visible.longitude - searched.longitude) > visible.longitudeDelta * PAN_THRESHOLD;
  const zoomedOut = visible.latitudeDelta > searched.latitudeDelta * ZOOM_OUT_THRESHOLD;
  return panned || zoomedOut;
}
