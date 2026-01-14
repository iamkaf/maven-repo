import type {
  ApiResponse,
  ArtifactOrGroup,
  ArtifactsResponse,
  FilesResponse,
  GroupsResponse,
  LatestResponse,
  VersionWithBadges,
  VersionsResponse,
} from '../types';

const API_URL = import.meta.env.VITE_API_URL || '/api';

async function fetchApi<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
  const url = new URL(`${API_URL}${endpoint}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });
  }

  const response = await fetch(url.toString());
  return response.json();
}

export const mavenApi = {
  getGroups: (): Promise<GroupsResponse> => fetchApi<string[]>('/groups'),

  getArtifacts: (group: string): Promise<ArtifactsResponse> =>
    fetchApi<ArtifactOrGroup[]>('/artifacts', { group }),

  getVersions: (group: string, artifact: string): Promise<VersionsResponse> =>
    fetchApi<VersionWithBadges[]>('/versions', { group, artifact }),

  getFiles: (
    group: string,
    artifact: string,
    version: string
  ): Promise<FilesResponse> =>
    fetchApi('/files', { group, artifact, version }),

  getLatest: (group: string, artifact: string): Promise<LatestResponse> =>
    fetchApi<string>('/latest', { group, artifact }),
};
