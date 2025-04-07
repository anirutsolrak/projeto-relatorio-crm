import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import LogisticsService from '../utils/logisticsService';
import getSupabaseClient from '../utils/supabaseClient';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

// Componente Resumo Mobile
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

// Função getPreviousPeriod mantida
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
    const [isLoadingSummary, setIsLoadingSummary] = useState(true);
    const [summaryError, setSummaryError] = useState(null);
    const [kpiData, setKpiData] = useState({ current: null, previous: null });
    const [reasonDailyTotals, setReasonDailyTotals] = useState([]);
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
    const [filters, setFilters] = useState({ dataInicio: defaultStartDate, dataFim: defaultEndDate });

     const fetchAllLogisticData = useCallback(async (startDate, endDate) => {
        console.log(`[fetchAllLogisticData] Iniciando busca para período: ${startDate} a ${endDate}`);
        if (!logisticsService || !startDate || !endDate) { setIsLoadingSummary(false); setSummaryError("Erro interno ou datas inválidas."); return; }
        setIsLoadingSummary(true); setSummaryError(null);
        setKpiData({ current: null, previous: null });
        setReasonDailyTotals([]);
        setConsolidatedTimeSeriesData([]);
        setRegionalStateTotals({});

        const { previousStartDate, previousEndDate } = getPreviousPeriod(startDate, endDate);
        console.log(`[fetchAllLogisticData] Período anterior calculado: ${previousStartDate} a ${previousEndDate}`);

        try {
            const [
                currentKpiResult,
                previousKpiResult,
                reasonsResult,
                timeSeriesResult,
                regionalStateResult
            ] = await Promise.all([
                logisticsService.getLogisticsKPIs(startDate, endDate),
                (previousStartDate && previousEndDate)
                    ? logisticsService.getLogisticsKPIs(previousStartDate, previousEndDate)
                    : Promise.resolve({ data: null, error: null }),
                logisticsService.getReasonDailyTotals(startDate, endDate),
                logisticsService.getConsolidatedTimeSeries(startDate, endDate),
                logisticsService.getRegionalStateTotalsPeriod(startDate, endDate)
            ]);

            console.log(`[fetchAllLogisticData] Resultados:`, { currentKpiResult, previousKpiResult, reasonsResult, timeSeriesResult, regionalStateResult });

             const errors = [];
             if (currentKpiResult.error) errors.push(`KPIs Atuais: ${currentKpiResult.error.message || 'Erro desconhecido'}`);
             if (previousKpiResult.error) errors.push(`KPIs Anteriores: ${previousKpiResult.error.message || 'Erro desconhecido'}`); // Mudado para error
             if (reasonsResult.error) errors.push(`Motivos Devolução: ${reasonsResult.error.message || 'Erro desconhecido'}`);
             if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro desconhecido'}`);
             if (regionalStateResult.error) errors.push(`Totais Regionais: ${regionalStateResult.error.message || 'Erro desconhecido'}`);

             if (errors.length > 0) {
                 throw new Error(errors.join('; '));
             }

             setKpiData({ current: currentKpiResult.data, previous: previousKpiResult.data });
             setReasonDailyTotals(reasonsResult.data || []);
             setConsolidatedTimeSeriesData(timeSeriesResult.data || []);
             setRegionalStateTotals(regionalStateResult.data || {});

        } catch (err) {
            reportError(err, 'fetchAllLogisticData');
            setSummaryError(`Falha ao carregar dados: ${err.message}`);
            setKpiData({ current: null, previous: null });
            setReasonDailyTotals([]);
            setConsolidatedTimeSeriesData([]);
            setRegionalStateTotals({});
        } finally {
            setIsLoadingSummary(false);
            console.log(`[fetchAllLogisticData] Busca finalizada.`);
        }
    }, [logisticsService]);

    // Remover fetchFilterOptions
    useEffect(() => {
        console.log("[Logistica useEffect Update] Filtros de data alterados. Buscando todos os dados...", filters);
        fetchAllLogisticData(filters.dataInicio, filters.dataFim).catch(err => reportError(err, "useEffectUpdate[fetchAllLogisticData]"));
     }, [filters.dataInicio, filters.dataFim, fetchAllLogisticData]);

    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => {
        const checkOverflow = (container) => container ? container.scrollWidth > container.clientWidth + 5 : false;
        const consContainer = consolidatedChartScrollContainerRef.current;
        const reasonsContainer = reasonsChartScrollContainerRef.current;
        const handleResize = () => { checkOverflow(consContainer); checkOverflow(reasonsContainer); }
        window.addEventListener('resize', handleResize); checkOverflow(consContainer); checkOverflow(reasonsContainer);
        return () => window.removeEventListener('resize', handleResize);
    }, [isConsolidatedChartExpanded, isReasonsChartExpanded, consolidatedTimeSeriesData, reasonDailyTotals]);

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
        setFilters({ dataInicio: newPeriod.startDate, dataFim: newPeriod.endDate });
    }, []);

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
            await fetchAllLogisticData(filters.dataInicio, filters.dataFim);
            // await fetchFilterOptions(); // Remover
        } catch(err) {
             reportError(err, 'handleLogisticsUploadSuccess-Catch');
             setSummaryError(`Erro durante upload/refresh: ${err.message}`);
             setIsLoadingSummary(false);
         }
     };

    const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
    const formatNumber = (value, decimals = 0) => {
        if (value === null || value === undefined || isNaN(Number(value))) return 'N/D'; // Retorna 'N/D' para nulo/undefined/NaN
        const num = Number(value);
        return num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
     };
    const formatPercent = (value, decimals = 1) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return `${formatNumber(num, decimals)}%`; };

    // Renderiza a variação PoP (baseada nos valores ABSOLUTOS)
    const renderComparisonPercentage = useCallback((currentAbsoluteValue, previousAbsoluteValue) => {
        const current = Number(currentAbsoluteValue);
        const previous = Number(previousAbsoluteValue);
        if (previousAbsoluteValue === null || previousAbsoluteValue === undefined || isNaN(previous)) return null;
        if (isNaN(current)) return React.createElement('span', { className: "text-gray-500 text-xs" }, "-");

        let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%';
        if (previous === 0) { changeText = (current === 0) ? '0.0%' : 'Novo'; iconClass = (current === 0) ? 'fa-solid fa-equals' : 'fa-solid fa-arrow-up'; textClass = (current === 0) ? 'text-gray-500' : 'text-green-600'; }
        else { const percentageChange = ((current - previous) / Math.abs(previous)) * 100; if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; } else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; } }
        return React.createElement('span', { className: `text-xs ${textClass} inline-flex items-center gap-1 whitespace-nowrap` }, React.createElement('i', { className: iconClass }), React.createElement('span', null, changeText), React.createElement('span', {className:"text-gray-400"}, "(vs ant.)"));
    }, []);

    // Renderiza a linha de comparação completa
    const renderCompleteComparison = useCallback((kpiKey, currentKpiSet, previousKpiSet) => {
        // Verifica se os dados necessários existem
        if (!currentKpiSet?.last_day_absolute || !currentKpiSet?.period_daily_diff) {
             return React.createElement('div', { className: 'mt-1 text-xs text-gray-400 italic' }, 'N/D');
        }

        const currentDailyValue = currentKpiSet.period_daily_diff[kpiKey]; // Pode ser null se RPC retornou null
        const currentAbsValue = currentKpiSet.last_day_absolute[kpiKey];
        const previousAbsValue = previousKpiSet?.last_day_absolute?.[kpiKey]; // Pode ser null/undefined
        const totalAbsValue = currentKpiSet.last_day_absolute.geral;

        // Se o valor diário não pôde ser calculado (RPC retornou null), exibe N/D na comparação
        if (currentDailyValue === null) {
             return React.createElement('div', { className: 'mt-1 text-xs text-gray-400 italic' }, 'N/D (dados insuf.)');
        }

        const currentAbsNum = Number(currentAbsValue);
        const totalAbsNum = Number(totalAbsValue);
        const percentageOfTotal = (kpiKey !== 'geral' && totalAbsNum !== null && totalAbsNum !== 0 && !isNaN(currentAbsNum)) ? (currentAbsNum / totalAbsNum * 100) : NaN;
        const popComparison = renderComparisonPercentage(currentAbsValue, previousAbsValue); // Compara ABSOLUTO atual vs ABSOLUTO anterior
        const hasLastDayValue = currentAbsValue !== null && currentAbsValue !== undefined && !isNaN(currentAbsNum);
        const hasPercentage = !isNaN(percentageOfTotal);

        return React.createElement('div', { className: 'mt-1 flex flex-col' },
            !isMobileView && hasLastDayValue && React.createElement('span', { className: 'text-xs text-gray-500 mb-0.5' }, `(${formatNumber(currentAbsValue)} últ. dia)`),
            React.createElement('div', { className: 'flex flex-wrap items-center gap-x-2' },
                 hasPercentage && React.createElement('span', { className: 'text-xs text-gray-600' }, `(${formatPercent(percentageOfTotal)})`),
                 hasPercentage && popComparison && React.createElement('span', { className: 'text-xs text-gray-400' }, '|'),
                 popComparison
            )
        );
    }, [isMobileView, renderComparisonPercentage, formatPercent, formatNumber]);

    // --- Dados e Opções dos Gráficos ---
    const consolidatedChartData = useMemo(() => {
        const timeSeries = consolidatedTimeSeriesData || [];
        if (timeSeries.length === 0) return { labels: [], datasets: [] };
        const labels = [...new Set(timeSeries.map(d => d.metric_date))].sort();
        let labelsToShow = labels;
        if (!isMobileView && !isConsolidatedChartExpanded && labels.length > 3) { labelsToShow = labels.slice(-3); }
        const formattedLabelsToShow = labelsToShow.map(l => formatDate(l));
        const categories = ['Entregue', 'Em Rota', 'DEVOLUÇÃO', 'Custodia'];
        const colors = { 'Entregue': '#10b981', 'Em Rota': '#3b82f6', 'DEVOLUÇÃO': '#ef4444', 'Custodia': '#f59e0b' };
        const datasets = categories.map(cat => {
            const fullDataPoints = labels.map(label => {
                const point = timeSeries.find(d => d.metric_date === label && (d.sub_category === cat || (cat === 'DEVOLUÇÃO' && ['DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'].includes(d.sub_category))) );
                return point ? point.value : null;
            });
            let dataPointsToShow = fullDataPoints;
            if (!isMobileView && !isConsolidatedChartExpanded && labels.length > 3) { dataPointsToShow = fullDataPoints.slice(-3); }
            const pointRadius = labels.length > 30 ? (isConsolidatedChartExpanded ? 1: 0) : 3;
            return { label: cat, data: dataPointsToShow, borderColor: colors[cat], backgroundColor: `${colors[cat]}33`, tension: 0.1, yAxisID: 'y', fill: false, pointRadius: pointRadius, pointHoverRadius: 5, spanGaps: true, };
        });
        return { labels: formattedLabelsToShow, datasets };
     }, [consolidatedTimeSeriesData, isConsolidatedChartExpanded, isMobileView]);

    const returnReasonsChartData = useMemo(() => {
        if (!reasonDailyTotals || reasonDailyTotals.length === 0) return { labels: [], datasets: [] };
        const reasonColors = ['#3b82f6', '#ef4444', '#f97316', '#eab308', '#10b981', '#14b8a6', '#6366f1', '#a855f7', '#ec4899', '#64748b', '#f43f5e', '#84cc16'];
        const dataToShow = isReasonsChartExpanded ? reasonDailyTotals : reasonDailyTotals.slice(0, isMobileView ? 5 : 7);
        return {
             labels: dataToShow.map(r => r.reason),
             datasets: [{
                 label: 'Total Diário/Período',
                 data: dataToShow.map(r => r.count), // Usa os totais diários calculados
                 backgroundColor: dataToShow.map((_, index) => reasonColors[index % reasonColors.length])
             }]
         };
     }, [reasonDailyTotals, isMobileView, isReasonsChartExpanded]);

    const lineChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { autoSkip: !isConsolidatedChartExpanded, maxRotation: (isMobileView || isConsolidatedChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } }, y: { beginAtZero: true, title: { display: true, text: 'Quantidade Absoluta', font: { size: 11 } }, ticks: { font: { size: 10 }} } }, plugins: { legend: { position: 'bottom', labels: { font: {size: 11}, usePointStyle: true, pointStyleWidth: 8 } } } }), [isMobileView, isConsolidatedChartExpanded]);

    const barChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        scales: { x: { beginAtZero: true, ticks: { font: { size: 10 }}}, y: { ticks: { autoSkip: false, font: { size: 10 } } } },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Total Diário/Período: ${formatNumber(ctx.raw)}` } } }
     }), []);

    const calculateBarChartHeight = (itemCount) => Math.max(300, itemCount * 28 + 100);
    const reasonsChartHeight = isReasonsChartExpanded ? calculateBarChartHeight(reasonDailyTotals.length) : 400;
    const consolidatedChartMinWidth = (!isMobileView && !isConsolidatedChartExpanded && consolidatedChartData.labels.length > 0) ? '100%' : `${Math.max(600, (consolidatedTimeSeriesData?.length || 0) * (isMobileView ? 35 : 50))}px`;

    const toggleConsolidatedChartExpansion = () => setIsConsolidatedChartExpanded(prev => !prev);
    const toggleReasonsChartExpansion = () => setIsReasonsChartExpanded(prev => !prev);
    const toggleRegionExpansion = (region) => setExpandedRegion(prev => prev === region ? null : region);

    // --- Renderização Auxiliar ---
    // Remover renderFilters
    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const currentKpiSet = kpiData?.current; // Contém { last_day_absolute, period_daily_diff }
    const previousKpiSet = kpiData?.previous;
    const hasCurrentKpis = !!currentKpiSet?.period_daily_diff && !isLoadingSummary && !summaryError; // Baseado no diff diário

    // Dados para resumos mobile
    const trendMobileSummaryData = useMemo(() => {
        if (!currentKpiSet?.period_daily_diff) return [];
        const diffs = currentKpiSet.period_daily_diff;
        return [
            { label: 'Entregue (Diário/Per.)', value: diffs.delivered },
            { label: 'Devolvido (Diário/Per.)', value: diffs.returned },
            { label: 'Em Rota (Diário/Per.)', value: diffs.inRoute },
            { label: 'Custódia (Diário/Per.)', value: diffs.custody },
        ].filter(item => item.value !== null && item.value !== undefined);
    }, [currentKpiSet]);

    const reasonsMobileSummaryData = useMemo(() => {
         if (!reasonDailyTotals || reasonDailyTotals.length === 0) return [];
         return reasonDailyTotals.map(r => ({ label: r.reason, value: r.count }));
     }, [reasonDailyTotals]);

     const initialReasonsLimit = isMobileView ? 5 : 7;
     const showReasonsExpandButton = reasonDailyTotals.length > initialReasonsLimit;

    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoadingSummary} message="Carregando dados..." />
            <main className="p-4 lg:p-6">
                 {summaryError && !isLoadingSummary && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> {`Erro Resumo: ${summaryError}`} </div> )}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                        {canUpload && ( <button onClick={() => setShowLogisticsUploader(prev => !prev)} className={`btn ${showLogisticsUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`} data-name="upload-logistics-button"> <i className={`fas ${showLogisticsUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showLogisticsUploader ? 'Fechar Upload' : 'Carregar'}</span> </button> )}
                    </div>
                </div>
                {showLogisticsUploader && canUpload && ( <div className="my-6"> <FileUploaderLogistics onFileUpload={handleLogisticsUploadSuccess} user={user} onClose={() => setShowLogisticsUploader(false)} /> </div> )}
                 <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={{ startDate: filters.dataInicio, endDate: filters.dataFim }} />

                {/* --- KPIs Consolidados (Geral - Diário/Período) --- */}
                {isLoadingSummary && renderLoading("Carregando KPIs...")}
                {!isLoadingSummary && !summaryError && !currentKpiSet?.period_daily_diff && renderNoDataMessage("Nenhum dado de sumário encontrado ou calculável para o período.")}
                {hasCurrentKpis && (
                    <div className="kpi-grid grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-6">
                         {/* Valor principal é a MAGNITUDE do valor DIÁRIO. Se for null, mostra N/D. Comparação lida com o resto */}
                         <KPIPanel title="Entregue (Diário/Período)" value={currentKpiSet.period_daily_diff.delivered === null ? 'N/D' : formatNumber(Math.abs(currentKpiSet.period_daily_diff.delivered))} comparison={renderCompleteComparison('delivered', currentKpiSet, previousKpiSet)}/>
                         <KPIPanel title="Devolvido (Diário/Período)" value={currentKpiSet.period_daily_diff.returned === null ? 'N/D' : formatNumber(Math.abs(currentKpiSet.period_daily_diff.returned))} comparison={renderCompleteComparison('returned', currentKpiSet, previousKpiSet)}/>
                         <KPIPanel title="Custódia (Diário/Período)" value={currentKpiSet.period_daily_diff.custody === null ? 'N/D' : formatNumber(Math.abs(currentKpiSet.period_daily_diff.custody))} comparison={renderCompleteComparison('custody', currentKpiSet, previousKpiSet)} />
                         <KPIPanel title="Em Rota (Diário/Período)" value={currentKpiSet.period_daily_diff.inRoute === null ? 'N/D' : formatNumber(Math.abs(currentKpiSet.period_daily_diff.inRoute))} comparison={renderCompleteComparison('inRoute', currentKpiSet, previousKpiSet)} />
                         <KPIPanel title="Total Geral (Diário/Período)" value={currentKpiSet.period_daily_diff.geral === null ? 'N/D' : formatNumber(Math.abs(currentKpiSet.period_daily_diff.geral))} comparison={renderCompleteComparison('geral', currentKpiSet, previousKpiSet)} />
                    </div>
                )}

                 {/* --- Gráficos --- */}
                 {!isLoadingSummary && !summaryError && (consolidatedTimeSeriesData.length > 0 || reasonDailyTotals.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        {/* Gráfico de Tendência (Mostra valores ABSOLUTOS) */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-base font-semibold text-gray-700">Tendência Consolidada (Geral - Absoluto)</h3>
                                {consolidatedTimeSeriesData.length > 0 && (
                                    <button onClick={toggleConsolidatedChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                        {isConsolidatedChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}
                                    </button>
                                )}
                            </div>
                             {(!isConsolidatedChartExpanded && isMobileView && consolidatedTimeSeriesData.length > 0) ? (
                                 <ChartMobileSummary
                                     title="Resumo Tendência (Diário/Período)"
                                     data={trendMobileSummaryData}
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

                        {/* Gráfico de Motivos (Mostra valores DIÁRIOS/PERÍODO) */}
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                             <div className="flex justify-between items-center mb-4">
                                 <h3 className="text-base font-semibold text-gray-700">Motivos Devolução (Diário/Período)</h3>
                                 {showReasonsExpandButton && (
                                     <button onClick={toggleReasonsChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">
                                         {isReasonsChartExpanded ? (isMobileView ? 'Ver Resumo' : 'Ver Menos') : `Ver ${isMobileView ? 'Gráfico' : `Todos (${reasonDailyTotals.length})`}`}
                                     </button>
                                 )}
                             </div>
                              {(!isReasonsChartExpanded && isMobileView && reasonDailyTotals.length > 0) ? (
                                  <ChartMobileSummary
                                      title="Resumo Motivos Devolução (Diário/Per.)"
                                      data={reasonsMobileSummaryData}
                                      onExpandClick={toggleReasonsChartExpansion}
                                      expandButtonText="Ver Gráfico"
                                  />
                              ) : (
                                 <div className="flex-grow relative" style={{ height: `${reasonsChartHeight}px` }}>
                                      <div ref={reasonsChartScrollContainerRef} className={`absolute inset-0 ${isReasonsChartExpanded ? 'overflow-auto' : 'overflow-hidden'}`}>
                                          <div style={{ height: isReasonsChartExpanded ? `${calculateBarChartHeight(returnReasonsChartData.labels.length)}px` : '100%', width:'100%' }}>
                                              {reasonDailyTotals.length > 0 ? (
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
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Totais ARs por Região (Período)</h3>
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