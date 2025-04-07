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
            console.warn(`[${context}] Nenhuma métrica fornecida para adicionar.`);
            return { data: null, error: null };
        }
        console.log(`[${context}] Tentando inserir/atualizar ${metrics.length} métricas...`);
        const supabase = getClient();
        try {
            const { data, error } = await supabase
                .from('stock_daily_metrics')
                .upsert(metrics, { onConflict: 'item_type, metric_date, metric_type' })
                .select();
            if (error) { throw error; }
            console.log(`[${context}] Upsert concluído com sucesso. Resultado (amostra):`, data?.slice(0, 5));
            return { data, error: null };
        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: null, error: errorCatch };
        }
    }

    async function getLatestStockMetrics(startDate, endDate) {
        const context = 'getLatestStockMetrics';
        console.log(`[${context}] Fetching latest stock metrics for period: ${startDate} to ${endDate}`);
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
                console.warn(`[${context}] No stock data found in the specified period.`);
                return { data: { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null }, error: null };
            }

            const latestDate = latestDateData.metric_date;
            console.log(`[${context}] Latest date with data found: ${latestDate}`);

            const { data, error } = await supabase
                .from('stock_daily_metrics')
                .select('item_type, metric_type, value')
                .eq('metric_date', latestDate);

            if (error) throw error;
            console.log(`[${context}] Data fetched for latest date (${data?.length ?? 0} rows):`, data);

            // Inicializa com chaves normalizadas esperadas
            const latestMetrics = {
                PLASTICO: {},
                CARTA: {},
                ENVELOPE: {},
                lastDate: latestDate
            };

            if (data) {
                data.forEach(item => {
                    let originalItemType = item.item_type; // Guarda o original para logs
                    let normalizedItemTypeKey = null; // Chave a ser usada no objeto

                    // Normalização explícita e LOG DETALHADO
                    if (originalItemType?.toUpperCase() === 'PLÁSTICO' || originalItemType?.toUpperCase() === 'PLÃ STICO' ) {
                        normalizedItemTypeKey = 'PLASTICO';
                         console.log(`[${context}] Normalizing '${originalItemType}' to '${normalizedItemTypeKey}'`);
                    } else if (originalItemType?.toUpperCase() === 'CARTA') {
                        normalizedItemTypeKey = 'CARTA';
                    } else if (originalItemType?.toUpperCase() === 'ENVELOPE') {
                        normalizedItemTypeKey = 'ENVELOPE';
                    } else {
                         console.warn(`[${context}] Unrecognized item_type: '${originalItemType}'`);
                    }

                    // Verifica se a chave normalizada existe no nosso objeto E se a métrica também existe
                    if (normalizedItemTypeKey && latestMetrics[normalizedItemTypeKey] && item.metric_type) {
                         // Log antes da atribuição
                         console.log(`[${context}] Assigning: latestMetrics['${normalizedItemTypeKey}']['${item.metric_type}'] = ${item.value}`);
                        latestMetrics[normalizedItemTypeKey][item.metric_type] = item.value;
                    } else {
                         console.warn(`[${context}] Failed to assign metric. normalizedKey='${normalizedItemTypeKey}', metricType='${item.metric_type}', item:`, item);
                     }
                });
            }

            console.log(`%c[${context}] Processed latest metrics:`, 'color: blue; font-weight: bold;', JSON.stringify(latestMetrics)); // Usa JSON.stringify para garantir a visualização
            return { data: latestMetrics, error: null };

        } catch (errorCatch) {
            reportServiceError(errorCatch, context);
            return { data: { PLASTICO: {}, CARTA: {}, ENVELOPE: {}, lastDate: null }, error: errorCatch };
        }
    }

    async function getStockTimeSeries(startDate, endDate) {
        const context = 'getStockTimeSeries';
        console.log(`[${context}] Fetching stock time series for period: ${startDate} to ${endDate}`);
        const supabase = getClient();
        const targetMetricType = 'Saldo';
        try {
             const { data, error } = await supabase
                 .from('stock_daily_metrics')
                 .select('metric_date, item_type, value')
                 .gte('metric_date', startDate)
                 .lte('metric_date', endDate)
                 .eq('metric_type', targetMetricType)
                 .order('metric_date', { ascending: true });
             if (error) throw error;
             console.log(`[${context}] Time series data fetched (${data?.length ?? 0} rows):`, data);
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
        // Adicione outras funções se necessário
    };
}

export default EstoqueService;