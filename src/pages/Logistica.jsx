import React from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import Navigation from '../components/Navigation'; // Assumindo que Navigation está um nível acima
import FilterPanel from '../components/FilterPanel';
import DataTable from '../components/DataTable';
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import LogisticsService from '../utils/logisticsService'; // Assumindo localização do serviço

function Logistica({ onNavigate, user }) {
    const reportError = (error, context = 'LogisticaPage') => console.error(`[${context}] Error:`, error?.message || error);
    // Instanciar o serviço. Usar useMemo para evitar recriação a cada render.
    const logisticsService = React.useMemo(() => LogisticsService(), []);

    // Estados do componente
    const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false); // Estado do menu mobile (controlado pelo App/Navigation)
    const [filterOpen, setFilterOpen] = React.useState(false); // Visibilidade do painel de filtro no mobile
    const [showLogisticsUploader, setShowLogisticsUploader] = React.useState(false); // Visibilidade do uploader
    const [isLoading, setIsLoading] = React.useState(true); // Estado de carregamento de dados
    const [fetchError, setFetchError] = React.useState(null); // Mensagem de erro ao buscar dados
    const [logisticsData, setLogisticsData] = React.useState([]); // Dados da tabela
    const [sortConfig, setSortConfig] = React.useState({ key: 'metric_date', direction: 'desc' }); // Configuração de ordenação
    const [distinctFilterOptions, setDistinctFilterOptions] = React.useState({ regions: [], statesByRegion: {} }); // Opções para os filtros (regiões, estados)
    const [availableStates, setAvailableStates] = React.useState([]); // Estados disponíveis no filtro baseado na região selecionada

    // Datas padrão para os filtros
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];

    // Estado dos filtros aplicados
    const [filters, setFilters] = React.useState({
        region: 'todos',
        state: 'todos',
        dataInicio: defaultStartDate,
        dataFim: defaultEndDate
    });

    // Função para buscar dados da API/serviço
    const fetchData = React.useCallback(async (currentFilters, currentSortConfig) => {
        if (!logisticsService) {
             console.warn("[Logistica fetchData] Service not ready.");
             setIsLoading(false);
             setFetchError("Erro interno: Serviço de dados não inicializado.");
             return;
        }
        setIsLoading(true);
        setFetchError(null);
        console.log("[Logistica] Fetching data with filters:", currentFilters, "sort:", currentSortConfig);
        try {
            if (!currentFilters.dataInicio || !currentFilters.dataFim) throw new Error("Datas inválidas para busca.");
            if (new Date(currentFilters.dataFim) < new Date(currentFilters.dataInicio)) throw new Error("Data final não pode ser anterior à data inicial.");

            const { data, error } = await logisticsService.getLogisticsData(
                currentFilters.dataInicio,
                currentFilters.dataFim,
                { region: currentFilters.region, state: currentFilters.state } // Passa filtros relevantes
            );
            if (error) throw error; // Lança erro para o catch

            const rawData = data || [];
            console.log(`[Logistica] Received ${rawData.length} records.`);

            // Ordenação client-side dos dados recebidos
            const sortedData = [...rawData].sort((a, b) => {
                const key = currentSortConfig.key;
                const direction = currentSortConfig.direction === 'asc' ? 1 : -1;
                const valA = a[key]; const valB = b[key];
                if (valA === null || valA === undefined) return 1 * direction; // Nulls last
                if (valB === null || valB === undefined) return -1 * direction;
                if (valA < valB) return -1 * direction;
                if (valA > valB) return 1 * direction;
                if (a.id < b.id) return -1; // Secondary sort
                if (a.id > b.id) return 1;
                return 0;
             });
            setLogisticsData(sortedData); // Atualiza estado com dados ordenados

        } catch (err) {
            reportError(err, 'fetchData');
            setFetchError(`Falha ao carregar dados de logística: ${err.message}`);
            setLogisticsData([]); // Limpa dados em caso de erro
        } finally {
            setIsLoading(false); // Finaliza o estado de carregamento
            console.log("[Logistica] Fetch data finished.");
        }
    }, [logisticsService]); // Depende do serviço (que é memoizado)

    // Função para buscar opções distintas para os filtros (regiões e estados)
    const fetchFilterOptions = React.useCallback(async () => {
        if (!logisticsService) {
            console.warn("[Logistica fetchFilterOptions] Service not ready.");
            return;
        }
        console.log("[Logistica] Fetching filter options...");
         try {
             const { data, error } = await logisticsService.getDistinctRegionsAndStates();
             if (error) throw error;
             const options = data || { regions: [], statesByRegion: {} };
             console.log("[Logistica] Received filter options:", options);
             setDistinctFilterOptions(options); // Atualiza opções de filtro

             // Define estados iniciais disponíveis baseado no filtro inicial ('todos')
             const initialRegion = filters.region;
             const statesByRegion = options.statesByRegion || {};
             const initialStates = initialRegion === 'todos'
                 ? [...new Set(Object.values(statesByRegion).flat())].sort()
                 : statesByRegion[initialRegion] || [];
             setAvailableStates(initialStates); // Atualiza estados disponíveis

         } catch(err) {
             reportError(err, 'fetchFilterOptions');
             // Não define fetchError aqui para não bloquear a UI por causa de filtros
             console.error(`Falha ao buscar opções de filtro: ${err.message}`);
             setDistinctFilterOptions({ regions: [], statesByRegion: {} }); // Reseta em caso de erro
             setAvailableStates([]);
         }
     }, [logisticsService, filters.region]); // Depende do serviço e do filtro de região atual

    // Efeito para buscar opções de filtro na montagem do componente
    React.useEffect(() => {
        let isMounted = true;
        console.log("[Logistica Effect Mount] Fetching initial filter options...");
        fetchFilterOptions().catch(err => {
            if(isMounted) reportError(err, "useEffectMount[fetchFilterOptions]");
        });
        return () => { isMounted = false; } // Cleanup
    }, [fetchFilterOptions]); // Depende da função memoizada

    // Efeito para buscar dados quando filtros ou ordenação mudam
    React.useEffect(() => {
        let isMounted = true;
        console.log("[Logistica Effect Update] Filters/sort changed, fetching data...");
        fetchData(filters, sortConfig).catch(err => {
            if(isMounted) reportError(err, "useEffectUpdate[fetchData]");
        });
        return () => { isMounted = false; } // Cleanup
    }, [filters, sortConfig, fetchData]); // Depende dos filtros, ordenação e função de busca

     // Efeito para atualizar 'availableStates' quando 'filters.region' muda *depois* que as opções foram carregadas
     React.useEffect(() => {
         // Roda apenas se as opções já foram carregadas (evita rodar na montagem inicial junto com o outro useEffect)
         if (distinctFilterOptions.regions.length > 0) {
             console.log("[Logistica Effect Region Change] Updating available states for region:", filters.region);
             const currentStatesByRegion = distinctFilterOptions.statesByRegion || {};
             const states = filters.region === 'todos'
                 ? [...new Set(Object.values(currentStatesByRegion).flat())].sort()
                 : currentStatesByRegion[filters.region] || [];
             setAvailableStates(states);
         }
     }, [filters.region, distinctFilterOptions]); // Observa a mudança na região *e* nas opções carregadas


    // Handler para alternar visibilidade do menu mobile (delegado ao App.js)
    // const toggleMobileMenu = () => setMobileMenuOpen(prev => !prev);

    // Handler para mudança nos filtros
    const handleFilterChange = (key, value) => {
        console.log(`[Logistica] Filter changed - Key: ${key}, Value: ${value}`);
        setFilters(prevFilters => {
            const newFilters = { ...prevFilters, [key]: value };
            // Resetar filtro de estado se a região mudar
            if (key === 'region') {
                newFilters.state = 'todos';
                // A atualização de availableStates é feita pelo useEffect dedicado
            }
            // Validar datas para prevenir ranges inválidos antes de atualizar o estado
            if ((key === 'dataInicio' && value && newFilters.dataFim && new Date(value) > new Date(newFilters.dataFim)) ||
                (key === 'dataFim' && value && newFilters.dataInicio && new Date(value) < new Date(newFilters.dataInicio))) {
                console.warn("[Logistica handleFilterChange] Invalid date range selected.");
                setFetchError("Data final não pode ser anterior à data inicial."); // Exibe erro
                return prevFilters; // Não atualiza o estado se inválido
            } else {
                 setFetchError(null); // Limpa erro de data se a mudança for válida
             }
            return newFilters; // Atualiza o estado dos filtros
        });
    };

    // Handler para alternar visibilidade do painel de filtro mobile
    const handleFilterToggle = () => setFilterOpen(prev => !prev);

    // Handler para mudança na ordenação da tabela
    const handleSort = (key) => {
        console.log(`[Logistica] Sorting requested for key: ${key}`);
        setSortConfig(prev => {
            const direction = (prev.key === key && prev.direction === 'asc') ? 'desc' : 'asc';
            return { key, direction };
        });
    };

    // Handler para clique em linha da tabela (placeholder)
    const handleRowClick = (row) => console.log('[Logistica] Row clicked:', row);

    // Handler chamado após upload bem-sucedido do arquivo de logística
    const handleLogisticsUploadSuccess = async (processedData) => {
         setIsLoading(true);
         setFetchError(null);
         setShowLogisticsUploader(false); // Fecha uploader
         const supabase = getSupabaseClient(); // Pega instância do Supabase
         const { logisticsMetrics } = processedData;

         if (!Array.isArray(logisticsMetrics) || logisticsMetrics.length === 0) {
             setFetchError("Nenhum dado válido para salvar após processamento.");
             setIsLoading(false);
             return;
         }
         console.log(`[Logistica] Trying to save ${logisticsMetrics.length} logistics metrics...`);
         try {
             // Envia dados para o Supabase usando upsert
             const { error: logisticsError } = await supabase
                 .from('logistics_daily_metrics')
                 .upsert(logisticsMetrics, { onConflict: 'metric_date, region, state' }); // Define colunas de conflito
             if (logisticsError) throw logisticsError; // Lança erro se houver

             console.log("[Logistica] Logistics data saved successfully.");
             // Rebusca dados e opções de filtro após sucesso
             await fetchData(filters, sortConfig);
             await fetchFilterOptions(); // Passa filtro atual de região

         } catch(err) {
             reportError(err, 'handleLogisticsUploadSuccess');
             setFetchError(`Erro ao salvar logística: ${err.message || 'Erro desconhecido'}`);
         } finally {
             setIsLoading(false); // Finaliza carregamento
         }
     };

    // Verifica se o usuário atual pode fazer uploads
    const canUpload = user && user.role !== 'guest';

    // Formata data para exibição (DD/MM/YYYY)
    const formatDate = (dateString) => {
        if (!dateString) return '';
        try {
             const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString;
            return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); // Usa UTC para evitar TZs
        } catch (e) {
            reportError(e, `formatDate(${dateString})`);
            return dateString;
        }
    };

    // Formata número para exibição
     const formatNumber = (value) => {
         if (value === null || value === undefined) return '0';
         if (typeof value === 'number') {
              return value.toLocaleString('pt-BR');
          }
         return String(value);
     };

    // Renderiza os filtros para Desktop
     const renderDesktopFilters = () => (
        <div className="hidden lg:block mb-6">
            <div className="bg-white p-4 rounded-lg shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="input-label" htmlFor="filter-region-desktop">Região</label>
                        <select id="filter-region-desktop" value={filters.region} onChange={(e) => handleFilterChange('region', e.target.value)} className="input-field" data-name="region-filter-select" >
                            <option value="todos">Todas</option>
                            {(distinctFilterOptions.regions || []).map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="input-label" htmlFor="filter-state-desktop">Estado</label>
                         <select id="filter-state-desktop" value={filters.state} onChange={(e) => handleFilterChange('state', e.target.value)} className="input-field" data-name="state-filter-select" disabled={!availableStates || availableStates.length === 0} >
                             <option value="todos">Todos</option>
                             {(availableStates || []).map(s => <option key={s} value={s}>{s}</option>)}
                         </select>
                    </div>
                    <div>
                        <label className="input-label" htmlFor="filter-start-date-desktop">Data Início</label>
                        <input id="filter-start-date-desktop" type="date" value={filters.dataInicio} onChange={(e) => handleFilterChange('dataInicio', e.target.value)} className="input-field" data-name="start-date-input" max={filters.dataFim || undefined}/>
                    </div>
                    <div>
                        <label className="input-label" htmlFor="filter-end-date-desktop">Data Fim</label>
                        <input id="filter-end-date-desktop" type="date" value={filters.dataFim} onChange={(e) => handleFilterChange('dataFim', e.target.value)} className="input-field" data-name="end-date-input" min={filters.dataInicio || undefined} />
                    </div>
                </div>
            </div>
        </div>
    );

    // Renderiza os filtros para Mobile (usando FilterPanel)
     const renderMobileFilters = () => (
        <div className={`lg:hidden mb-6 ${filterOpen ? 'block' : 'hidden'}`}>
             <FilterPanel
                 filters={[
                     { id: 'region', label: 'Região', type: 'select', value: filters.region, options: [{ value: 'todos', label: 'Todas' }, ...(distinctFilterOptions.regions || []).map(r => ({ value: r, label: r }))] },
                      { id: 'state', label: 'Estado', type: 'select', value: filters.state, options: [{ value: 'todos', label: 'Todos' }, ...(availableStates || []).map(s => ({ value: s, label: s }))] , disabled: !availableStates || availableStates.length === 0 },
                     { id: 'dataInicio', label: 'Data Início', type: 'date', value: filters.dataInicio, max: filters.dataFim || undefined },
                     { id: 'dataFim', label: 'Data Fim', type: 'date', value: filters.dataFim, min: filters.dataInicio || undefined }
                 ]}
                 onFilterChange={handleFilterChange} // Passa a função de handler
                 isOpen={filterOpen} // Controla visibilidade
             />
         </div>
     );

    // Renderização principal do componente
    return (
        // Div principal com altura mínima da tela
        <div className="min-h-screen">
            {/* Overlay de carregamento */}
            <LoadingOverlay isLoading={isLoading} message="Carregando dados de logística..." />
            {/* Conteúdo principal */}
            <main className="p-4 lg:p-6">
                {/* Exibição de erro de busca */}
                {fetchError && !isLoading && (
                    <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert">
                        <i className="fas fa-exclamation-triangle mr-2"></i> {fetchError}
                    </div>
                )}
                {/* Cabeçalho da página */}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    {/* Botões de ação */}
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button onClick={handleFilterToggle} className="btn btn-secondary btn-icon lg:hidden w-full sm:w-auto" data-name="mobile-filter-button">
                            <i className="fas fa-filter"></i> <span>Filtros</span>
                        </button>
                        {canUpload && ( // Mostra botão de upload apenas se permitido
                            <button onClick={() => setShowLogisticsUploader(prev => !prev)} className={`btn ${showLogisticsUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`} data-name="upload-logistics-button">
                                <i className={`fas ${showLogisticsUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showLogisticsUploader ? 'Fechar Upload' : 'Carregar'}</span>
                            </button>
                        )}
                        <button className="btn btn-secondary btn-icon w-full sm:w-auto" data-name="download-button" onClick={() => alert('Funcionalidade de exportar ainda não implementada.')}>
                            <i className="fas fa-download"></i> <span>Exportar</span>
                        </button>
                    </div>
                </div>

                {/* Componente de Upload (condicional) */}
                {showLogisticsUploader && canUpload && (
                    <div className="my-6">
                       <FileUploaderLogistics onFileUpload={handleLogisticsUploadSuccess} user={user} onClose={() => setShowLogisticsUploader(false)} />
                    </div>
                )}

                {/* Renderiza os filtros (mobile e desktop) */}
                {renderMobileFilters()}
                {renderDesktopFilters()}

                {/* Tabela de dados */}
                <DataTable
                    columns={[
                        { key: 'metric_date', title: 'Data', sortable: true, render: (value) => formatDate(value) },
                        { key: 'region', title: 'Região', sortable: true },
                        { key: 'state', title: 'Estado', sortable: true },
                        { key: 'value', title: 'Valor (ARs)', sortable: true, render: (value) => formatNumber(value) }
                    ]}
                    data={logisticsData} // Passa os dados reais
                    onRowClick={handleRowClick}
                    onSort={handleSort} // Passa handler de ordenação
                    currentSort={sortConfig} // Passa estado atual de ordenação
                />
                 {/* Mensagem de "nenhum dado" (apenas se não estiver carregando e não houver erro) */}
                 {!isLoading && !fetchError && logisticsData.length === 0 && (
                     <div className="text-center py-12 text-gray-500">
                         <i className="fas fa-box-open text-4xl mb-4"></i>
                         <p>Nenhum dado de logística encontrado para os filtros selecionados.</p>
                         {!canUpload && <p className="text-sm mt-1">Faça login para carregar relatórios.</p>}
                     </div>
                 )}
            </main>
        </div>
    );
}

export default Logistica; // Exporta o componente