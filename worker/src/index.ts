import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
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
  const validExtensions = ['.jar', '.pom', '.module', '.xml', '.sha1', '.sha256', '.sha512', '.md5', '.asc'];
  const hasValidExtension = validExtensions.some((ext) => fileName.endsWith(ext));

  if (!hasValidExtension) {
    return errorResponse('Invalid file type', 400);
  }

  // 4. Check file immutability (only for main artifact files, not hash files)
  // Allow multiple files per version (jar, pom, sources, javadoc) but prevent overwriting
  if (!fileName.endsWith('.sha1') && !fileName.endsWith('.sha256') && !fileName.endsWith('.sha512') && !fileName.endsWith('.md5') && !fileName.includes('maven-metadata')) {
    const r2Key = `${groupPath}/${artifactId}/${version}/${fileName}`;
    const existingFile = await env.R2.head(r2Key);

    if (existingFile) {
      return new Response(`File ${fileName} already exists`, {
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

  if (pathParts.length < 3) {
    return errorResponse('Invalid path format', 400);
  }

  const fileName = pathParts[pathParts.length - 1];

  // Handle artifact-level metadata (e.g., /snapshots/com/iamkaf/artifact/maven-metadata.xml)
  if (pathParts.length === 3 && fileName === 'maven-metadata.xml') {
    const artifactId = pathParts[pathParts.length - 2];
    const groupParts = pathParts.slice(0, pathParts.length - 2);
    const groupPath = groupParts.join('/');
    const fileContent = await request.arrayBuffer();
    const r2Key = `${groupPath}/${artifactId}/${fileName}`;
    await env.R2.put(r2Key, fileContent);
    return new Response('OK', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Handle version-level uploads (requires 4+ parts)
  if (pathParts.length < 4) {
    return errorResponse('Invalid path format', 400);
  }

  const version = pathParts[pathParts.length - 2];
  const artifactId = pathParts[pathParts.length - 3];
  const groupParts = pathParts.slice(0, pathParts.length - 3);
  const groupPath = groupParts.join('/');

  // 3. Validate version ends with -SNAPSHOT (except for maven-metadata.xml)
  if (!version.endsWith('-SNAPSHOT') && !fileName.includes('maven-metadata')) {
    return errorResponse('Version must end with -SNAPSHOT', 400);
  }

  // 4. Upload to R2 with the filename Gradle provided (trust Gradle's timestamping)
  const r2Key = `${groupPath}/${artifactId}/${version}/${fileName}`;
  const fileContent = await request.arrayBuffer();

  await env.R2.put(r2Key, fileContent);

  return new Response('OK', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  });
};

// GET /releases/* or /snapshots/* - Serve artifacts from R2
async function handleArtifactGet(url: URL, env: Env): Promise<Response> {
  const pathname = url.pathname;
  const prefix = pathname.startsWith('/releases/') ? '/releases/' : '/snapshots/';
  const mavenPath = pathname.substring(prefix.length);

  const object = await env.R2.get(mavenPath);

  if (!object) {
    return new Response('Not found', { status: 404 });
  }

  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType;

  if (contentType) {
    headers.set('Content-Type', contentType);
  }

  // Set cache headers for artifacts
  headers.set('Cache-Control', 'public, max-age=3600');

  return new Response(object.body, {
    status: 200,
    headers,
  });
}

// ----------------------------------------------------------------------------
// Purge Handler
// ----------------------------------------------------------------------------

async function handlePurge(request: Request, url: URL, env: Env): Promise<Response> {
  // 1. Authenticate
  if (!validateBasicAuth(request, env)) {
    return unauthorizedResponse();
  }

  // 2. Parse input
  const prefix = url.searchParams.get('prefix');
  if (!prefix) {
    return errorResponse('Missing prefix parameter', 400);
  }

  // Input validation: ensure it looks like a group.artifact string
  // It shouldn't contain slashes usually, but we want to be somewhat flexible yet safe.
  // The requirement says: "com.iamkaf.explodingsheep" -> "com/iamkaf/explodingsheep"
  // Let's just replace dots with slashes.
  const pathPrefix = prefix.replace(/\./g, '/');

  if (pathPrefix.length < 3) { // minimal sanity check
    return errorResponse('Prefix too short', 400);
  }

  const deletedKeys: string[] = [];
  const errors: string[] = [];

  // 3. Define roots to purge
  const roots = ['releases', 'snapshots'];

  for (const root of roots) {
    const fullPrefix = `${root}/${pathPrefix}/`;

    try {
      let truncated = true;
      let cursor: string | undefined;

      while (truncated) {
        const list: R2Objects = await env.R2.list({
          prefix: fullPrefix,
          cursor: cursor,
        });

        if (list.objects.length > 0) {
          const keysToDelete = list.objects.map((o) => o.key);
          await env.R2.delete(keysToDelete);
          deletedKeys.push(...keysToDelete);
        }

        truncated = list.truncated;
        cursor = list.truncated ? list.cursor : undefined;
      }
    } catch (e: any) {
      console.error(`Error purging ${fullPrefix}:`, e);
      errors.push(`Failed to purge ${fullPrefix}: ${e.message}`);
    }
  }

  return jsonResponse({
    success: errors.length === 0,
    deleted: deletedKeys,
    errors: errors.length > 0 ? errors : undefined
  });
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

    // Route: /releases/* for release files (GET to read, PUT to upload)
    if (path.startsWith('/releases/')) {
      if (request.method === 'PUT') {
        return await handleReleasePut(request, url, env);
      }
      if (request.method === 'GET') {
        return await handleArtifactGet(url, env);
      }
      return errorResponse('Method not allowed', 405);
    }

    // Route: /snapshots/* for snapshot files (GET to read, PUT to upload)
    if (path.startsWith('/snapshots/')) {
      if (request.method === 'PUT') {
        return await handleSnapshotPut(request, url, env);
      }
      if (request.method === 'GET') {
        return await handleArtifactGet(url, env);
      }
      return errorResponse('Method not allowed', 405);
    }

    // Route: /api/purge (DELETE)
    if (path === '/api/purge') {
      if (request.method === 'DELETE') {
        return await handlePurge(request, url, env);
      }
      return errorResponse('Method not allowed', 405);
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
