import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 4311;
const CONTROL_PREFIX = '/__route-contract/';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const LOGGABLE_QUERY_KEYS = new Set([
  'chat_id',
  'q',
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
    // The job `POST /extractions/db` hands back for the extraction-path spec.
    // It is the only id whose GET answers a *sequence* rather than a fixed
    // state, so the fixed-state contracts above stay exactly as they were.
    sequenced: '30000000-0000-4000-8000-000000000007',
  },
};

// `extractionRequestSchema` (frontend/lib/validation/schemas.ts) validates
// `collection_id` and `schema_id` as UUIDs, so the submit path needs a
// UUID-shaped collection. `IDS.collection.known` is deliberately not one — the
// route-status contract asserts on that literal — hence a separate id here.
const EXTRACTABLE_COLLECTION_ID = '50000000-0000-4000-8000-000000000001';
const EXTRACTABLE_DOCUMENT_IDS = [
  'route-contract-extract-document-1',
  'route-contract-extract-document-2',
];
/**
 * The collection → extraction flow contract (#692). Its own collection, job id
 * and document set so the extraction-path contract above keeps asserting on an
 * unchanged 2-document sequence.
 *
 * The collection starts empty: the spec fills it through the real save popover
 * (one `POST /collections/{id}/documents` per selected result) and the stub
 * records what arrived. Six search hits are served so the spec can select a
 * strict subset.
 */
const FLOW = {
  collectionId: '50000000-0000-4000-8000-000000000002',
  collectionName: 'Route contract flow collection',
  jobId: '30000000-0000-4000-8000-000000000008',
  hits: Array.from({ length: 6 }, (_, index) => ({
    id: `route-contract-flow-document-${index + 1}`,
    title: `Route contract flow judgment ${index + 1}`,
    case_number: `II AKa 30${index + 1}/2026`,
    jurisdiction: 'pl',
    court_name: 'Route contract appellate court',
    decision_date: '2026-08-06',
  })),
};

const CHAT_OWNERS = new Map([
  [IDS.chat.known, USER_ID],
  [IDS.chat.hidden, OTHER_USER_ID],
]);

let requests = [];
let shuttingDown = false;
let sequencedPolls = 0;
let sequencedServed = [];
let flowDocumentIds = [];
let flowSubmittedDocumentIds = null;
let flowPolls = 0;
let flowServed = [];

/**
 * Resolves to the request's JSON object, or `{}` for anything that is not one
 * (aborted body, invalid JSON, a JSON scalar or array). Never rejects, so the
 * handlers built on it always answer.
 */
function readJsonBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    const done = (parsed) =>
      resolve(
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? parsed
          : {},
      );
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('error', () => done(null));
    request.on('end', () => {
      try {
        done(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        done(null);
      }
    });
  });
}

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

/** A flow search hit in the shape `/documents/{id}` and `/documents/batch` serve. */
function flowDocument(hit) {
  return {
    document_id: hit.id,
    title: hit.title,
    document_number: hit.case_number,
    document_type: 'judgment',
    language: 'pl',
    date_issued: hit.decision_date,
    court_name: hit.court_name,
  };
}

