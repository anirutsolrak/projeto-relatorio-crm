function LogisticsService() {
    const supabase = getSupabaseClient();

    const reportError = (error, context) => {
        console.error(`LogisticsService Error (${context}):`, error?.message || error);
    };

    async function getLogisticsData(startDate, endDate, filters = {}) {
        const context = 'getLogisticsData';
        try {
            let query = supabase
                .from('logistics_daily_metrics')
                .select('id, metric_date, region, state, value, uploaded_at')
                .order('metric_date', { ascending: false }) // Mais recentes primeiro
                .order('region', { ascending: true })
                .order('state', { ascending: true });

            if (startDate) {
                query = query.gte('metric_date', startDate);
            }
            if (endDate) {
                query = query.lte('metric_date', endDate);
            }

            if (filters.region && filters.region !== 'todos') {
                query = query.eq('region', filters.region);
            }
            if (filters.state && filters.state !== 'todos') {
                 query = query.eq('state', filters.state);
            }


            const { data, error } = await query;

            if (error) throw error;

            console.log(`[${context}] Fetched ${data?.length} records.`);
            return { data, error: null };
        } catch (error) {
            reportError(error, context);
            return { data: null, error };
        }
    }

    async function getDistinctRegionsAndStates() {
        const context = 'getDistinctRegionsAndStates';
        try {
            const { data, error } = await supabase.rpc('get_distinct_logistics_regions_states');

            if (error) throw error;

            const regions = [...new Set(data.map(item => item.region))].sort();
            const statesByRegion = data.reduce((acc, curr) => {
                if (!acc[curr.region]) {
                    acc[curr.region] = [];
                }
                acc[curr.region].push(curr.state);
                acc[curr.region].sort(); // Sort states within the region
                return acc;
            }, {});


            return { data: { regions, statesByRegion }, error: null };
        } catch (error) {
            reportError(error, context);
            return { data: { regions: [], statesByRegion: {} }, error };
        }
    }


    return {
        getLogisticsData,
        getDistinctRegionsAndStates
    };
}