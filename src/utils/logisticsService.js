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

    // Busca regiões distintas para filtro UI (se necessário no futuro)
    async function getDistinctRegions() {
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

    // --- Chama RPC para buscar KPIs (Absoluto Último Dia + Diferença Diária/Período) ---
    async function getLogisticsKPIs(startDate, endDate) {
        const context = 'getLogisticsKPIs';
        console.log(`[${context}] Calling RPC 'get_logistics_kpi_data' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc('get_logistics_kpi_data', {
                start_date_param: startDate,
                end_date_param: endDate
            });

            if (error) {
                console.error(`[${context}] RPC error:`, error);
                throw error;
            }
            console.log(`%c[${context}] RPC result:`, 'color: blue; font-weight: bold;', data);
            // O RPC retorna diretamente o objeto com last_day_absolute e period_daily_diff
            return { data: data, error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            // Retorna uma estrutura padrão em caso de erro para evitar quebras no frontend
             return {
                data: {
                    last_day_absolute: { delivered: 0, inRoute: 0, returned: 0, custody: 0, geral: 0, date: null },
                    period_daily_diff: { delivered: null, inRoute: null, returned: null, custody: null, geral: null } // null indica falha no cálculo
                },
                error: errorCatch
            };
        }
    }

    // --- Chama RPC para buscar totais diários/período dos Motivos de Devolução ---
    async function getReasonDailyTotals(startDate, endDate) {
        const context = 'getReasonDailyTotals';
        console.log(`[${context}] Calling RPC 'get_logistics_reason_daily_totals' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc('get_logistics_reason_daily_totals', {
                start_date_param: startDate,
                end_date_param: endDate
             });

            if (error) {
                console.error(`[${context}] RPC error:`, error);
                throw error;
            }
            console.log(`%c[${context}] RPC result (reasons):`, 'color: blue; font-weight: bold;', data);
            // O RPC já retorna o array JSON [{reason, count}] ordenado
            return { data: data || [], error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: [], error: errorCatch };
        }
    }

    // --- Chama RPC para buscar totais por Região/Estado (Soma do período) ---
    async function getRegionalStateTotalsPeriod(startDate, endDate) { // Renomeado para clareza
        const context = 'getRegionalStateTotalsPeriod';
        console.log(`[${context}] Calling RPC 'get_logistics_regional_state_period_totals' for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase.rpc('get_logistics_regional_state_period_totals', {
                start_date_param: startDate,
                end_date_param: endDate
            });

            if (error) {
                 console.error(`[${context}] RPC error:`, error);
                 throw error;
            }
             console.log(`%c[${context}] RPC result (regional totals):`, 'color: blue; font-weight: bold;', data);
             // O RPC já retorna o objeto JSON { REGIAO: { total: number, states: { ESTADO: total } } }
             return { data: data || {}, error: null };

         } catch (errorCatch) {
             reportServiceError(errorCatch, context);
             return { data: {}, error: errorCatch };
         }
     }

    // --- Busca dados BRUTOS de série temporal consolidada (para gráfico) ---
    async function getConsolidatedTimeSeries(startDate, endDate) {
        const context = 'getConsolidatedTimeSeries';
        const targetCategoryName = 'ENTREGAS';
        const subCategoryMap = { delivered: 'Entregue', inRoute: 'Em Rota', returned: 'DEVOLUÇÃO', custody: 'Custodia' };
        const variationsReturned = [...new Set([subCategoryMap.returned, 'DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'])];
        const targetSubCategories = [ subCategoryMap.delivered, subCategoryMap.inRoute, ...variationsReturned, subCategoryMap.custody ].filter(Boolean);
        console.log(`[${context}] Fetching time series for ${startDate} to ${endDate}. Category: '${targetCategoryName}', Subcategories:`, targetSubCategories);
        const supabase = getClient();
        try {
            // Esta busca continua sendo feita diretamente na tabela
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

    return {
        getDistinctRegions,
        getLogisticsKPIs,
        getReasonDailyTotals,
        getConsolidatedTimeSeries,
        getRegionalStateTotalsPeriod
    };
}

export default LogisticsService;