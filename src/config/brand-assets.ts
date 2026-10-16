// Rev the public asset URLs when artwork changes, including installed-app icons.
export const brandAssetRevision = "cav-20261016";

export function brandAsset(path: string) {
  return `/brand/${path}?v=${brandAssetRevision}`;
}
