import getSupabaseClient from './supabaseClient.js';

const reportServiceError = (error, context) => {
    console.error(`[LogisticsService Error - ${context}]`, error?.message || error);
};

function EstoqueService() {

    const getClient = () => {
        try {
            return getSupabaseClient();
        } catch (error) {
            reportServiceError(error, 'getClient');
            throw new Error("Falha ao obter cliente Supabase no EstoqueService.");
        }
    };

    async function addStockMetrics(metrics) {
        const context = 'addStockMetrics';
        if (!metrics || metrics.length === 0) {
            return { data: null, error: null };
        }
        const supabase = getClient();
        try {
            const { data, error } = await supabase
                .from('stock_daily_metrics')
                .upsert(metrics, { onConflict: 'item_type, metric_date, metric_type, product_code' }) // Adiciona product_code aqui
                .select();
            if (error) { throw error; }
            return { data, error: null };
        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: null, error: errorCatch };
        }
    }

    async function getLatestStockMetrics(startDate, endDate) {
        const context = 'getLatestStockMetrics';
        const supabase = getClient();
        try {
            const { data: latestDateData, error: latestDateError } = await supabase
                .from('stock_daily_metrics')
                .select('metric_date')
                .gte('metric_date', startDate)
                .lte('metric_date', endDate)
                .order('metric_date', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestDateError) throw latestDateError;

            if (!latestDateData?.metric_date) {
                return { data: { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null }, error: null };
            }

            const latestDate = latestDateData.metric_date;

            const { data, error } = await supabase
                .from('stock_daily_metrics')
                .select('item_type, metric_type, value, product_code') // Inclui product_code
                .eq('metric_date', latestDate);

            if (error) throw error;

            const latestMetrics = {
                PLASTICO: {},
                CARTA: {},
                ENVELOPE: {},
                lastDate: latestDate
            };

            if (data) {
                data.forEach(item => {
                    let normalizedItemTypeKey = null;

                    if (item.item_type?.toUpperCase() === 'PLÁSTICO' || item.item_type?.toUpperCase() === 'PLÃ STICO' ) {
                        normalizedItemTypeKey = 'PLASTICO';
                    } else if (item.item_type?.toUpperCase() === 'CARTA') {
                        normalizedItemTypeKey = 'CARTA';
                    } else if (item.item_type?.toUpperCase() === 'ENVELOPE') {
                        normalizedItemTypeKey = 'ENVELOPE';
                    }

                    if (normalizedItemTypeKey && latestMetrics[normalizedItemTypeKey] && item.metric_type) {
                        latestMetrics[normalizedItemTypeKey][item.metric_type] = item.value;
                    }
                });
            }

            return { data: latestMetrics, error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null }, error: errorCatch };
        }
    }

    async function getStockTimeSeries(startDate, endDate) {
        const context = 'getStockTimeSeries';
        const supabase = getClient();
        const targetMetricType = 'Saldo';
        try {
             const { data, error } = await supabase
                 .from('stock_daily_metrics')
                 .select('metric_date, item_type, value, product_code') // Inclui product_code
                 .gte('metric_date', startDate)
                 .lte('metric_date', endDate)
                 .eq('metric_type', targetMetricType)
                 .order('metric_date', { ascending: true });
             if (error) throw error;
             return { data: data || [], error: null };
         } catch (errorCatch) {
             reportServiceError(errorCatch, context);
             return { data: [], error: errorCatch };
         }
     }

    return {
        addStockMetrics,
        getLatestStockMetrics,
        getStockTimeSeries
    };
}

export default EstoqueService;