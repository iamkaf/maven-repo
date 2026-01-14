export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface FileInfo {
  name: string;
  size: number;
  uploaded: string;
}

export interface ArtifactOrGroup {
  name: string;
  isArtifact: boolean;
}

export interface VersionWithBadges {
  version: string;
  latest: boolean;
  release: boolean;
}

export type GroupsResponse = ApiResponse<string[]>;
export type ArtifactsResponse = ApiResponse<ArtifactOrGroup[]>;
export type VersionsResponse = ApiResponse<VersionWithBadges[]>;
export type FilesResponse = ApiResponse<FileInfo[]>;
export type LatestResponse = ApiResponse<string>;