function collectionResponse(collectionId, response) {
  if (collectionId === IDS.collection.missing) {
    sendJson(response, 404, { detail: 'Collection not found' });
    return;
  }
  if (collectionId === FLOW.collectionId) {
    sendJson(response, 200, {
      id: FLOW.collectionId,
      user_id: USER_ID,
      name: FLOW.collectionName,
      description: 'Collection the flow contract fills from search results',
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
      documents: flowDocumentIds,
      document_count: flowDocumentIds.length,
    });
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

function collectionListResponse(response) {
  sendJson(response, 200, [
    {
      id: EXTRACTABLE_COLLECTION_ID,
      user_id: USER_ID,
      name: 'Route contract extraction collection',
      description: 'Collection the extraction-path contract submits against',
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
      documents: EXTRACTABLE_DOCUMENT_IDS,
      document_count: EXTRACTABLE_DOCUMENT_IDS.length,
    },
    {
      id: FLOW.collectionId,
      user_id: USER_ID,
      name: FLOW.collectionName,
      description: 'Collection the flow contract fills from search results',
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:00:00.000Z',
      documents: flowDocumentIds,
      document_count: flowDocumentIds.length,
    },
  ]);
}

function collectionDocumentsResponse(collectionId, response) {
  const documentIds =
    collectionId === FLOW.collectionId ? flowDocumentIds : EXTRACTABLE_DOCUMENT_IDS;
  sendJson(
    response,
    200,
    documentIds.map((documentId, index) => ({
      id: `route-contract-collection-row-${index + 1}`,
      document_id: documentId,
      document_date: '2026-08-06',
      volume_number: index + 1,
      title: `Route contract extraction source ${index + 1}`,
      document_type: 'judgment',
      document_number: `II AKa 21${index + 4}/2026`,
    })),
  );
}

function schemasDbResponse(response) {
  sendJson(response, 200, {
    data: [
      {
        id: IDS.schema.known,
        name: 'Route contract schema',
        description: 'Schema the extraction-path contract extracts with',
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
    ],
    pagination: { page: 1, page_size: 100, total: 1, total_pages: 1 },
  });
}

/**
 * The states `GET /extractions/{sequenced}` walks through, in order.
 *
 * A stub that answers a terminal state on the first poll would let a spec claim
 * it "watched a job progress" while proving only that one response rendered.
 * The names are the ones the real endpoint emits: `_pending_batch_response` and
 * `_in_progress_batch_response` (backend/app/extraction_domain/jobs_router.py)
 * plus `simplify_job_status`, which maps Celery SUCCESS onto COMPLETED.
 */
const SEQUENCED_EXTRACTION_STEPS = [
  { status: 'PENDING', completed_documents: 0, results: null },
  { status: 'IN_PROGRESS', completed_documents: 1, results: null },
  {
    status: 'COMPLETED',
    completed_documents: 2,
    results: EXTRACTABLE_DOCUMENT_IDS.map((documentId, index) => ({
      collection_id: EXTRACTABLE_COLLECTION_ID,
      document_id: documentId,
      status: 'completed',
      created_at: '2026-08-06T00:00:00.000Z',
      updated_at: '2026-08-06T00:01:00.000Z',
      started_at: '2026-08-06T00:00:30.000Z',
      completed_at: '2026-08-06T00:01:00.000Z',
      error_message: null,
      extracted_data: {
        case_number: `II AKa 21${index + 4}/2026`,
        ruling_summary: `Appeal outcome recorded for document ${index + 1}`,
      },
    })),
  },
];

function sequencedExtractionResponse(url, response) {
  // The middleware builds the SSR snapshot with `include_results=false`
  // (frontend/middleware.ts). That read must observe the current state without
  // consuming a step, or the browser polls would start mid-sequence.
  const isSnapshotRead = url.searchParams.get('include_results') === 'false';
  const step =
    SEQUENCED_EXTRACTION_STEPS[
      Math.min(sequencedPolls, SEQUENCED_EXTRACTION_STEPS.length - 1)
    ];
  if (!isSnapshotRead) {
    sequencedPolls += 1;
    // Recorded here rather than sniffed in the browser. Observed while
    // building this spec: one page load issues two polls milliseconds apart
    // and one of the two responses reaches Chromium with no readable body —
    // sometimes with no `response` event at all. What the stub answered has
    // no such window.
    sequencedServed.push({
      status: step.status,
      completed_documents: step.completed_documents,
      total_documents: EXTRACTABLE_DOCUMENT_IDS.length,
    });
  }

  sendJson(response, 200, {
    job_id: IDS.extraction.sequenced,
    status: step.status,
    schema_name: 'Route contract schema',
    collection_name: 'Route contract extraction collection',
    completed_documents: step.completed_documents,
    total_documents: EXTRACTABLE_DOCUMENT_IDS.length,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:01:00.000Z',
    results: isSnapshotRead ? null : step.results,
  });
}

/**
 * Same one-step-per-poll contract as `sequencedExtractionResponse`, for the
 * flow job. Totals and results come from the `document_ids` the extract page
 * POSTed to `/extractions/db`, not from the collection: an extract page that
 * submits the wrong set shows up here as the wrong `total_documents`.
 */
function flowExtractionResponse(url, response) {
  const submitted = flowSubmittedDocumentIds ?? [];
  const total = submitted.length;
  const steps = [
    { status: 'PENDING', completed: 0, results: null },
    { status: 'IN_PROGRESS', completed: Math.ceil(total / 2), results: null },
    {
      status: 'COMPLETED',
      completed: total,
      results: submitted.map((documentId) => {
        const hit = FLOW.hits.find(({ id }) => id === documentId);
        const n = documentId.replace(/^.*-/, '');
        return {
          collection_id: FLOW.collectionId,
          document_id: documentId,
          status: 'completed',
          created_at: '2026-08-06T00:00:00.000Z',
          updated_at: '2026-08-06T00:01:00.000Z',
          started_at: '2026-08-06T00:00:30.000Z',
          completed_at: '2026-08-06T00:01:00.000Z',
          error_message: null,
          extracted_data: {
            case_number: hit?.case_number ?? documentId,
            ruling_summary: `Flow outcome for judgment ${n}`,
          },
        };
      }),
    },
  ];
  const isSnapshotRead = url.searchParams.get('include_results') === 'false';
  const step = steps[Math.min(flowPolls, steps.length - 1)];
  if (!isSnapshotRead) {
    flowPolls += 1;
    flowServed.push({
      status: step.status,
      completed_documents: step.completed,
      total_documents: total,
    });
  }
  sendJson(response, 200, {
    job_id: FLOW.jobId,
    status: step.status,
    schema_name: 'Route contract schema',
    collection_name: FLOW.collectionName,
    completed_documents: step.completed,
    total_documents: total,
    created_at: '2026-08-06T00:00:00.000Z',
    updated_at: '2026-08-06T00:01:00.000Z',
    results: isSnapshotRead ? null : step.results,
  });
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
    sequencedPolls = 0;
    sequencedServed = [];
    flowDocumentIds = [];
    flowSubmittedDocumentIds = null;
    flowPolls = 0;
    flowServed = [];
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === `${CONTROL_PREFIX}requests`) {
    sendJson(response, 200, { requests });
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === `${CONTROL_PREFIX}extraction-sequence`
  ) {
    const jobId = url.searchParams.get('job_id') ?? IDS.extraction.sequenced;
    const servedByJob = new Map([
      [IDS.extraction.sequenced, sequencedServed],
      [FLOW.jobId, flowServed],
    ]);
    if (!servedByJob.has(jobId)) {
      sendJson(response, 404, { error: 'no sequenced job with that id', jobId });
      return;
    }
    sendJson(response, 200, { served: servedByJob.get(jobId) });
    return;
  }

  if (
    request.method === 'GET' &&
    url.pathname === `${CONTROL_PREFIX}flow-collection`
  ) {
    sendJson(response, 200, {
      document_ids: flowDocumentIds,
      submitted_document_ids: flowSubmittedDocumentIds,
    });
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
    url.pathname === '/rest/v1/profiles'
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

  // Typing in the search box fans out to autocomplete and suggest, and the
  // page reports outcomes to the events sink. None of them carry the flow;
  // they are answered empty so the strict-stub check stays focused on requests
  // that do.
  if (
    request.method === 'GET' &&
    (url.pathname === '/api/search/autocomplete' ||
      url.pathname === '/api/search/suggest')
  ) {
    logRequest(request, url);
    sendJson(response, 200, {
      query: url.searchParams.get('q') ?? '',
      topic_hits: [],
      suggestion_hits: [],
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/events') {
    logRequest(request, url);
    request.resume();
    sendJson(response, 200, { accepted: 0 });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/search/documents') {
    logRequest(request, url);
    sendJson(response, 200, {
      documents: FLOW.hits,
      query: url.searchParams.get('q') ?? '',
      query_time_ms: 1,
      pagination: {
        offset: 0,
        limit: FLOW.hits.length,
        loaded_count: FLOW.hits.length,
        estimated_total: FLOW.hits.length,
        has_more: false,
        next_offset: null,
      },
      total_count: FLOW.hits.length,
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/collections') {
    logRequest(request, url);
    collectionListResponse(response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/schemas/db') {
    logRequest(request, url);
    schemasDbResponse(response);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/dashboard/stats') {
    // Intentionally partial: StatisticsView only reads `total_judgments`
    // (the corpus size in the cohort line) — the real payload has ~12 more
    // fields (jurisdictions, court_levels, data_completeness, ...).
    logRequest(request, url);
    sendJson(response, 200, { total_judgments: 12907 });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/documents/batch') {
    logRequest(request, url);
    readJsonBody(request).then((body) => {
      // Flow documents answer with their search-hit metadata so the collection
      // page renders titles. Everything else keeps the empty list: metadata
      // enrichment is best-effort in the extract page, so that exercises the
      // real code path without inventing judgment metadata.
      const ids = Array.isArray(body.document_ids) ? body.document_ids : [];
      const documents = FLOW.hits
        .filter(({ id }) => ids.includes(id))
        .map(flowDocument);
      sendJson(response, 200, { documents });
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/extractions/db') {
    logRequest(request, url);
    readJsonBody(request).then((body) => {
      const isFlow = body.collection_id === FLOW.collectionId;
      if (isFlow) {
        flowSubmittedDocumentIds = Array.isArray(body.document_ids)
          ? body.document_ids
          : [];
      }
      sendJson(response, 202, {
        job_id: isFlow ? FLOW.jobId : IDS.extraction.sequenced,
        status: 'accepted',
        message: 'Extraction job created successfully',
      });
    });
    return;
  }

  const addDocumentMatch = url.pathname.match(
    /^\/collections\/([^/]+)\/documents$/,
  );
  if (request.method === 'POST' && addDocumentMatch) {
    logRequest(request, url);
    const collectionId = decodeURIComponent(addDocumentMatch[1]);
    readJsonBody(request).then((body) => {
      if (collectionId !== FLOW.collectionId || typeof body.document_id !== 'string') {
        sendJson(response, 404, { detail: 'Collection not found' });
        return;
      }
      if (!flowDocumentIds.includes(body.document_id)) {
        flowDocumentIds.push(body.document_id);
      }
      sendJson(response, 200, {
        message: 'Document added to collection',
        collection_id: collectionId,
        document_id: body.document_id,
      });
    });
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/extractions/base-schema/aggregate'
  ) {
    logRequest(request, url);
    request.resume();
    sendJson(response, 200, {
      total: 320,
      sample_n: 100,
      seed: 7,
      fields: {
        appeal_outcome: {
          kind: 'categorical',
          multi: true,
          values: [
            { value: 'dismissed', count: 60 },
            { value: 'allowed', count: 30 },
          ],
          other: 0,
          null: 10,
          covered: 90,
        },
        decision_date: {
          kind: 'year',
          values: [{ value: '2019', count: 100 }],
          null: 0,
          covered: 100,
        },
      },
    });
    return;
  }

  if (
    request.method === 'POST' &&
    url.pathname === '/extractions/base-schema/filter'
  ) {
    logRequest(request, url);
    request.resume();
    sendJson(response, 200, {
      documents: [],
      total_count: 320,
      limit: 20,
      offset: 0,
      has_more: false,
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/precedents/find') {
    // The "In similar cases…" cohort block (#726). Four cohort members, three
    // `dismissed`/one `allowed`, so the default appeal_outcome grouping has a
    // clickable majority bucket. Two ranked precedents: `p-dismissed` stays
    // ranked after filtering to `dismissed`, `p-allowed` gets filtered out.
    logRequest(request, url);
    request.resume();
    sendJson(response, 200, {
      query: 'a juvenile drug appeal with three co-defendants',
      precedents: [
        {
          document_id: 'p-dismissed',
          title: 'R v Dismissed',
          document_type: 'judgment',
          date_issued: '2023-01-01',
          court_name: 'Court of Appeal',
          outcome: null,
          legal_bases: null,
          summary: null,
          similarity_score: 0.82,
          relevance_score: null,
          matching_factors: [],
          relevance_explanation: null,
        },
        {
          document_id: 'p-allowed',
          title: 'R v Allowed',
          document_type: 'judgment',
          date_issued: '2022-06-01',
          court_name: 'Court of Appeal',
          outcome: null,
          legal_bases: null,
          summary: null,
          similarity_score: 0.71,
          relevance_score: null,
          matching_factors: [],
          relevance_explanation: null,
        },
      ],
      total_found: 2,
      search_strategy: 'semantic_similarity',
      enhanced_query: null,
      cohort: [
        { document_id: 'p-dismissed', similarity_score: 0.82, case_number: 'C-1', title: 'R v Dismissed', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-01-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: ['theft'] },
        { document_id: 'c-2', similarity_score: 0.78, case_number: 'C-2', title: 'R v Two', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-02-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: [] },
        { document_id: 'c-3', similarity_score: 0.74, case_number: 'C-3', title: 'R v Three', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2023-03-01', appeal_outcome: ['dismissed'], sentences_received: [], convict_offences: [] },
        { document_id: 'p-allowed', similarity_score: 0.71, case_number: 'C-4', title: 'R v Allowed', jurisdiction: 'UK', court_name: 'Court of Appeal', decision_date: '2022-06-01', appeal_outcome: ['allowed'], sentences_received: [], convict_offences: ['burglary'] },
      ],
      resolved_case: null,
    });
    return;
  }

  const collectionDocumentsMatch = url.pathname.match(
    /^\/collections\/([^/]+)\/documents$/,
  );
  if (request.method === 'GET' && collectionDocumentsMatch) {
    logRequest(request, url);
    collectionDocumentsResponse(
      decodeURIComponent(collectionDocumentsMatch[1]),
      response,
    );
    return;
  }

  const collectionMatch = url.pathname.match(/^\/collections\/([^/]+)$/);
  if (request.method === 'GET' && collectionMatch) {
    logRequest(request, url);
    collectionResponse(decodeURIComponent(collectionMatch[1]), response);
    return;
  }

  const flowDocumentMatch = url.pathname.match(/^\/documents\/([^/]+)$/);
  const flowHit =
    flowDocumentMatch &&
    FLOW.hits.find(({ id }) => id === decodeURIComponent(flowDocumentMatch[1]));
  if (request.method === 'GET' && flowHit) {
    logRequest(request, url);
    // `useCollection.loadDocument` reads `data.document`, matching the backend
    // `GET /documents/{id}` envelope.
    sendJson(response, 200, { document: flowDocument(flowHit) });
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
    const jobId = decodeURIComponent(extractionMatch[1]);
    if (jobId === IDS.extraction.sequenced) {
      sequencedExtractionResponse(url, response);
      return;
    }
    if (jobId === FLOW.jobId) {
      flowExtractionResponse(url, response);
      return;
    }
    extractionResponse(jobId, response);
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
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExitTimer = setTimeout(() => process.exit(1), 5_000);
  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);
    if (error) {
      console.error(`[route-contract-stub] shutdown failed: ${error.message}`);
      process.exitCode = 1;
    }
    process.exit();
  });
  server.closeAllConnections();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
