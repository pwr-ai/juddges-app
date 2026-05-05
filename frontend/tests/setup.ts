import '@testing-library/jest-dom'
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util'

// Polyfill for TextEncoder/TextDecoder (MSW + undici need these too)
// Using 'as any' because Node.js and DOM TextEncoder have slightly different types
global.TextEncoder = NodeTextEncoder as any
global.TextDecoder = NodeTextDecoder as any

// ---------------------------------------------------------------------------
// Polyfills required to load `undici` (and therefore MSW v2 / @mswjs/interceptors)
// inside the jsdom test environment. jsdom strips a number of Web APIs that
// undici uses at module-load time, so we re-expose Node's implementations.
// Order matters: streams + worker primitives MUST be on `global` BEFORE
// `require('undici')` runs.
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-require-imports
const streamWeb = require('node:stream/web')
if (typeof (global as any).ReadableStream === 'undefined')
  (global as any).ReadableStream = streamWeb.ReadableStream
if (typeof (global as any).WritableStream === 'undefined')
  (global as any).WritableStream = streamWeb.WritableStream
if (typeof (global as any).TransformStream === 'undefined')
  (global as any).TransformStream = streamWeb.TransformStream

// eslint-disable-next-line @typescript-eslint/no-require-imports
const workerThreads = require('worker_threads')
if (typeof (global as any).MessagePort === 'undefined')
  (global as any).MessagePort = workerThreads.MessagePort
if (typeof (global as any).MessageChannel === 'undefined')
  (global as any).MessageChannel = workerThreads.MessageChannel
if (typeof (global as any).BroadcastChannel === 'undefined')
  (global as any).BroadcastChannel = workerThreads.BroadcastChannel

// Polyfill Web Fetch API globals that jsdom doesn't provide. MSW v2 (and the
// underlying @mswjs/interceptors) require Request/Response/Headers on the
// global scope at module-load time. We deliberately do NOT touch
// `global.fetch` here: the existing test corpus has many tests that directly
// assign `global.fetch = jest.fn()` at module load, and MSW's interceptor
// would clobber those assignments on `server.listen()`. MSW is therefore
// started on-demand by suites that opt in (see `tests/__mocks__/server.ts`).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const undici = require('undici')
if (!global.Request) global.Request = undici.Request as any
if (!global.Response) global.Response = undici.Response as any
if (!global.Headers) global.Headers = undici.Headers as any
if (!global.fetch) global.fetch = undici.fetch as any
if (!(global as any).FormData) (global as any).FormData = undici.FormData

// Polyfill for crypto.randomUUID (used for request IDs)
if (!global.crypto) {
  // @ts-expect-error - crypto polyfill
  global.crypto = {}
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = (() => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0
      const v = c === 'x' ? r : (r & 0x3) | 0x8
      return v.toString(16)
    })
  }) as any
}

// Mock Next.js router
jest.mock('next/navigation', () => ({
  useRouter() {
    return {
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    }
  },
  useSearchParams() {
    return new URLSearchParams()
  },
  usePathname() {
    return '/'
  },
  redirect: jest.fn(),
}))

// Mock environment variables
process.env.NEXT_PUBLIC_API_BASE_URL = 'http://localhost:8004'
process.env.BACKEND_API_KEY = 'test-api-key'

beforeAll(() => {
  jest.spyOn(console, 'debug').mockImplementation(() => {})
  jest.spyOn(console, 'info').mockImplementation(() => {})
  jest.spyOn(console, 'log').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

// Global test setup
beforeEach(() => {
  // Clear all mocks before each test
  jest.clearAllMocks()
})
