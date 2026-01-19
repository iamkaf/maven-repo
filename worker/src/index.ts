import { XMLParser } from 'fast-xml-parser';

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
    versioning?: {
      latest?: string;
      release?: string;
      versions?: {
        version?: string[];
      };
      lastUpdated?: string;
    };
    version?: string;
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
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
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

// PUT /publish/com/iamkaf/artifact/version/file.jar
const handlePublishPut = async (
  request: Request,
  url: URL,
  env: Env
): Promise<Response> => {
  // 1. Validate authentication
  if (!validateBasicAuth(request, env)) {
    return unauthorizedResponse();
  }

  // 2. Parse path: /publish/com/iamkaf/artifact/version/file.jar
  const pathname = url.pathname;
  if (!pathname.startsWith('/publish/')) {
    return errorResponse('Invalid publish path', 400);
  }

  const mavenPath = pathname.substring('/publish/'.length);
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

    // Route: /publish/* for artifact uploads (PUT only)
    if (path.startsWith('/publish/')) {
      if (request.method !== 'PUT') {
        return errorResponse('Method not allowed', 405);
      }
      return await handlePublishPut(request, url, env);
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
