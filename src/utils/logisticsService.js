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

    async function getLogisticsData(startDate, endDate, filters = {}) {
        const context = 'getLogisticsData';
        console.log(`[${context}] Fetching table data for ${startDate} to ${endDate} with filters:`, filters);
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
            if (filters.state && filters.state !== 'todos') {
                query = query.eq('state', filters.state);
            }

            const { data, error, count } = await query;

            if (error) throw error;
            console.log(`[${context}] Fetched ${data?.length ?? 0} rows from logistics_daily_metrics.`);
            return { data, error: null };
        } catch (error) {
            reportServiceError(error, context);
            return { data: null, error };
        }
    }

    async function getDistinctRegionsAndStates() {
        const context = 'getDistinctRegionsAndStates';
        console.log(`[${context}] Fetching distinct regions and states.`);
        const supabase = getClient();
        try {

            const { data, error } = await supabase
                .from('logistics_daily_metrics')
                .select('region, state');

            if (error) throw error;
            console.log(`[${context}] Found ${data?.length ?? 0} region/state combinations.`);

            const regions = new Set();
            const statesByRegion = {};

            if (data) {
                 data.forEach(item => {
                    if (item.region) {
                         regions.add(item.region);
                         if (item.state) {
                             if (!statesByRegion[item.region]) {
                                 statesByRegion[item.region] = new Set();
                             }
                             statesByRegion[item.region].add(item.state);
                         }
                     }
                 });
             }

             const sortedRegions = Array.from(regions).sort();
             const finalStatesByRegion = {};
             for (const region in statesByRegion) {
                 finalStatesByRegion[region] = Array.from(statesByRegion[region]).sort();
             }
             console.log(`[${context}] Result:`, { regions: sortedRegions, statesByRegion: finalStatesByRegion });
            return { data: { regions: sortedRegions, statesByRegion: finalStatesByRegion }, error: null };
        } catch (error) {
            reportServiceError(error, context);
            return { data: { regions: [], statesByRegion: {} }, error };
        }
    }

    async function getConsolidatedLogisticsSummary(startDate, endDate) {
        const context = 'getConsolidatedLogisticsSummary';
        console.log(`[${context}] Fetching summary data for period: ${startDate} to ${endDate}`);
        const supabase = getClient();

        // *** VERIFIQUE E AJUSTE ESTES NOMES CONFORME O BANCO ***
        const targetCategoryName = 'ENTREGAS'; // É este mesmo? Ou "ENTREGAS - Projeção"?
        const subCategoryMap = {
            delivered: 'Entregue',      // Está escrito assim?
            inRoute:   'Em Rota',       // Está escrito assim?
            returned:  'DEVOLUÇÃO',     // Ou 'DEVOLUCAO' ou 'DEVOLUÃ‡ÃƒO'?
            custody:   'Custodia'       // Está escrito assim?
        };
        // *** FIM DA VERIFICAÇÃO ***

        const variationsReturned = [...new Set([subCategoryMap.returned, 'DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'])]; // Garante unicidade e inclui comuns
        const targetSubCategories = [
            subCategoryMap.delivered,
            subCategoryMap.inRoute,
            ...variationsReturned,
            subCategoryMap.custody
        ].filter(Boolean); // Remove null/undefined se algum nome não for encontrado

        console.log(`[${context}] Querying table 'logistics_consolidated_metrics' for category '${targetCategoryName}' and subcategories:`, targetSubCategories);

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
            console.log(`[${context}] Raw data fetched from DB (${data?.length ?? 0} rows for category '${targetCategoryName}' in period):`, data?.length > 5 ? JSON.stringify(data.slice(-5))+' (last 5 shown)' : JSON.stringify(data));

            const summary = {
                delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0,
                successRate: 0, returnRate: 0, lastDateFound: null
            };

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


    async function getReturnReasonsSummary(startDate, endDate) {
        const context = 'getReturnReasonsSummary';
         // *** VERIFIQUE E AJUSTE ESTE NOME CONFORME O BANCO ***
        const targetCategoryName = 'DEVOLUÇÃO - MOTIVOS'; // Ou 'DEVOLUCAO - MOTIVOS' ou 'DEVOLUÃ‡ÃƒO - MOTIVOS'?
        // *** FIM DA VERIFICAÇÃO ***

        console.log(`[${context}] Fetching return reasons for period: ${startDate} to ${endDate}, Category: '${targetCategoryName}'`);
        const supabase = getClient();

        try {
            console.log(`[${context}] Executing query...`);
            const { data, error } = await supabase
                .from('logistics_consolidated_metrics')
                .select('metric_date, sub_category, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate)
                .eq('category', targetCategoryName) // Usa nome verificado/ajustado
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
                     // Verifica se sub_category existe e não é igual à categoria principal (case-insensitive)
                     // E também não é exatamente igual à categoria principal (para evitar linhas de total)
                     if (item.sub_category && item.sub_category.toUpperCase() !== targetCategoryName.toUpperCase() && item.sub_category !== targetCategoryName) {
                         const value = typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0;
                         reasons[item.sub_category] = value;

                     } else {

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


    async function getConsolidatedTimeSeries(startDate, endDate) {
        const context = 'getConsolidatedTimeSeries';
         // *** VERIFIQUE E AJUSTE ESTES NOMES CONFORME O BANCO ***
        const targetCategoryName = 'ENTREGAS';
        const subCategoryMap = { delivered: 'Entregue', inRoute: 'Em Rota', returned: 'DEVOLUÇÃO', custody: 'Custodia' };
        // *** FIM DA VERIFICAÇÃO ***

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


    async function getRegionalSummary(startDate, endDate) {
        const context = 'getRegionalSummary';
        console.log(`[${context}] Fetching regional summary (SUM) for ${startDate} to ${endDate}`);
        const supabase = getClient();

        try {

            const { data, error } = await supabase
                .from('logistics_daily_metrics')
                .select('region, value')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate);

            if (error) throw error;
            console.log(`[${context}] Raw regional data fetched (${data?.length ?? 0} rows):`, data);


            const regions = {};
            if (data) {
                data.forEach(item => {
                    if (item.region) {
                        const value = typeof item.value === 'number' ? item.value : 0;
                        regions[item.region] = (regions[item.region] || 0) + value;
                    }
                 });
            }


            const sortedRegions = Object.entries(regions)
                .map(([region, total]) => ({ region, total }))
                .sort((a, b) => b.total - a.total);

            console.log(`[${context}] Processed regional summary (SUM):`, sortedRegions);
            return { data: sortedRegions, error: null };

        } catch (error) {
            reportServiceError(error, context);
            return { data: [], error };
        }
    }

    return {
        getLogisticsData,
        getDistinctRegionsAndStates,
        getConsolidatedLogisticsSummary,
        getReturnReasonsSummary,
        getConsolidatedTimeSeries,
        getRegionalSummary,
    };
}

export default LogisticsService;