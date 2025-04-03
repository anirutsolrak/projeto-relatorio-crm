import { createClient } from '@supabase/supabase-js';

let supabaseClientInstance = null;

function getSupabaseClient() {
    try {
        if (supabaseClientInstance) {
            console.log("[Supabase] Returning existing client instance");
            return supabaseClientInstance;
        }

        if (typeof createClient !== 'function') {
             throw new Error("Supabase library function createClient not available. Ensure @supabase/supabase-js is loaded or imported correctly.");
        }

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error("Supabase URL or Anon Key not configured in .env file (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).");
            throw new Error("Supabase URL or Anon Key not configured");
        }

        console.log("[Supabase] Initializing new client instance");
        supabaseClientInstance = createClient(
            supabaseUrl,
            supabaseAnonKey,
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false,
                    storage: window.localStorage
                }
            }
        );

        if (!supabaseClientInstance) {
            throw new Error("Failed to create Supabase client instance");
        }

        console.log("[Supabase] Client initialized successfully");
        return supabaseClientInstance;

    } catch (error) {
        console.error("Supabase client initialization error:", error);
        throw new Error(`Failed to initialize Supabase: ${error.message}`);
    }
}

function setupAuthListener() {
    try {
        const supabase = getSupabaseClient();
        if (!supabase || typeof supabase.auth?.onAuthStateChange !== 'function') {
            console.error("Cannot set up auth listener: Supabase client or auth module not ready.");
            return null;
        }
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log(`Auth state changed: ${event}`, session);
                if (event === 'SIGNED_IN') {
                    console.log("User signed in:", session?.user);
                } else if (event === 'SIGNED_OUT') {
                    console.log("User signed out");
                } else if (event === 'INITIAL_SESSION') {
                    console.log("Initial session:", session);
                }
            }
        );
        return subscription;
    } catch (error) {
        console.error("Error setting up auth listener:", error);
        return null;
    }
}

setupAuthListener();

export default getSupabaseClient;