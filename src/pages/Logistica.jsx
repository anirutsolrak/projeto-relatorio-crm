import React, { useState, useEffect, useMemo, useCallback } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import FilterPanel from '../components/FilterPanel';
import DataTable from '../components/DataTable';
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import LogisticsService from '../utils/logisticsService';
import getSupabaseClient from '../utils/supabaseClient';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';

const getPreviousPeriod = (startDateStr, endDateStr) => {
    try {
        const start = new Date(startDateStr + 'T00:00:00Z'); const end = new Date(endDateStr + 'T00:00:00Z');
        if (isNaN(start.getTime()) || isNaN(end.getTime())) { return { previousStartDate: null, previousEndDate: null }; }
        const diff = end.getTime() - start.getTime();
        if (diff < 0) return { previousStartDate: null, previousEndDate: null }; // Evita data inicial após final
        const prevEndDate = new Date(start.getTime() - 24 * 60 * 60 * 1000); // Dia anterior ao início atual
        const prevStartDate = new Date(prevEndDate.getTime() - diff); // Subtrai a duração
        return { previousStartDate: prevStartDate.toISOString().split('T')[0], previousEndDate: prevEndDate.toISOString().split('T')[0] };
    } catch (e) { return { previousStartDate: null, previousEndDate: null }; }
};

