# Weaviate Connection Pool Environment Variables

## Overview

The Weaviate connection pool uses HTTP/gRPC-level connection pooling to handle multiple concurrent requests efficiently. These environment variables allow you to configure the pooling behavior.

## Environment Variables

### Connection Pooling

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `WEAVIATE_USE_POOL` | Enable/disable connection pooling | `true` | No |
| `WV_POOL_CONNECTIONS` | Number of connections to keep in pool | `10` | No |
| `WV_POOL_MAXSIZE` | Maximum number of connections in pool | `50` | No |
| `WV_POOL_MAX_RETRIES` | Maximum retries for pool connections | `3` | No |
| `WV_POOL_TIMEOUT` | Connection timeout in seconds | `5` | No |

**Note**: Connections use HTTP and plain gRPC (not HTTPS). This matches typical Weaviate deployments.

## Configuration Examples

### Development (Lower Resource Usage)
```bash
WEAVIATE_USE_POOL=true
WV_POOL_CONNECTIONS=5
WV_POOL_MAXSIZE=20
```

### Production (Optimized for Concurrency)
```bash
WEAVIATE_USE_POOL=true
WV_POOL_CONNECTIONS=20
WV_POOL_MAXSIZE=100
```

### High Traffic (Maximum Concurrency)
```bash
WEAVIATE_USE_POOL=true
WV_POOL_CONNECTIONS=50
WV_POOL_MAXSIZE=200
WV_POOL_TIMEOUT=10
```

## How It Works

1. **Single Client Instance**: One `WeaviateAsyncClient` is created and reused
2. **HTTP-Level Pooling**: The client uses httpx which maintains a pool of TCP connections
3. **Concurrent Requests**: Multiple async requests can use different connections from the pool
4. **Automatic Management**: Connections are created/destroyed as needed within the pool limits

## Tuning Guidelines

- **`WV_POOL_CONNECTIONS`**: Set based on expected concurrent requests (typically 10-50)
- **`WV_POOL_MAXSIZE`**: Should be 2-5x `WV_POOL_CONNECTIONS` to handle traffic spikes
- **`WV_POOL_TIMEOUT`**: Increase if you have slow network connections
- **`WV_POOL_MAX_RETRIES`**: Usually keep at 3 unless you have unstable networks

## Monitoring

Monitor connection pool usage in production to determine optimal settings:
- Connection wait times
- Request throughput
- Error rates
- Resource usage

Adjust pool size based on actual usage patterns.

