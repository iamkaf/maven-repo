import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

const builder = new XMLBuilder({
  ignoreAttributes: false,
  format: true,
});

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

interface Env {
  R2: R2Bucket;
  MAVEN_PUBLISH_USERNAME?: string;
  MAVEN_PUBLISH_PASSWORD?: string;
}

interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

interface MavenMetadata {
  metadata?: {
    groupId?: string;
    artifactId?: string;
    version?: string;
    versioning?: {
      latest?: string;
      release?: string;
      snapshot?: {
        timestamp?: string;
        buildNumber?: number;
      };
      lastUpdated?: string;
      snapshotVersions?: {
        snapshotVersion?: Array<{
          extension?: string;
          classifier?: string;
          value?: string;
          updated?: string;
        }>;
      };
      versions?: {
        version?: string[];
      };
    };
  };
}

interface SnapshotMetadata {
  timestamp: string;      // Format: yyyyMMdd.HHmmss
  buildNumber: number;    // Incremental integer
}

// ----------------------------------------------------------------------------
// Utilities
// ----------------------------------------------------------------------------

const jsonResponse = <T>(data: T, status: number = 200): Response => {
  const body: ApiResponse<T> = { data, error: null };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

const errorResponse = (message: string, status: number = 400): Response => {
  const body = { data: null, error: message };
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ----------------------------------------------------------------------------
// Authentication
// ----------------------------------------------------------------------------

const validateBasicAuth = (request: Request, env: Env): boolean => {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  const username = env.MAVEN_PUBLISH_USERNAME;
  const password = env.MAVEN_PUBLISH_PASSWORD;

  if (!username || !password) {
    console.error('Auth credentials not configured');
    return false;
  }

  // Decode Basic Auth header
  const token = authHeader.substring(6);
  const decoded = atob(token);
  const [providedUsername, providedPassword] = decoded.split(':');

  return providedUsername === username && providedPassword === password;
};

const unauthorizedResponse = (): Response => {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Maven Repository"',
      'Content-Type': 'text/plain',
    },
  });
};

// ----------------------------------------------------------------------------
// Version Immutability Checker
// ----------------------------------------------------------------------------

const checkVersionExists = async (
  groupPath: string,
  artifactId: string,
  version: string,
  env: Env
): Promise<boolean> => {
  const prefix = `${groupPath}/${artifactId}/${version}/`;
  const listed = await env.R2.list({ prefix, limit: 1 });

  return listed.objects.length > 0;
};

// ----------------------------------------------------------------------------
// Maven Metadata Parser
// ----------------------------------------------------------------------------

const parseMavenMetadata = (xml: string): MavenMetadata | null => {
  try {
    return parser.parse(xml);
  } catch {
    return null;
  }
};

// ----------------------------------------------------------------------------
// API Handlers
// ----------------------------------------------------------------------------

// GET /api/groups
// List top-level groups (e.g., "com")
const handleGetGroups = async (env: Env): Promise<Response> => {
  const listed = await env.R2.list({ delimiter: '/' });

  if (!listed.delimitedPrefixes) {
    return jsonResponse([]);
  }

  const groups = listed.delimitedPrefixes
    .map((p) => p.replace(/\/$/, ''))
    .filter((g) => g && !g.startsWith('.'));

  return jsonResponse(groups);
};

// GET /api/artifacts?group=com.iamkaf
// List artifacts and subgroups under a group
const handleGetArtifacts = async (url: URL, env: Env): Promise<Response> => {
  const group = url.searchParams.get('group');

  if (!group) {
    return errorResponse('Missing required parameter: group', 400);
  }

  const groupPath = group.replace(/\./g, '/');
  const listed = await env.R2.list({
    prefix: `${groupPath}/`,
    delimiter: '/',
  });

  if (!listed.delimitedPrefixes) {
    return jsonResponse([]);
  }

  // Check each directory: if it has maven-metadata.xml it's an artifact, otherwise a subgroup
  const dirPromises = listed.delimitedPrefixes
    .map(async (prefix) => {
      const name = prefix.replace(/\/$/, '').split('/').pop();
      if (!name || name.startsWith('.')) return null;

      // Check if maven-metadata.xml exists in this directory
      const metadataPath = `${groupPath}/${name}/maven-metadata.xml`;
      const metadataObject = await env.R2.get(metadataPath);

      return {
        name,
        isArtifact: !!metadataObject,
      };
    });

  const results = await Promise.all(dirPromises);
  const validResults = results.filter((r): r is { name: string; isArtifact: boolean } => r !== null);

  return jsonResponse(validResults);
};

