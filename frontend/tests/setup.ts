import '@testing-library/jest-dom'
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util'

// Polyfill for TextEncoder/TextDecoder
// Using 'as any' because Node.js and DOM TextEncoder have slightly different types
global.TextEncoder = NodeTextEncoder as any
global.TextDecoder = NodeTextDecoder as any

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
