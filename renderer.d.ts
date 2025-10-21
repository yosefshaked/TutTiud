export {};

declare global {
  interface Window {
    electronAPI: {
      getSupabaseConfig: () => Promise<{ supabaseUrl: string; supabaseKey: string; }>;
      // הוסף כאן את שאר הפונקציות מה-preload אם תצטרך
    };
  }
}