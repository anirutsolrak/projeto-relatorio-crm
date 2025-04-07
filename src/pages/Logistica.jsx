import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import FilterPanel from '../components/FilterPanel';
// Não precisamos mais de DataTable
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import LogisticsService from '../utils/logisticsService';
import getSupabaseClient from '../utils/supabaseClient';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

// Componente de Resumo para mobile (mantido)
function ChartMobileSummary({ title, valueLabel, value, comparisonLabel, comparisonValue, onExpandClick, expandButtonText }) {
    const formatValue = (val) => (val === null || val === undefined || isNaN(Number(val)) ? '-' : Number(val).toLocaleString('pt-BR'));
    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between">
            <div>
                <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
                <div className="space-y-1 text-sm">
                    {valueLabel && value !== undefined && (<div className="flex justify-between"><span className="text-gray-500">{valueLabel}:</span><span className="font-medium">{formatValue(value)}</span></div>)}
                    {comparisonLabel && comparisonValue !== undefined && (<div className="flex justify-between"><span className="text-gray-500">{comparisonLabel}:</span><span className="font-medium">{formatValue(comparisonValue)}</span></div>)}
                </div>
            </div>
            <div className="mt-4 text-right"><button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">{expandButtonText || "Ver Gráfico"}</button></div>
        </div>
    );
}

const getPreviousPeriod = (startDateStr, endDateStr) => {
    try {
        const start = new Date(startDateStr + 'T00:00:00Z'); const end = new Date(endDateStr + 'T00:00:00Z');
        if (isNaN(start.getTime()) || isNaN(end.getTime())) { return { previousStartDate: null, previousEndDate: null }; }
        const diff = end.getTime() - start.getTime();
        if (diff < 0) return { previousStartDate: null, previousEndDate: null };
        const prevEndDate = new Date(start.getTime() - 24 * 60 * 60 * 1000);
        const prevStartDate = new Date(prevEndDate.getTime() - diff);
        return { previousStartDate: prevStartDate.toISOString().split('T')[0], previousEndDate: prevEndDate.toISOString().split('T')[0] };
    } catch (e) { return { previousStartDate: null, previousEndDate: null }; }
};

