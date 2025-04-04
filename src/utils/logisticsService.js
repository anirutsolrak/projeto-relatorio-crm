
import getSupabaseClient from './supabaseClient'; // Ajuste o caminho se necessário

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
                .order('metric_date', { ascending: false }) // Mais recentes primeiro por padrão
                .order('region', { ascending: true })
                .order('state', { ascending: true });

            if (startDate) {
                query = query.gte('metric_date', startDate);
            }
            if (endDate) {
                query = query.lte('metric_date', endDate);
            }

            // Aplicar filtros de string (se não forem 'todos')
            if (filters.region && filters.region !== 'todos') {
                query = query.eq('region', filters.region);
            }
            if (filters.state && filters.state !== 'todos') {
                 // Considerar case-insensitivity se necessário no DB ou aqui
                 query = query.eq('state', filters.state);
            }

            // Adicionar limite para evitar buscar dados demais inicialmente?
            // query = query.limit(1000);

            const { data, error, count } = await query; // Incluir count pode ser útil

            if (error) throw error;

            console.log(`[${context}] Fetched ${data?.length} records.`);
            return { data, error: null };
        } catch (error) {
            reportError(error, context);
            return { data: null, error };
        }
    }

    // Função para buscar regiões e estados distintos usando RPC
    async function getDistinctRegionsAndStates() {
        const context = 'getDistinctRegionsAndStates';
        try {
            // Chama a função RPC criada no Supabase
            const { data, error } = await supabase.rpc('get_distinct_logistics_regions_states');

            if (error) throw error;

            // Processa o resultado da RPC para o formato desejado
            const regions = [...new Set(data.map(item => item.region))].sort();
            const statesByRegion = data.reduce((acc, curr) => {
                if (!acc[curr.region]) {
                    acc[curr.region] = [];
                }
                // Evitar duplicados se a RPC retornar múltiplos por alguma razão
                if (!acc[curr.region].includes(curr.state)) {
                    acc[curr.region].push(curr.state);
                }
                // Ordenar estados dentro de cada região
                acc[curr.region].sort();
                return acc;
            }, {});

            return { data: { regions, statesByRegion }, error: null };
        } catch (error) {
            reportError(error, context);
            // Retorna estrutura vazia em caso de erro
            return { data: { regions: [], statesByRegion: {} }, error };
        }
    }

    // Exporta as funções do serviço
    return {
        getLogisticsData,
        getDistinctRegionsAndStates
    };
}

export default LogisticsService; // Exporta a factory function