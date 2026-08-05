/**
 * Middleware-only proof that the authenticated request owns the chat.
 * Incoming values are always stripped before the middleware preflight.
 */
export const OWNED_CHAT_ID_HEADER = "x-juddges-owned-chat-id";
