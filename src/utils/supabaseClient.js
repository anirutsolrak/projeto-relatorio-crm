import { createClient } from '@supabase/supabase-js';

let supabaseClientInstance = null;

function getSupabaseClient() {
    try {
        if (supabaseClientInstance) {
            return supabaseClientInstance;
        }
        if (typeof createClient !== 'function') {
             throw new Error("Supabase library function createClient not available.");
        }
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) {
            console.error("Supabase URL or Anon Key missing in .env");
            throw new Error("Supabase URL or Anon Key not configured");
        }
        console.log("[Supabase] Initializing new client instance...");
        supabaseClientInstance = createClient(supabaseUrl, supabaseAnonKey, { auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
        if (!supabaseClientInstance) {
            throw new Error("Failed to create Supabase client instance");
        }
        console.log("[Supabase] Client initialized successfully.");
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
            console.warn("[Supabase] Cannot set up auth listener: Client/Auth not ready.");
            return null;
        }
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                console.log(`[Supabase Auth] Event: ${event}`, session ? `User: ${session.user.id}` : 'No session');
            }
        );
        console.log("[Supabase] Auth listener set up.");
        return subscription;
    } catch (error) {
        console.error("Error setting up auth listener:", error);
        return null;
    }
}

setupAuthListener();

export async function insertLocalStockEntries(entries) {
    if (!entries || entries.length === 0) { console.warn("[Supabase Insert Stock] No entries provided."); return { data: [], error: null }; }
    const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase client not initialized for stock insert.");
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) { console.error("[Supabase Insert Stock] User not authenticated."); return { data: null, error: new Error("User not authenticated") }; } } catch (authError) { console.error("[Supabase Insert Stock] Error checking auth user:", authError); return { data: null, error: authError }; }
    console.log(`[Supabase Insert Stock] Attempting insert ${entries.length} entries.`);
    try { const { data, error } = await supabase.from('local_stock_entries').insert(entries).select(); if (error) { console.error('[Supabase Insert Stock] Error:', error); throw error; } console.log(`[Supabase Insert Stock] ${data ? data.length : 0} inserted.`); return { data, error: null }; }
    catch (error) { console.error("[Supabase Insert Stock] Catch error:", error); return { data: null, error }; }
}

export async function upsertUfAverageCosts(costs) {
    if (!costs || costs.length === 0) { console.warn("[Supabase Upsert Costs] No costs provided."); return { data: [], error: null }; }
    const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase client not initialized for cost upsert.");
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) { console.error("[Supabase Upsert Costs] User not authenticated."); return { data: null, error: new Error("User not authenticated") }; } } catch (authError) { console.error("[Supabase Upsert Costs] Error checking auth user:", authError); return { data: null, error: authError }; }
    console.log(`[Supabase Upsert Costs] Attempting upsert ${costs.length} costs.`);
    try { const costsWithTimestamp = costs.map(c => ({ ...c, updated_at: new Date().toISOString() })); const { data, error } = await supabase.from('uf_average_costs').upsert(costsWithTimestamp, { onConflict: 'uf' }).select(); if (error) { console.error('[Supabase Upsert Costs] Error:', error); throw error; } console.log(`[Supabase Upsert Costs] ${data ? data.length : 0} upserted.`); return { data, error: null }; }
    catch (error) { console.error("[Supabase Upsert Costs] Catch error:", error); return { data: null, error }; }
}

export async function insertLogisticsDailyMetrics(metrics) {
    if (!metrics || metrics.length === 0) { console.warn("[Supabase Insert Daily State Logistics] No metrics."); return { data: [], error: null }; }
    const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase client not initialized.");
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) { console.error("[Supabase Insert Daily State Logistics] User not auth."); return { data: null, error: new Error("User not authenticated") }; } } catch (authError) { console.error("[Supabase Insert Daily State Logistics] Auth check error:", authError); return { data: null, error: authError }; }
    console.log(`[Supabase Insert Daily State Logistics] Attempting upsert ${metrics.length} metrics into 'logistics_report_daily_state'. First:`, JSON.stringify(metrics[0])); // Alterado nome da tabela
    try { const { data, error } = await supabase.from('logistics_report_daily_state').upsert(metrics, { onConflict: 'metric_date, state, metric_key' }).select(); if (error) { console.error('[Supabase Insert Daily State Logistics] Error:', error); throw error; } console.log(`[Supabase Insert Daily State Logistics] ${data ? data.length : 0} upserted.`); return { data, error: null }; }
    catch (error) { console.error("[Supabase Insert Daily State Logistics] Catch error:", error); return { data: null, error }; }
}

export async function upsertLogisticsConsolidatedMetrics(metrics) {
    if (!metrics || metrics.length === 0) { console.warn("[Supabase Upsert Consolidated Logistics] No metrics."); return { data: [], error: null }; }
    const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase client not initialized.");
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) { console.error("[Supabase Upsert Consolidated Logistics] User not auth."); return { data: null, error: new Error("User not authenticated") }; } } catch (authError) { console.error("[Supabase Upsert Consolidated Logistics] Auth check error:", authError); return { data: null, error: authError }; }
    console.log(`[Supabase Upsert Consolidated Logistics] Attempting upsert ${metrics.length} metrics.`);
    try { const { data, error } = await supabase.from('logistics_consolidated_metrics').upsert(metrics, { onConflict: 'metric_date, category, sub_category' }).select(); if (error) { console.error('[Supabase Upsert Consolidated Logistics] Error:', error); throw error; } console.log(`[Supabase Upsert Consolidated Logistics] ${data ? data.length : 0} upserted.`); return { data, error: null }; }
    catch (error) { console.error("[Supabase Upsert Consolidated Logistics] Catch error:", error); return { data: null, error }; }
}

export async function upsertLogisticsDailyConsolidatedData(metrics) {
    if (!metrics || metrics.length === 0) { console.warn("[Supabase Upsert Daily Consolidated] No metrics."); return { data: [], error: null }; }
    const supabase = getSupabaseClient(); if (!supabase) throw new Error("Supabase client not initialized.");
    try { const { data: { user } } = await supabase.auth.getUser(); if (!user) { console.error("[Supabase Upsert Daily Consolidated] User not auth."); return { data: null, error: new Error("User not authenticated") }; } } catch (authError) { console.error("[Supabase Upsert Daily Consolidated] Auth check error:", authError); return { data: null, error: authError }; }
    console.log(`[Supabase Upsert Daily Consolidated] Attempting upsert ${metrics.length} metrics.`);
    try { const { data, error } = await supabase.from('logistics_daily_consolidated_data').upsert(metrics, { onConflict: 'metric_date, category, sub_category' }).select(); if (error) { console.error('[Supabase Upsert Daily Consolidated] Error:', error); throw error; } console.log(`[Supabase Upsert Daily Consolidated] ${data ? data.length : 0} upserted.`); return { data, error: null }; }
    catch (error) { console.error("[Supabase Upsert Daily Consolidated] Catch error:", error); return { data: null, error }; }
}

export default getSupabaseClient;