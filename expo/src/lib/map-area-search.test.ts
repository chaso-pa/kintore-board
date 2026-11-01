import { shouldOfferAreaSearch, type MapArea } from './map-area-search';

const tokyo: MapArea = { latitude: 35.68, longitude: 139.76, latitudeDelta: 0.1, longitudeDelta: 0.1 };

describe('shouldOfferAreaSearch', () => {
  it('stays hidden for a small pan inside the searched area', () => {
    expect(shouldOfferAreaSearch(tokyo, { ...tokyo, latitude: tokyo.latitude + 0.02 })).toBe(false);
  });

  it('appears once the map has moved somewhere else', () => {
    const osaka = { ...tokyo, latitude: 34.69, longitude: 135.5 };
    expect(shouldOfferAreaSearch(tokyo, osaka)).toBe(true);
  });

  it('appears for a pan of more than about a third of the view', () => {
    expect(shouldOfferAreaSearch(tokyo, { ...tokyo, longitude: tokyo.longitude + 0.04 })).toBe(true);
  });

  // Everything in a smaller view was already in the larger one.
  it('stays hidden when zooming in', () => {
    expect(shouldOfferAreaSearch(tokyo, { ...tokyo, latitudeDelta: 0.02, longitudeDelta: 0.02 })).toBe(false);
  });

  it('appears when zooming well out', () => {
    expect(shouldOfferAreaSearch(tokyo, { ...tokyo, latitudeDelta: 0.5, longitudeDelta: 0.5 })).toBe(true);
  });

  // No location permission: the list was never centred anywhere.
  it('appears for any move when nothing was searched around a point', () => {
    expect(shouldOfferAreaSearch(null, tokyo)).toBe(true);
  });
});
