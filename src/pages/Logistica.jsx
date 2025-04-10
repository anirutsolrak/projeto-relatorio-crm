import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import FileUploaderLogistics from '../components/FileUploaderLogistics';
import FileUploaderLogisticsDaily from '../components/FileUploaderLogisticsDaily';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';
import LogisticsService from '../utils/logisticsService';
import getSupabaseClient from '../utils/supabaseClient';
import { Chart } from 'chart.js/auto';
import AnnotationPlugin from 'chartjs-plugin-annotation';

// Registra plugin
Chart.register(AnnotationPlugin);

// --- Funções Auxiliares de Formatação e Cálculo ---
const formatDate = (dateString) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }); } catch (e) { return dateString; } };
const formatNumber = (value, decimals = 0) => { if (value === null || value === undefined) { return '-'; } const num = Number(value); if (isNaN(num)) { return 'Invál.'; } if (decimals > 0) { let fV; const aN = Math.abs(num); if (aN >= 1e6) { fV = (num / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'; } else if (aN >= 1e3) { fV = (num / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' K'; } else { fV = num.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); } return `R$ ${fV}`; } const absCount = Math.abs(num); if (absCount >= 1e6) { return (num / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' M'; } if (absCount >= 1e3) { return (num / 1e3).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' K'; } return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); };
const formatPercent = (value, decimals = 1) => { if (value === null || value === undefined || isNaN(Number(value))) return '-'; const num = Number(value); return num.toLocaleString('pt-BR', { style: 'percent', minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
const calculatePercentageChange = (current, previous) => { if (previous === null || previous === undefined || previous === 0 || current === null || current === undefined) { return null; } return ((current - previous) / Math.abs(previous)) * 100; };
const getPreviousPeriod = (startDateStr, endDateStr) => { try { const start = new Date(startDateStr + 'T00:00:00Z'); const end = new Date(endDateStr + 'T00:00:00Z'); if (isNaN(start.getTime()) || isNaN(end.getTime())) { return { previousStartDate: null, previousEndDate: null }; } const diff = end.getTime() - start.getTime(); if (diff < 0) return { previousStartDate: null, previousEndDate: null }; const prevEndDate = new Date(start.getTime() - 24 * 60 * 60 * 1000); const prevStartDate = new Date(prevEndDate.getTime() - diff); return { previousStartDate: prevStartDate.toISOString().split('T')[0], previousEndDate: prevEndDate.toISOString().split('T')[0] }; } catch (e) { return { previousStartDate: null, previousEndDate: null }; } };

// Componente para comparação simples PoP (Ajustado para retornar 'Novo' ou null)
const renderSimpleComparison = (currentValue, previousValue) => {
    const current = Number(currentValue);
    const previous = Number(previousValue);
    if (isNaN(current)) return null;
    if (previous === null || previous === undefined || isNaN(previous)) {
         if (current > 0) {
             return React.createElement('span', { className: `text-xs text-blue-500 inline-flex items-center gap-1 whitespace-nowrap` }, React.createElement('i', { className: 'fa-solid fa-star' }), React.createElement('span', null, 'Novo'));
         }
         return null;
    }
    let percentageChange; let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%';
    if (previous === 0) {
        if (current === 0) { changeText = '0.0%'; }
        else { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = 'Novo'; }
    } else {
        percentageChange = ((current - previous) / Math.abs(previous)) * 100;
        if (percentageChange > 0.1) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${formatPercent(percentageChange / 100, 1)}`; }
        else if (percentageChange < -0.1) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = formatPercent(percentageChange / 100, 1); }
        else { changeText = '0.0%'; }
    }
    return React.createElement('span', { className: `text-xs ${textClass} inline-flex items-center gap-1 whitespace-nowrap` }, React.createElement('i', { className: iconClass }), React.createElement('span', null, changeText), React.createElement('span', {className:"text-gray-400"}, "(vs ant.)"));
};

// Componente para Resumo Mobile
function ChartMobileSummary({ title, data = [], onExpandClick, expandButtonText }) {
    const formatValue = (val, isPercent = false) => { if (val === null || val === undefined || isNaN(Number(val))) return '-'; const num = Number(val); const options = isPercent ? { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 } : { minimumFractionDigits: 0, maximumFractionDigits: 0 }; return num.toLocaleString('pt-BR', options); };
    return ( <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between min-h-[200px]"> <div> <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3> <div className="space-y-1 text-sm max-h-48 overflow-y-auto pr-2"> {data.map((item, index) => ( <div key={index} className="flex justify-between"> <TruncatedTextWithPopover className="text-gray-500 mr-2" title={item.label}>{item.label}:</TruncatedTextWithPopover> <span className="font-medium flex-shrink-0">{formatValue(item.value, item.isPercent)}</span> </div> ))} {data.length === 0 && <p className='text-gray-400 text-xs italic'>Nenhum dado para resumir.</p>} </div> </div> {onExpandClick && ( <div className="mt-4 text-right"> <button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">{expandButtonText || "Ver Gráfico"}</button> </div> )} </div> );
}


export default function LogisticaView({ onNavigate, user }) {
    const reportError = (error, context = 'LogisticaView') => console.error(`[${context}] Error:`, error?.message || error);
    const logisticsService = useMemo(() => LogisticsService(), []);

    const [showConsolidatedUploader, setShowConsolidatedUploader] = useState(false);
    const [showDailyUploader, setShowDailyUploader] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    const [dataError, setDataError] = useState(null);
    const [dailyKpiData, setDailyKpiData] = useState(null);
    const [consolidatedKpiData, setConsolidatedKpiData] = useState(null);
    const [reasonDailyTotals, setReasonDailyTotals] = useState([]);
    const [timeSeriesData, setTimeSeriesData] = useState([]);
    const [dailyRegionalStateTotals, setDailyRegionalStateTotals] = useState({});
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isTimeSeriesChartExpanded, setIsTimeSeriesChartExpanded] = useState(false);
    const [isReasonsChartExpanded, setIsReasonsChartExpanded] = useState(false);
    const [expandedRegion, setExpandedRegion] = useState(null);
    const timeSeriesChartScrollContainerRef = useRef(null);
    const reasonsChartScrollContainerRef = useRef(null);
    const defaultEndDate = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date(new Date().setDate(new Date().getDate() - 6)).toISOString().split('T')[0];
    const [filters, setFilters] = useState({ dataInicio: defaultStartDate, dataFim: defaultEndDate });

     const fetchAllLogisticData = useCallback(async (startDate, endDate) => {
        console.log(`[LogisticaView fetchAll] Iniciando busca: ${startDate} a ${endDate}`);
        if (!logisticsService || !startDate || !endDate) { setIsLoadingData(false); setDataError("Erro interno ou datas inválidas."); return; }
        setIsLoadingData(true); setDataError(null);
        setDailyKpiData(null); setConsolidatedKpiData(null); setReasonDailyTotals([]); setTimeSeriesData([]); setDailyRegionalStateTotals({});
        const { previousStartDate, previousEndDate } = getPreviousPeriod(startDate, endDate);
        try {
            const [
                dailyKpiResult, previousDailyKpiResult, consolidatedKpiResult,
                reasonsResult, timeSeriesResult, dailyRegionalResult
            ] = await Promise.all([
                logisticsService.getAggregatedDailyKPIs(startDate, endDate),
                (previousStartDate && previousEndDate) ? logisticsService.getAggregatedDailyKPIs(previousStartDate, previousEndDate) : Promise.resolve({ data: null, error: null }),
                logisticsService.getConsolidatedKpisForDateRange(startDate, endDate),
                logisticsService.getReasonDailyTotals(startDate, endDate),
                logisticsService.getDailyAggregatedTimeSeries(startDate, endDate),
                logisticsService.getDailyRegionalStateTotals(startDate, endDate)
            ]);
            console.log(`[LogisticaView fetchAll] Resultados:`, { dailyKpiResult, previousDailyKpiResult, consolidatedKpiResult, reasonsResult, timeSeriesResult, dailyRegionalResult });
             const errors = [];
             if (dailyKpiResult.error) errors.push(`KPIs Diários Atuais: ${dailyKpiResult.error.message || 'Erro'}`);
             if (previousDailyKpiResult.error) errors.push(`KPIs Diários Anteriores: ${previousDailyKpiResult.error.message || 'Erro'}`);
             if (consolidatedKpiResult.error || !consolidatedKpiResult.data) errors.push(`KPI Consolidado: ${consolidatedKpiResult.error?.message || 'Dados não encontrados'}`);
             if (reasonsResult.error) errors.push(`Motivos: ${reasonsResult.error.message || 'Erro'}`);
             if (timeSeriesResult.error) errors.push(`Série Temporal: ${timeSeriesResult.error.message || 'Erro'}`);
             if (dailyRegionalResult.error) errors.push(`Regionais Diários: ${dailyRegionalResult.error.message || 'Erro'}`);
             if (errors.length > 0) { throw new Error(errors.join('; ')); }

             setDailyKpiData({ current: dailyKpiResult.data, previous: previousDailyKpiResult.data });
             setDailyRegionalStateTotals(dailyRegionalResult.data || {});
             setConsolidatedKpiData(consolidatedKpiResult.data);
             setReasonDailyTotals(reasonsResult.data || []);
             setTimeSeriesData(timeSeriesResult.data || []);

        } catch (err) { reportError(err, 'fetchAllLogisticData'); setDataError(`Falha ao carregar dados: ${err.message}`); setDailyKpiData(null); setConsolidatedKpiData(null); setReasonDailyTotals([]); setTimeSeriesData([]); setDailyRegionalStateTotals({}); }
        finally { setIsLoadingData(false); console.log(`[LogisticaView fetchAll] Busca finalizada.`); }
    }, [logisticsService]);

    useEffect(() => { console.log("[LogisticaView useEffect Update]", filters); fetchAllLogisticData(filters.dataInicio, filters.dataFim).catch(err => reportError(err, "useEffectUpdate[fetchAllLogisticData]")); }, [filters.dataInicio, filters.dataFim, fetchAllLogisticData]);
    useEffect(() => { const handleResize = () => setIsMobileView(window.innerWidth < 768); window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, []);
    useEffect(() => { const checkOverflow = (container) => container ? container.scrollWidth > container.clientWidth + 5 : false; const consContainer = timeSeriesChartScrollContainerRef.current; const reasonsContainer = reasonsChartScrollContainerRef.current; const handleResize = () => { checkOverflow(consContainer); checkOverflow(reasonsContainer); }; window.addEventListener('resize', handleResize); checkOverflow(consContainer); checkOverflow(reasonsContainer); return () => window.removeEventListener('resize', handleResize); }, [isTimeSeriesChartExpanded, isReasonsChartExpanded, timeSeriesData, reasonDailyTotals]);

    const handlePeriodChange = useCallback((newPeriod) => { console.log("[LogisticaView handlePeriodChange]", newPeriod); if (!newPeriod.startDate || !newPeriod.endDate) { console.error("Período inválido:", newPeriod); setDataError("Datas inválidas."); return; } if (new Date(newPeriod.endDate) < new Date(newPeriod.startDate)) { console.warn("Data final anterior."); setDataError("Data final anterior à inicial."); return; } setDataError(null); setFilters({ dataInicio: newPeriod.startDate, dataFim: newPeriod.endDate }); }, []);

    const handleConsolidatedUploadSuccess = useCallback(async (summary) => { console.log("Upload Consolidado Concluído:", summary); setIsLoadingData(true); await fetchAllLogisticData(filters.dataInicio, filters.dataFim); setIsLoadingData(false); }, [filters.dataInicio, filters.dataFim, fetchAllLogisticData]);
    const handleDailyUploadSuccess = useCallback(async (summary) => { console.log("Upload Diário Concluído:", summary); setIsLoadingData(true); await fetchAllLogisticData(filters.dataInicio, filters.dataFim); setIsLoadingData(false); }, [filters.dataInicio, filters.dataFim, fetchAllLogisticData]);

    const totalGeralDiarioAtual = useMemo(() => { const currentKpis = dailyKpiData?.current; if (!currentKpis) return 0; return (currentKpis.delivered ?? 0) + (currentKpis.returned ?? 0) + (currentKpis.custody ?? 0) + (currentKpis.inRoute ?? 0); }, [dailyKpiData]);
    const totalGeralDiarioAnterior = useMemo(() => { const previousKpis = dailyKpiData?.previous; if (!previousKpis) return null; return (previousKpis.delivered ?? 0) + (previousKpis.returned ?? 0) + (previousKpis.custody ?? 0) + (previousKpis.inRoute ?? 0); }, [dailyKpiData]);

    // Função de Callback para renderizar a comparação completa
    const renderFullComparison = useCallback((kpiKey, currentDailyAggregate, previousDailyAggregate, consolidatedData) => {
        const currentVal = currentDailyAggregate?.[kpiKey];
        const previousVal = previousDailyAggregate?.[kpiKey];
        const consolidatedVal = consolidatedData?.last_day_absolute?.[kpiKey];
        const consolidatedDate = consolidatedData?.last_date_found;
        const currentTotalGeralForPercent = totalGeralDiarioAtual;
        let percentageOfTotal = null;
        if (kpiKey !== 'geral' && currentTotalGeralForPercent > 0 && currentVal !== null && currentVal !== undefined) {
            percentageOfTotal = (currentVal / currentTotalGeralForPercent);
        }
        const popComparison = renderSimpleComparison(currentVal, previousVal);
        const hasConsolidated = consolidatedVal !== null && consolidatedVal !== undefined;
        const hasPercentage = percentageOfTotal !== null;
        if (!popComparison && !hasPercentage && !hasConsolidated) return null;

        return React.createElement('div', { className: 'mt-1 flex flex-col text-xs' },
            !isMobileView && hasConsolidated && React.createElement('span', { className: 'text-gray-500 mb-0.5', title: `Valor consolidado acumulado em ${formatDate(consolidatedDate)}` },
                `(Cons: ${formatNumber(consolidatedVal, 0)})`
            ),
            React.createElement('div', { className: 'flex flex-wrap items-center gap-x-2' },
                 hasPercentage && React.createElement('span', { className: 'text-gray-600' }, `(${formatPercent(percentageOfTotal, 1)})`),
                 hasPercentage && popComparison && React.createElement('span', { className: 'text-gray-400' }, '|'),
                 popComparison
            )
        );
    }, [isMobileView, totalGeralDiarioAtual, formatDate, formatNumber, formatPercent, renderSimpleComparison]); // Adiciona renderSimpleComparison


    const timeSeriesChartData = useMemo(() => { const timeSeries = timeSeriesData || []; if (timeSeries.length === 0) return { labels: [], datasets: [] }; const labels = [...new Set(timeSeries.map(d => d.metric_date))].sort(); let labelsToShow = labels; if (!isMobileView && !isTimeSeriesChartExpanded && labels.length > 3) { labelsToShow = labels.slice(-3); } const formattedLabelsToShow = labelsToShow.map(l => formatDate(l)); const categories = ['Entregue', 'Em Rota', 'DEVOLUÇÃO', 'Custodia']; const colors = { 'Entregue': '#10b981', 'Em Rota': '#3b82f6', 'DEVOLUÇÃO': '#ef4444', 'Custodia': '#f59e0b' }; const datasets = categories.map(cat => { const fullDataPoints = labels.map(label => { const point = timeSeries.find(d => d.metric_date === label && (d.sub_category === cat || (cat === 'DEVOLUÇÃO' && ['DEVOLUCAO', 'DEVOLUÇÃO', 'DEVOLUÃ‡ÃƒO'].includes(d.sub_category))) ); return point ? point.value : null; }); let dataPointsToShow = fullDataPoints; if (!isMobileView && !isTimeSeriesChartExpanded && labels.length > 3) { dataPointsToShow = fullDataPoints.slice(-3); } const pointRadius = labels.length > 30 ? (isTimeSeriesChartExpanded ? 1: 0) : 3; return { label: cat, data: dataPointsToShow, borderColor: colors[cat], backgroundColor: `${colors[cat]}33`, tension: 0.1, yAxisID: 'y', fill: false, pointRadius: pointRadius, pointHoverRadius: 5, spanGaps: true, }; }); return { labels: formattedLabelsToShow, datasets }; }, [timeSeriesData, isTimeSeriesChartExpanded, isMobileView]);
    const returnReasonsChartData = useMemo(() => { if (!reasonDailyTotals || reasonDailyTotals.length === 0) return { labels: [], datasets: [] }; const reasonColors = ['#3b82f6', '#ef4444', '#f97316', '#eab308', '#10b981', '#14b8a6', '#6366f1', '#a855f7', '#ec4899', '#64748b', '#f43f5e', '#84cc16']; const dataToShow = isReasonsChartExpanded ? reasonDailyTotals : reasonDailyTotals.slice(0, isMobileView ? 5 : 7); return { labels: dataToShow.map(r => r.reason), datasets: [{ label: 'Total Diário/Período', data: dataToShow.map(r => r.count), backgroundColor: dataToShow.map((_, index) => reasonColors[index % reasonColors.length]) }] }; }, [reasonDailyTotals, isMobileView, isReasonsChartExpanded]);
    const lineChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { autoSkip: !isTimeSeriesChartExpanded, maxRotation: (isMobileView || isTimeSeriesChartExpanded) ? 60 : 0, font: { size: 10 }, padding: 5 } }, y: { beginAtZero: true, title: { display: true, text: 'Quantidade (Diária Agregada)', font: { size: 11 } }, ticks: { font: { size: 10 }} } }, plugins: { legend: { position: 'bottom', labels: { font: {size: 11}, usePointStyle: true, pointStyleWidth: 8 } } } }), [isMobileView, isTimeSeriesChartExpanded]);
    const barChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { font: { size: 10 }}}, y: { ticks: { autoSkip: false, font: { size: 10 } } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `Total Diário/Período: ${formatNumber(ctx.raw, 0)}` } } } }), [formatNumber]);
    const calculateBarChartHeight = (itemCount) => Math.max(300, itemCount * 28 + 100);
    const reasonsChartHeight = isReasonsChartExpanded ? calculateBarChartHeight(reasonDailyTotals.length) : 400;
    const timeSeriesChartMinWidth = (!isMobileView && !isTimeSeriesChartExpanded && timeSeriesChartData.labels.length > 0) ? '100%' : `${Math.max(600, (timeSeriesData?.length || 0) * (isMobileView ? 35 : 50))}px`;
    const toggleTimeSeriesChartExpansion = () => setIsTimeSeriesChartExpanded(prev => !prev);
    const toggleReasonsChartExpansion = () => setIsReasonsChartExpanded(prev => !prev);
    const toggleRegionExpansion = (region) => setExpandedRegion(prev => prev === region ? null : region);

    const renderNoDataMessage = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-info-circle text-4xl mb-4"></i> <p>{message}</p></div> </div> );
    const renderLoading = (message) => ( <div className="flex items-center justify-center h-full text-center py-12 text-gray-500"> <div><i className="fas fa-spinner fa-spin text-4xl mb-4"></i> <p>{message}</p></div> </div> );

    const canUpload = user && user.role !== 'guest';
    const currentDailyKpis = dailyKpiData?.current;
    const previousDailyKpis = dailyKpiData?.previous;
    const hasDailyKpis = !!currentDailyKpis && !isLoadingData && !dataError;
    const initialReasonsLimit = isMobileView ? 5 : 7;
    const showReasonsExpandButton = reasonDailyTotals.length > initialReasonsLimit;

    const timeSeriesMobileSummaryData = useMemo(() => { if (!currentDailyKpis) return []; return [ { label: 'Entregue (Soma Per.)', value: currentDailyKpis.delivered }, { label: 'Devolvido (Soma Per.)', value: currentDailyKpis.returned }, { label: 'Em Rota (Soma Per.)', value: currentDailyKpis.inRoute }, { label: 'Custódia (Soma Per.)', value: currentDailyKpis.custody }, ].filter(item => item.value !== null && item.value !== undefined); }, [currentDailyKpis]);
    const reasonsMobileSummaryData = useMemo(() => { if (!reasonDailyTotals || reasonDailyTotals.length === 0) return []; return reasonDailyTotals.map(r => ({ label: r.reason, value: r.count })); }, [reasonDailyTotals]);
    const consolidatedRegionalTotals = useMemo(() => { if (!consolidatedKpiData?.regional_totals) return {}; return consolidatedKpiData.regional_totals; }, [consolidatedKpiData]);


    return (
        <div className="min-h-screen">
            <LoadingOverlay isLoading={isLoadingData} message="Carregando dados..." />
            <main className="p-4 lg:p-6">
                 {dataError && !isLoadingData && ( <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" role="alert"> <i className="fas fa-exclamation-triangle mr-2"></i> {`Erro: ${dataError}`} </div> )}
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6">
                    <h2 className="text-2xl font-bold text-gray-800 mb-4 lg:mb-0">Relatórios de Logística</h2>
                    <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2 w-full sm:w-auto">
                         {canUpload && ( <button onClick={() => setShowConsolidatedUploader(prev => !prev)} className={`btn ${showConsolidatedUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`}><i className={`fas ${showConsolidatedUploader ? 'fa-times' : 'fa-upload'}`}></i> <span>{showConsolidatedUploader ? 'Fechar Consolidado' : 'Carregar Consolidado'}</span> </button> )}
                         {canUpload && ( <button onClick={() => setShowDailyUploader(prev => !prev)} className={`btn ${showDailyUploader ? 'btn-secondary' : 'btn-primary'} btn-icon w-full sm:w-auto`}><i className={`fas ${showDailyUploader ? 'fa-times' : 'fa-calendar-day'}`}></i> <span>{showDailyUploader ? 'Fechar Diário' : 'Carregar Diário'}</span> </button> )}
                    </div>
                </div>
                 {showConsolidatedUploader && canUpload && ( <div className="my-6"> <FileUploaderLogistics onFileUpload={handleConsolidatedUploadSuccess} user={user} onClose={() => setShowConsolidatedUploader(false)} /> </div> )}
                 {showDailyUploader && canUpload && ( <div className="my-6"> <FileUploaderLogisticsDaily onFileUpload={handleDailyUploadSuccess} user={user} onClose={() => setShowDailyUploader(false)} /> </div> )}
                 <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={{ startDate: filters.dataInicio, endDate: filters.dataFim }} />

                 {/* --- KPIs (Valores Diários Agregados) --- */}
                {isLoadingData && renderLoading("Carregando KPIs...")}
                {!isLoadingData && !dataError && !currentDailyKpis && renderNoDataMessage("Nenhum dado encontrado para o período.")}
                {hasDailyKpis && (
                    <div className="kpi-grid grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 my-6"> {/* Ajustado grid-cols-1 para mobile */}
                         <KPIPanel title="Entregue (Diário/Per.)" value={formatNumber(currentDailyKpis.delivered, 0)} comparison={renderFullComparison('delivered', currentDailyKpis, previousDailyKpis, consolidatedKpiData, totalGeralDiarioAtual, isMobileView)}/>
                         <KPIPanel title="Devolvido (Diário/Per.)" value={formatNumber(currentDailyKpis.returned, 0)} comparison={renderFullComparison('returned', currentDailyKpis, previousDailyKpis, consolidatedKpiData, totalGeralDiarioAtual, isMobileView)}/>
                         <KPIPanel title="Custódia (Diário/Per.)" value={formatNumber(currentDailyKpis.custody, 0)} comparison={renderFullComparison('custody', currentDailyKpis, previousDailyKpis, consolidatedKpiData, totalGeralDiarioAtual, isMobileView)} />
                         <KPIPanel title="Em Rota (Diário/Per.)" value={formatNumber(currentDailyKpis.inRoute, 0)} comparison={renderFullComparison('inRoute', currentDailyKpis, previousDailyKpis, consolidatedKpiData, totalGeralDiarioAtual, isMobileView)} />
                         <KPIPanel title="Total Geral (Diário/Per.)" value={formatNumber(totalGeralDiarioAtual, 0)} comparison={renderSimpleComparison(totalGeralDiarioAtual, totalGeralDiarioAnterior)} />
                    </div>
                )}

                 {/* --- Gráficos --- */}
                 {!isLoadingData && !dataError && (timeSeriesData.length > 0 || reasonDailyTotals.length > 0) && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                            <div className="flex justify-between items-center mb-4"> <h3 className="text-base font-semibold text-gray-700">Tendência Diária Agregada</h3> {timeSeriesData.length > 0 && ( <button onClick={toggleTimeSeriesChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">{isTimeSeriesChartExpanded ? 'Ver Resumo' : 'Ver Gráfico'}</button> )} </div>
                             {(!isTimeSeriesChartExpanded && isMobileView && timeSeriesData.length > 0) ? ( <ChartMobileSummary title="Resumo Tendência (Soma Per.)" data={timeSeriesMobileSummaryData} onExpandClick={toggleTimeSeriesChartExpansion} expandButtonText="Ver Gráfico" /> ) : ( <div className="flex-grow relative h-[350px]"> <div ref={timeSeriesChartScrollContainerRef} className={`absolute inset-0 ${isTimeSeriesChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`}> <div style={{ minWidth: timeSeriesChartMinWidth, height: '100%' }} className="relative"> {timeSeriesData.length > 0 ? <ChartComponent type="line" data={timeSeriesChartData} options={lineChartOptions} /> : renderNoDataMessage("Sem dados para gráfico de tendência.")} </div> </div> </div> )}
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col min-h-[400px]">
                             <div className="flex justify-between items-center mb-4"> <h3 className="text-base font-semibold text-gray-700">Motivos Devolução (Total Diário/Período)</h3> {showReasonsExpandButton && ( <button onClick={toggleReasonsChartExpansion} className="btn btn-secondary btn-xs py-1 px-2">{isReasonsChartExpanded ? (isMobileView ? 'Ver Resumo' : 'Ver Menos') : `Ver ${isMobileView ? 'Gráfico' : `Todos (${reasonDailyTotals.length})`}`}</button> )} </div>
                              {(!isReasonsChartExpanded && isMobileView && reasonDailyTotals.length > 0) ? ( <ChartMobileSummary title="Resumo Motivos Devolução (Total Per.)" data={reasonsMobileSummaryData} onExpandClick={toggleReasonsChartExpansion} expandButtonText="Ver Gráfico" /> ) : ( <div className="flex-grow relative" style={{ height: `${reasonsChartHeight}px` }}> <div ref={reasonsChartScrollContainerRef} className={`absolute inset-0 ${isReasonsChartExpanded ? 'overflow-auto' : 'overflow-hidden'}`}> <div style={{ height: isReasonsChartExpanded ? `${calculateBarChartHeight(returnReasonsChartData.labels.length)}px` : '100%', width:'100%' }}> {reasonDailyTotals.length > 0 ? <ChartComponent type="bar" data={returnReasonsChartData} options={barChartOptions} /> : renderNoDataMessage("Sem dados de motivos.")} </div> </div> </div> )}
                        </div>
                    </div>
                 )}

                 {/* --- KPIs Regionais/Estaduais --- */}
                 {!isLoadingData && !dataError && Object.keys(dailyRegionalStateTotals).length > 0 && (
                     <div className="mb-6">
                         <h3 className="text-xl font-semibold text-gray-800 mb-4">Totais Diários por Região (Período)</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                             {Object.entries(dailyRegionalStateTotals).sort(([, a], [, b]) => b.total - a.total).map(([region, regionData]) => ( <div key={region} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100"> <div className="flex justify-between items-center cursor-pointer mb-2" onClick={() => toggleRegionExpansion(region)} role="button" tabIndex={0} aria-expanded={expandedRegion === region} aria-controls={`states-${region}`}> <h4 className="text-base font-semibold text-gray-700">{region}</h4> <div className='flex items-center'> <span className="text-lg font-bold mr-2">{formatNumber(regionData.total, 0)}</span> <i className={`fas fa-chevron-down transition-transform duration-200 ${expandedRegion === region ? 'rotate-180' : ''}`}></i> </div> </div> <div id={`states-${region}`} className={`transition-all duration-300 ease-in-out overflow-hidden ${expandedRegion === region ? 'max-h-96 mt-3 pt-3 border-t border-gray-200' : 'max-h-0'}`} style={{ maxHeight: expandedRegion === region ? '24rem' : '0' }} > <div className="space-y-1 pl-2 overflow-y-auto max-h-80 pr-2"> {Object.entries(regionData.states).sort(([, a], [, b]) => b - a).map(([state, count]) => ( <div key={state} className="flex justify-between items-center text-sm pr-2 border-b border-gray-100 last:border-b-0 pb-1"> <TruncatedTextWithPopover className="text-gray-600" title={state}>{state}</TruncatedTextWithPopover> <span className="font-medium flex-shrink-0 ml-2">{formatNumber(count, 0)}</span> </div> ))} {Object.keys(regionData.states).length === 0 && <p className="text-sm text-gray-500 italic">Nenhum estado.</p>} </div> </div> </div> ))}
                         </div>
                     </div>
                 )}
                 {!isLoadingData && !dataError && Object.keys(dailyRegionalStateTotals).length === 0 && ( <div className="mb-6"> <h3 className="text-xl font-semibold text-gray-800 mb-4">Totais por Região</h3> {renderNoDataMessage("Nenhum dado regional.")} </div> )}
            </main>
        </div>
    );
}