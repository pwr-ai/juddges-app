import { createServer } from 'node:http';

const HOST = '127.0.0.1';
const PORT = 4311;
const CONTROL_PREFIX = '/__route-contract/';

let requests = [];

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function sanitizedRequest(request, url) {
  return {
    method: request.method,
    path: url.pathname,
    query: Object.fromEntries(url.searchParams.entries()),
  };
}

const server = createServer((request, response) => {
  const host = request.headers.host;
  if (host !== `${HOST}:${PORT}`) {
    sendJson(response, 400, { error: 'unexpected host' });
    return;
  }

  const url = new URL(request.url ?? '/', `http://${host}`);

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

  requests.push(sanitizedRequest(request, url));
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
  console.log(`[route-contract-stub] listening on http://${HOST}:${PORT}`);
});

function shutdown(signal) {
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

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
