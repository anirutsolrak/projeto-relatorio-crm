import getSupabaseClient from './supabaseClient.js';

const reportServiceError = (error, context) => {
    console.error(`[LogisticsService Error - ${context}]`, error?.message || error);
};

function LogisticsService() {

    const getClient = () => {
        try {
            return getSupabaseClient();
        } catch (error) {
            reportServiceError(error, 'getClient');
            throw new Error("Falha ao obter cliente Supabase no LogisticsService.");
        }
    };

    // Não é mais usada pela página Logistica.js, mas mantida caso útil em outro lugar.
    async function getLogisticsData(startDate, endDate, filters = {}) {
        const context = 'getLogisticsData';
        console.log(`[${context}] Fetching detailed data for ${startDate} to ${endDate} with filters:`, filters);
        const supabase = getClient();
        try {
            let query = supabase
                .from('logistics_daily_metrics')
                .select('*')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate);

            if (filters.region && filters.region !== 'todos') {
                query = query.eq('region', filters.region);
            }
            // Filtro de estado removido da lógica principal da página
            // if (filters.state && filters.state !== 'todos') {
            //      query = query.eq('state', filters.state);
            // }

            const { data, error, count } = await query;

            if (error) throw error;
            console.log(`[${context}] Fetched ${data?.length ?? 0} rows from logistics_daily_metrics.`);
            return { data, error: null };
        } catch (error) {
            reportServiceError(error, context);
            return { data: null, error };
        }
    }

    // Busca regiões e estados distintos para os filtros da UI
    async function getDistinctRegionsAndStates() {
        const context = 'getDistinctRegionsAndStates';
        console.log(`[${context}] Fetching distinct regions and states.`);
        const supabase = getClient();
        try {
            // Otimização: buscar apenas regiões distintas, já que o filtro de estado foi removido
            const { data, error } = await supabase
                .from('logistics_daily_metrics')
                .select('region'); // Seleciona apenas a coluna region

            if (error) throw error;
            console.log(`[${context}] Found ${data?.length ?? 0} region entries.`);

            const regions = new Set();
            if (data) {
                 data.forEach(item => {
                    if (item.region) {
                         regions.add(item.region);
                     }
                 });
             }

             const sortedRegions = Array.from(regions).sort();
             // Não precisamos mais de statesByRegion
             console.log(`[${context}] Result:`, { regions: sortedRegions });
            return { data: { regions: sortedRegions, statesByRegion: {} }, error: null }; // Retorna statesByRegion vazio
        } catch (error) {
            reportServiceError(error, context);
            return { data: { regions: [], statesByRegion: {} }, error };
        }
    }

    // --- Busca dados consolidados (KPIs) - IGNORA filtros de UI de Região ---
    async function getConsolidatedLogisticsSummary(startDate, endDate) {
        const context = 'getConsolidatedLogisticsSummary';
        console.log(`[${context}] Fetching summary data for period: ${startDate} to ${endDate}`);
        const supabase = getClient();

        const targetCategoryName = 'ENTREGAS';
        const subCategoryMap = { delivered: 'Entregue', inRoute: 'Em Rota', returned: 'DEVOLUÇÃO', custody: 'Custodia' };
        const variationsReturned = [...new Set([subCategoryMap.returned, 'DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'])];
        const targetSubCategories = [ subCategoryMap.delivered, subCategoryMap.inRoute, ...variationsReturned, subCategoryMap.custody ].filter(Boolean);

        console.log(`[${context}] Querying 'logistics_consolidated_metrics' for category '${targetCategoryName}' and subcategories:`, targetSubCategories);

        try {
            const { data, error } = await supabase
                .from('logistics_consolidated_metrics')
                .select('metric_date, sub_category, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate)
                .eq('category', targetCategoryName)
                .in('sub_category', targetSubCategories)
                .order('metric_date', { ascending: true });

            if (error) {
                 console.error(`[${context}] Supabase error fetching data:`, error);
                 throw error;
             }
            console.log(`[${context}] Raw data fetched (${data?.length ?? 0} rows for category '${targetCategoryName}' in period):`, data?.length > 5 ? JSON.stringify(data.slice(-5))+' (last 5 shown)' : JSON.stringify(data));

            const summary = { delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0, successRate: 0, returnRate: 0, lastDateFound: null };

            if (data && data.length > 0) {
                const latestDate = data[data.length - 1].metric_date;
                summary.lastDateFound = latestDate;
                console.log(`[${context}] Latest date found in data: ${latestDate}`);

                const latestData = data.filter(item => item.metric_date === latestDate);
                console.log(`[${context}] Data for the latest date (${latestData.length} items):`, JSON.stringify(latestData));

                latestData.forEach((item) => {
                    const value = typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0;
                    const subCat = item.sub_category;

                    if (subCat === subCategoryMap.delivered) summary.delivered = value;
                    else if (subCat === subCategoryMap.inRoute) summary.inRoute = value;
                    else if (variationsReturned.includes(subCat)) summary.returned = value;
                    else if (subCat === subCategoryMap.custody) summary.custody = value;
                    else console.warn(`[${context}] Subcategoria não mapeada na data ${latestDate}: '${subCat}'`);
                });
            } else {
                console.warn(`[${context}] Nenhum dado encontrado para categoria '${targetCategoryName}' e subcategorias relevantes no período ${startDate} a ${endDate}. KPIs ficarão zerados.`);
            }

            console.log(`[${context}] Sumário antes do cálculo final:`, JSON.stringify(summary));

            const totalConsideredForRate = summary.delivered + summary.returned;
            summary.successRate = totalConsideredForRate > 0 ? (summary.delivered / totalConsideredForRate) * 100 : 0;
            summary.returnRate = totalConsideredForRate > 0 ? (summary.returned / totalConsideredForRate) * 100 : 0;
            summary.geral = summary.delivered + summary.inRoute + summary.returned + summary.custody;

            console.log(`%c[${context}] Sumário Final Calculado (Baseado no Último Dia: ${summary.lastDateFound || 'Nenhum dado'}):`, 'color: blue; font-weight: bold;', summary);
            return { data: summary, error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: null, error: errorCatch };
        }
    }

    // --- Busca motivos de devolução (IGNORA filtros de UI de Região) ---
    async function getReturnReasonsSummary(startDate, endDate) {
        const context = 'getReturnReasonsSummary';
        const targetCategoryName = 'DEVOLUÇÃO - MOTIVOS';
        console.log(`[${context}] Fetching return reasons for period: ${startDate} to ${endDate}, Category: '${targetCategoryName}'`);
        const supabase = getClient();

        try {
            const { data, error } = await supabase
                .from('logistics_consolidated_metrics')
                .select('metric_date, sub_category, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate)
                .eq('category', targetCategoryName)
                .order('metric_date', { ascending: false });

            if (error) {
                console.error(`[${context}] Supabase error:`, error);
                throw error;
            }
            console.log(`[${context}] Raw data fetched (${data?.length ?? 0} rows):`, data?.length > 10 ? JSON.stringify(data.slice(0, 10))+' (first 10 shown)' : JSON.stringify(data));

            const reasons = {};
            let latestDateFound = null;

            if (data && data.length > 0) {
                 latestDateFound = data[0].metric_date;
                 console.log(`[${context}] Latest date found for return reasons: ${latestDateFound}`);

                 const latestData = data.filter(item => item.metric_date === latestDateFound);
                 console.log(`[${context}] Data for latest date (${latestData.length} items):`, JSON.stringify(latestData));

                 latestData.forEach(item => {
                     if (item.sub_category && item.sub_category.toUpperCase() !== targetCategoryName.toUpperCase() && item.sub_category !== targetCategoryName) {
                         const value = typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0;
                         reasons[item.sub_category] = value;
                     }
                 });
            } else {
                 console.warn(`[${context}] Nenhum dado encontrado para ${targetCategoryName} no período.`);
            }

            console.log(`[${context}] Reasons object after processing:`, JSON.stringify(reasons));

            const sortedReasons = Object.entries(reasons)
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count);

            console.log(`%c[${context}] Processed reasons (sorted):`, 'color: blue; font-weight: bold;', sortedReasons);
            return { data: sortedReasons, error: null };

        } catch (errorCatch) {
            console.error(`[${context}] Caught error:`, errorCatch);
            reportServiceError(errorCatch, context);
            return { data: [], error: errorCatch };
        }
    }

    // --- Busca série temporal consolidada (IGNORA filtros de UI de Região) ---
    async function getConsolidatedTimeSeries(startDate, endDate) {
        const context = 'getConsolidatedTimeSeries';
        const targetCategoryName = 'ENTREGAS';
        const subCategoryMap = { delivered: 'Entregue', inRoute: 'Em Rota', returned: 'DEVOLUÇÃO', custody: 'Custodia' };
        const variationsReturned = [...new Set([subCategoryMap.returned, 'DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'])];
        const targetSubCategories = [ subCategoryMap.delivered, subCategoryMap.inRoute, ...variationsReturned, subCategoryMap.custody ].filter(Boolean);

        console.log(`[${context}] Fetching time series for ${startDate} to ${endDate}. Category: '${targetCategoryName}', Subcategories:`, targetSubCategories);
        const supabase = getClient();

        try {
            const { data, error } = await supabase
                .from('logistics_consolidated_metrics')
                .select('metric_date, sub_category, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate)
                .eq('category', targetCategoryName)
                .in('sub_category', targetSubCategories)
                .order('metric_date', { ascending: true });

            if (error) throw error;
            console.log(`[${context}] Time series data fetched: ${data?.length ?? 0} points.`);
            return { data: data || [], error: null };

        } catch (error) {
            reportServiceError(error, context);
            return { data: [], error };
        }
    }

    // --- Busca total filtrado (Respeita filtro de Região da UI) ---
    async function getFilteredTotals(startDate, endDate, filters = {}) {
        const context = 'getFilteredTotals';
        console.log(`[${context}] Fetching filtered totals for ${startDate} to ${endDate} with filters:`, filters);
        const supabase = getClient();
        try {
            let query = supabase
                .from('logistics_daily_metrics')
                .select('value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate);

            // Aplica filtro de Região se não for 'todos'
            if (filters.region && filters.region !== 'todos') {
                query = query.eq('region', filters.region);
                console.log(`[${context}] Applied region filter: ${filters.region}`);
            }
            // Filtro de Estado REMOVIDO

            const { data, error } = await query;

            if (error) {
                console.error(`[${context}] Supabase error fetching filtered totals:`, error);
                throw error;
            }

            const totalSum = data ? data.reduce((sum, item) => sum + (Number(item.value) || 0), 0) : 0;
            console.log(`%c[${context}] Filtered total sum calculated: ${totalSum}`, 'color: blue; font-weight: bold;');

            return { data: { totalSum }, error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: { totalSum: 0 }, error: errorCatch };
        }
    }

    // --- Busca totais por Região/Estado (IGNORA filtros de UI de Região/Estado) ---
    async function getRegionalStateTotals(startDate, endDate) {
        const context = 'getRegionalStateTotals';
        console.log(`[${context}] Fetching regional/state totals for period: ${startDate} to ${endDate} (Ignoring UI region filter)`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase
                .from('logistics_daily_metrics')
                .select('region, state, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate);

            if (error) {
                 console.error(`[${context}] Supabase error:`, error);
                 throw error;
             }
             console.log(`[${context}] Raw daily data fetched: ${data?.length ?? 0} rows.`);

             const totals = {};

             if (data) {
                 data.forEach(item => {
                     if (item.region && item.state && typeof item.value === 'number' && !isNaN(item.value)) {
                         if (!totals[item.region]) {
                             totals[item.region] = { total: 0, states: {} };
                         }
                         totals[item.region].total += item.value;
                         if (!totals[item.region].states[item.state]) {
                             totals[item.region].states[item.state] = 0;
                         }
                         totals[item.region].states[item.state] += item.value;
                     }
                 });
             }

             console.log(`%c[${context}] Processed regional/state totals:`, 'color: blue; font-weight: bold;', totals);
             return { data: totals, error: null };

         } catch (errorCatch) {
             reportServiceError(errorCatch, context);
             return { data: {}, error: errorCatch };
         }
     }

    return {
        // getLogisticsData, // Mantida caso necessário
        getDistinctRegionsAndStates,
        getConsolidatedLogisticsSummary,
        getReturnReasonsSummary,
        getConsolidatedTimeSeries,
        getFilteredTotals,
        getRegionalStateTotals
    };
}

export default LogisticsService;