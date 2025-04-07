import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter'; // Importa PeriodFilter
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import LogisticsService from '../utils/logisticsService';
import getSupabaseClient from '../utils/supabaseClient';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

// Componente Resumo Mobile Ajustado para mostrar todos os itens
function ChartMobileSummary({ title, data = [], onExpandClick, expandButtonText }) {
    const formatValue = (val) => (val === null || val === undefined || isNaN(Number(val)) ? '-' : Number(val).toLocaleString('pt-BR'));

    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between">
            <div>
                <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
                <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-2">
                    {data.map((item, index) => (
                         <div key={index} className="flex justify-between">
                            <TruncatedTextWithPopover className="text-gray-500 mr-2" title={item.label}>
                                {item.label}:
                            </TruncatedTextWithPopover>
                            <span className="font-medium flex-shrink-0">{formatValue(item.value)}</span>
                        </div>
                    ))}
                    {data.length === 0 && <p className='text-gray-400 text-xs italic'>Nenhum dado para resumir.</p>}
                </div>
            </div>
            {onExpandClick && (
                 <div className="mt-4 text-right">
                    <button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">
                        {expandButtonText || "Ver Detalhes"}
                    </button>
                </div>
            )}
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

    const [showLogisticsUploader, setShowLogisticsUploader] = useState(false);
    const [distinctFilterOptions, setDistinctFilterOptions] = useState({ regions: [] });
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [summaryError, setSummaryError] = useState(null);
    const [summaryData, setSummaryData] = useState({ current: null, previous: null });
    const [consolidatedPeriodSums, setConsolidatedPeriodSums] = useState(null);
    const [returnReasons, setReturnReasons] = useState([]);
    const [consolidatedTimeSeriesData, setConsolidatedTimeSeriesData] = useState([]);
    const [regionalStateTotals, setRegionalStateTotals] = useState({});
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isConsolidatedChartExpanded, setIsConsolidatedChartExpanded] = useState(false);
    const [isReasonsChartExpanded, setIsReasonsChartExpanded] = useState(false);
    const [expandedRegion, setExpandedRegion] = useState(null);

    const consolidatedChartScrollContainerRef = useRef(null);
    const reasonsChartScrollContainerRef = useRef(null);

    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    const [filters, setFilters] = useState({ dataInicio: defaultStartDate, dataFim: defaultEndDate }); // Removido filtro de região daqui

     const fetchAllLogisticData = useCallback(async (startDate, endDate) => { // Removido currentFilters
        console.log(`[fetchAllLogisticData] Iniciando busca para período: ${startDate} a ${endDate}`);
        if (!logisticsService || !startDate || !endDate) { setIsLoadingSummary(false); setSummaryError("Erro interno ou datas inválidas."); return; }
        setIsLoadingSummary(true); setSummaryError(null);
        setSummaryData({ current: null, previous: null });
        setConsolidatedPeriodSums(null);
        setReturnReasons([]);
        setConsolidatedTimeSeriesData([]);
        // setFilteredTotal(0); // Removido
        setRegionalStateTotals({});

        const { previousStartDate, previousEndDate } = getPreviousPeriod(startDate, endDate);
        console.log(`[fetchAllLogisticData] Período anterior calculado: ${previousStartDate} a ${previousEndDate}`);

        try {
            const [
                currentSummaryResult,
                previousSummaryResult,
                periodSumsResult,
                reasonsResult,
                timeSeriesResult,
                // filteredTotalResult, // Removido
                regionalStateResult
            ] = await Promise.all([
                logisticsService.getConsolidatedLogisticsSummary(startDate, endDate),
                (previousStartDate && previousEndDate)
                    ? logisticsService.getConsolidatedLogisticsSummary(previousStartDate, previousEndDate)
                    : Promise.resolve({ data: null, error: null }),
                logisticsService.getConsolidatedPeriodSums(startDate, endDate),
                logisticsService.getReturnReasonsSummary(startDate, endDate),
                logisticsService.getConsolidatedTimeSeries(startDate, endDate),
                // logisticsService.getFilteredTotals(startDate, endDate, filters), // Removido
                logisticsService.getRegionalStateTotals(startDate, endDate)
            ]);

            console.log(`[fetchAllLogisticData] Resultados:`, { currentSummaryResult, previousSummaryResult, periodSumsResult, reasonsResult, timeSeriesResult, regionalStateResult }); // Removido filteredTotalResult

             const errors = [];
             if (currentSummaryResult.error) errors.push(`Sumário Atual: ${currentSummaryResult.error.message || 'Erro desconhecido'}`);
             if (previousSummaryResult.error) console.warn(`[fetchAllLogisticData] Erro Sumário Anterior: ${previousSummaryResult.error.message || 'Erro desconhecido'}`);
             if (periodSumsResult.error) errors.push(`Somas Período: ${periodSumsResult.error.message || 'Erro desconhecido'}`);
             if (reasonsResult.error) errors.push(`Motivos Devolução: ${reasonsResult.error.message || 'Erro desconhecido'}`);
             if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);
             // if (filteredTotalResult.error) errors.push(`Total Filtrado: ${filteredTotalResult.error.message || 'Erro desconhecido'}`); // Removido
             if (regionalStateResult.error) errors.push(`Totais Regionais: ${regionalStateResult.error.message || 'Erro desconhecido'}`);

             if (errors.length > 0) {
                 throw new Error(errors.join('; '));
             }

             const finalSummaryState = { current: currentSummaryResult.data, previous: previousSummaryResult.data };
             console.log(`[fetchAllLogisticData] Definindo estado summaryData:`, JSON.stringify(finalSummaryState));
             setSummaryData(finalSummaryState);
             console.log(`[fetchAllLogisticData] Definindo estado consolidatedPeriodSums:`, periodSumsResult.data);
             setConsolidatedPeriodSums(periodSumsResult.data);
             setReturnReasons(reasonsResult.data || []);
             setConsolidatedTimeSeriesData(timeSeriesResult.data || []);
             // setFilteredTotal(filteredTotalResult.data?.totalSum || 0); // Removido
             setRegionalStateTotals(regionalStateResult.data || {});

        } catch (err) {
            reportError(err, 'fetchAllLogisticData');
            setSummaryError(`Falha ao carregar dados: ${err.message}`);
            setSummaryData({ current: null, previous: null });
            setConsolidatedPeriodSums(null);
            setReturnReasons([]);
            setConsolidatedTimeSeriesData([]);
            // setFilteredTotal(0); // Removido
            setRegionalStateTotals({});
        } finally {
            setIsLoadingSummary(false);
            console.log(`[fetchAllLogisticData] Busca finalizada.`);
        }
    }, [logisticsService]); // Depende apenas do service

    // Remover fetchFilterOptions
    // useEffect(() => { fetchFilterOptions().catch(err => reportError(err, "useEffectMount[fetchFilterOptions]")); }, [fetchFilterOptions]);

    useEffect(() => {
        console.log("[Logistica useEffect Update] Filtros de data alterados. Buscando todos os dados...", filters);
        fetchAllLogisticData(filters.dataInicio, filters.dataFim).catch(err => reportError(err, "useEffectUpdate[fetchAllLogisticData]"));
     }, [filters.dataInicio, filters.dataFim, fetchAllLogisticData]); // Depende apenas das datas e da função

    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => {
        const checkOverflow = (container) => container ? container.scrollWidth > container.clientWidth + 5 : false;
        const consContainer = consolidatedChartScrollContainerRef.current;
        const reasonsContainer = reasonsChartScrollContainerRef.current;
        const handleResize = () => { checkOverflow(consContainer); checkOverflow(reasonsContainer); }
        window.addEventListener('resize', handleResize); checkOverflow(consContainer); checkOverflow(reasonsContainer);
        return () => window.removeEventListener('resize', handleResize);
    }, [isConsolidatedChartExpanded, isReasonsChartExpanded, consolidatedTimeSeriesData, returnReasons]);

    // Callback para PeriodFilter
    const handlePeriodChange = useCallback((newPeriod) => {
        console.log("[handlePeriodChange] Novas datas recebidas:", newPeriod);
        if (!newPeriod.startDate || !newPeriod.endDate) {
            console.error("Período inválido recebido:", newPeriod);
            setSummaryError("Datas inválidas selecionadas.");
            return;
        }
        if (new Date(newPeriod.endDate) < new Date(newPeriod.startDate)) {
             console.warn("Data final anterior à inicial.");
             setSummaryError("Data final não pode ser anterior à data inicial.");
             return;
         }
        setSummaryError(null);
        setFilters({ dataInicio: newPeriod.startDate, dataFim: newPeriod.endDate }); // Atualiza apenas as datas
    }, []);

    // Remover handleFilterToggle
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
            await fetchAllLogisticData(filters.dataInicio, filters.dataFim); // Não passa mais filtros
            // await fetchFilterOptions(); // Remover
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
        if (isNaN(current)) return React.createElement('span', { className: "text-gray-500 text-xs" }, "-");
        if (previous === null || previous === undefined || isNaN(previous)) { return null; }
        let percentageChange; let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%';
        if (previous === 0) { percentageChange = (current === 0) ? 0 : Infinity; }
        else { percentageChange = ((current - previous) / Math.abs(previous)) * 100; }
        if (percentageChange === Infinity) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = 'Novo'; }
        else if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; }
        else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; }
        return React.createElement('span', { className: `text-xs ${textClass} inline-flex items-center gap-1 whitespace-nowrap` }, React.createElement('i', { className: iconClass }), React.createElement('span', null, changeText), React.createElement('span', {className:"text-gray-400"}, "(vs ant.)"));
    }, []);

    const renderCompleteComparison = useCallback((currentValue, previousValue, periodSumValue, currentTotal) => {
        const currentValNum = Number(currentValue);
        const currentTotalNum = Number(currentTotal);
        const percentageOfTotal = currentTotalNum > 0 && !isNaN(currentValNum) ? (currentValNum / currentTotalNum * 100) : 0;
        const popComparison = renderComparisonPercentage(currentValue, previousValue);
        const hasPeriodSum = periodSumValue !== null && periodSumValue !== undefined && !isNaN(Number(periodSumValue));
        const hasPercentage = !isNaN(percentageOfTotal);

        if (!popComparison && !hasPercentage) return null; // Não renderiza nada se não houver nem % nem PoP

        return React.createElement('div', { className: 'mt-1 flex flex-col' },
            !isMobileView && hasPeriodSum && React.createElement('span', { className: 'text-xs text-gray-500 mb-0.5' }, `(${formatNumber(periodSumValue)} período)`),
            React.createElement('div', { className: 'flex flex-wrap items-center gap-x-2' },
                 hasPercentage && React.createElement('span', { className: 'text-xs text-gray-600' }, `(${formatPercent(percentageOfTotal)})`),
                 hasPercentage && popComparison && React.createElement('span', { className: 'text-xs text-gray-400' }, '|'),
                 popComparison
            )
        );
    }, [isMobileView, renderComparisonPercentage, formatPercent, formatNumber]);

    // --- Dados e Opções dos Gráficos ---
    const consolidatedChartData = useMemo(() => {
        const originalData = consolidatedTimeSeriesData || [];
        if (originalData.length === 0) return { labels: [], datasets: [] };

        const allLabels = [...new Set(originalData.map(d => d.metric_date))].sort();
        const categories = ['Entregue', 'Em Rota', 'DEVOLUÇÃO', 'Custodia'];
        const colors = { 'Entregue': '#10b981', 'Em Rota': '#3b82f6', 'DEVOLUÇÃO': '#ef4444', 'Custodia': '#f59e0b' };

        // Determina quais labels e dados mostrar
        let labelsToShow = allLabels;
        if (!isMobileView && !isConsolidatedChartExpanded && allLabels.length > 3) {
            labelsToShow = allLabels.slice(-3); // Pega os últimos 3
        }
        const formattedLabelsToShow = labelsToShow.map(l => formatDate(l));

        const datasets = categories.map(cat => {
            const fullDataPoints = allLabels.map(label => {
                const point = originalData.find(d => d.metric_date === label && (d.sub_category === cat || (cat === 'DEVOLUÇÃO' && ['DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'].includes(d.sub_category))));
                return point ? point.value : null;
            });

            // Filtra os dataPoints para corresponder aos labelsToShow
            let dataPointsToShow = fullDataPoints;
            if (!isMobileView && !isConsolidatedChartExpanded && allLabels.length > 3) {
                 dataPointsToShow = fullDataPoints.slice(-3);
            }

            // Lógica de raio baseada na densidade ORIGINAL
            const pointRadius = allLabels.length > 30 ? (isConsolidatedChartExpanded ? 1 : 0) : 3;
            const pointHoverRadius = 5;

            return {
                 label: cat,
                 data: dataPointsToShow, // Usa os dados fatiados
                 borderColor: colors[cat],
                 backgroundColor: `${colors[cat]}33`,
                 tension: 0.1, yAxisID: 'y', fill: false,
                 pointRadius: pointRadius, // Raio baseado na densidade original
                 pointHoverRadius: pointHoverRadius,
                 spanGaps: true,
             };
        });
        return { labels: formattedLabelsToShow, datasets }; // Retorna labels e datasets fatiados
     }, [consolidatedTimeSeriesData, isConsolidatedChartExpanded, isMobileView]); // Adiciona isMobileView

    const returnReasonsChartData = useMemo(() => {
        if (!returnReasons || returnReasons.length === 0) return { labels: [], datasets: [] };
        const reasonColors = ['#3b82f6', '#ef4444', '#f97316', '#eab308', '#10b981', '#14b8a6', '#6366f1', '#a855f7', '#ec4899', '#64748b', '#f43f5e', '#84cc16'];
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
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: { x: { beginAtZero: true, ticks: { font: { size: 10 }}}, y: { ticks: { autoSkip: false, font: { size: 10 } } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.raw)}` } } }
     }), []);

    const calculateBarChartHeight = (itemCount) => Math.max(300, itemCount * 28 + 100);
    const reasonsChartHeight = isReasonsChartExpanded ? calculateBarChartHeight(returnReasons.length) : 400;
    // Ajuste na lógica de minWidth para gráfico de tendência
    const consolidatedChartMinWidth = (!isMobileView && !isConsolidatedChartExpanded) ? '100%' : `${Math.max(600, (consolidatedTimeSeriesData?.length || 0) * (isMobileView ? 35 : 50))}px`;


    const toggleConsolidatedChartExpansion = () => setIsConsolidatedChartExpanded(prev => !prev);
    const toggleReasonsChartExpansion = () => setIsReasonsChartExpanded(prev => !prev);
    const toggleRegionExpansion = (region) => setExpandedRegion(prev => prev === region ? null : region);

    // --- Renderização Auxiliar ---
    // Remover renderFilters
    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const currentSummary = summaryData?.current;
    const previousSummary = summaryData?.previous;
    const periodSums = consolidatedPeriodSums;
    const hasCurrentSummary = !!currentSummary && !isLoadingSummary && !summaryError;
    const totalGeralCurrent = hasCurrentSummary ? currentSummary.geral || 0 : 0;
    const totalGeralPrevious = previousSummary ? previousSummary.geral : null;

    // Remover filteredTotalTitle
    const trendMobileSummaryData = useMemo(() => {
        if (!periodSums) return [];
        return [
            { label: 'Entregue (Soma Per.)', value: periodSums.delivered },
            { label: 'Devolvido (Soma Per.)', value: periodSums.returned },
            { label: 'Em Rota (Soma Per.)', value: periodSums.inRoute },
            { label: 'Custódia (Soma Per.)', value: periodSums.custody },
        ].filter(item => item.value !== null && item.value !== undefined);
    }, [periodSums]);

    const reasonsMobileSummaryData = useMemo(() => {
         if (!returnReasons || returnReasons.length === 0) return [];
         return returnReasons.map(r => ({ label: r.reason, value: r.count }));
     }, [returnReasons]);

     const initialReasonsLimit = isMobileView ? 5 : 7;
     const showReasonsExpandButton = returnReasons.length > initialReasonsLimit; // Botão só aparece se houver mais itens que o limite inicial

    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoadingSummary} message="Carregando dados..." />
            <main className="p-4 lg:p-6">
                 {summaryError && !isLoadingSummary && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> {`Erro Resumo: ${summaryError}`} </div> )}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        {/* Botão de Filtro Mobile Removido */}
                        {canUpload && ( <button onClick={() => setShowLogisticsUploader(prev => !prev)} className={`btn ${showLogisticsUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`} data-name="upload-logistics-button"> <i className={`fas ${showLogisticsUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showLogisticsUploader ? 'Fechar Upload' : 'Carregar'}</span> </button> )}
                    </div>
                </div>
                {showLogisticsUploader && canUpload && ( <div className="my-6"> <FileUploaderLogistics onFileUpload={handleLogisticsUploadSuccess} user={user} onClose={() => setShowLogisticsUploader(false)} /> </div> )}
                 {/* Usando PeriodFilter diretamente */}
                 <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={{ startDate: filters.dataInicio, endDate: filters.dataFim }} />

                {/* --- KPIs Consolidados (Geral) --- */}
                {isLoadingSummary && renderLoading("Carregando KPIs...")}
                {!isLoadingSummary && !summaryError && !currentSummary && renderNoDataMessage("Nenhum dado de sumário encontrado para o período.")}
                {hasCurrentSummary && (
                    <div className="kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-6"> {/* Volta para 5 colunas */}
                        <KPIPanel title="Entregue (Geral - Últ. Dia)" value={formatNumber(currentSummary.delivered)} comparison={renderCompleteComparison(currentSummary.delivered, previousSummary?.delivered, periodSums?.delivered, totalGeralCurrent)}/>
                        <KPIPanel title="Devolvido (Geral - Últ. Dia)" value={formatNumber(currentSummary.returned)} comparison={renderCompleteComparison(currentSummary.returned, previousSummary?.returned, periodSums?.returned, totalGeralCurrent)}/>
                        <KPIPanel title="Custódia (Geral - Últ. Dia)" value={formatNumber(currentSummary.custody)} comparison={renderCompleteComparison(currentSummary.custody, previousSummary?.custody, periodSums?.custody, totalGeralCurrent)} />
                        <KPIPanel title="Em Rota (Geral - Últ. Dia)" value={formatNumber(currentSummary.inRoute)} comparison={renderCompleteComparison(currentSummary.inRoute, previousSummary?.inRoute, periodSums?.inRoute, totalGeralCurrent)} />
                        <KPIPanel title="Total Geral (Geral - Últ. Dia)" value={formatNumber(totalGeralCurrent)} comparison={renderComparisonPercentage(totalGeralCurrent, totalGeralPrevious)} />
                         {/* KPI Total Filtrado Removido */}
                    </div>
                )}

                 {/* --- Gráficos --- */}
                 {!isLoadingSummary && !summaryError && (consolidatedTimeSeriesData.length > 0 || returnReasons.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Gráfico de Tendência */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-base font-semibold text-gray-700">Tendência Consolidada (Geral)</h3>
                                {consolidatedTimeSeriesData.length > 0 && (
                                    <button onClick={toggleConsolidatedChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                        {isConsolidatedChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}
                                    </button>
                                )}
                            </div>
                             {(!isConsolidatedChartExpanded && isMobileView && consolidatedTimeSeriesData.length > 0) ? (
                                 <ChartMobileSummary
                                     title="Resumo Tendência (Soma Período)"
                                     data={trendMobileSummaryData}
                                     onExpandClick={toggleConsolidatedChartExpansion}
                                     expandButtonText="Ver Gráfico"
                                 />
                             ) : (
                                <div className="flex-grow relative h-[350px]">
                                     <div ref={consolidatedChartScrollContainerRef} className={`absolute inset-0 ${isConsolidatedChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`}>
                                          {/* Aplica minWidth dinâmico */}
                                          <div style={{ minWidth: consolidatedChartMinWidth, height: '100%' }} className="relative">
                                             {consolidatedTimeSeriesData.length > 0 ? <ChartComponent type="line" data={consolidatedChartData} options={lineChartOptions} /> : renderNoDataMessage("Sem dados para gráfico de tendência.")}
                                          </div>
                                      </div>
                                 </div>
                            )}
                        </div>

                        {/* Gráfico de Motivos */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-base font-semibold text-gray-700">Motivos de Devolução (Geral - Últ. Dia)</h3>
                                 {/* Condição ajustada para o botão */}
                                 {showReasonsExpandButton && (
                                     <button onClick={toggleReasonsChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                         {isReasonsChartExpanded ? (isMobileView ? 'Ver Resumo' : 'Ver Menos') : `Ver ${isMobileView ? 'Gráfico' : `Todos (${returnReasons.length})`}`}
                                     </button>
                                 )}
                             </div>
                              {(!isReasonsChartExpanded && isMobileView && returnReasons.length > 0) ? (
                                  <ChartMobileSummary
                                      title="Resumo Motivos Devolução (Últ. Dia)"
                                      data={reasonsMobileSummaryData}
                                      onExpandClick={toggleReasonsChartExpansion}
                                      expandButtonText="Ver Gráfico"
                                  />
                              ) : (
                                 <div className="flex-grow relative" style={{ height: `${reasonsChartHeight}px` }}>
                                      <div ref={reasonsChartScrollContainerRef} className={`absolute inset-0 ${isReasonsChartExpanded ? 'overflow-auto' : 'overflow-hidden'}`}>
                                            {/* Aplica height dinâmico */}
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

                 {/* --- KPIs Regionais/Estaduais --- */}
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
                                             aria-controls={`states-${region}`}
                                         >
                                             <h4 className="text-base font-semibold text-gray-700">{region}</h4>
                                             <div className='flex items-center'>
                                                <span className="text-lg font-bold mr-2">{formatNumber(regionData.total)}</span>
                                                <i className={`fas fa-chevron-down transition-transform duration-200 ${expandedRegion === region ? 'rotate-180' : ''}`}></i>
                                             </div>
                                         </div>
                                         <div
                                            id={`states-${region}`}
                                            className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedRegion === region ? 'max-h-60 mt-3 pt-3 border-t border-gray-200' : 'max-h-0'}`}
                                            style={{ maxHeight: expandedRegion === region ? '15rem' : '0' }}
                                         >
                                            <div className="space-y-1 pl-2 overflow-y-auto max-h-56">
                                                 {Object.entries(regionData.states)
                                                     .sort(([, a], [, b]) => b - a)
                                                     .map(([state, count]) => (
                                                         <div key={state} className="flex justify-between items-center text-sm pr-2">
                                                             <TruncatedTextWithPopover className="text-gray-600" title={state}>
                                                                 {state}
                                                             </TruncatedTextWithPopover>
                                                             <span className="font-medium flex-shrink-0 ml-2">{formatNumber(count)}</span>
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