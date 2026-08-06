import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 4311;
const CONTROL_PREFIX = '/__route-contract/';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const LOGGABLE_QUERY_KEYS = new Set([
  'chat_id',
  'id',
  'include_results',
  'job_id',
  'limit',
  'order',
  'select',
  'top_k',
  'user_id',
]);

const IDS = {
  chat: {
    known: '10000000-0000-4000-8000-000000000001',
    missing: '10000000-0000-4000-8000-000000000002',
    hidden: '10000000-0000-4000-8000-000000000003',
  },
  collection: {
    known: 'known-collection',
    missing: 'missing-collection',
    hidden: 'hidden-collection',
  },
  document: {
    known: 'known-document',
    missing: 'missing-document',
    hidden: 'hidden-document',
  },
  schema: {
    known: '20000000-0000-4000-8000-000000000001',
    missing: '20000000-0000-4000-8000-000000000002',
    hidden: '20000000-0000-4000-8000-000000000003',
  },
  extraction: {
    known: '30000000-0000-4000-8000-000000000001',
    missing: '30000000-0000-4000-8000-000000000002',
    hidden: '30000000-0000-4000-8000-000000000003',
    invalid: '30000000-0000-4000-8000-000000000004',
    rateLimited: '30000000-0000-4000-8000-000000000005',
    unavailable: '30000000-0000-4000-8000-000000000006',
  },
};
const CHAT_OWNERS = new Map([
  [IDS.chat.known, USER_ID],
  [IDS.chat.hidden, OTHER_USER_ID],
]);

let requests = [];

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sanitizedRequest(request, url) {
  const query = {};
  for (const [key, value] of url.searchParams.entries()) {
    const sanitizedValue = LOGGABLE_QUERY_KEYS.has(key) ? value : '[redacted]';
    const existing = query[key];
    if (existing === undefined) {
      query[key] = sanitizedValue;
    } else if (Array.isArray(existing)) {
      existing.push(sanitizedValue);
    } else {
      query[key] = [existing, sanitizedValue];
    }
  }
  return {
    method: request.method,
    path: url.pathname,
    query,
  };
}

