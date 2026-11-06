/**
 * Defaults for every query over the local records DB (plan §3.3). The data is on the device,
 * so the network state is irrelevant, it changes only when we write it (and then we
 * invalidate), and a failed read will not succeed on a retry.
 */
export const recordsQueryDefaults = {
  networkMode: 'always',
  staleTime: Infinity,
  retry: false,
} as const;
