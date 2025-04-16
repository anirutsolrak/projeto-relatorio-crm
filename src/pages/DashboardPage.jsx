import React, { useState, useEffect, useRef, useMemo, useCallback, useContext } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
import DashboardService from '../utils/dashboardService';
import getSupabaseClient from '../utils/supabaseClient';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';
import { FilterContext } from '../contexto/FilterContext';


function LineChartMobileSummary({ title, primaryMetricLabel = "Principal", primarySummary, secondaryMetricLabel = "Secundário", secondarySummary, onExpandClick, expandButtonText }) {
    const formatSummaryValue = (val, unit = null, decimals = 0) => { if (val === null || val === undefined || val === 'N/A' || isNaN(val)) return 'N/A'; if (unit === 'currency') { return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: decimals }); } if (unit === 'percent') { if (!isFinite(val)) return '(inf%)'; const sign = val > 0 ? '+' : ''; return `${sign}${val.toFixed(1)}%`; } return val.toLocaleString('pt-BR', { maximumFractionDigits: decimals }); };
    const getChangeColor = (change) => { if (change === null || change === undefined || change === 'N/A' || isNaN(change) || !isFinite(change) || change === 0) return 'text-gray-600'; return change > 0 ? 'text-green-600' : 'text-red-600'; };
    return (
        <div className="bg-white p-4 rounded-lg shadow-md h-full flex flex-col justify-between">
            <div>
                <h3 className="text-base font-semibold text-gray-700 mb-4">{title}</h3>
                <div className="space-y-1 text-sm">
                    {primarySummary?.startValue !== undefined && (<div className="flex justify-between"><span className="text-gray-500">{primaryMetricLabel} (Início):</span><span className="font-medium">{formatSummaryValue(primarySummary.startValue, primarySummary.unit, primarySummary.decimals)}</span></div>)}
                    {primarySummary?.endValue !== undefined && (<div className="flex justify-between"><span className="text-gray-500">{primaryMetricLabel} (Fim):</span><span className="font-medium">{formatSummaryValue(primarySummary.endValue, primarySummary.unit, primarySummary.decimals)}</span></div>)}
                    {primarySummary?.changePercent !== undefined && (<div className="flex justify-between"><span className="text-gray-500">{primaryMetricLabel} (Variação %):</span><span className={`font-medium ${getChangeColor(primarySummary.changePercent)}`}>{formatSummaryValue(primarySummary.changePercent, 'percent')}</span></div>)}

                    {secondarySummary?.averageValue !== undefined ? (
                         <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500">{secondaryMetricLabel} (Média Período):</span><span className="font-medium">{formatSummaryValue(secondarySummary.averageValue, secondarySummary.unit, secondarySummary.decimals)}</span></div>
                     ) : primarySummary?.averageValue !== undefined ? (
                         <div className="flex justify-between border-t pt-1 mt-1"><span className="text-gray-500">{primaryMetricLabel} (Média Período):</span><span className="font-medium">{formatSummaryValue(primarySummary.averageValue, primarySummary.unit, primarySummary.decimals)}</span></div>
                     ) : null}

                    {primarySummary && !secondarySummary && primarySummary.label && primarySummary.value !== undefined && !primarySummary.startValue && (<div className="flex justify-between"><span className="text-gray-500">{primarySummary.label}:</span><span className="font-medium">{formatSummaryValue(primarySummary.value, primarySummary.unit, primarySummary.decimals)}</span></div>)}
                </div>
            </div>
            <div className="mt-4 text-right"><button onClick={onExpandClick} className="btn btn-secondary btn-xs py-1 px-2">{expandButtonText || "Ver Gráfico"}</button></div>
        </div>
    );
}


