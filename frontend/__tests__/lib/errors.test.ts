/**
 * Tests for standardized error handling module.
 *
 * Covers error classes, type guards, and error factory function.
 */

import {
  ErrorCode,
  AppError,
  ValidationError,
  EmptyCollectionError,
  SchemaNotFoundError,
  CollectionNotFoundError,
  DatabaseError,
  TaskSubmissionError,
  RateLimitError,
  UnauthorizedError,
  isErrorResponse,
  isSuccessResponse,
  createErrorFromResponse,
} from '@/lib/errors';
import type { ErrorDetail } from '@/lib/errors';

describe('errors module', () => {
  // ── AppError ───────────────────────────────────────────────────────────

  describe('AppError', () => {
    it('creates an error with correct properties', () => {
      const err = new AppError('test', ErrorCode.INTERNAL_ERROR, 500, { key: 'val' });
      expect(err.message).toBe('test');
      expect(err.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(err.statusCode).toBe(500);
      expect(err.details).toEqual({ key: 'val' });
      expect(err.name).toBe('AppError');
    });

    it('defaults to status 500', () => {
      const err = new AppError('test', ErrorCode.INTERNAL_ERROR);
      expect(err.statusCode).toBe(500);
    });

    it('toErrorDetail() returns ErrorDetail shape', () => {
      const err = new AppError('msg', ErrorCode.VALIDATION_ERROR, 400);
      const detail = err.toErrorDetail();
      expect(detail.error).toBe(ErrorCode.VALIDATION_ERROR);
      expect(detail.message).toBe('msg');
      expect(detail.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('toJSON() returns same as toErrorDetail()', () => {
      const err = new AppError('msg', ErrorCode.INTERNAL_ERROR);
      expect(err.toJSON()).toEqual(err.toErrorDetail());
    });

    it('is an instance of Error', () => {
      const err = new AppError('msg', ErrorCode.INTERNAL_ERROR);
      expect(err).toBeInstanceOf(Error);
    });
  });

  // ── Specific error subclasses ──────────────────────────────────────────

  describe('ValidationError', () => {
    it('has status 400 and VALIDATION_ERROR code', () => {
      const err = new ValidationError('bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe(ErrorCode.VALIDATION_ERROR);
      expect(err.name).toBe('ValidationError');
    });
  });

  describe('EmptyCollectionError', () => {
    it('includes collection ID in message and details', () => {
      const err = new EmptyCollectionError('col-123');
      expect(err.message).toContain('col-123');
      expect(err.details).toEqual({ collectionId: 'col-123' });
      expect(err.statusCode).toBe(400);
    });
  });

  describe('SchemaNotFoundError', () => {
    it('includes schema ID in message and has 404 status', () => {
      const err = new SchemaNotFoundError('schema-1');
      expect(err.message).toContain('schema-1');
      expect(err.statusCode).toBe(404);
      expect(err.details).toEqual({ schemaId: 'schema-1' });
    });
  });

  describe('CollectionNotFoundError', () => {
    it('includes collection ID and has 404 status', () => {
      const err = new CollectionNotFoundError('col-x');
      expect(err.message).toContain('col-x');
      expect(err.statusCode).toBe(404);
    });
  });

  describe('DatabaseError', () => {
    it('has default message and 503 status', () => {
      const err = new DatabaseError();
      expect(err.message).toBe('Database operation failed');
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe(ErrorCode.DATABASE_UNAVAILABLE);
    });

    it('accepts custom message', () => {
      const err = new DatabaseError('connection lost');
      expect(err.message).toBe('connection lost');
    });
  });

  describe('TaskSubmissionError', () => {
    it('has default message and 503 status', () => {
      const err = new TaskSubmissionError();
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe(ErrorCode.TASK_SUBMISSION_FAILED);
    });
  });

  describe('RateLimitError', () => {
    it('has 429 status', () => {
      const err = new RateLimitError();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe(ErrorCode.RATE_LIMIT_EXCEEDED);
    });
  });

  describe('UnauthorizedError', () => {
    it('has 401 status', () => {
      const err = new UnauthorizedError();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe(ErrorCode.UNAUTHORIZED);
    });
  });

  // ── Type guards ────────────────────────────────────────────────────────

  describe('isErrorResponse', () => {
    it('returns true for valid ErrorDetail objects', () => {
      const detail: ErrorDetail = {
        error: 'test',
        message: 'test message',
        code: ErrorCode.INTERNAL_ERROR,
      };
      expect(isErrorResponse(detail)).toBe(true);
    });

    it('returns false for non-error objects', () => {
      expect(isErrorResponse({ data: 'something' })).toBe(false);
      expect(isErrorResponse(null)).toBe(false);
      expect(isErrorResponse('string')).toBe(false);
    });

    it('returns false for partial matches', () => {
      expect(isErrorResponse({ error: 'x', message: 'y' })).toBe(false);
    });
  });

  describe('isSuccessResponse', () => {
    it('returns true for success responses', () => {
      expect(isSuccessResponse({ data: 'value' })).toBe(true);
    });

    it('returns false for error responses', () => {
      const err: ErrorDetail = {
        error: 'test',
        message: 'msg',
        code: ErrorCode.INTERNAL_ERROR,
      };
      expect(isSuccessResponse(err)).toBe(false);
    });
  });

  // ── createErrorFromResponse ────────────────────────────────────────────

  describe('createErrorFromResponse', () => {
    it('creates ValidationError for VALIDATION_ERROR code', () => {
      const err = createErrorFromResponse({
        error: 'bad',
        message: 'bad input',
        code: ErrorCode.VALIDATION_ERROR,
      });
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.message).toBe('bad input');
    });

    it('creates DatabaseError for DATABASE_UNAVAILABLE code', () => {
      const err = createErrorFromResponse({
        error: 'db',
        message: 'db down',
        code: ErrorCode.DATABASE_UNAVAILABLE,
      });
      expect(err).toBeInstanceOf(DatabaseError);
    });

    it('creates RateLimitError for RATE_LIMIT_EXCEEDED code', () => {
      const err = createErrorFromResponse({
        error: 'rate',
        message: 'too many',
        code: ErrorCode.RATE_LIMIT_EXCEEDED,
      });
      expect(err).toBeInstanceOf(RateLimitError);
    });

    it('creates UnauthorizedError for UNAUTHORIZED code', () => {
      const err = createErrorFromResponse({
        error: 'auth',
        message: 'no auth',
        code: ErrorCode.UNAUTHORIZED,
      });
      expect(err).toBeInstanceOf(UnauthorizedError);
    });

    it('creates generic AppError for unknown codes', () => {
      const err = createErrorFromResponse({
        error: 'x',
        message: 'msg',
        code: ErrorCode.INTERNAL_ERROR,
      });
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(500);
    });

    it('creates AppError with 404 for NOT_FOUND variants', () => {
      const err = createErrorFromResponse({
        error: 'not found',
        message: 'schema gone',
        code: ErrorCode.SCHEMA_NOT_FOUND,
      });
      expect(err.statusCode).toBe(404);
    });
  });
});