// GET /api/versions?group=...&artifact=...
// List versions for an artifact with badges
const handleGetVersions = async (url: URL, env: Env): Promise<Response> => {
  const group = url.searchParams.get('group');
  const artifact = url.searchParams.get('artifact');

  if (!group || !artifact) {
    return errorResponse('Missing required parameters: group, artifact', 400);
  }

  const groupPath = group.replace(/\./g, '/');
  const metadataPath = `${groupPath}/${artifact}/maven-metadata.xml`;

  const object = await env.R2.get(metadataPath);
  if (!object) {
    return errorResponse('Artifact not found', 404);
  }

  const xml = await object.text();
  const parsed = parseMavenMetadata(xml);

  if (!parsed?.metadata?.versioning?.versions?.version) {
    return errorResponse('Invalid maven-metadata.xml', 500);
  }

  const versions = parsed.metadata.versioning.versions.version;
  const versionsArray = Array.isArray(versions) ? versions : [versions];
  const latest = parsed.metadata.versioning?.latest || parsed.metadata.versioning?.release;
  const release = parsed.metadata.versioning?.release;

  // Sort versions semantically (simple version sorting)
  versionsArray.sort((a, b) => {
    const partsA = a.split('.').map(Number);
    const partsB = b.split('.').map(Number);
    for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
      const numA = partsA[i] || 0;
      const numB = partsB[i] || 0;
      if (numA !== numB) return numB - numA;
    }
    return 0;
  });

  // Return versions with badges
  const versionsWithBadges = versionsArray.map((version: string) => ({
    version,
    latest: version === latest,
    release: version === release,
  }));

  return jsonResponse(versionsWithBadges);
};

// GET /api/files?group=...&artifact=...&version=...
// List files for a specific version
const handleGetFiles = async (url: URL, env: Env): Promise<Response> => {
  const group = url.searchParams.get('group');
  const artifact = url.searchParams.get('artifact');
  const version = url.searchParams.get('version');

  if (!group || !artifact || !version) {
    return errorResponse('Missing required parameters: group, artifact, version', 400);
  }

  const groupPath = group.replace(/\./g, '/');
  const prefix = `${groupPath}/${artifact}/${version}/`;

  const listed = await env.R2.list({ prefix });

  if (!listed.objects) {
    return jsonResponse([]);
  }

  const files = listed.objects
    .filter((obj) => obj.key.startsWith(prefix))
    .map((obj) => ({
      name: obj.key.replace(prefix, ''),
      size: obj.size,
      uploaded: obj.uploaded,
    }))
    .filter((f) => f.name && !f.name.startsWith('.'));

  return jsonResponse(files);
};

// GET /api/latest?group=...&artifact=...
// Get latest version
const handleGetLatest = async (url: URL, env: Env): Promise<Response> => {
  const group = url.searchParams.get('group');
  const artifact = url.searchParams.get('artifact');

  if (!group || !artifact) {
    return errorResponse('Missing required parameters: group, artifact', 400);
  }

  const groupPath = group.replace(/\./g, '/');
  const metadataPath = `${groupPath}/${artifact}/maven-metadata.xml`;

  const object = await env.R2.get(metadataPath);
  if (!object) {
    return errorResponse('Artifact not found', 404);
  }

  const xml = await object.text();
  const parsed = parseMavenMetadata(xml);

  const latest = parsed?.metadata?.versioning?.latest ||
                parsed?.metadata?.versioning?.release;

  if (!latest) {
    return errorResponse('Could not determine latest version', 500);
  }

  return jsonResponse(latest);
};

// ----------------------------------------------------------------------------
// Publishing Handler
// ----------------------------------------------------------------------------

