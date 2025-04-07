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

    // Busca regiões distintas para filtro UI
    async function getDistinctRegions() { // Renomeado e simplificado
        const context = 'getDistinctRegions';
        console.log(`[${context}] Fetching distinct regions.`);
        const supabase = getClient();
        try {
            // Busca apenas regiões distintas da tabela daily_metrics
            const { data, error } = await supabase
                .from('logistics_daily_metrics')
                .select('region', { distinct: true }); // Supabase pode otimizar isso

            if (error) throw error;

            const regions = data ? data.map(item => item.region).filter(Boolean).sort() : [];
            console.log(`[${context}] Result:`, { regions });
            return { data: { regions }, error: null }; // Retorna apenas a lista de regiões

        } catch (error) {
            reportServiceError(error, context);
            return { data: { regions: [] }, error };
        }
    }

    // Busca dados consolidados para KPIs (Último Dia) - IGNORA filtros de UI de Região
    async function getConsolidatedLogisticsSummary(startDate, endDate) {
        const context = 'getConsolidatedLogisticsSummary';
        console.log(`[${context}] Fetching LAST DAY summary data for period: ${startDate} to ${endDate}`);
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
                .order('metric_date', { ascending: false })
                .limit(targetSubCategories.length * 2);

            if (error) { throw error; }
            console.log(`[${context}] Raw data fetched (${data?.length ?? 0} rows potentially containing last day):`, data);

            const summary = { delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0, successRate: 0, returnRate: 0, lastDateFound: null };

            if (data && data.length > 0) {
                const latestDate = data[0].metric_date;
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
                });
            } else {
                console.warn(`[${context}] No data found for category '${targetCategoryName}' in period.`);
            }
            const totalConsideredForRate = summary.delivered + summary.returned;
            summary.successRate = totalConsideredForRate > 0 ? (summary.delivered / totalConsideredForRate) * 100 : 0;
            summary.returnRate = totalConsideredForRate > 0 ? (summary.returned / totalConsideredForRate) * 100 : 0;
            summary.geral = summary.delivered + summary.inRoute + summary.returned + summary.custody;
            console.log(`%c[${context}] Sumário Final (Last Day: ${summary.lastDateFound || 'N/A'}):`, 'color: blue; font-weight: bold;', summary);
            return { data: summary, error: null };
        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: null, error: errorCatch };
        }
    }

    // Busca SOMAS do período para KPIs - IGNORA filtros de UI de Região
     async function getConsolidatedPeriodSums(startDate, endDate) {
         const context = 'getConsolidatedPeriodSums';
         console.log(`[${context}] Fetching PERIOD SUMS for: ${startDate} to ${endDate}`);
         const supabase = getClient();
         const targetCategoryName = 'ENTREGAS';
         const subCategoryMap = { delivered: 'Entregue', inRoute: 'Em Rota', returned: 'DEVOLUÇÃO', custody: 'Custodia' };
         const variationsReturned = [...new Set([subCategoryMap.returned, 'DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'])];
         const targetSubCategories = [ subCategoryMap.delivered, subCategoryMap.inRoute, ...variationsReturned, subCategoryMap.custody ].filter(Boolean);

         try {
             const { data, error } = await supabase
                 .from('logistics_consolidated_metrics')
                 .select('sub_category, value')
                 .gte('metric_date', startDate)
                 .lte('metric_date', endDate)
                 .eq('category', targetCategoryName)
                 .in('sub_category', targetSubCategories);

             if (error) { throw error; }
             console.log(`[${context}] Raw data for period sum calculation (${data?.length ?? 0} rows):`, data);

             const periodSums = { delivered: 0, inRoute: 0, returned: 0, custody: 0 };

             if (data && data.length > 0) {
                 data.forEach(item => {
                     const value = typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0;
                     const subCat = item.sub_category;

                     if (subCat === subCategoryMap.delivered) periodSums.delivered += value;
                     else if (subCat === subCategoryMap.inRoute) periodSums.inRoute += value;
                     else if (variationsReturned.includes(subCat)) periodSums.returned += value;
                     else if (subCat === subCategoryMap.custody) periodSums.custody += value;
                 });
             } else {
                 console.warn(`[${context}] No data found to calculate period sums.`);
             }

             console.log(`%c[${context}] Calculated Period Sums:`, 'color: purple; font-weight: bold;', periodSums);
             return { data: periodSums, error: null };

         } catch (errorCatch) {
             reportServiceError(errorCatch, context);
             return { data: { delivered: 0, inRoute: 0, returned: 0, custody: 0 }, error: errorCatch };
         }
     }

    // Busca motivos de devolução (Último dia) - IGNORA filtros de UI de Região
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
            if (error) { throw error; }
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
            } else { console.warn(`[${context}] Nenhum dado encontrado para ${targetCategoryName} no período.`); }
            console.log(`[${context}] Reasons object after processing:`, JSON.stringify(reasons));
            const sortedReasons = Object.entries(reasons)
                .map(([reason, count]) => ({ reason, count }))
                .sort((a, b) => b.count - a.count);
            console.log(`%c[${context}] Processed reasons (sorted):`, 'color: blue; font-weight: bold;', sortedReasons);
            return { data: sortedReasons, error: null };
        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: [], error: errorCatch };
        }
    }

    // Busca série temporal consolidada - IGNORA filtros de UI de Região
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

    // --- REMOVIDO: getFilteredTotals (não é mais necessário como KPI separado) ---

    // Busca totais por Região/Estado (IGNORA filtros de UI de Região/Estado)
    async function getRegionalStateTotals(startDate, endDate) {
        const context = 'getRegionalStateTotals';
        console.log(`[${context}] Fetching regional/state totals for period: ${startDate} to ${endDate} (Ignoring UI region filter)`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase
                .from('logistics_daily_metrics') // Busca da tabela correta
                .select('region, state, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate);
            if (error) { throw error; }
            console.log(`[${context}] Raw daily data fetched: ${data?.length ?? 0} rows.`);
            const totals = {};
            if (data) {
                 data.forEach(item => {
                     if (item.region && item.state && typeof item.value === 'number' && !isNaN(item.value)) {
                         if (!totals[item.region]) { totals[item.region] = { total: 0, states: {} }; }
                         totals[item.region].total += item.value; // Soma os valores diários
                         if (!totals[item.region].states[item.state]) { totals[item.region].states[item.state] = 0; }
                         totals[item.region].states[item.state] += item.value; // Soma os valores diários
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
        // getLogisticsData, // Manter se precisar
        getDistinctRegions, // Renomeado
        getConsolidatedLogisticsSummary,
        getConsolidatedPeriodSums,
        getReturnReasonsSummary,
        getConsolidatedTimeSeries,
        // getFilteredTotals, // Removido
        getRegionalStateTotals
    };
}

export default LogisticsService;