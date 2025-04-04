import getSupabaseClient from './supabaseClient';

function DashboardService() {


    const reportError = (error, context) => {
    
        console.error(`DashboardService Error (${context}):`, error?.message || error);
    };


    async function getRawMetricsData(startDate, endDate) {
        const context = 'getRawMetricsData';
        const supabase = getSupabaseClient();
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


    async function getCalculatedKPIs(startDate, endDate) {
        const context = 'getCalculatedKPIs';
        const supabase = getSupabaseClient();
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


    return {
        getRawMetricsData,
        getCalculatedKPIs
    };
}

export default DashboardService;