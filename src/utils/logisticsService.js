import getSupabaseClient from './supabaseClient.js';

const reportServiceError = (error, context) => {
    console.error(`[LogisticsService Error - ${context}]`, error?.message || error);
};

function LogisticsService() {

    const getClient = () => {
        try { return getSupabaseClient(); }
        catch (error) { reportServiceError(error, 'getClient'); throw new Error("Falha ao obter cliente Supabase no LogisticsService."); }
    };

    async function getDistinctRegions() {
        const context = 'getDistinctRegions';
        console.log(`[${context}] Fetching distinct regions from daily metrics.`);
        const supabase = getClient();
        try {
             const { data: regionData, error: regionError } = await supabase
                 .rpc('get_distinct_logistics_regions');
             if(regionError) throw regionError;
            const regions = regionData ? regionData.map(item => item.region).filter(Boolean).sort() : [];
            console.log(`[${context}] Result:`, { regions });
            return { data: { regions }, error: null };
        } catch (error) { reportServiceError(error, context); return { data: { regions: [] }, error }; }
    }

    async function getAggregatedDailyKPIs(startDate, endDate) {
        const context = 'getAggregatedDailyKPIs';
        const functionName = 'get_logistics_daily_aggregated_kpis';
        console.log(`[${context}] Calling RPC '${functionName}' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc(functionName, { start_date_param: startDate, end_date_param: endDate });
            if (error) {
                console.error(`[${context}] RPC error:`, error);
                if (error.code === 'PGRST200' || error.message.includes('404')) { console.error(`[${context}] ### ERRO 404: FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA NO ENDPOINT REST. Verifique a definição da função e permissões no Supabase. ###`); }
                else if (error.code === '42883' || (error.message && error.message.includes('function') && error.message.includes('does not exist'))) { console.error(`[${context}] ### FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA OU ASSINATURA INCORRETA NO BANCO! Verifique a criação no Supabase. ###`); }
                throw error;
            }
            console.log(`%c[${context}] RPC result:`, 'color: purple; font-weight: bold;', data);
             return { data: data ?? { delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0 }, error: null };
        } catch (errorCatch) { reportServiceError(errorCatch, context); return { data: { delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0 }, error: errorCatch }; }
    }

    // Renomeada de volta para get_logistics_kpi_data e ajustada para buscar no range
    async function getConsolidatedKpisForDateRange(startDate, endDate) {
        const context = 'getConsolidatedKpisForDateRange';
        // A função SQL original 'get_logistics_kpi_data' busca o MAX(date) dentro do range
        const functionName = 'get_logistics_kpi_data';
        console.log(`[${context}] Calling RPC '${functionName}' for range: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc(functionName, { start_date_param: startDate, end_date_param: endDate });
             if (error) {
                 console.error(`[${context}] RPC error:`, error);
                 if (error.code === 'PGRST200' || error.message.includes('404')) { console.error(`[${context}] ### ERRO 404: FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA NO ENDPOINT REST. Verifique a definição da função e permissões no Supabase. ###`);}
                 else if (error.code === '42883' || (error.message && error.message.includes('function') && error.message.includes('does not exist'))) { console.error(`[${context}] ### FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA OU ASSINATURA INCORRETA NO BANCO! Verifique a criação no Supabase. ###`); }
                 throw error;
             }
            // A RPC retorna { last_date_found, last_day_absolute }
            console.log(`%c[${context}] RPC result for range ending ${endDate}:`, 'color: blue; font-weight: bold;', data);
            // Retorna o objeto completo recebido da RPC
            return { data: data ?? { last_date_found: null, last_day_absolute: null }, error: null };
        } catch (errorCatch) { reportServiceError(errorCatch, context); return { data: { last_date_found: null, last_day_absolute: null }, error: errorCatch }; }
    }

    async function getReasonDailyTotals(startDate, endDate) {
        const context = 'getReasonDailyTotals';
        const functionName = 'get_logistics_reason_daily_totals';
        console.log(`[${context}] Calling RPC '${functionName}' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc(functionName, { start_date_param: startDate, end_date_param: endDate });
            if (error) {
                console.error(`[${context}] RPC error:`, error);
                 if (error.code === 'PGRST200' || error.message.includes('404')) { console.error(`[${context}] ### ERRO 404: FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA NO ENDPOINT REST. Verifique a definição da função e permissões no Supabase. ###`);}
                 else if (error.code === '42883' || (error.message && error.message.includes('function') && error.message.includes('does not exist'))) { console.error(`[${context}] ### FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA OU ASSINATURA INCORRETA NO BANCO! Verifique a criação no Supabase. ###`); }
                 throw error;
             }
            console.log(`%c[${context}] RPC result (reasons):`, 'color: blue; font-weight: bold;', data);
            return { data: data || [], error: null };
        } catch (errorCatch) { reportServiceError(errorCatch, context); return { data: [], error: errorCatch }; }
    }

    async function getDailyRegionalStateTotals(startDate, endDate) {
        const context = 'getDailyRegionalStateTotals';
        const functionName = 'get_logistics_daily_regional_state_totals';
        console.log(`[${context}] Calling RPC '${functionName}' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc(functionName, { start_date_param: startDate, end_date_param: endDate });
            if (error) {
                 console.error(`[${context}] RPC error:`, error);
                 if (error.code === 'PGRST200' || error.message.includes('404')) { console.error(`[${context}] ### ERRO 404: FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA NO ENDPOINT REST. Verifique a definição da função e permissões no Supabase. ###`);}
                 else if (error.code === '42883' || (error.message && error.message.includes('function') && error.message.includes('does not exist'))) { console.error(`[${context}] ### FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA OU ASSINATURA INCORRETA NO BANCO! Verifique a criação no Supabase. ###`); }
                 throw error;
            }
             console.log(`%c[${context}] RPC result (daily regional totals):`, 'color: purple; font-weight: bold;', data);
             return { data: data || {}, error: null };
         } catch (errorCatch) { reportServiceError(errorCatch, context); return { data: {}, error: errorCatch }; }
     }

    async function getDailyAggregatedTimeSeries(startDate, endDate) {
        const context = 'getDailyAggregatedTimeSeries';
        const functionName = 'get_logistics_daily_aggregated_timeseries';
        console.log(`[${context}] Calling RPC '${functionName}' for ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
             const { data, error } = await supabase.rpc(functionName, { start_date_param: startDate, end_date_param: endDate });
             if (error) {
                 console.error(`[${context}] RPC error:`, error);
                 if (error.code === 'PGRST200' || error.message.includes('404')) { console.error(`[${context}] ### ERRO 404: FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA NO ENDPOINT REST. Verifique a definição da função e permissões no Supabase. ###`);}
                 else if (error.code === '42883' || (error.message && error.message.includes('function') && error.message.includes('does not exist'))) { console.error(`[${context}] ### FUNÇÃO RPC '${functionName}' NÃO ENCONTRADA OU ASSINATURA INCORRETA NO BANCO! Verifique a criação no Supabase. ###`); }
                 throw error;
             }
            console.log(`[${context}] Time series data fetched: ${data?.length ?? 0} points.`);
            return { data: data || [], error: null };
        } catch (error) { reportServiceError(error, context); return { data: [], error }; }
    }

    return {
        getDistinctRegions,
        getAggregatedDailyKPIs,
        getConsolidatedKpisForDateRange, // Exportando a função renomeada/ajustada
        getReasonDailyTotals,
        getDailyRegionalStateTotals,
        getDailyAggregatedTimeSeries
    };
}

export default LogisticsService;