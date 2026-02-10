// Type definitions for Playwright test environment
declare global {
  interface Window {
    mockSupabaseClient?: {
      auth: {
        getUser: () => Promise<{
          data: {
            user: {
              id: string;
              email: string;
            };
          };
          error: null;
        }>;
        getSession?: () => Promise<{
          data: {
            session: {
              user: {
                id: string;
                email: string;
              };
            };
          };
          error: null;
        }>;
      };
    };
  }
}

export {};
