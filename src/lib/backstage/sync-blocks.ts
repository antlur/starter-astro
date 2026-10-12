import {
  syncBlockManifests as syncSdkBlockManifests,
  validateBlockManifests as validateSdkBlockManifests,
  type BackstageClient,
  type BlockManifest as SdkBlockManifest,
  type BlockManifestSyncOptions,
  type BlockManifestSyncResult,
} from "@antlur/backstage";

export type BlockManifest = Omit<SdkBlockManifest, "registry_identity" | "derived_from"> & {
  registry_identity: string;
  derived_from?: string | null;
};
export type BlockSyncClient = Pick<BackstageClient, "blocks">;
export type BlockSyncOptions = BlockManifestSyncOptions;
export type BlockSyncResult = Pick<BlockManifestSyncResult, "created" | "updated" | "warnings">;

export function validateBlockManifests(manifests: readonly unknown[]): BlockManifest[] {
  if (manifests.length === 0) throw new Error("No block manifests were found.");
  return validateSdkBlockManifests(manifests);
}

export async function syncBlockManifests(
  client: BlockSyncClient,
  manifests: readonly unknown[],
  options: BlockSyncOptions = {},
): Promise<BlockSyncResult> {
  const result = await syncSdkBlockManifests(client, manifests, options);

  return {
    created: result.created,
    updated: result.updated,
    ...(result.warnings ? { warnings: result.warnings } : {}),
  };
}
