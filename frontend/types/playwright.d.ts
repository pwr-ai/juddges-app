// Type definitions for Playwright test environment
declare global {
  interface Window {
    mockSupabaseClient?: {
      auth: {
        getUser: () => Promise<
          | {
              data: { user: { id: string; email: string } };
              error: null;
            }
          | {
              data: { user: null };
              error: { message: string };
            }
        >;
        getSession?: () => Promise<
          | {
              data: { session: { user: { id: string; email: string } } };
              error: null;
            }
          | {
              data: { session: null };
              error: { message: string } | null;
            }
        >;
        signOut?: () => Promise<{ error: null }>;
        onAuthStateChange?: () => {
          data: { subscription: { unsubscribe: () => void } };
        };
      };
    };
  }
}

export {};