function Logistica({ onNavigate, user }) {
    const reportError = (error, context = 'LogisticaPage') => console.error(`[${context}] Error:`, error?.message || error);
    const logisticsService = useMemo(() => LogisticsService(), []);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [filterOpen, setFilterOpen] = useState(false);
    const [showLogisticsUploader, setShowLogisticsUploader] = useState(false);
    const [distinctFilterOptions, setDistinctFilterOptions] = useState({ regions: [] }); // Removido statesByRegion
    // const [availableStates, setAvailableStates] = useState([]); // Remover
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [summaryError, setSummaryError] = useState(null);
    const [summaryData, setSummaryData] = useState({ current: null, previous: null });
    const [returnReasons, setReturnReasons] = useState([]);
    const [consolidatedTimeSeriesData, setConsolidatedTimeSeriesData] = useState([]);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [regionalStateTotals, setRegionalStateTotals] = useState({});
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isConsolidatedChartExpanded, setIsConsolidatedChartExpanded] = useState(false);
    const [isReasonsChartExpanded, setIsReasonsChartExpanded] = useState(false);
    const [expandedRegion, setExpandedRegion] = useState(null);

    const consolidatedChartScrollContainerRef = useRef(null);
    const reasonsChartScrollContainerRef = useRef(null);

    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    // Removido filtro de estado inicial
    const [filters, setFilters] = useState({ region: 'todos', dataInicio: defaultStartDate, dataFim: defaultEndDate });

     // Função de busca principal - AGORA BUSCA TODOS OS DADOS NECESSÁRIOS
     const fetchAllLogisticData = useCallback(async (startDate, endDate, currentFilters) => {
        console.log(`[fetchAllLogisticData] Iniciando busca para período: ${startDate} a ${endDate} com filtros UI:`, currentFilters);
        if (!logisticsService || !startDate || !endDate) { setIsLoadingSummary(false); setSummaryError("Erro interno ou datas inválidas."); return; }
        setIsLoadingSummary(true); setSummaryError(null);
        // Limpa todos os estados de dados
        setSummaryData({ current: null, previous: null });
        setReturnReasons([]);
        setConsolidatedTimeSeriesData([]);
        setFilteredTotal(0);
        setRegionalStateTotals({});

        const { previousStartDate, previousEndDate } = getPreviousPeriod(startDate, endDate);
        console.log(`[fetchAllLogisticData] Período anterior calculado: ${previousStartDate} a ${previousEndDate}`);

        try {
            // Executa todas as buscas em paralelo
            const [
                currentSummaryResult,
                previousSummaryResult, // Será { data: null, error: null } se datas inválidas
                reasonsResult,
                timeSeriesResult,
                filteredTotalResult,
                regionalStateResult
            ] = await Promise.all([
                logisticsService.getConsolidatedLogisticsSummary(startDate, endDate), // Ignora filtros UI reg/est
                (previousStartDate && previousEndDate)
                    ? logisticsService.getConsolidatedLogisticsSummary(previousStartDate, previousEndDate) // Ignora filtros UI reg/est
                    : Promise.resolve({ data: null, error: null }),
                logisticsService.getReturnReasonsSummary(startDate, endDate), // Ignora filtros UI reg/est
                logisticsService.getConsolidatedTimeSeries(startDate, endDate), // Ignora filtros UI reg/est
                logisticsService.getFilteredTotals(startDate, endDate, currentFilters), // *** USA filtros UI reg ***
                logisticsService.getRegionalStateTotals(startDate, endDate) // Ignora filtros UI reg/est
            ]);

            console.log(`[fetchAllLogisticData] Resultados:`, { currentSummaryResult, previousSummaryResult, reasonsResult, timeSeriesResult, filteredTotalResult, regionalStateResult });

            // Coleta erros
             const errors = [];
             if (currentSummaryResult.error) errors.push(`Sumário Atual: ${currentSummaryResult.error.message || 'Erro desconhecido'}`);
             if (previousSummaryResult.error) console.warn(`[fetchAllLogisticData] Erro Sumário Anterior: ${previousSummaryResult.error.message || 'Erro desconhecido'}`);
             if (reasonsResult.error) errors.push(`Motivos Devolução: ${reasonsResult.error.message || 'Erro desconhecido'}`);
             if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);
             if (filteredTotalResult.error) errors.push(`Total Filtrado: ${filteredTotalResult.error.message || 'Erro desconhecido'}`);
             if (regionalStateResult.error) errors.push(`Totais Regionais/Estaduais: ${regionalStateResult.error.message || 'Erro desconhecido'}`);

             if (errors.length > 0) {
                 throw new Error(errors.join('; '));
             }

             // Define os estados
             const finalSummaryState = {
                 current: currentSummaryResult.data,
                 previous: previousSummaryResult.data
             };
             console.log(`[fetchAllLogisticData] Definindo estado summaryData:`, JSON.stringify(finalSummaryState));
             setSummaryData(finalSummaryState);
             setReturnReasons(reasonsResult.data || []);
             setConsolidatedTimeSeriesData(timeSeriesResult.data || []);
             setFilteredTotal(filteredTotalResult.data?.totalSum || 0);
             setRegionalStateTotals(regionalStateResult.data || {});

        } catch (err) {
            reportError(err, 'fetchAllLogisticData');
            setSummaryError(`Falha ao carregar dados: ${err.message}`);
            // Limpa todos os estados em caso de erro
            setSummaryData({ current: null, previous: null });
            setReturnReasons([]);
            setConsolidatedTimeSeriesData([]);
            setFilteredTotal(0);
            setRegionalStateTotals({});
        } finally {
            setIsLoadingSummary(false);
            console.log(`[fetchAllLogisticData] Busca finalizada.`);
        }
    }, [logisticsService]); // Apenas service como dependencia, filtros são passados

    // Busca opções de filtro (apenas regiões agora)
    const fetchFilterOptions = useCallback(async () => {
        if (!logisticsService) return;
         try {
             const { data, error } = await logisticsService.getDistinctRegionsAndStates(); if (error) throw error;
             // Ajustado para usar apenas regions
             setDistinctFilterOptions({ regions: data?.regions || [] });
         } catch (err) { reportError(err, 'fetchFilterOptions'); setDistinctFilterOptions({ regions: [] }); }
     }, [logisticsService]);

    // Efeitos
    useEffect(() => { fetchFilterOptions().catch(err => reportError(err, "useEffectMount[fetchFilterOptions]")); }, [fetchFilterOptions]);
    useEffect(() => {
        console.log("[Logistica useEffect Update] Filtros alterados. Buscando todos os dados...", { filters });
        fetchAllLogisticData(filters.dataInicio, filters.dataFim, filters).catch(err => reportError(err, "useEffectUpdate[fetchAllLogisticData]"));
     }, [filters, fetchAllLogisticData]); // Depende de filters e da função principal de busca
    // Remover useEffect que atualizava availableStates
    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => {
        const checkOverflow = (container) => {
            if(container) {
                const tolerance = 5;
                return container.scrollWidth > container.clientWidth + tolerance;
            } return false;
        }
        const consContainer = consolidatedChartScrollContainerRef.current;
        const reasonsContainer = reasonsChartScrollContainerRef.current;
        const handleResize = () => {
            checkOverflow(consContainer); // Re-checar no resize
            checkOverflow(reasonsContainer);
        }
        window.addEventListener('resize', handleResize);
        // Checa inicialmente também
        checkOverflow(consContainer);
        checkOverflow(reasonsContainer);
        return () => window.removeEventListener('resize', handleResize);
    }, [isConsolidatedChartExpanded, isReasonsChartExpanded, consolidatedTimeSeriesData, returnReasons]);


    // Handlers
    const handleFilterChange = (key, value) => {
        setFilters(prevFilters => {
            const newFilters = { ...prevFilters, [key]: value };
            // Não precisa mais resetar ou atualizar 'state'
            // Validação de datas
            if ((key === 'dataInicio' && value && newFilters.dataFim && new Date(value) > new Date(newFilters.dataFim)) ||
                (key === 'dataFim' && value && newFilters.dataInicio && new Date(value) < new Date(newFilters.dataInicio)))
            {
                console.warn("Data final anterior à inicial.");
                setSummaryError("Data final não pode ser anterior à data inicial.");
                return prevFilters;
            } else {
                setSummaryError(null);
            }
            return newFilters;
        });
    };
    const handleFilterToggle = () => setFilterOpen(prev => !prev);
    const handleLogisticsUploadSuccess = async (processedData) => {
        setIsLoadingSummary(true); setSummaryError(null); setShowLogisticsUploader(false);
        const { consolidatedMetrics, logisticsMetrics } = processedData;
        const supabase = getSupabaseClient(); const uploadPromises = [];
        if (Array.isArray(consolidatedMetrics) && consolidatedMetrics.length > 0) { uploadPromises.push(supabase.from('logistics_consolidated_metrics').upsert(consolidatedMetrics, { onConflict: 'metric_date, category, sub_category' }).select()); }
        if (Array.isArray(logisticsMetrics) && logisticsMetrics.length > 0) { uploadPromises.push(supabase.from('logistics_daily_metrics').upsert(logisticsMetrics, { onConflict: 'metric_date, region, state' }).select()); }
        if (uploadPromises.length === 0) { setIsLoadingSummary(false); setSummaryError("Nenhum dado válido encontrado para upload."); return; }
        try {
            const results = await Promise.all(uploadPromises);
            const errors = results.map((r, i) => r.error ? `Upsert ${i === 0 && consolidatedMetrics?.length > 0 ? 'Consolidado' : 'Estado/Região'}: ${r.error.message}` : null).filter(Boolean);
            if (errors.length > 0) throw new Error(errors.join('; '));
             console.log("[handleLogisticsUploadSuccess] Upload para Supabase concluído. Rebuscando dados...");
            await fetchAllLogisticData(filters.dataInicio, filters.dataFim, filters); // Passa filtros
            await fetchFilterOptions();
        } catch(err) {
             reportError(err, 'handleLogisticsUploadSuccess-Catch');
             setSummaryError(`Erro durante upload/refresh: ${err.message}`);
             setIsLoadingSummary(false);
         }
     };


    const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
    const formatNumber = (value, decimals = 0) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    const formatPercent = (value, decimals = 1) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return `${formatNumber(num, decimals)}%`; };

    const renderComparisonPercentage = useCallback((currentValue, previousValue) => {
        const current = Number(currentValue);
        const previous = Number(previousValue);
        if (isNaN(current) || previous === null || previous === undefined || isNaN(previous)) return React.createElement('span', { className: "text-gray-500 text-xs" }, "-");
        let percentageChange; let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%';
        if (previous === 0) { percentageChange = (current === 0) ? 0 : Infinity; }
        else { percentageChange = ((current - previous) / Math.abs(previous)) * 100; }
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

    // --- Dados e Opções dos Gráficos (com ajustes para scroll e cores) ---
    const consolidatedChartData = useMemo(() => { if (!consolidatedTimeSeriesData || consolidatedTimeSeriesData.length === 0) return { labels: [], datasets: [] }; const labels = [...new Set(consolidatedTimeSeriesData.map(d => d.metric_date))].sort(); const formattedLabels = labels.map(l => formatDate(l)); const categories = ['Entregue', 'Em Rota', 'DEVOLUÇÃO', 'Custodia']; const colors = { 'Entregue': '#10b981', 'Em Rota': '#3b82f6', 'DEVOLUÇÃO': '#ef4444', 'Custodia': '#f59e0b' }; const datasets = categories.map(cat => { const dataPoints = labels.map(label => { const point = consolidatedTimeSeriesData.find(d => d.metric_date === label && (d.sub_category === cat || (cat === 'DEVOLUÇÃO' && ['DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'].includes(d.sub_category))) ); return point ? point.value : null; }); return { label: cat, data: dataPoints, borderColor: colors[cat], backgroundColor: `${colors[cat]}33`, tension: 0.1, yAxisID: 'y', fill: false, pointRadius: labels.length > 30 ? (isConsolidatedChartExpanded ? 1: 0) : 3, pointHoverRadius: 5, spanGaps: true, }; }); return { labels: formattedLabels, datasets }; }, [consolidatedTimeSeriesData, isConsolidatedChartExpanded]);

    const returnReasonsChartData = useMemo(() => {
        if (!returnReasons || returnReasons.length === 0) return { labels: [], datasets: [] };
        const reasonColors = ['#64748b', '#718096', '#a0aec0', '#cbd5e0', '#e2e8f0', '#f7fafc', '#4a5568', '#2d3748', '#94a3b8', '#e2e8f0'];
        const dataToShow = isReasonsChartExpanded ? returnReasons : returnReasons.slice(0, isMobileView ? 5 : 7);
        return {
             labels: dataToShow.map(r => r.reason),
             datasets: [{
                 label: 'Contagem',
                 data: dataToShow.map(r => r.count),
                 backgroundColor: dataToShow.map((_, index) => reasonColors[index % reasonColors.length])
             }]
         };
     }, [returnReasons, isMobileView, isReasonsChartExpanded]);

    const lineChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { autoSkip: !isConsolidatedChartExpanded, maxRotation: (isMobileView || isConsolidatedChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } }, y: { beginAtZero: true, title: { display: true, text: 'Quantidade', font: { size: 11 } }, ticks: { font: { size: 10 }} } }, plugins: { legend: { position: 'bottom', labels: { font: {size: 11}, usePointStyle: true, pointStyleWidth: 8 } } } }), [isMobileView, isConsolidatedChartExpanded]);

    const barChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, indexAxis: isMobileView ? 'y' : 'x',
        scales: {
            x: { beginAtZero: true, ticks: { font: { size: 10 }}},
            y: { ticks: { autoSkip: false, font: { size: 10 } } } // Removido callback por enquanto, TruncatedText cuidará disso
        },
        plugins: {
             legend: { display: false },
             tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}` } }
         } }),
     [isMobileView]); // Removido isReasonsChartExpanded como dependencia

    const calculateBarChartHeight = (itemCount) => Math.max(300, itemCount * (isMobileView ? 30 : 25) + 100);
    const reasonsChartHeight = isReasonsChartExpanded ? calculateBarChartHeight(returnReasons.length) : (isMobileView ? 300 : 400);
    const consolidatedChartMinWidth = isConsolidatedChartExpanded ? `${Math.max(600, (consolidatedChartData?.labels?.length || 0) * (isMobileView ? 35 : 50))}px` : '100%'; // Usa consolidatedChartData.labels


    const toggleConsolidatedChartExpansion = () => setIsConsolidatedChartExpanded(prev => !prev);
    const toggleReasonsChartExpansion = () => setIsReasonsChartExpanded(prev => !prev);
    const toggleRegionExpansion = (region) => setExpandedRegion(prev => prev === region ? null : region);


    const renderFilters = () => ( <> {renderMobileFilters()} {renderDesktopFilters()} </> );
    const renderDesktopFilters = () => ( <div className="hidden lg:block mb-6"> <div className="bg-white p-4 rounded-lg shadow-sm"> <div className="grid grid-cols-1 md:grid-cols-3 gap-4"> {/* Ajustado para 3 colunas */} <div> <label className="input-label" htmlFor="filter-region-desktop">Região</label> <select id="filter-region-desktop" value={filters.region} onChange={(e) => handleFilterChange('region', e.target.value)} className="input-field" data-name="region-filter-select" > <option value="todos">Todas</option> {(distinctFilterOptions.regions || []).map(r => <option key={r} value={r}>{r}</option>)} </select> </div> {/* Filtro de Estado Removido */} <div> <label className="input-label" htmlFor="filter-start-date-desktop">Data Início</label> <input id="filter-start-date-desktop" type="date" value={filters.dataInicio} onChange={(e) => handleFilterChange('dataInicio', e.target.value)} className="input-field" data-name="start-date-input" max={filters.dataFim || undefined}/> </div> <div> <label className="input-label" htmlFor="filter-end-date-desktop">Data Fim</label> <input id="filter-end-date-desktop" type="date" value={filters.dataFim} onChange={(e) => handleFilterChange('dataFim', e.target.value)} className="input-field" data-name="end-date-input" min={filters.dataInicio || undefined} /> </div> </div> </div> </div> );
    const renderMobileFilters = () => ( <div className={`lg:hidden mb-6 ${filterOpen ? 'block' : 'hidden'}`}> <FilterPanel filters={[ { id: 'region', label: 'Região', type: 'select', value: filters.region, options: [{ value: 'todos', label: 'Todas' }, ...(distinctFilterOptions.regions || []).map(r => ({ value: r, label: r }))] }, /* Filtro de Estado Removido */ { id: 'dataInicio', label: 'Data Início', type: 'date', value: filters.dataInicio, max: filters.dataFim || undefined }, { id: 'dataFim', label: 'Data Fim', type: 'date', value: filters.dataFim, min: filters.dataInicio || undefined } ]} onFilterChange={handleFilterChange} isOpen={filterOpen} /> </div> );
    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const currentSummary = summaryData?.current;
    const previousSummary = summaryData?.previous;
    const hasCurrentSummary = !!currentSummary && !isLoadingSummary && !summaryError;
    const totalGeralCurrent = hasCurrentSummary ? currentSummary.geral || 0 : 0;
    const totalGeralPrevious = previousSummary ? previousSummary.geral : null;

    let filteredTotalTitle = "Total ARs (Filtro Região)"; // Título base
    if (filters.region !== 'todos') filteredTotalTitle = `Total ${filters.region}`;


    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoadingSummary} message="Carregando dados..." />
            <main className="p-4 lg:p-6">
                 {summaryError && !isLoadingSummary && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> {`Erro Resumo: ${summaryError}`} </div> )}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        <button onClick={handleFilterToggle} className="btn btn-secondary btn-icon lg:hidden w-full sm:w-auto" data-name="mobile-filter-button"> <i className="fas fa-filter"></i> <span>Filtros</span> </button>
                        {canUpload && ( <button onClick={() => setShowLogisticsUploader(prev => !prev)} className={`btn ${showLogisticsUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`} data-name="upload-logistics-button"> <i className={`fas ${showLogisticsUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showLogisticsUploader ? 'Fechar Upload' : 'Carregar'}</span> </button> )}
                    </div>
                </div>
                {showLogisticsUploader && canUpload && ( <div className="my-6"> <FileUploaderLogistics onFileUpload={handleLogisticsUploadSuccess} user={user} onClose={() => setShowLogisticsUploader(false)} /> </div> )}
                {renderFilters()}

                {/* --- KPIs Consolidados (Geral) e Total Filtrado por Região --- */}
                {isLoadingSummary && renderLoading("Carregando KPIs...")}
                {!isLoadingSummary && !summaryError && !currentSummary && renderNoDataMessage("Nenhum dado de sumário encontrado para o período.")}
                {hasCurrentSummary && (
                    <div className="kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 my-6">
                        <KPIPanel title="Entregue (Geral - Últ. Dia)" value={currentSummary.delivered} comparison={renderComparisonWithCurrentPercent(currentSummary.delivered, previousSummary?.delivered, totalGeralCurrent)}/>
                        <KPIPanel title="Devolvido (Geral - Últ. Dia)" value={currentSummary.returned} comparison={renderComparisonWithCurrentPercent(currentSummary.returned, previousSummary?.returned, totalGeralCurrent)}/>
                        <KPIPanel title="Custódia (Geral - Últ. Dia)" value={currentSummary.custody} comparison={renderComparisonWithCurrentPercent(currentSummary.custody, previousSummary?.custody, totalGeralCurrent)} />
                        <KPIPanel title="Em Rota (Geral - Últ. Dia)" value={currentSummary.inRoute} comparison={renderComparisonWithCurrentPercent(currentSummary.inRoute, previousSummary?.inRoute, totalGeralCurrent)} />
                        <KPIPanel title="Total Geral (Geral - Últ. Dia)" value={totalGeralCurrent} comparison={renderComparisonPercentage(totalGeralCurrent, totalGeralPrevious)} />
                        <KPIPanel title={filteredTotalTitle} value={filteredTotal} />
                    </div>
                )}

                 {/* --- Gráficos (Consolidados - Ignoram filtro de região UI) --- */}
                 {!isLoadingSummary && !summaryError && (consolidatedTimeSeriesData.length > 0 || returnReasons.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Gráfico de Tendência */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-base font-semibold text-gray-700">Tendência Consolidada (Geral)</h3>
                                {isMobileView && consolidatedTimeSeriesData.length > 0 && (
                                    <button onClick={toggleConsolidatedChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                        {isConsolidatedChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}
                                    </button>
                                )}
                            </div>
                             {(isMobileView && !isConsolidatedChartExpanded && hasCurrentSummary) ? (
                                 <ChartMobileSummary
                                     title="Resumo Tendência (Geral)"
                                     valueLabel="Total Geral (Últ. Dia)"
                                     value={totalGeralCurrent}
                                     onExpandClick={toggleConsolidatedChartExpansion}
                                     expandButtonText="Ver Gráfico"
                                 />
                             ) : (
                                <div className="flex-grow relative h-[350px]">
                                     <div ref={consolidatedChartScrollContainerRef} className={`absolute inset-0 ${isConsolidatedChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
                                          <div style={{ minWidth: consolidatedChartMinWidth, height: '100%' }} className="relative">
                                             {consolidatedTimeSeriesData.length > 0 ? <ChartComponent type="line" data={consolidatedChartData} options={lineChartOptions} /> : renderNoDataMessage("Sem dados para gráfico de tendência.")}
                                          </div>
                                      </div>
                                 </div>
                            )}
                        </div>

                        {/* Gráfico de Motivos */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-base font-semibold text-gray-700">Motivos de Devolução (Geral - Últ. Dia)</h3>
                                 {returnReasons.length > (isMobileView ? 5 : 7) && (
                                     <button onClick={toggleReasonsChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                         {isReasonsChartExpanded ? 'Ver Menos' : `Ver Top ${returnReasons.length}`}
                                     </button>
                                 )}
                             </div>
                              {(isMobileView && !isReasonsChartExpanded && returnReasons.length > 0) ? (
                                  <ChartMobileSummary
                                      title="Resumo Motivos Devolução (Geral)"
                                      valueLabel={returnReasons[0]?.reason}
                                      value={returnReasons[0]?.count}
                                      comparisonLabel={returnReasons[1]?.reason}
                                      comparisonValue={returnReasons[1]?.count}
                                      onExpandClick={toggleReasonsChartExpansion}
                                      expandButtonText="Ver Gráfico"
                                  />
                              ) : (
                                 <div className="flex-grow relative" style={{ height: `${reasonsChartHeight}px` }}>
                                      <div ref={reasonsChartScrollContainerRef} className={`absolute inset-0 ${isReasonsChartExpanded ? 'overflow-auto' : 'overflow-hidden'}`}>
                                          <div style={{ height: isReasonsChartExpanded ? `${calculateBarChartHeight(returnReasonsChartData.labels.length)}px` : '100%', width:'100%' }}>
                                              {returnReasons.length > 0 ? (
                                                  <ChartComponent type="bar" data={returnReasonsChartData} options={barChartOptions} />
                                              ) : renderNoDataMessage("Sem dados de motivos de devolução.")}
                                          </div>
                                      </div>
                                 </div>
                             )}
                        </div>
                    </div>
                 )}

                 {/* --- KPIs Regionais/Estaduais (Período Selecionado - IGNORA filtro de região UI) --- */}
                 {!isLoadingSummary && !summaryError && Object.keys(regionalStateTotals).length > 0 && (
                     <div className="mb-6">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Totais por Região (Período Selecionado)</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                             {Object.entries(regionalStateTotals)
                                 .sort(([, a], [, b]) => b.total - a.total)
                                 .map(([region, regionData]) => (
                                     <div key={region} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                                         <div
                                             className="flex justify-between items-center cursor-pointer mb-2"
                                             onClick={() => toggleRegionExpansion(region)}
                                             onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleRegionExpansion(region); }}
                                             role="button"
                                             tabIndex={0}
                                             aria-expanded={expandedRegion === region}
                                             aria-controls={`states-${region}`} // Accessibility
                                         >
                                             <h4 className="text-base font-semibold text-gray-700">{region}</h4>
                                             <div className='flex items-center'>
                                                <span className="text-lg font-bold mr-2">{formatNumber(regionData.total)}</span>
                                                <i className={`fas fa-chevron-down transition-transform duration-200 ${expandedRegion === region ? 'rotate-180' : ''}`}></i>
                                             </div>
                                         </div>
                                         {/* Detalhes dos estados */}
                                         <div
                                            id={`states-${region}`}
                                            className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedRegion === region ? 'max-h-60 mt-3 pt-3 border-t border-gray-200' : 'max-h-0'}`}
                                            style={{ maxHeight: expandedRegion === region ? '15rem' : '0' }} // Tailwind JIT might need explicit max-height
                                         >
                                            <div className="space-y-1 pl-2 overflow-y-auto max-h-56"> {/* Max height for scroll */}
                                                 {Object.entries(regionData.states)
                                                     .sort(([, a], [, b]) => b - a)
                                                     .map(([state, count]) => (
                                                         <div key={state} className="flex justify-between items-center text-sm pr-2">
                                                             <span className="text-gray-600">{state}</span>
                                                             <span className="font-medium">{formatNumber(count)}</span>
                                                         </div>
                                                 ))}
                                                 {Object.keys(regionData.states).length === 0 && <p className="text-sm text-gray-500 italic">Nenhum estado encontrado.</p>}
                                             </div>
                                         </div>
                                     </div>
                             ))}
                         </div>
                     </div>
                 )}
                 {!isLoadingSummary && !summaryError && Object.keys(regionalStateTotals).length === 0 && (
                    <div className="mb-6">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Totais por Região</h3>
                         {renderNoDataMessage("Nenhum dado regional encontrado para o período.")}
                    </div>
                 )}

            </main>
        </div>
    );
}

export default Logistica;