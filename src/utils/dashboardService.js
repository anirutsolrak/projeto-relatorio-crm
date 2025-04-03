import getSupabaseClient from './supabaseClient.js';

const reportError = (error, context) => {
    console.error(`DashboardService Error (${context}):`, error?.message || error);
};

export async function getRawMetricsData(startDate, endDate) {
    const context = 'getRawMetricsData';
    const supabase = getSupabaseClient(); // Get client inside the function
    try {
        const { data, error } = await supabase
            .from('daily_proposal_metrics')
            .select('*')
            .gte('metric_date', startDate)
            .lte('metric_date', endDate)
            .order('metric_date', { ascending: true });

        if (error) throw error;

        return { data, error: null };
    } catch (error) {
        reportError(error, context);
        return { data: null, error };
    }
}

export async function getCalculatedKPIs(startDate, endDate) {
    const context = 'getCalculatedKPIs';
    const supabase = getSupabaseClient(); // Get client inside the function
    try {
        const { data, error } = await supabase.rpc('get_dashboard_kpis', {
            start_date: startDate,
            end_date: endDate
        });

        if (error) throw error;

        return { data, error: null };

    } catch (error) {
        reportError(error, context);
        return { data: null, error };
    }
}