function logRequest(request, url, unexpected = false) {
  const entry = {
    ...sanitizedRequest(request, url),
    ...(unexpected ? { unexpected: true } : {}),
  };
  requests.push(entry);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(entry.query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  // eslint-disable-next-line no-console -- intentional child-process diagnostics
  console.log(
    `[route-contract-stub] ${entry.method} ${entry.path}${query.size ? `?${query}` : ''}`,
  );
}

function authResponse(request, response) {
  const token = request.headers.authorization?.replace(/^Bearer /, '');
  if (token === 'route-contract-invalid') {
    sendJson(response, 401, { code: 'bad_jwt', message: 'bad jwt' });
    return;
  }
  if (token === 'route-contract-outage') {
    sendJson(response, 503, { message: 'auth service unavailable' });
    return;
  }
  if (token !== 'route-contract-valid') {
    sendJson(response, 401, {
      code: 'no_authorization',
      message: 'invalid route-contract token',
    });
    return;
  }
  sendJson(response, 200, {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'route-contract@example.test',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-08-06T00:00:00.000Z',
  });
}

function chatsResponse(url, response) {
  const chatId = url.searchParams.get('id')?.replace(/^eq\./, '');
  const userId = url.searchParams.get('user_id')?.replace(/^eq\./, '');
  const rows =
    chatId && CHAT_OWNERS.get(chatId) === userId ? [{ id: chatId }] : [];
  sendJson(response, 200, rows, {
    'content-range': rows.length === 1 ? '0-0/1' : '*/0',
  });
}

function messagesResponse(url, response) {
  const chatId = url.searchParams.get('chat_id')?.replace(/^eq\./, '');
  const userId = url.searchParams.get('user_id')?.replace(/^eq\./, '');
  const messages =
    chatId === IDS.chat.known && userId === USER_ID
      ? [
          {
            id: '40000000-0000-4000-8000-000000000001',
            role: 'user',
            content: 'Route contract chat message',
            document_ids: null,
            created_at: '2026-08-06T00:00:00.000Z',
          },
        ]
      : [];
  sendJson(response, 200, messages);
}

function collectionResponse(collectionId, response) {
  if (collectionId === IDS.collection.missing) {
    sendJson(response, 404, { detail: 'Collection not found' });
    return;
  }
  const userId =
    collectionId === IDS.collection.hidden ? OTHER_USER_ID : USER_ID;
  sendJson(response, 200, {
    id: collectionId,
    user_id: userId,
    name: 'Route contract collection',
    description: null,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:00:00.000Z',
    documents: [],
    document_count: 0,
  });
}

function documentResponse(documentId, response) {
  if (documentId === IDS.document.missing) {
    sendJson(response, 404, { detail: 'Document not found' });
    return;
  }
  if (documentId === IDS.document.hidden) {
    sendJson(response, 403, { detail: 'Document not accessible' });
    return;
  }
  sendJson(response, 200, {
    document_id: documentId,
    title: 'Route contract judgment',
    document_type: 'judgment',
    language: 'en',
  });
}

function schemaResponse(url, response) {
  const schemaId = url.searchParams.get('id')?.replace(/^eq\./, '');
  if (schemaId === IDS.schema.missing || schemaId === IDS.schema.hidden) {
    sendJson(response, 200, []);
    return;
  }
  sendJson(response, 200, [
    {
      id: schemaId ?? IDS.schema.known,
      name: 'Route contract schema',
      description: null,
      type: 'judgment',
      category: 'legal',
      text: {},
      dates: {},
      status: 'published',
      is_verified: true,
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
      user_id: USER_ID,
    },
  ]);
}

function profileResponse(response) {
  sendJson(response, 200, [{ email: 'route-contract@example.test' }]);
}

function extractionResponse(jobId, response) {
  const statusById = new Map([
    [IDS.extraction.missing, 404],
    [IDS.extraction.hidden, 403],
    [IDS.extraction.invalid, 422],
    [IDS.extraction.rateLimited, 429],
    [IDS.extraction.unavailable, 503],
  ]);
  const status = statusById.get(jobId);
  if (status) {
    sendJson(response, status, { detail: `upstream ${status}` });
    return;
  }
  sendJson(response, 200, {
    job_id: jobId,
    status: 'SUCCESS',
    schema_name: 'Route contract extraction schema',
    results: [],
  });
}

const server = createServer((request, response) => {
  const host = request.headers.host;
  const url = new URL(request.url ?? '/', `http://${HOST}:${PORT}`);
  if (host !== `${HOST}:${PORT}`) {
    logRequest(request, url, true);
    process.exitCode = 1;
    sendJson(response, 400, { error: 'unexpected host' });
    return;
  }

  if (request.method === 'GET' && url.pathname === `${CONTROL_PREFIX}ready`) {
    sendJson(response, 200, { ready: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === `${CONTROL_PREFIX}reset`) {
    requests = [];
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === `${CONTROL_PREFIX}requests`) {
    sendJson(response, 200, { requests });
    return;
  }

  if (request.method === 'OPTIONS' && url.pathname === '/auth/v1/user') {
    logRequest(request, url);
    response.writeHead(204, {
      'access-control-allow-origin': `http://${HOST}:3006`,
      'access-control-allow-headers': 'authorization, apikey',
      'access-control-allow-methods': 'GET, OPTIONS',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/auth/v1/user') {
    logRequest(request, url);
    authResponse(request, response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/rest/v1/chats') {
    logRequest(request, url);
    chatsResponse(url, response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/rest/v1/messages') {
    logRequest(request, url);
    messagesResponse(url, response);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/rest/v1/extraction_schemas'
  ) {
    logRequest(request, url);
    schemaResponse(url, response);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/rest/v1/user_profiles'
  ) {
    logRequest(request, url);
    profileResponse(response);
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === '/rest/v1/extraction_jobs'
  ) {
    logRequest(request, url);
    sendJson(response, 200, []);
    return;
  }

  if (
    request.method === 'PATCH' &&
    url.pathname === '/rest/v1/extraction_jobs'
  ) {
    logRequest(request, url);
    request.resume();
    sendJson(response, 200, []);
    return;
  }

  const collectionMatch = url.pathname.match(/^\/collections\/([^/]+)$/);
  if (request.method === 'GET' && collectionMatch) {
    logRequest(request, url);
    collectionResponse(decodeURIComponent(collectionMatch[1]), response);
    return;
  }

  const documentMatch = url.pathname.match(
    /^\/documents\/([^/]+)\/metadata$/,
  );
  if (request.method === 'GET' && documentMatch) {
    logRequest(request, url);
    documentResponse(decodeURIComponent(documentMatch[1]), response);
    return;
  }

  const extractionMatch = url.pathname.match(/^\/extractions\/([^/]+)$/);
  if (request.method === 'GET' && extractionMatch) {
    logRequest(request, url);
    extractionResponse(decodeURIComponent(extractionMatch[1]), response);
    return;
  }

  logRequest(request, url, true);
  process.exitCode = 1;
  sendJson(response, 500, {
    error: 'unexpected route-contract request',
    method: request.method,
    path: url.pathname,
  });
});

server.on('error', (error) => {
  console.error(`[route-contract-stub] ${error.message}`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console -- intentional child-process diagnostics
  console.log(`[route-contract-stub] listening on http://${HOST}:${PORT}`);
});

function shutdown() {
  server.closeAllConnections();
  server.close((error) => {
    if (error) {
      console.error(`[route-contract-stub] shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
    process.exit();
  });

  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