function DashboardPage({ user, onLogout }) {
    const reportError = (error, context = 'DashboardPage') => console.error(`[${context}] Error:`, error?.message || error);
    const [isLoading, setIsLoading] = useState(true);
    const { period } = useContext(FilterContext); // Usar período do contexto
    const [dashboardData, setDashboardData] = useState({ summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 }, typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] } });
    const [showUploader, setShowUploader] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [isTypedChartExpanded, setIsTypedChartExpanded] = useState(false);
    const [isNotTypedChartExpanded, setIsNotTypedChartExpanded] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isAccountsChartExpanded, setIsAccountsChartExpanded] = useState(false);
    const [isEsteiraChartExpanded, setIsEsteiraChartExpanded] = useState(false);
    const accountsChartScrollContainerRef = useRef(null);
    const esteiraChartScrollContainerRef = useRef(null);
    const [showAccountsScrollButtons, setShowAccountsScrollButtons] = useState(false);
    const [canAccountsScrollPrev, setCanAccountsScrollPrev] = useState(false);
    const [canAccountsScrollNext, setCanAccountsScrollNext] = useState(false);
    const [showAccountsScrollFade, setShowAccountsScrollFade] = useState(false);
    const [accountsChartOverflowsWhenCollapsed, setAccountsChartOverflowsWhenCollapsed] = useState(false);
    const [showEsteiraScrollButtons, setShowEsteiraScrollButtons] = useState(false);
    const [canEsteiraScrollPrev, setCanEsteiraScrollPrev] = useState(false);
    const [canEsteiraScrollNext, setCanEsteiraScrollNext] = useState(false);
    const [showEsteiraScrollFade, setShowEsteiraScrollFade] = useState(false);
    const [esteiraChartOverflowsWhenCollapsed, setEsteiraChartOverflowsWhenCollapsed] = useState(false);
    const dashboardService = useMemo(() => DashboardService(), []);
    const debounce = (func, wait) => { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; };
    const parseBrazilianNumber = (value) => { if (value === null || value === undefined) return null; const valueStr = String(value).trim(); if (valueStr === '' || valueStr === '-' || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?'].includes(valueStr.toUpperCase())) return null; const cleanedStr = valueStr.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim(); const number = parseFloat(cleanedStr); return isNaN(number) ? null : number; };
    const safeParseFloat = (value) => { if (value === null || value === undefined) return null; const num = parseFloat(value); return isNaN(num) ? null : num; };
    const checkChartOverflow = useCallback((chartType) => { const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current; const labels = chartType === 'accounts' ? dashboardData?.accountsTrends?.labels : dashboardData?.esteiraTrends?.labels; const setOverflowState = chartType === 'accounts' ? setAccountsChartOverflowsWhenCollapsed : setEsteiraChartOverflowsWhenCollapsed; if (!container || !labels?.length) { setOverflowState(false); return; } const estimatedWidthPerPoint = isMobileView ? 40 : 80; const totalEstimatedWidth = labels.length * estimatedWidthPerPoint; const containerWidth = container.clientWidth; const tolerance = 5; const overflows = totalEstimatedWidth > containerWidth + tolerance; setOverflowState(overflows); }, [dashboardData?.accountsTrends?.labels, dashboardData?.esteiraTrends?.labels, isMobileView]);
    const checkAccountsChartOverflow = useCallback(() => checkChartOverflow('accounts'), [checkChartOverflow]);
    const checkEsteiraChartOverflow = useCallback(() => checkChartOverflow('esteira'), [checkChartOverflow]);
    const updateScrollButtons = useCallback((chartType) => { const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current; const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded; const setShowButtons = chartType === 'accounts' ? setShowAccountsScrollButtons : setShowEsteiraScrollButtons; const setCanPrev = chartType === 'accounts' ? setCanAccountsScrollPrev : setCanEsteiraScrollPrev; const setCanNext = chartType === 'accounts' ? setCanAccountsScrollNext : setCanEsteiraScrollNext; const setShowFade = chartType === 'accounts' ? setShowAccountsScrollFade : setShowEsteiraScrollFade; if (!container) { setShowButtons(false); setShowFade(false); setCanPrev(false); setCanNext(false); return; } if (!isExpanded) { setShowButtons(false); setShowFade(false); setCanPrev(false); setCanNext(false); return; } const tolerance = 5; const scrollLeft = Math.round(container.scrollLeft); const scrollWidth = Math.round(container.scrollWidth); const clientWidth = Math.round(container.clientWidth); const hasHorizontalOverflow = scrollWidth > clientWidth + tolerance; const isScrolledToStart = scrollLeft <= tolerance; const isScrolledToEnd = scrollLeft >= scrollWidth - clientWidth - tolerance; setShowButtons(hasHorizontalOverflow); setCanPrev(hasHorizontalOverflow && !isScrolledToStart); setCanNext(hasHorizontalOverflow && !isScrolledToEnd); setShowFade(hasHorizontalOverflow && !isScrolledToEnd); }, [isAccountsChartExpanded, isEsteiraChartExpanded]);
    const updateAccountsScrollButtons = useCallback(() => updateScrollButtons('accounts'), [updateScrollButtons]);
    const updateEsteiraScrollButtons = useCallback(() => updateScrollButtons('esteira'), [updateScrollButtons]);
    const debouncedUpdateAccountsScrollButtons = useMemo(() => debounce(updateAccountsScrollButtons, 150), [updateAccountsScrollButtons]);
    const debouncedCheckAccountsChartOverflow = useMemo(() => debounce(checkAccountsChartOverflow, 150), [checkAccountsChartOverflow]);
    const debouncedUpdateEsteiraScrollButtons = useMemo(() => debounce(updateEsteiraScrollButtons, 150), [updateEsteiraScrollButtons]);
    const debouncedCheckEsteiraChartOverflow = useMemo(() => debounce(checkEsteiraChartOverflow, 150), [checkEsteiraChartOverflow]);
    useEffect(() => { const handleResize = () => { const mobile = window.innerWidth < 768; setIsMobileView(mobile); debouncedUpdateAccountsScrollButtons(); debouncedCheckAccountsChartOverflow(); debouncedUpdateEsteiraScrollButtons(); debouncedCheckEsteiraChartOverflow(); }; window.addEventListener('resize', handleResize); handleResize(); return () => window.removeEventListener('resize', handleResize); }, [debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow]);
    useEffect(() => { const accountsContainer = accountsChartScrollContainerRef.current; const esteiraContainer = esteiraChartScrollContainerRef.current; let accountsResizeObserver, esteiraResizeObserver; const setupObservers = (container, isExpanded, updateFunc, checkFunc, debouncedUpdateFunc, debouncedCheckFunc, chartType) => { if (container) { requestAnimationFrame(() => { updateFunc(); checkFunc(); }); if (isExpanded) { container.addEventListener('scroll', debouncedUpdateFunc, { passive: true }); } else { container.removeEventListener('scroll', debouncedUpdateFunc); } const observer = new ResizeObserver(() => { debouncedUpdateFunc(); debouncedCheckFunc(); }); observer.observe(container); const innerChartContainer = container.querySelector(`[data-name="${chartType}-chart-inner-container"]`); if (innerChartContainer) observer.observe(innerChartContainer); return () => { container.removeEventListener('scroll', debouncedUpdateFunc); if (observer) observer.disconnect(); }; } requestAnimationFrame(() => { updateFunc(); checkFunc(); }); return () => {}; }; const cleanupAccounts = setupObservers(accountsContainer, isAccountsChartExpanded, updateAccountsScrollButtons, checkAccountsChartOverflow, debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, 'accounts'); const cleanupEsteira = setupObservers(esteiraContainer, isEsteiraChartExpanded, updateEsteiraScrollButtons, checkEsteiraChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow, 'esteira'); return () => { cleanupAccounts(); cleanupEsteira(); }; }, [dashboardData, isMobileView, isAccountsChartExpanded, isEsteiraChartExpanded, updateAccountsScrollButtons, checkAccountsChartOverflow, debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, updateEsteiraScrollButtons, checkEsteiraChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow]);

    const fetchAndSetDashboardData = useCallback(async (startDate, endDate) => {
        if (!dashboardService || !startDate || !endDate) {
            console.warn("[DashboardPage fetch] Serviço não disponível ou datas inválidas:", { hasService: !!dashboardService, startDate, endDate });
            setIsLoading(false); setFetchError("Erro interno ou datas inválidas."); return;
        }
        console.log(`[DashboardPage fetch] Iniciando busca: ${startDate} a ${endDate}`);
        setIsLoading(true); setFetchError(null); setDashboardData({ summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 }, typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] } }); setIsAccountsChartExpanded(false); setIsTypedChartExpanded(false); setIsNotTypedChartExpanded(false); setIsEsteiraChartExpanded(false);
        try {
            const [kpiResult, rawDataResult] = await Promise.all([ dashboardService.getCalculatedKPIs(startDate, endDate), dashboardService.getRawMetricsData(startDate, endDate) ]);
            if (kpiResult.error) throw new Error(`Erro KPIs: ${kpiResult.error.message || kpiResult.error}`); if (rawDataResult.error) throw new Error(`Erro Dados Brutos: ${rawDataResult.error.message || rawDataResult.error}`);
            const kpiData = kpiResult.data; const rawData = rawDataResult.data;
            if (!kpiData) throw new Error('API de KPIs não retornou dados.'); let processedChartData = { typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] } }; if (rawData && rawData.length > 0) { processedChartData.typedDetails = processCategoryData(rawData, 'DIGITADAS'); processedChartData.notTypedDetails = processCategoryData(rawData, 'NÃO DIGITADAS'); const uniqueDates = [...new Set(rawData.map(item => item.metric_date))].sort((a, b) => new Date(a) - new Date(b)); processedChartData.accountsTrends = processAccountsTrendData(rawData, uniqueDates); processedChartData.esteiraTrends = processEsteiraTrendData(rawData, uniqueDates); } setDashboardData({ summary: { typed: kpiData.current_typed_sum || 0, notTyped: kpiData.current_not_typed_sum || 0, activeAccounts: kpiData.last_active_accounts_in_period || 0, activeAccountsAvg: kpiData.current_active_accounts_avg || 0, faixaLimiteTotal: kpiData.current_limit_total_sum || 0, limitTotalAvg: kpiData.current_limit_total_avg || 0, previousTyped: kpiData.previous_typed_sum || 0, previousNotTyped: kpiData.previous_not_typed_sum || 0 }, ...processedChartData });
        } catch (error) {
            reportError(error, 'fetchAndSetDashboardData'); setFetchError(`Falha ao carregar dados: ${error.message}`);
        } finally {
            setIsLoading(false); requestAnimationFrame(() => { updateAccountsScrollButtons(); checkAccountsChartOverflow(); updateEsteiraScrollButtons(); checkEsteiraChartOverflow(); });
            console.log(`[DashboardPage fetch] Busca finalizada para ${startDate} a ${endDate}.`);
        }
    }, [dashboardService]); // Depende apenas do serviço (que é memoizado)

    const processCategoryData = (data, category) => { const categoryData = data.filter(item => item.category === category); const subCategoryTotals = {}; categoryData.forEach(item => { const subCatUpper = item.sub_category?.toUpperCase() || ''; const excludedKeywords = ['TOTAL', 'ACUMULADO', 'MEDIA', 'MÉDIA', 'GERAL', 'INTEGRADAS', 'DIGITADAS', 'NÃO DIGITADAS', 'ESTEIRA']; const isExcluded = excludedKeywords.some(ex => subCatUpper.includes(ex)); const value = parseBrazilianNumber(item.value); if (!isExcluded && value !== null) { const subCategoryKey = item.sub_category || 'Desconhecido'; subCategoryTotals[subCategoryKey] = (subCategoryTotals[subCategoryKey] || 0) + value; } }); const nonZeroEntries = Object.entries(subCategoryTotals).filter(([, value]) => value !== 0); const sortedEntries = nonZeroEntries.sort(([,a], [,b]) => b - a); return { categories: sortedEntries.map(e => e[0]), values: sortedEntries.map(e => e[1]), fullData: sortedEntries }; };
    const formatDateLabel = (dateString, mobile) => { if (!dateString) return ''; try { const date = new Date(dateString); if (isNaN(date.getTime())) return dateString; if (mobile) { const d = String(date.getUTCDate()).padStart(2, '0'); const m = date.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''); return `${d}/${m}`; } else { const d = String(date.getUTCDate()).padStart(2, '0'); const m = String(date.getUTCMonth() + 1).padStart(2, '0'); const y = date.getUTCFullYear(); return `${d}/${m}/${y}`; } } catch (e) { return dateString; } };
    const processAccountsTrendData = (rawData, dates) => { const accountsData = dates.map(date => { const d = rawData.find(i => i.metric_date === date && i.category === 'CONTAS ATIVAS' && i.sub_category?.toUpperCase().includes('ACUMULADO')); return d ? safeParseFloat(d.value) : null; }); const limitData = dates.map(date => { const d = rawData.find(i => i.metric_date === date && i.category === 'FAIXA DE LIMITE' && i.sub_category?.toUpperCase().includes('MEDIA')); return d ? safeParseFloat(d.value) : null; }); return { labels: dates, activeAccounts: accountsData, averageLimit: limitData }; };
    const processEsteiraTrendData = (rawData, dates) => { const esteiraData = rawData.filter(item => item.category === 'ESTEIRA'); const subCategories = [...new Set(esteiraData.map(i => i.sub_category).filter(s => s && !s.toUpperCase().includes('GERAL') && !s.toUpperCase().includes('ESTEIRA')))]; const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280']; let colorIndex = 0; const datasets = subCategories.map(subCat => { const color = colors[colorIndex++ % colors.length]; const seriesData = dates.map(date => { const entry = esteiraData.find(i => i.metric_date === date && i.sub_category === subCat); return entry ? safeParseFloat(entry.value) : null; }); if (!seriesData.some(v => v !== null)) return null; return { label: subCat, data: seriesData, borderColor: color, backgroundColor: `${color}33`, tension: 0.1, yAxisID: 'y', fill: true, spanGaps: true }; }).filter(dataset => dataset !== null); return { labels: dates, datasets: datasets }; };

    useEffect(() => {
        if (period.startDate && period.endDate) {
            fetchAndSetDashboardData(period.startDate, period.endDate);
        } else {
            console.warn("[DashboardPage useEffect] Datas do contexto inválidas:", period);
            setFetchError("Datas inválidas no contexto.");
            setIsLoading(false);
        }
    }, [period.startDate, period.endDate, fetchAndSetDashboardData]); // Usar período do contexto

    const handleUploadSuccess = useCallback(async (processedData) => {
        setIsLoading(true); setFetchError(null); setShowUploader(false); const supabase = getSupabaseClient(); const { dailyMetrics, summaryMetrics } = processedData; if (!Array.isArray(dailyMetrics) || !Array.isArray(summaryMetrics)) { setFetchError("Erro interno: Dados inválidos recebidos."); setIsLoading(false); return; }
        try {
            const upsertDaily = supabase.from('daily_proposal_metrics').upsert(dailyMetrics, { onConflict: 'metric_date, category, sub_category' }); const upsertSummary = supabase.from('monthly_summary_metrics').upsert(summaryMetrics, { onConflict: 'metric_month, category, sub_category' }); const [dailyResult, summaryResult] = await Promise.all([upsertDaily, upsertSummary]); let errors = []; if (dailyResult.error) errors.push(`Erro Diário: ${dailyResult.error.message}`); if (summaryResult.error) errors.push(`Erro Resumo: ${summaryResult.error.message}`); if (errors.length > 0) { setFetchError(errors.join('; ')); reportError({ daily: dailyResult.error, summary: summaryResult.error }, 'handleUploadSuccess'); } else { console.log("[handleUploadSuccess] Upload successful. Refreshing data..."); fetchAndSetDashboardData(period.startDate, period.endDate); }
        } catch (catchError) {
            reportError(catchError, 'handleUploadSuccess'); setFetchError(`Erro inesperado durante o salvamento: ${catchError.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [period.startDate, period.endDate, fetchAndSetDashboardData]); // Adicionar dependências do período

    const typedChartDisplayData = useMemo(() => { const fullData = dashboardData?.typedDetails?.fullData || []; if (fullData.length === 0) return { labels: [], datasets: [] }; const dataToShow = isTypedChartExpanded ? fullData : fullData.slice(0, 3); return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }] }; }, [dashboardData?.typedDetails?.fullData, isTypedChartExpanded]);
    const notTypedChartDisplayData = useMemo(() => { const fullData = dashboardData?.notTypedDetails?.fullData || []; if (fullData.length === 0) return { labels: [], datasets: [] }; const dataToShow = isNotTypedChartExpanded ? fullData : fullData.slice(0, 3); return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Não Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(255, 99, 132, 0.6)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] }; }, [dashboardData?.notTypedDetails?.fullData, isNotTypedChartExpanded]);


    const calculateLineChartSummary = useCallback((data, label, unit = null, decimals = 0) => {
        console.log(`[calculateLineChartSummary] Input data for ${label || 'metric'}:`, JSON.stringify(data));
        if (!data || !Array.isArray(data) || data.length === 0) { return { startValue: 'N/A', endValue: 'N/A', changePercent: 'N/A', averageValue: 'N/A', unit, decimals }; }


        let actualStartValue = 'N/A';
        for (let i = 0; i < data.length; i++) {
            if (typeof data[i] === 'number' && !isNaN(data[i])) {
                actualStartValue = data[i];
                break;
            }
        }

        let actualEndValue = 'N/A';
        for (let i = data.length - 1; i >= 0; i--) {
            if (typeof data[i] === 'number' && !isNaN(data[i])) {
                actualEndValue = data[i];
                break;
            }
        }


        const validValues = data.filter(v => typeof v === 'number' && !isNaN(v));
        console.log(`[calculateLineChartSummary] Filtered validValues for Average (${label}):`, validValues);
        const averageValue = validValues.length > 0
            ? validValues.reduce((sum, v) => sum + v, 0) / validValues.length
            : 'N/A';


        let changePercent = 'N/A';
        if (actualStartValue !== 'N/A' && actualEndValue !== 'N/A') {
            if (actualStartValue === 0) {
                changePercent = (actualEndValue === 0) ? 0 : Infinity;
            } else {
                changePercent = ((actualEndValue - actualStartValue) / Math.abs(actualStartValue)) * 100;
            }
        }

        const result = { startValue: actualStartValue, endValue: actualEndValue, changePercent, averageValue, unit, decimals };
        console.log(`[calculateLineChartSummary] Result for ${label || 'metric'}:`, result);
        return result;
    }, []);

    const accountsChartData = useMemo(() => { const rawLabels = dashboardData?.accountsTrends?.labels || []; const activeAccountsData = dashboardData?.accountsTrends?.activeAccounts || []; const averageLimitData = dashboardData?.accountsTrends?.averageLimit || []; console.log("[accountsChartData] Raw activeAccounts:", JSON.stringify(activeAccountsData)); console.log("[accountsChartData] Raw averageLimit:", JSON.stringify(averageLimitData)); if (rawLabels.length === 0) return { labels: [], datasets: [], summaryAccounts: null, summaryLimit: null }; const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView && isAccountsChartExpanded)); const pointRadius = rawLabels.length > 30 ? (isAccountsChartExpanded ? 1 : 0) : (isMobileView ? 2 : 3); const pointHoverRadius = rawLabels.length > 30 ? 3 : (isMobileView ? 4 : 5); const summaryAccounts = calculateLineChartSummary(activeAccountsData, 'Contas Ativas', null, 0); const summaryLimit = calculateLineChartSummary(averageLimitData, 'Limite Médio', 'currency', 0); return { labels: formattedLabels, datasets: [ { label: 'Contas Ativas (Acum.)', data: activeAccountsData, borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, yAxisID: 'y', fill: true, pointRadius, pointHoverRadius, spanGaps: true }, { label: 'Limite Médio (R$)', data: averageLimitData, borderColor: 'rgb(153, 102, 255)', backgroundColor: 'rgba(153, 102, 255, 0.2)', tension: 0.1, yAxisID: 'y1', fill: true, pointRadius, pointHoverRadius, spanGaps: true } ], summaryAccounts: summaryAccounts, summaryLimit: summaryLimit }; }, [dashboardData?.accountsTrends, isMobileView, isAccountsChartExpanded, calculateLineChartSummary]);
    const esteiraChartData = useMemo(() => { const rawLabels = dashboardData?.esteiraTrends?.labels || []; const datasetsRaw = dashboardData?.esteiraTrends?.datasets || []; if (rawLabels.length === 0 || datasetsRaw.length === 0) return { labels: [], datasets: [], summary: null }; const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView && isEsteiraChartExpanded)); const pointRadius = rawLabels.length > 30 ? (isEsteiraChartExpanded ? 1 : 0) : (isMobileView ? 2 : 3); const pointHoverRadius = rawLabels.length > 30 ? 3 : (isMobileView ? 4 : 5); const datasets = datasetsRaw.map(ds => ({ ...ds, pointRadius, pointHoverRadius })); const dailyTotals = rawLabels.map((_, index) => { let sum = 0; let hasValue = false; datasets.forEach(ds => { if (ds.data && typeof ds.data[index] === 'number' && !isNaN(ds.data[index])) { sum += ds.data[index]; hasValue = true; } }); return hasValue ? sum : null; }); console.log("[esteiraChartData] Calculated dailyTotals:", JSON.stringify(dailyTotals)); const summary = calculateLineChartSummary(dailyTotals, 'Esteira Total', null, 0); return { labels: formattedLabels, datasets: datasets, summary: summary }; }, [dashboardData?.esteiraTrends, isMobileView, isEsteiraChartExpanded, calculateLineChartSummary]);
    const commonBarChartOptions = useMemo(() => ({ indexAxis: isMobileView ? 'x' : 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { font: { size: isMobileView ? 10 : 12 } } }, y: { ticks: { font: { size: isMobileView ? 10 : 12 } } } }, plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12 } } }, barPercentage: 0.5, categoryPercentage: 0.8, maxBarThickness: 30, }), [isMobileView]);
    const lineChartBaseOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label || ''}: ${c.parsed.y !== null ? c.parsed.y.toLocaleString('pt-BR') : 'N/A'}` } } } }), []);
    const accountsChartOptions = useMemo(() => ({ ...lineChartBaseOptions, scales: { x: { ticks: { font: { size: 11 }, autoSkip: !isAccountsChartExpanded, maxRotation: isAccountsChartExpanded ? (isMobileView ? 60 : 45) : 0, padding: isAccountsChartExpanded ? 5 : 0 } }, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Contas Ativas', font: { size: 10 } }, ticks: { font: { size: 10 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Limite Médio (R$)', font: { size: 10 } }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, callback: v => v == null ? v : 'R$' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) } } }, plugins: { ...lineChartBaseOptions.plugins, tooltip: { callbacks: { label: (c) => `${c.dataset.label || ''}: ${c.parsed.y !== null ? (c.dataset.yAxisID === 'y1' ? 'R$' + c.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : c.parsed.y.toLocaleString('pt-BR')) : 'N/A'}` } } } }), [isMobileView, isAccountsChartExpanded, lineChartBaseOptions]);
    const esteiraChartOptions = useMemo(() => ({ ...lineChartBaseOptions, scales: { x: { ticks: { font: { size: 11 }, autoSkip: !isEsteiraChartExpanded, maxRotation: isEsteiraChartExpanded ? (isMobileView ? 60 : 45) : 0, padding: isEsteiraChartExpanded ? 5 : 0 } }, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Valor', font: { size: 10 } }, ticks: { font: { size: 10 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } } } }), [isMobileView, isEsteiraChartExpanded, lineChartBaseOptions]);
    const handleScroll = (direction, chartType) => { const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current; if (container) { const scrollAmount = container.clientWidth * 0.7; container.scrollBy({ left: direction === 'prev' ? -scrollAmount : scrollAmount, behavior: 'smooth' }); } };
    const toggleLineChartExpansion = (chartType) => { if (chartType === 'accounts') setIsAccountsChartExpanded(prev => !prev); else if (chartType === 'esteira') setIsEsteiraChartExpanded(prev => !prev); requestAnimationFrame(() => { if (chartType === 'accounts') { updateAccountsScrollButtons(); checkAccountsChartOverflow(); } else if (chartType === 'esteira') { updateEsteiraScrollButtons(); checkEsteiraChartOverflow(); } }); };
    const calculateBarChartHeight = (dataLength) => Math.max(400, dataLength * (isMobileView ? 35 : 25) + 80);
    const renderNoData = () => ( <div className="text-center py-16 text-gray-500"><i className="fas fa-info-circle text-5xl mb-4 text-gray-400"></i><p>Nenhum dado encontrado para o período selecionado.</p><p className="text-sm mt-2">Tente selecionar outro período ou carregue um relatório.</p></div> );
    const renderScrollButtons = (chartType) => { const showButtons = chartType === 'accounts' ? showAccountsScrollButtons : showEsteiraScrollButtons; const canPrev = chartType === 'accounts' ? canAccountsScrollPrev : canEsteiraScrollPrev; const canNext = chartType === 'accounts' ? canAccountsScrollNext : canEsteiraScrollNext; const showFade = chartType === 'accounts' ? showAccountsScrollFade : showEsteiraScrollFade; const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded; if (!isExpanded || !showButtons) return null; return ( <React.Fragment><button onClick={(e)=>{ e.preventDefault(); handleScroll('prev', chartType); }} disabled={!canPrev} className="absolute left-1 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full shadow-md p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Previous" data-name={`scroll-prev-button-${chartType}`}><i className="fas fa-chevron-left text-gray-600 text-xs w-3 h-3"></i></button><button onClick={(e)=>{ e.preventDefault(); handleScroll('next', chartType); }} disabled={!canNext} className="absolute right-1 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full shadow-md p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Next" data-name={`scroll-next-button-${chartType}`}><i className="fas fa-chevron-right text-gray-600 text-xs w-3 h-3"></i></button>{showFade && <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none"></div>}</React.Fragment> ); };
    const renderComparisonPercentage = (currentValue, previousValue) => { if (previousValue === null || previousValue === undefined || currentValue === null || currentValue === undefined) return <span className="text-gray-500">(- ant.)</span>; let percentageChange; let iconClass = 'fa-solid fa-minus'; let textClass = 'text-gray-500'; let changeText = '0.0%'; if (previousValue === 0) { percentageChange = (currentValue === 0) ? 0 : Infinity; } else { percentageChange = ((currentValue - previousValue) / Math.abs(previousValue)) * 100; } if (percentageChange === Infinity) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = '(+inf%)'; } else if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; } else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; } return ( <span className={`inline-flex items-center gap-1 ${textClass}`}><i className={iconClass} style={{ fontSize: '0.7em' }}></i><span>{changeText}</span><span className="text-gray-400 font-normal">(vs ant.)</span></span> ); };
    const formatKpiValue = (val, decimals = 0) => { if (val == null || val === undefined) return '-'; if (typeof val !== 'number' || isNaN(val)) return String(val); return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }); };
    const hasAccountsChartData = dashboardData?.accountsTrends?.labels?.length > 0; const hasEsteiraChartData = dashboardData?.esteiraTrends?.datasets?.length > 0; const hasTypedChartData = dashboardData?.typedDetails?.fullData?.length > 0; const hasNotTypedChartData = dashboardData?.notTypedDetails?.fullData?.length > 0; const hasSummaryData = dashboardData?.summary && Object.values(dashboardData.summary).some(v => v !== 0); const hasAnyData = hasAccountsChartData || hasEsteiraChartData || hasTypedChartData || hasNotTypedChartData || hasSummaryData;
    const showTypedExpandButton = hasTypedChartData && (dashboardData.typedDetails.fullData.length > 3); const showNotTypedExpandButton = hasNotTypedChartData && (dashboardData.notTypedDetails.fullData.length > 3);
    const showAccountsExpandButton = hasAccountsChartData && (accountsChartOverflowsWhenCollapsed || isMobileView);
    const showEsteiraExpandButton = hasEsteiraChartData && (esteiraChartOverflowsWhenCollapsed || isMobileView);

    return (
        <div className="dashboard-container pt-6 px-6 pb-8 bg-gray-100 min-h-screen">
            <LoadingOverlay isLoading={isLoading} message="Carregando dados..." />
            <Header user={user} onLogout={onLogout} onUploadClick={() => setShowUploader(prev => !prev)} isUploaderOpen={showUploader} />
            {showUploader && <div className="my-6"><FileUploader onFileUpload={handleUploadSuccess} user={user} onClose={() => setShowUploader(false)} /></div>}

            <PeriodFilter />

            {fetchError && !isLoading && <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"><i className="fas fa-exclamation-triangle mr-2"></i> {fetchError}</div>}

            {!isLoading && !fetchError && dashboardData?.summary && hasAnyData && (
                <React.Fragment>
                    <div className="kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 my-6">
                        <KPIPanel title="Propostas Digitadas (Período)" value={dashboardData.summary.typed} comparison={renderComparisonPercentage(dashboardData.summary.typed, dashboardData.summary.previousTyped)} />
                        <KPIPanel title="Propostas Não Digitadas (Período)" value={dashboardData.summary.notTyped} comparison={renderComparisonPercentage(dashboardData.summary.notTyped, dashboardData.summary.previousNotTyped)} />
                        <KPIPanel title="Contas Ativas (Último dia período)" value={dashboardData.summary.activeAccounts} comparison={dashboardData.summary.activeAccountsAvg} />
                        <KPIPanel title="Faixa Limite Total (Período)" value={dashboardData.summary.faixaLimiteTotal} unit="currency" />
                        <KPIPanel title="Média Diária Limite Total (Período)" value={dashboardData.summary.limitTotalAvg} unit="currency" />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                         <div className="bg-white p-4 rounded-lg shadow-md flex flex-col" style={{ minHeight: '450px' }}> <div className="flex justify-between items-center mb-2"> <h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Digitadas</h3> {showTypedExpandButton && (<button onClick={(e)=>{e.preventDefault();setIsTypedChartExpanded(prev => !prev);}} className="btn btn-secondary btn-xs py-1 px-2">{isTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}</button>)} </div> <div className="flex-grow relative" style={{ height: isTypedChartExpanded ? `${calculateBarChartHeight(typedChartDisplayData.labels.length)}px` : 'calc(100% - 30px)' }}> {hasTypedChartData ? <ChartComponent title="" type="bar" data={typedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>} </div> </div>
                         <div className="bg-white p-4 rounded-lg shadow-md flex flex-col" style={{ minHeight: '450px' }}> <div className="flex justify-between items-center mb-2"> <h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Não Digitadas</h3> {showNotTypedExpandButton && (<button onClick={(e)=>{e.preventDefault();setIsNotTypedChartExpanded(prev => !prev);}} className="btn btn-secondary btn-xs py-1 px-2">{isNotTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}</button>)} </div> <div className="flex-grow relative" style={{ height: isNotTypedChartExpanded ? `${calculateBarChartHeight(notTypedChartDisplayData.labels.length)}px` : 'calc(100% - 30px)' }}> {hasNotTypedChartData ? <ChartComponent title="" type="bar" data={notTypedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>} </div> </div>
                    </div>
                    <div className="grid grid-cols-1 gap-6 mb-6">
                        {hasAccountsChartData ? (
                             (isMobileView && !isAccountsChartExpanded) ? (
                                 <LineChartMobileSummary
                                     title="Evolução Contas/Limite (Resumo)"
                                     primaryMetricLabel="Contas Ativas"
                                     primarySummary={accountsChartData.summaryAccounts}
                                     secondaryMetricLabel="Limite Médio"
                                     secondarySummary={accountsChartData.summaryLimit}
                                     onExpandClick={(e) => { e.preventDefault(); toggleLineChartExpansion('accounts'); }}
                                     expandButtonText="Ver Gráfico"
                                 />
                             ) : (
                                <div className="bg-white p-4 rounded-lg shadow-md"> <div className="flex justify-between items-center mb-4"> <h3 className="text-base font-semibold text-gray-700">Evolução Contas Ativas e Limite Médio</h3> {showAccountsExpandButton && (<button onClick={(e) => { e.preventDefault(); toggleLineChartExpansion('accounts'); }} className="btn btn-secondary btn-xs py-1 px-2">{isAccountsChartExpanded ? (isMobileView ? 'Ver Resumo KPI' : 'Ver Resumo') : 'Ver Gráfico'}</button>)} </div> <div className="relative h-[400px]"> <div ref={accountsChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isAccountsChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="accounts-chart-scroll-container"> <div style={{ minWidth: isAccountsChartExpanded ? `${Math.max(600, (dashboardData?.accountsTrends?.labels?.length || 0) * (isMobileView ? 40 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="accounts-chart-inner-container"> <ChartComponent title="" type="line" data={accountsChartData} options={accountsChartOptions} /> </div> </div> {renderScrollButtons('accounts')} </div> </div>
                             )
                         ) : ( <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução de Contas/Limite.</div> )}
                    </div>
                     <div className="grid grid-cols-1 gap-6 mb-6">
                         {hasEsteiraChartData ? (
                              (isMobileView && !isEsteiraChartExpanded) ? (
                                  <LineChartMobileSummary
                                      title="Evolução da Esteira (Resumo Total)"
                                      primaryMetricLabel="Esteira Total"
                                      primarySummary={esteiraChartData.summary}

                                      onExpandClick={(e) => { e.preventDefault(); toggleLineChartExpansion('esteira'); }}
                                      expandButtonText="Ver Gráfico"
                                  />
                              ) : (
                                 <div className="bg-white p-4 rounded-lg shadow-md"> <div className="flex justify-between items-center mb-4"> <h3 className="text-base font-semibold text-gray-700">Evolução da Esteira</h3> {showEsteiraExpandButton && (<button onClick={(e) => { e.preventDefault(); toggleLineChartExpansion('esteira'); }} className="btn btn-secondary btn-xs py-1 px-2">{isEsteiraChartExpanded ? (isMobileView ? 'Ver Resumo KPI' : 'Ver Resumo') : 'Ver Gráfico'}</button>)} </div> <div className="relative h-[400px]"> <div ref={esteiraChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isEsteiraChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="esteira-chart-scroll-container"> <div style={{ minWidth: isEsteiraChartExpanded ? `${Math.max(600, (dashboardData?.esteiraTrends?.labels?.length || 0) * (isMobileView ? 40 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="esteira-chart-inner-container"> <ChartComponent title="" type="line" data={esteiraChartData} options={esteiraChartOptions} /> </div> </div> {renderScrollButtons('esteira')} </div> </div>
                              )
                          ) : ( <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução da Esteira.</div> )}
                    </div>
                </React.Fragment>
            )}
            {!isLoading && !fetchError && (!dashboardData || !hasAnyData) && renderNoData()}
        </div>
    );
}

export default DashboardPage;