function Logistica({ onNavigate, user }) {
    const reportError = (error, context = 'LogisticaPage') => console.error(`[${context}] Error:`, error?.message || error);
    const logisticsService = useMemo(() => LogisticsService(), []);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false); const [filterOpen, setFilterOpen] = useState(false);
    const [showLogisticsUploader, setShowLogisticsUploader] = useState(false); const [isLoadingTable, setIsLoadingTable] = useState(true);
    const [tableFetchError, setTableFetchError] = useState(null); const [logisticsData, setLogisticsData] = useState([]);
    const [sortConfig, setSortConfig] = useState({ key: 'metric_date', direction: 'desc' });
    const [distinctFilterOptions, setDistinctFilterOptions] = useState({ regions: [], statesByRegion: {} });
    const [availableStates, setAvailableStates] = useState([]); const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [summaryError, setSummaryError] = useState(null);
    const [summaryData, setSummaryData] = useState({ current: null, previous: null });
    const [returnReasons, setReturnReasons] = useState([]); const [consolidatedTimeSeriesData, setConsolidatedTimeSeriesData] = useState([]);
    const [regionalSummary, setRegionalSummary] = useState([]); const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    const [filters, setFilters] = useState({ region: 'todos', state: 'todos', dataInicio: defaultStartDate, dataFim: defaultEndDate });

    const fetchDataForTable = useCallback(async (currentFilters, currentSortConfig) => {
        if (!logisticsService) { setIsLoadingTable(false); setTableFetchError("Erro interno: Serviço não inicializado."); return; }
        setIsLoadingTable(true); setTableFetchError(null);
        try {
            if (!currentFilters.dataInicio || !currentFilters.dataFim) throw new Error("Datas inválidas.");
            if (new Date(currentFilters.dataFim) < new Date(currentFilters.dataInicio)) throw new Error("Data final anterior à inicial.");
            const { data, error } = await logisticsService.getLogisticsData( currentFilters.dataInicio, currentFilters.dataFim, { region: currentFilters.region, state: currentFilters.state });
            if (error) throw error; const rawData = data || [];
            const sortedData = [...rawData].sort((a, b) => { const key = currentSortConfig.key; const direction = currentSortConfig.direction === 'asc' ? 1 : -1; const valA = a[key]; const valB = b[key]; if (valA === null || valA === undefined) return 1 * direction; if (valB === null || valB === undefined) return -1 * direction; if (key === 'value') { if (Number(valA) < Number(valB)) return -1 * direction; if (Number(valA) > Number(valB)) return 1 * direction; } else { if (valA < valB) return -1 * direction; if (valA > valB) return 1 * direction; } if (a.id && b.id) { if (a.id < b.id) return -1; if (a.id > b.id) return 1; } return 0; });
            setLogisticsData(sortedData);
        } catch (err) { reportError(err, 'fetchDataForTable'); setTableFetchError(`Falha ao carregar dados da tabela: ${err.message}`); setLogisticsData([]); }
        finally { setIsLoadingTable(false); }
     }, [logisticsService]);

     const fetchSummaryData = useCallback(async (startDate, endDate) => {
        console.log(`[fetchSummaryData - Logistica] Iniciando busca para período: ${startDate} a ${endDate}`);
        if (!logisticsService || !startDate || !endDate) { setIsLoadingSummary(false); setSummaryError("Erro interno ou datas inválidas."); return; }
        setIsLoadingSummary(true); setSummaryError(null);
        setSummaryData({ current: null, previous: null });
        setReturnReasons([]);
        setConsolidatedTimeSeriesData([]);
        setRegionalSummary([]);

        const { previousStartDate, previousEndDate } = getPreviousPeriod(startDate, endDate);
        console.log(`[fetchSummaryData - Logistica] Período anterior calculado: ${previousStartDate} a ${previousEndDate}`);

        try {
            let currentSummaryResult = { data: null, error: null };
            let previousSummaryResult = { data: null, error: null };
            let reasonsResult = { data: [], error: null };
            let timeSeriesResult = { data: [], error: null };
            let regionalResult = { data: [], error: null };

            currentSummaryResult = await logisticsService.getConsolidatedLogisticsSummary(startDate, endDate);
            console.log(`[fetchSummaryData - Logistica] Resultado Serviço Sumário Atual:`, currentSummaryResult);

            if (previousStartDate && previousEndDate) {
                previousSummaryResult = await logisticsService.getConsolidatedLogisticsSummary(previousStartDate, previousEndDate);
                console.log(`[fetchSummaryData - Logistica] Resultado Serviço Sumário Anterior:`, previousSummaryResult);
            } else {
                console.log(`[fetchSummaryData - Logistica] Não buscando sumário anterior (datas inválidas).`);
            }

            [reasonsResult, timeSeriesResult, regionalResult] = await Promise.all([
                 logisticsService.getReturnReasonsSummary(startDate, endDate),
                 logisticsService.getConsolidatedTimeSeries(startDate, endDate),
                 logisticsService.getRegionalSummary(startDate, endDate)
            ]);
            console.log(`[fetchSummaryData - Logistica] Resultados (Reasons, TimeSeries, Regional):`, { reasonsResult, timeSeriesResult, regionalResult });

             const errors = [];
             if (currentSummaryResult.error) errors.push(`Sumário Atual: ${currentSummaryResult.error.message || 'Erro desconhecido'}`);
             if (previousSummaryResult.error) console.warn(`[fetchSummaryData] Erro Sumário Anterior: ${previousSummaryResult.error.message || 'Erro desconhecido'}`);
             if (reasonsResult.error) errors.push(`Motivos Devolução: ${reasonsResult.error.message || 'Erro desconhecido'}`);
             if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);
             if (regionalResult.error) errors.push(`Regional: ${regionalResult.error.message || 'Erro desconhecido'}`);

             if (errors.length > 0) {
                 throw new Error(errors.join('; '));
             }

             const finalSummaryState = {
                 current: currentSummaryResult.data,
                 previous: previousSummaryResult.data
             };
             console.log(`[fetchSummaryData - Logistica] Definindo estado summaryData:`, JSON.stringify(finalSummaryState));
             setSummaryData(finalSummaryState);

             setReturnReasons(reasonsResult.data || []);
             setConsolidatedTimeSeriesData(timeSeriesResult.data || []);
             setRegionalSummary(regionalResult.data || []);

        } catch (err) {
            reportError(err, 'fetchSummaryData');
            setSummaryError(`Falha ao carregar resumos/gráficos: ${err.message}`);
            setSummaryData({ current: null, previous: null });
            setReturnReasons([]);
            setConsolidatedTimeSeriesData([]);
            setRegionalSummary([]);
        } finally {
            setIsLoadingSummary(false);
            console.log(`[fetchSummaryData - Logistica] Busca finalizada.`);
        }
    }, [logisticsService]);

    const fetchFilterOptions = useCallback(async () => {
        if (!logisticsService) return;
         try {
             const { data, error } = await logisticsService.getDistinctRegionsAndStates(); if (error) throw error;
             const options = data || { regions: [], statesByRegion: {} }; setDistinctFilterOptions(options);
             const initialRegion = filters.region; const statesByRegion = options.statesByRegion || {};
             const initialStates = initialRegion === 'todos' ? [...new Set(Object.values(statesByRegion).flat())].sort() : statesByRegion[initialRegion] || []; setAvailableStates(initialStates);
         } catch (err) { reportError(err, 'fetchFilterOptions'); setDistinctFilterOptions({ regions: [], statesByRegion: {} }); setAvailableStates([]); }
     }, [logisticsService, filters.region]);


    useEffect(() => { fetchFilterOptions().catch(err => reportError(err, "useEffectMount[fetchFilterOptions]")); }, [fetchFilterOptions]);
    useEffect(() => {
        console.log("[Logistica useEffect Update] Filtros ou Sort alterados. Buscando dados...", { filters, sortConfig });
        fetchDataForTable(filters, sortConfig).catch(err => reportError(err, "useEffectUpdate[fetchDataForTable]"));
        fetchSummaryData(filters.dataInicio, filters.dataFim).catch(err => reportError(err, "useEffectUpdate[fetchSummaryData]"));
     }, [filters, sortConfig, fetchDataForTable, fetchSummaryData]);
    useEffect(() => { if (distinctFilterOptions.regions.length > 0) { const currentStatesByRegion = distinctFilterOptions.statesByRegion || {}; const states = filters.region === 'todos' ? [...new Set(Object.values(currentStatesByRegion).flat())].sort() : currentStatesByRegion[filters.region] || []; setAvailableStates(states); } }, [filters.region, distinctFilterOptions]);
    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize); }, []);


    const handleFilterChange = (key, value) => { setFilters(prevFilters => { const newFilters = { ...prevFilters, [key]: value }; if (key === 'region') { newFilters.state = 'todos'; } if ((key === 'dataInicio' && value && newFilters.dataFim && new Date(value) > new Date(newFilters.dataFim)) || (key === 'dataFim' && value && newFilters.dataInicio && new Date(value) < new Date(newFilters.dataInicio))) { setTableFetchError("Data final anterior à inicial."); setSummaryError(null); return prevFilters; } else { setTableFetchError(null); } return newFilters; }); };
    const handleFilterToggle = () => setFilterOpen(prev => !prev);
    const handleSort = (key) => { setSortConfig(prev => ({ key, direction: (prev.key === key && prev.direction === 'asc') ? 'desc' : 'asc' })); };
    const handleRowClick = (row) => console.log('[Logistica] Row clicked:', row);
    const handleLogisticsUploadSuccess = async (processedData) => {
        setIsLoadingTable(true); setIsLoadingSummary(true); setTableFetchError(null); setSummaryError(null); setShowLogisticsUploader(false);
        const { consolidatedMetrics, logisticsMetrics } = processedData;
        const supabase = getSupabaseClient(); const uploadPromises = [];
        if (Array.isArray(consolidatedMetrics) && consolidatedMetrics.length > 0) { uploadPromises.push(supabase.from('logistics_consolidated_metrics').upsert(consolidatedMetrics, { onConflict: 'metric_date, category, sub_category' }).select()); }
        if (Array.isArray(logisticsMetrics) && logisticsMetrics.length > 0) { uploadPromises.push(supabase.from('logistics_daily_metrics').upsert(logisticsMetrics, { onConflict: 'metric_date, region, state' }).select()); }
        if (uploadPromises.length === 0) { setIsLoadingTable(false); setIsLoadingSummary(false); setTableFetchError("Nenhum dado válido encontrado para upload."); return; }
        try {
            const results = await Promise.all(uploadPromises);
            const errors = results.map((r, i) => r.error ? `Upsert ${i === 0 && consolidatedMetrics?.length > 0 ? 'Consolidado' : 'Estado/Região'}: ${r.error.message}` : null).filter(Boolean);
            if (errors.length > 0) throw new Error(errors.join('; '));
             console.log("[handleLogisticsUploadSuccess] Upload para Supabase concluído. Rebuscando dados...");
            await fetchDataForTable(filters, sortConfig);
            await fetchSummaryData(filters.dataInicio, filters.dataFim);
            await fetchFilterOptions();
        } catch(err) {
             reportError(err, 'handleLogisticsUploadSuccess-Catch');
             setTableFetchError(`Erro durante upload/refresh: ${err.message}`);
             setSummaryError(`Erro durante upload/refresh: ${err.message}`);
             setIsLoadingTable(false);
             setIsLoadingSummary(false);
         }
     };


    const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
    const formatNumber = (value, decimals = 0) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    const formatPercent = (value, decimals = 1) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return `${formatNumber(num, decimals)}%`; };

    const renderComparisonPercentage = useCallback((currentValue, previousValue) => {
        const current = Number(currentValue);
        const previous = Number(previousValue);

        if (isNaN(current) || previous === null || previous === undefined || isNaN(previous)) {
            return React.createElement('span', { className: "text-gray-500 text-xs" }, "-");
        }

        let percentageChange; let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%';

        if (previous === 0) {
            percentageChange = (current === 0) ? 0 : Infinity;
        } else {
            percentageChange = ((current - previous) / Math.abs(previous)) * 100;
        }
        if (percentageChange === Infinity) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = '(>1000%)'; }
        else if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; }
        else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; }
        return React.createElement('span', { className: `text-xs ${textClass} inline-flex items-center gap-1 whitespace-nowrap` }, React.createElement('i', { className: iconClass }), React.createElement('span', null, changeText), React.createElement('span', {className:"text-gray-400"}, "(vs ant.)"));
    }, []);


    const renderComparisonWithCurrentPercent = useCallback((currentValue, previousValue, currentTotal) => {
        const currentValNum = Number(currentValue);
        const currentTotalNum = Number(currentTotal);

        const percentageOfTotal = currentTotalNum > 0 && !isNaN(currentValNum) ? (currentValNum / currentTotalNum * 100) : 0;
        const popComparison = renderComparisonPercentage(currentValue, previousValue);

        return React.createElement('div', { className: 'flex flex-col sm:flex-row sm:items-center sm:gap-x-2' },
            React.createElement('span', { className: 'text-xs text-gray-600' }, `(${formatPercent(percentageOfTotal)})`),
            React.createElement('span', { className: 'text-xs text-gray-400 mx-1 hidden sm:inline' }, '|'),
            popComparison
        );
    }, [renderComparisonPercentage, formatPercent]);


    const consolidatedChartData = useMemo(() => { if (!consolidatedTimeSeriesData || consolidatedTimeSeriesData.length === 0) return { labels: [], datasets: [] }; const labels = [...new Set(consolidatedTimeSeriesData.map(d => d.metric_date))].sort(); const formattedLabels = labels.map(l => formatDate(l)); const categories = ['Entregue', 'Em Rota', 'DEVOLUÇÃO', 'Custodia']; const colors = { 'Entregue': '#10b981', 'Em Rota': '#3b82f6', 'DEVOLUÇÃO': '#ef4444', 'Custodia': '#f59e0b' }; const datasets = categories.map(cat => { const dataPoints = labels.map(label => { const point = consolidatedTimeSeriesData.find(d => d.metric_date === label && (d.sub_category === cat || (cat === 'DEVOLUÇÃO' && d.sub_category === 'DEVOLUÃ‡ÃƒO')) ); return point ? point.value : null; }); return { label: cat, data: dataPoints, borderColor: colors[cat], backgroundColor: `${colors[cat]}33`, tension: 0.1, yAxisID: 'y', fill: false, pointRadius: labels.length > 30 ? 1 : 3, pointHoverRadius: 5, spanGaps: true, }; }); return { labels: formattedLabels, datasets }; }, [consolidatedTimeSeriesData]);
    const returnReasonsChartData = useMemo(() => { if (!returnReasons || returnReasons.length === 0) return { labels: [], datasets: [] }; const topReasons = returnReasons.slice(0, isMobileView ? 5 : 10); return { labels: topReasons.map(r => r.reason), datasets: [{ label: 'Contagem', data: topReasons.map(r => r.count), backgroundColor: '#64748b' }] }; }, [returnReasons, isMobileView]);
    const regionalChartData = useMemo(() => { if (!regionalSummary || regionalSummary.length === 0) return { labels: [], datasets: [] }; const colors = ['#1e3a8a', '#1d4ed8', '#2563eb', '#3b82f6', '#60a5fa']; return { labels: regionalSummary.map(r => r.region), datasets: [{ label: 'Entregas', data: regionalSummary.map(r => r.total), backgroundColor: colors.slice(0, regionalSummary.length) }] }; }, [regionalSummary]);
    const lineChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { autoSkip: true, maxRotation: isMobileView ? 60 : 0 } }, y: { beginAtZero: true, title: { display: true, text: 'Quantidade' } } }, plugins: { legend: { position: 'bottom' } } }), [isMobileView]);
    const barChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, indexAxis: isMobileView ? 'y' : 'x', scales: { x: { beginAtZero: true }, y: { ticks: { autoSkip: false } } }, plugins: { legend: { display: false } } }), [isMobileView]);


    const renderFilters = () => ( <> {renderMobileFilters()} {renderDesktopFilters()} </> );
    const renderDesktopFilters = () => ( <div className="hidden lg:block mb-6"> <div className="bg-white p-4 rounded-lg shadow-sm"> <div className="grid grid-cols-1 md:grid-cols-4 gap-4"> <div> <label className="input-label" htmlFor="filter-region-desktop">Região</label> <select id="filter-region-desktop" value={filters.region} onChange={(e) => handleFilterChange('region', e.target.value)} className="input-field" data-name="region-filter-select" > <option value="todos">Todas</option> {(distinctFilterOptions.regions || []).map(r => <option key={r} value={r}>{r}</option>)} </select> </div> <div> <label className="input-label" htmlFor="filter-state-desktop">Estado</label> <select id="filter-state-desktop" value={filters.state} onChange={(e) => handleFilterChange('state', e.target.value)} className="input-field" data-name="state-filter-select" disabled={!availableStates || availableStates.length === 0} > <option value="todos">Todos</option> {(availableStates || []).map(s => <option key={s} value={s}>{s}</option>)} </select> </div> <div> <label className="input-label" htmlFor="filter-start-date-desktop">Data Início</label> <input id="filter-start-date-desktop" type="date" value={filters.dataInicio} onChange={(e) => handleFilterChange('dataInicio', e.target.value)} className="input-field" data-name="start-date-input" max={filters.dataFim || undefined}/> </div> <div> <label className="input-label" htmlFor="filter-end-date-desktop">Data Fim</label> <input id="filter-end-date-desktop" type="date" value={filters.dataFim} onChange={(e) => handleFilterChange('dataFim', e.target.value)} className="input-field" data-name="end-date-input" min={filters.dataInicio || undefined} /> </div> </div> </div> </div> );
    const renderMobileFilters = () => ( <div className={`lg:hidden mb-6 ${filterOpen ? 'block' : 'hidden'}`}> <FilterPanel filters={[ { id: 'region', label: 'Região', type: 'select', value: filters.region, options: [{ value: 'todos', label: 'Todas' }, ...(distinctFilterOptions.regions || []).map(r => ({ value: r, label: r }))] }, { id: 'state', label: 'Estado', type: 'select', value: filters.state, options: [{ value: 'todos', label: 'Todos' }, ...(availableStates || []).map(s => ({ value: s, label: s }))] , disabled: !availableStates || availableStates.length === 0 }, { id: 'dataInicio', label: 'Data Início', type: 'date', value: filters.dataInicio, max: filters.dataFim || undefined }, { id: 'dataFim', label: 'Data Fim', type: 'date', value: filters.dataFim, min: filters.dataInicio || undefined } ]} onFilterChange={handleFilterChange} isOpen={filterOpen} /> </div> );
    const renderNoDataMessage = (message) => ( <div className="text-center py-12 text-gray-500"> <i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p> </div> );
    const renderLoading = (message) => ( <div className="text-center py-12 text-gray-500"> <i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p> </div> );

    const canUpload = user && user.role !== 'guest';
    const currentSummary = summaryData?.current;
    const previousSummary = summaryData?.previous;
    const hasCurrentSummary = !!currentSummary && !isLoadingSummary && !summaryError;
    const totalGeralCurrent = hasCurrentSummary ? currentSummary.geral || 0 : 0;
    const totalGeralPrevious = previousSummary ? previousSummary.geral : null;

    console.log("[Logistica Render] State summaryData:", JSON.stringify(summaryData));
    console.log("[Logistica Render] currentSummary:", currentSummary);
    console.log("[Logistica Render] previousSummary:", previousSummary);
    console.log("[Logistica Render] hasCurrentSummary:", hasCurrentSummary);
    console.log("[Logistica Render] totalGeralCurrent:", totalGeralCurrent);
    console.log("[Logistica Render] totalGeralPrevious:", totalGeralPrevious);

    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoadingTable || isLoadingSummary} message="Carregando dados..." />
            <main className="p-4 lg:p-6">
                 {(tableFetchError || summaryError) && !isLoadingTable && !isLoadingSummary && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> {tableFetchError ? `Erro Tabela: ${tableFetchError}` : ''} {tableFetchError && summaryError ? '; ' : ''} {summaryError ? `Erro Resumo: ${summaryError}` : ''} </div> )}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button onClick={handleFilterToggle} className="btn btn-secondary btn-icon lg:hidden w-full sm:w-auto" data-name="mobile-filter-button"> <i className="fas fa-filter"></i> <span>Filtros</span> </button>
                        {canUpload && ( <button onClick={() => setShowLogisticsUploader(prev => !prev)} className={`btn ${showLogisticsUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`} data-name="upload-logistics-button"> <i className={`fas ${showLogisticsUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showLogisticsUploader ? 'Fechar Upload' : 'Carregar'}</span> </button> )}
                        <button className="btn btn-secondary btn-icon w-full sm:w-auto" data-name="download-button" onClick={() => alert('Exportar não implementado.')}> <i className="fas fa-download"></i> <span>Exportar</span> </button>
                    </div>
                </div>
                {showLogisticsUploader && canUpload && ( <div className="my-6"> <FileUploaderLogistics onFileUpload={handleLogisticsUploadSuccess} user={user} onClose={() => setShowLogisticsUploader(false)} /> </div> )}
                {renderFilters()}

                {isLoadingSummary && renderLoading("Carregando KPIs...")}
                {!isLoadingSummary && !summaryError && !currentSummary && renderNoDataMessage("Nenhum dado de sumário encontrado para o período.")}
                {hasCurrentSummary && (
                    <div className="kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-6">
                        <KPIPanel
                             title="Total Geral (Último Dia)"
                             value={totalGeralCurrent}
                             comparison={renderComparisonPercentage(totalGeralCurrent, totalGeralPrevious)}
                         />
                        <KPIPanel
                             title="Entregue (Último Dia)"
                             value={currentSummary.delivered}
                             comparison={renderComparisonWithCurrentPercent(currentSummary.delivered, previousSummary?.delivered, totalGeralCurrent)}
                         />
                        <KPIPanel
                             title="Devolvido (Último Dia)"
                             value={currentSummary.returned}
                             comparison={renderComparisonWithCurrentPercent(currentSummary.returned, previousSummary?.returned, totalGeralCurrent)}
                         />
                        <KPIPanel
                             title="Custódia (Último Dia)"
                             value={currentSummary.custody}
                             comparison={renderComparisonWithCurrentPercent(currentSummary.custody, previousSummary?.custody, totalGeralCurrent)}
                         />
                        <KPIPanel
                             title="Em Rota (Último Dia)"
                             value={currentSummary.inRoute}
                             comparison={renderComparisonWithCurrentPercent(currentSummary.inRoute, previousSummary?.inRoute, totalGeralCurrent)} // <-- AQUI A MUDANÇA
                         />
                    </div>
                )}

                 {!isLoadingSummary && !summaryError && (consolidatedTimeSeriesData.length > 0 || returnReasons.length > 0 || regionalSummary.length > 0) && ( <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6"> <div className="bg-white p-4 rounded-lg shadow-md h-[400px]"> <h3 className="text-base font-semibold text-gray-700 mb-4">Tendência Consolidada (Período)</h3> {consolidatedTimeSeriesData.length > 0 ? <ChartComponent type="line" data={consolidatedChartData} options={lineChartOptions} /> : renderNoDataMessage("Sem dados para gráfico de tendência.")} </div> <div className="bg-white p-4 rounded-lg shadow-md h-[400px]"> <h3 className="text-base font-semibold text-gray-700 mb-4">Principais Motivos de Devolução (Último Dia)</h3> {returnReasons.length > 0 ? <ChartComponent type="bar" data={returnReasonsChartData} options={barChartOptions} /> : renderNoDataMessage("Sem dados de motivos de devolução.")} </div> </div> )}

                {isLoadingTable && !logisticsData.length && renderLoading("Carregando tabela...")}
                {logisticsData.length > 0 && !isLoadingTable && ( <DataTable columns={[ { key: 'metric_date', title: 'Data', sortable: true, render: (value) => formatDate(value) }, { key: 'region', title: 'Região', sortable: true }, { key: 'state', title: 'Estado', sortable: true }, { key: 'value', title: 'Valor (ARs)', sortable: true, render: (value) => formatNumber(value) } ]} data={logisticsData} onRowClick={handleRowClick} onSort={handleSort} currentSort={sortConfig} /> )}
                {!isLoadingTable && !tableFetchError && !logisticsData.length && renderNoDataMessage("Nenhum dado na tabela para os filtros selecionados.")}

            </main>
        </div>
    );
}

export default Logistica;