// PUT /releases/com/iamkaf/artifact/version/file.jar
const handleReleasePut = async (
  request: Request,
  url: URL,
  env: Env
): Promise<Response> => {
  // 1. Validate authentication
  if (!validateBasicAuth(request, env)) {
    return unauthorizedResponse();
  }

  // 2. Parse path: /releases/com/iamkaf/artifact/version/file.jar
  const pathname = url.pathname;
  if (!pathname.startsWith('/releases/')) {
    return errorResponse('Invalid release path', 400);
  }

  const mavenPath = pathname.substring('/releases/'.length);
  const pathParts = mavenPath.split('/');

  if (pathParts.length < 4) {
    return errorResponse('Invalid Maven path format', 400);
  }

  // Extract coordinates from path
  const versionIndex = pathParts.length - 2;
  const fileName = pathParts[pathParts.length - 1];
  const version = pathParts[versionIndex];
  const artifactId = pathParts[versionIndex - 1];
  const groupParts = pathParts.slice(0, versionIndex - 1);
  const groupPath = groupParts.join('/');

  // 3. Validate file extension
  const validExtensions = ['.jar', '.pom', '.module', '.xml', '.sha1', '.sha256', '.asc'];
  const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));

  if (!hasValidExtension) {
    return errorResponse('Invalid file type', 400);
  }

  // 4. Check version immutability (only for artifact files, not metadata or hash files)
  if (!fileName.endsWith('.sha1') && !fileName.endsWith('.sha256') && !fileName.includes('maven-metadata')) {
    const versionExists = await checkVersionExists(groupPath, artifactId, version, env);

    if (versionExists) {
      return new Response(`Version ${version} already exists`, {
        status: 409,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  // 5. Get file content from request body
  const fileContent = await request.arrayBuffer();

  // 6. Construct R2 key
  const r2Key = `${groupPath}/${artifactId}/${version}/${fileName}`;

  // 7. Upload to R2
  await env.R2.put(r2Key, fileContent);

  // 8. Return success
  console.log(`Uploaded: ${r2Key} (${fileContent.byteLength} bytes)`);

  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};

// ----------------------------------------------------------------------------
// Snapshot Publishing Handler
// ----------------------------------------------------------------------------

// PUT /snapshots/com/iamkaf/artifact/version-SNAPSHOT/file.jar
const handleSnapshotPut = async (
  request: Request,
  url: URL,
  env: Env
): Promise<Response> => {
  // 1. Validate authentication
  if (!validateBasicAuth(request, env)) {
    return unauthorizedResponse();
  }

  // 2. Parse path: /snapshots/com/iamkaf/artifact/version-SNAPSHOT/file.jar
  const pathname = url.pathname;
  if (!pathname.startsWith('/snapshots/')) {
    return errorResponse('Invalid snapshot path', 400);
  }

  const mavenPath = pathname.substring('/snapshots/'.length);
  const pathParts = mavenPath.split('/');

  if (pathParts.length < 4) {
    return errorResponse('Invalid path format', 400);
  }

  const fileName = pathParts[pathParts.length - 1];
  const version = pathParts[pathParts.length - 2];
  const artifactId = pathParts[pathParts.length - 3];
  const groupParts = pathParts.slice(0, pathParts.length - 3);
  const groupPath = groupParts.join('/');

  // 3. Validate version ends with -SNAPSHOT
  if (!version.endsWith('-SNAPSHOT')) {
    return errorResponse('Version must end with -SNAPSHOT', 400);
  }

  // 4. Validate file type (same as releases)
  const validExtensions = ['.jar', '.pom', '.module', '.xml', '.sha1', '.sha256', '.asc'];
  const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));
  if (!hasValidExtension) {
    return errorResponse('Invalid file type', 400);
  }

  // 5. Extract base version (e.g., "1.0" from "1.0-SNAPSHOT")
  const baseVersion = version.substring(0, version.length - '-SNAPSHOT'.length);

  // 6. Generate or read snapshot metadata
  const snapshotMetadata = await getOrGenerateSnapshotMetadata(
    env,
    groupPath,
    artifactId,
    version
  );

  // 7. Generate timestamped filename
  const { baseFileName, extension } = parseFileName(fileName);
  const timestampedFileName = `${baseFileName}-${baseVersion}-${snapshotMetadata.timestamp}-${snapshotMetadata.buildNumber}.${extension}`;

  // 8. Upload to R2 with timestamped name
  const r2Key = `${groupPath}/${artifactId}/${version}/${timestampedFileName}`;
  const fileContent = await request.arrayBuffer();
  await env.R2.put(r2Key, fileContent);

  // 9. Update maven-metadata.xml
  await updateSnapshotMetadata(
    env,
    groupPath,
    artifactId,
    version,
    baseVersion,
    snapshotMetadata,
    extension
  );

  // 10. Return success with timestamped filename
  console.log(`Uploaded snapshot: ${r2Key} (${fileContent.byteLength} bytes)`);

  return new Response(JSON.stringify({
    success: true,
    file: timestampedFileName,
    timestamp: snapshotMetadata.timestamp,
    buildNumber: snapshotMetadata.buildNumber
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

// ----------------------------------------------------------------------------
// Snapshot Helper Functions
// ----------------------------------------------------------------------------

function parseFileName(fileName: string): { baseFileName: string; extension: string } {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return { baseFileName: fileName, extension: '' };
  }
  return {
    baseFileName: fileName.substring(0, lastDotIndex),
    extension: fileName.substring(lastDotIndex + 1)
  };
}

async function getOrGenerateSnapshotMetadata(
  env: Env,
  groupPath: string,
  artifactId: string,
  version: string
): Promise<SnapshotMetadata> {
  const metadataKey = `${groupPath}/${artifactId}/${version}/maven-metadata.xml`;

  // Try to read existing metadata
  const existing = await env.R2.get(metadataKey);

  if (existing) {
    const metadataText = await existing.text();
    const parsed = parser.parse(metadataText) as MavenMetadata;

    const existingTimestamp = parsed.metadata?.versioning?.snapshot?.timestamp;
    const existingBuildNumber = parsed.metadata?.versioning?.snapshot?.buildNumber;

    // Check if we need a new timestamp (new day or different version)
    const now = new Date();
    const newTimestamp = formatTimestamp(now);

    if (existingTimestamp === newTimestamp) {
      // Same day, increment build number
      return {
        timestamp: existingTimestamp,
        buildNumber: (existingBuildNumber || 0) + 1
      };
    } else {
      // New timestamp, reset build number to 1
      return {
        timestamp: newTimestamp,
        buildNumber: 1
      };
    }
  }

  // No existing metadata, generate initial
  const now = new Date();
  return {
    timestamp: formatTimestamp(now),
    buildNumber: 1
  };
}

function formatTimestamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}.${hours}${minutes}${seconds}`;
}

async function updateSnapshotMetadata(
  env: Env,
  groupPath: string,
  artifactId: string,
  version: string,
  baseVersion: string,
  snapshotMetadata: SnapshotMetadata,
  extension: string
): Promise<void> {
  const metadataKey = `${groupPath}/${artifactId}/${version}/maven-metadata.xml`;

  // Read existing metadata to preserve snapshotVersions
  const existing = await env.R2.get(metadataKey);
  let snapshotVersions: any[] = [];

  if (existing) {
    const metadataText = await existing.text();
    const parsed = parser.parse(metadataText) as MavenMetadata;
    const rawVersions = parsed.metadata?.versioning?.snapshotVersions?.snapshotVersion;
    snapshotVersions = Array.isArray(rawVersions) ? rawVersions : (rawVersions ? [rawVersions] : []);
  }

  // Add or update this file's snapshot version
  const timestampedValue = `${baseVersion}-${snapshotMetadata.timestamp}-${snapshotMetadata.buildNumber}`;
  const lastUpdated = formatTimestamp(new Date()).replace('.', '');

  const existingVersionIndex = snapshotVersions.findIndex(
    (sv: any) => sv.extension === extension && sv.classifier === (extension === 'jar' ? undefined : extension)
  );

  if (existingVersionIndex >= 0) {
    snapshotVersions[existingVersionIndex] = {
      extension: extension,
      value: timestampedValue,
      updated: lastUpdated
    };
  } else {
    snapshotVersions.push({
      extension: extension,
      value: timestampedValue,
      updated: lastUpdated
    });
  }

  // Build metadata XML
  const metadata = {
    metadata: {
      groupId: groupPath.replace(/\//g, '.'),
      artifactId: artifactId,
      version: version,
      versioning: {
        snapshot: {
          timestamp: snapshotMetadata.timestamp,
          buildNumber: snapshotMetadata.buildNumber
        },
        lastUpdated: lastUpdated,
        snapshotVersions: {
          snapshotVersion: snapshotVersions
        },
        versions: {
          version: snapshotVersions.map((sv: any) => sv.value)
        },
        latest: version,
        release: version
      }
    }
  };

  // Convert to XML and upload
  const xml = builder.build(metadata);
  await env.R2.put(metadataKey, xml);
}

// ----------------------------------------------------------------------------
// Main Request Handler
// ----------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Route handling
    const path = url.pathname;

    // Route: /releases/* for immutable release uploads (PUT only)
    if (path.startsWith('/releases/')) {
      if (request.method !== 'PUT') {
        return errorResponse('Method not allowed', 405);
      }
      return await handleReleasePut(request, url, env);
    }

    // Route: /snapshots/* for mutable snapshot uploads (PUT only)
    if (path.startsWith('/snapshots/')) {
      if (request.method !== 'PUT') {
        return errorResponse('Method not allowed', 405);
      }
      return await handleSnapshotPut(request, url, env);
    }

    // Route: /api/* for metadata API (GET only)
    if (request.method !== 'GET') {
      return errorResponse('Method not allowed', 405);
    }

    try {
      if (path === '/api/groups') {
        return await handleGetGroups(env);
      }

      if (path === '/api/artifacts') {
        return await handleGetArtifacts(url, env);
      }

      if (path === '/api/versions') {
        return await handleGetVersions(url, env);
      }

      if (path === '/api/files') {
        return await handleGetFiles(url, env);
      }

      if (path === '/api/latest') {
        return await handleGetLatest(url, env);
      }

      // Unknown route
      return errorResponse('Not found', 404);

    } catch (err) {
      console.error('API Error:', err);
      return errorResponse('Internal server error', 500);
    }
  },
};
