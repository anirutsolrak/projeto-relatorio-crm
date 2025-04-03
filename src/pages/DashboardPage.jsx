import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
// Importa as funções diretamente, como está agora, isso é bom.
import { getRawMetricsData, getCalculatedKPIs } from '../utils/dashboardService';
import getSupabaseClient from '../utils/supabaseClient';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover';

function DashboardPage({ user, onLogout }) {
    // *** CORREÇÃO PRINCIPAL: Estabilizar reportError ***
    const reportError = useCallback((error, context = 'DashboardPage') => {
        console.error(`[${context} Error]:`, error);
    }, []); // Array de dependências vazio torna esta função estável

    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState(() => {
        const today = new Date().toISOString().split('T')[0];
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 6);
        return { startDate: defaultStartDate.toISOString().split('T')[0], endDate: today };
    });

    const [dashboardData, setDashboardData] = useState({
        summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 },
        typedDetails: { categories: [], values: [], fullData: [] },
        notTypedDetails: { categories: [], values: [], fullData: [] },
        accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] },
        esteiraTrends: { labels: [], datasets: [] }
    });
    const [showUploader, setShowUploader] = useState(false);
    const [fetchError, setFetchError] = useState(null);
    const [isTypedChartExpanded, setIsTypedChartExpanded] = useState(false);
    const [isNotTypedChartExpanded, setIsNotTypedChartExpanded] = useState(false);
    const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);
    const [isAccountsChartExpanded, setIsAccountsChartExpanded] = useState(false);
    const [isEsteiraChartExpanded, setIsEsteiraChartExpanded] = useState(false);

    const accountsChartScrollContainerRef = useRef(null);
    const esteiraChartScrollContainerRef = useRef(null);

    // Estados de scroll... (sem alterações)
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

    // --- Helper Functions (Memoized/Stable) ---
    const debounce = useMemo(() => (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout); timeout = setTimeout(later, wait);
        };
    }, []);

    const parseBrazilianNumber = useCallback((value) => {
         if (value === null || value === undefined) return null;
         if (typeof value === 'number' && !isNaN(value)) return value;
         const valueStr = String(value).trim();
         if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?'].includes(valueStr.toUpperCase())) { return null; }
         const cleanedStr = valueStr.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
         const number = parseFloat(cleanedStr);
         return isNaN(number) ? null : number;
     }, []);

    const processCategoryData = useCallback((data, category) => {
         const categoryData = data.filter(item => item.category === category);
         const subCategoryTotals = {};
         categoryData.forEach(item => {
             const subCatUpper = item.sub_category?.toUpperCase() || '';
             const excludedKeywords = ['TOTAL', 'ACUMULADO', 'MEDIA', 'MÉDIA', 'GERAL', 'INTEGRADAS', 'DIGITADAS', 'NÃO DIGITADAS', 'ESTEIRA'];
             const isExcluded = excludedKeywords.some(ex => subCatUpper.includes(ex));
             const value = parseBrazilianNumber(item.value);
             if (!isExcluded && value !== null) {
                  const subCategoryKey = item.sub_category || 'Desconhecido';
                  subCategoryTotals[subCategoryKey] = (subCategoryTotals[subCategoryKey] || 0) + value;
              }
         });
         const nonZeroEntries = Object.entries(subCategoryTotals).filter(([, value]) => value !== 0);
         const sortedEntries = nonZeroEntries.sort(([,a], [,b]) => b - a);
         return { categories: sortedEntries.map(e => e[0]), values: sortedEntries.map(e => e[1]), fullData: sortedEntries };
     }, [parseBrazilianNumber]);

    const formatDateLabel = useCallback((dateString, mobile) => {
        if (!dateString) return '';
        try { const parts = dateString.split('-'); if (parts.length !== 3) return dateString; const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))); if (isNaN(date.getTime())) return dateString;
            if (mobile) { const d = String(date.getUTCDate()).padStart(2, '0'); const m = date.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', ''); return `${d}/${m}`; }
            else { const d = String(date.getUTCDate()).padStart(2, '0'); const m = String(date.getUTCMonth() + 1).padStart(2, '0'); const y = date.getUTCFullYear(); return `${d}/${m}/${y}`; }
        } catch (e) { return dateString; }
    }, []);

    const processEsteiraTrendData = useCallback((data, dates) => {
        const esteiraData = data.filter(item => item.category === 'ESTEIRA'); const subCategories = [...new Set(esteiraData.map(i => i.sub_category).filter(s => s && !s.toUpperCase().includes('GERAL') && !s.toUpperCase().includes('ESTEIRA')))];
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280']; let colorIndex = 0;
        const datasets = subCategories.map(subCat => {
            const color = colors[colorIndex++ % colors.length]; const seriesData = dates.map(date => { const entry = esteiraData.find(i => i.metric_date === date && i.sub_category === subCat); return entry ? parseBrazilianNumber(entry.value) : null; }); if (!seriesData.some(v => v !== null)) return null;
            return { label: subCat, data: seriesData, borderColor: color, backgroundColor: `${color}33`, tension: 0.1, yAxisID: 'y', fill: true, pointRadius: dates.length > 30 && !isEsteiraChartExpanded ? 0 : (dates.length > 30 ? 1 : 3), pointHoverRadius: dates.length > 30 ? 3 : 5, spanGaps: true };
        }).filter(dataset => dataset !== null);
        return { labels: dates, datasets: datasets };
    }, [parseBrazilianNumber, isEsteiraChartExpanded]); // Dependência em isEsteiraChartExpanded é aceitável aqui

    // --- Data Fetching Function (Stable with corrected reportError dependency) ---
    const fetchAndSetDashboardData = useCallback(async (startDate, endDate) => {
        console.log(`%c Fetching data for: ${startDate} to ${endDate}`, 'color: blue; font-weight: bold;');
        setIsLoading(true);
        setFetchError(null);
        setDashboardData({ // Reset
             summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 },
             typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] }
        });
        setIsAccountsChartExpanded(false); setIsTypedChartExpanded(false); setIsNotTypedChartExpanded(false); setIsEsteiraChartExpanded(false);

        try {
            // Usando as funções importadas diretamente
            const [kpiResult, rawDataResult] = await Promise.all([
                getCalculatedKPIs(startDate, endDate), // Função importada
                getRawMetricsData(startDate, endDate)  // Função importada
            ]);

            if (kpiResult.error) throw new Error(`Erro ao buscar KPIs: ${kpiResult.error.message || kpiResult.error}`);
            if (rawDataResult.error) throw new Error(`Erro ao buscar dados brutos: ${rawDataResult.error.message || rawDataResult.error}`);
            const kpiData = kpiResult.data;
            const rawData = rawDataResult.data;

            if (!kpiData) throw new Error('API de KPIs não retornou dados.');

            let processedChartData = { typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] } };
            if (rawData && rawData.length > 0) {
                 processedChartData.typedDetails = processCategoryData(rawData, 'DIGITADAS');
                 processedChartData.notTypedDetails = processCategoryData(rawData, 'NÃO DIGITADAS');
                 const dates = [...new Set(rawData.map(item => item.metric_date))].sort((a, b) => new Date(a) - new Date(b));
                 processedChartData.accountsTrends = {
                     labels: dates,
                     activeAccounts: dates.map(date => {
                         const d = rawData.find(i => i.metric_date === date && i.category === 'CONTAS ATIVAS' && i.sub_category?.includes('ACUMULADO'));
                         return d ? parseBrazilianNumber(d.value) : null;
                     }),
                     averageLimit: dates.map(date => {
                         const d = rawData.find(i => i.metric_date === date && i.category === 'FAIXA DE LIMITE' && i.sub_category?.includes('MEDIA'));
                         return d ? parseBrazilianNumber(d.value) : null;
                     })
                 };
                processedChartData.esteiraTrends = processEsteiraTrendData(rawData, dates);
            }

            setDashboardData({
                summary: {
                    typed: kpiData.current_typed_sum || 0, notTyped: kpiData.current_not_typed_sum || 0, activeAccounts: kpiData.last_active_accounts_in_period || 0, activeAccountsAvg: kpiData.current_active_accounts_avg || 0, faixaLimiteTotal: kpiData.current_limit_total_sum || 0, limitTotalAvg: kpiData.current_limit_total_avg || 0, previousTyped: kpiData.previous_typed_sum || 0, previousNotTyped: kpiData.previous_not_typed_sum || 0
                },
                ...processedChartData
            });
             console.log("%c Data fetch successful.", 'color: green;');

        } catch (error) {
            reportError(error, 'fetchAndSetDashboardData'); // Usa o reportError estável
            setFetchError(`Falha ao carregar dados: ${error.message}`);
            setDashboardData({ // Reset on error
                summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 },
                typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] }
            });
        } finally {
            setIsLoading(false);
        }
    // Dependências: Funções auxiliares estáveis (incluindo o reportError agora estável)
    }, [processCategoryData, parseBrazilianNumber, processEsteiraTrendData, reportError]);

    // --- Main Data Fetching Effect (Mantido, agora com fetchAndSetDashboardData estável) ---
    useEffect(() => {
        if (period.startDate && period.endDate) {
            fetchAndSetDashboardData(period.startDate, period.endDate);
        } else {
            console.warn("Period dates are invalid, skipping fetch.");
             setIsLoading(false);
             setFetchError("Período inválido selecionado.");
        }
    // Depender da função fetch estável é a prática recomendada
    }, [period.startDate, period.endDate, fetchAndSetDashboardData]);

    // --- UI Effects (Scroll, Overflow, Resize - sem alterações) ---
    const updateScrollButtons = useCallback((chartType) => {
        const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current;
        const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded;
        const setShowButtons = chartType === 'accounts' ? setShowAccountsScrollButtons : setShowEsteiraScrollButtons;
        const setCanPrev = chartType === 'accounts' ? setCanAccountsScrollPrev : setCanEsteiraScrollPrev;
        const setCanNext = chartType === 'accounts' ? setCanAccountsScrollNext : setCanEsteiraScrollNext;
        const setShowFade = chartType === 'accounts' ? setShowAccountsScrollFade : setShowEsteiraScrollFade;
        if (!container || !isExpanded) { setShowButtons(false); setShowFade(false); setCanPrev(false); setCanNext(false); return; }
        const tolerance = 5; const scrollLeft = Math.round(container.scrollLeft); const scrollWidth = Math.round(container.scrollWidth); const clientWidth = Math.round(container.clientWidth);
        const hasHorizontalOverflow = scrollWidth > clientWidth + tolerance; const isScrolledToStart = scrollLeft <= tolerance; const isScrolledToEnd = scrollLeft >= scrollWidth - clientWidth - tolerance;
        setShowButtons(hasHorizontalOverflow); setCanPrev(hasHorizontalOverflow && !isScrolledToStart); setCanNext(hasHorizontalOverflow && !isScrolledToEnd); setShowFade(hasHorizontalOverflow && !isScrolledToEnd);
    }, [isAccountsChartExpanded, isEsteiraChartExpanded]);

    const checkChartOverflow = useCallback((chartType) => {
        const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current;
        const labels = chartType === 'accounts' ? dashboardData?.accountsTrends?.labels : dashboardData?.esteiraTrends?.labels;
        const setOverflowState = chartType === 'accounts' ? setAccountsChartOverflowsWhenCollapsed : setEsteiraChartOverflowsWhenCollapsed;
        if (!container || !labels?.length) { setOverflowState(false); return; }
        const estimatedWidthPerPoint = isMobileView ? 25 : 80;
        const totalEstimatedWidth = labels.length * estimatedWidthPerPoint;
        const containerWidth = container.clientWidth;
        const tolerance = 5;
        const overflows = totalEstimatedWidth > containerWidth + tolerance;
        setOverflowState(overflows);
     }, [dashboardData?.accountsTrends?.labels, dashboardData?.esteiraTrends?.labels, isMobileView]);

    const checkAccountsChartOverflow = useCallback(() => checkChartOverflow('accounts'), [checkChartOverflow]);
    const checkEsteiraChartOverflow = useCallback(() => checkChartOverflow('esteira'), [checkChartOverflow]);
    const updateAccountsScrollButtons = useCallback(() => updateScrollButtons('accounts'), [updateScrollButtons]);
    const updateEsteiraScrollButtons = useCallback(() => updateScrollButtons('esteira'), [updateScrollButtons]);

    const debouncedUpdateAccountsScrollButtons = useMemo(() => debounce(updateAccountsScrollButtons, 150), [debounce, updateAccountsScrollButtons]);
    const debouncedCheckAccountsChartOverflow = useMemo(() => debounce(checkAccountsChartOverflow, 150), [debounce, checkAccountsChartOverflow]);
    const debouncedUpdateEsteiraScrollButtons = useMemo(() => debounce(updateEsteiraScrollButtons, 150), [debounce, updateEsteiraScrollButtons]);
    const debouncedCheckEsteiraChartOverflow = useMemo(() => debounce(checkEsteiraChartOverflow, 150), [debounce, checkEsteiraChartOverflow]);

    useEffect(() => { // Resize handling
        const handleResize = () => {
            const mobile = window.innerWidth < 768; setIsMobileView(mobile);
            debouncedUpdateAccountsScrollButtons(); debouncedCheckAccountsChartOverflow();
            debouncedUpdateEsteiraScrollButtons(); debouncedCheckEsteiraChartOverflow();
        }
        window.addEventListener('resize', handleResize); handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, [debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow]);

    useEffect(() => { // Scroll listeners and initial checks
        const accountsContainer = accountsChartScrollContainerRef.current; const esteiraContainer = esteiraChartScrollContainerRef.current;
        let accountsObserver, esteiraObserver;
        const setupObservers = (container, isExpanded, updateFunc, checkFunc, debouncedUpdateFunc, debouncedCheckFunc, chartType) => {
            if (container) {
                 requestAnimationFrame(() => { checkFunc(); updateFunc(); });
                const scrollHandler = debouncedUpdateFunc;
                if (isExpanded) { container.addEventListener('scroll', scrollHandler, { passive: true }); }
                else { container.removeEventListener('scroll', scrollHandler); }
                const observer = new ResizeObserver(() => { debouncedCheckFunc(); debouncedUpdateFunc(); });
                observer.observe(container);
                const innerChartContainer = container.querySelector(`[data-name="${chartType}-chart-inner-container"]`);
                 if (innerChartContainer) observer.observe(innerChartContainer);
                return { cleanup: () => { container.removeEventListener('scroll', scrollHandler); if (observer) observer.disconnect(); } };
            }
            return { cleanup: () => {} };
        };
         const { cleanup: cleanupAccounts } = setupObservers( accountsContainer, isAccountsChartExpanded, updateAccountsScrollButtons, checkAccountsChartOverflow, debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, 'accounts');
         const { cleanup: cleanupEsteira } = setupObservers( esteiraContainer, isEsteiraChartExpanded, updateEsteiraScrollButtons, checkEsteiraChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow, 'esteira');
        return () => { cleanupAccounts(); cleanupEsteira(); };
    }, [dashboardData, isMobileView, isAccountsChartExpanded, isEsteiraChartExpanded,
          updateAccountsScrollButtons, checkAccountsChartOverflow, debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow,
          updateEsteiraScrollButtons, checkEsteiraChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow]);

    // --- Other Callbacks (Period Change, Upload Success - sem alterações) ---
    const handlePeriodChange = useCallback((newPeriod) => { setPeriod(newPeriod); }, []);
    const handleUploadSuccess = useCallback(async (processedData) => {
        setIsLoading(true); setFetchError(null); setShowUploader(false);
        const supabase = getSupabaseClient(); const { dailyMetrics, summaryMetrics } = processedData;
        console.log("--- Uploading Data ---"); console.log("Daily Metrics Count:", dailyMetrics.length); console.log("Summary Metrics Count:", summaryMetrics.length); console.log("-----------------------");
        if (!Array.isArray(dailyMetrics) || !Array.isArray(summaryMetrics)) { reportError(new Error("Invalid processed data format"), 'handleUploadSuccess'); setFetchError("Erro interno ao processar dados do arquivo."); setIsLoading(false); return; }
        if (dailyMetrics.length === 0 && summaryMetrics.length === 0) { console.warn("No metrics extracted to upload."); setIsLoading(false); return; }
        try {
             const results = await Promise.allSettled([ supabase.from('daily_proposal_metrics').upsert(dailyMetrics, { onConflict: 'metric_date, category, sub_category' }), supabase.from('monthly_summary_metrics').upsert(summaryMetrics, { onConflict: 'metric_month, category, sub_category' }) ]);
             const dailyResult = results[0]; const summaryResult = results[1]; let errors = [];
            if (dailyResult.status === 'rejected' || (dailyResult.status === 'fulfilled' && dailyResult.value.error)) { const error = dailyResult.status === 'rejected' ? dailyResult.reason : dailyResult.value.error; reportError(error, 'upsertDaily'); errors.push(`Erro dados diários: ${error.message}`); }
             else { console.log("Upsert diário concluído:", dailyResult.value.status, dailyResult.value.statusText); }
             if (summaryResult.status === 'rejected' || (summaryResult.status === 'fulfilled' && summaryResult.value.error)) { const error = summaryResult.status === 'rejected' ? summaryResult.reason : summaryResult.value.error; reportError(error, 'upsertSummary'); errors.push(`Erro dados resumo: ${error.message}`); }
             else { console.log("Upsert de resumo concluído:", summaryResult.value.status, summaryResult.value.statusText); }
             if (errors.length > 0) { setFetchError(errors.join('; ')); setIsLoading(false); }
             else { console.log("Dados diários e de resumo salvos com sucesso."); fetchAndSetDashboardData(period.startDate, period.endDate); } // Re-fetch explicitly
        } catch (catchError) { reportError(catchError, 'handleUploadSuccessCatch'); setFetchError(`Erro inesperado pós-upload: ${catchError.message}`); setIsLoading(false); }
     }, [fetchAndSetDashboardData, period.startDate, period.endDate, reportError]);

     // --- Memoized Chart Data & Options (sem alterações) ---
     const typedChartDisplayData = useMemo(() => { const fullData = dashboardData?.typedDetails?.fullData || []; if (fullData.length === 0) return { labels: [], datasets: [] }; const dataToShow = isTypedChartExpanded ? fullData : fullData.slice(0, 3); return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Propostas Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }] }; }, [dashboardData?.typedDetails?.fullData, isTypedChartExpanded]);
     const notTypedChartDisplayData = useMemo(() => { const fullData = dashboardData?.notTypedDetails?.fullData || []; if (fullData.length === 0) return { labels: [], datasets: [] }; const dataToShow = isNotTypedChartExpanded ? fullData : fullData.slice(0, 3); return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Propostas Não Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(255, 99, 132, 0.6)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] }; }, [dashboardData?.notTypedDetails?.fullData, isNotTypedChartExpanded]);
     const accountsChartData = useMemo(() => { const rawLabels = dashboardData?.accountsTrends?.labels || []; if (rawLabels.length === 0) return { labels: [], datasets: [] }; const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView)); return { labels: formattedLabels, datasets: [ { label: 'Contas Ativas (Acum.)', data: dashboardData?.accountsTrends?.activeAccounts || [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, yAxisID: 'y', fill: true, pointRadius: rawLabels.length > 30 && !isAccountsChartExpanded ? 0 : (rawLabels.length > 30 ? 1 : 3), pointHoverRadius: rawLabels.length > 30 ? 3 : 5, spanGaps: true }, { label: 'Limite Médio (R$)', data: dashboardData?.accountsTrends?.averageLimit || [], borderColor: 'rgb(153, 102, 255)', backgroundColor: 'rgba(153, 102, 255, 0.2)', tension: 0.1, yAxisID: 'y1', fill: true, pointRadius: rawLabels.length > 30 && !isAccountsChartExpanded ? 0 : (rawLabels.length > 30 ? 1 : 3), pointHoverRadius: rawLabels.length > 30 ? 3 : 5, spanGaps: true } ] }; }, [dashboardData?.accountsTrends, isMobileView, isAccountsChartExpanded, formatDateLabel]);
     const esteiraChartData = useMemo(() => { const rawLabels = dashboardData?.esteiraTrends?.labels || []; if (rawLabels.length === 0) return { labels: [], datasets: [] }; const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView)); return { labels: formattedLabels, datasets: dashboardData?.esteiraTrends?.datasets || [] }; }, [dashboardData?.esteiraTrends, isMobileView, formatDateLabel]);

    const commonBarChartOptions = useMemo(() => ({ indexAxis: 'y', responsive: true, maintainAspectRatio: false, scales: { x: { beginAtZero: true, ticks: { font: { size: 15 } } }, y: { ticks: { font: { size: 15 } } } }, plugins: { legend: { display: false } }, barPercentage: 0.3, categoryPercentage: 0.8, maxBarThickness: 35, }), []);
    const accountsChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { font: { size: 13 }, autoSkip: !isAccountsChartExpanded, maxRotation: isAccountsChartExpanded ? (isMobileView ? 75 : 45) : (isMobileView ? 60: 0), minRotation: isAccountsChartExpanded ? (isMobileView ? 60 : 0) : 0, padding: isAccountsChartExpanded ? 10 : 0, } }, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Contas Ativas (Acum.)', font: { weight: 'bold', size: 12 } }, ticks: { font: { size: 11 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } }, y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Limite Médio (R$)', font: { weight: 'bold', size: 12 } }, grid: { drawOnChartArea: false }, ticks: { font: { size: 11 }, callback: v => v == null ? v : 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) } } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } }, tooltip: { callbacks: { label: function(c) { let l = c.dataset.label || ''; if(l) l += ': '; if (c.parsed?.y !== null && c.parsed?.y !== undefined) { l += c.dataset.yAxisID === 'y1' ? 'R$ ' + c.parsed.y.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : c.parsed.y.toLocaleString('pt-BR'); } else l += 'N/A'; return l; } } } } }), [isMobileView, isAccountsChartExpanded]);
    const esteiraChartOptions = useMemo(() => ({ responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { x: { ticks: { font: { size: 13 }, autoSkip: !isEsteiraChartExpanded, maxRotation: isEsteiraChartExpanded ? (isMobileView ? 75 : 45) : (isMobileView ? 60: 0), minRotation: isEsteiraChartExpanded ? (isMobileView ? 60 : 0) : 0, padding: isEsteiraChartExpanded ? 10 : 0, } }, y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Valor', font: { weight: 'bold', size: 12 } }, ticks: { font: { size: 11 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } } }, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } }, tooltip: { callbacks: { label: function(c) { let l = c.dataset.label || ''; if(l) l += ': '; if (c.parsed?.y !== null && c.parsed?.y !== undefined) l += c.parsed.y.toLocaleString('pt-BR'); else l += 'N/A'; return l; } } } } }), [isMobileView, isEsteiraChartExpanded]);

    // --- Memoized UI Elements & Logic (sem alterações) ---
    const handleScroll = useCallback((direction, chartType) => { const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current; if (container) { const scrollAmount = container.clientWidth * 0.7; container.scrollBy({ left: direction === 'prev' ? -scrollAmount : scrollAmount, behavior: 'smooth' }); } }, []);
    const toggleLineChartExpansion = useCallback((chartType) => { if (chartType === 'accounts') setIsAccountsChartExpanded(prev => !prev); else if (chartType === 'esteira') setIsEsteiraChartExpanded(prev => !prev); }, []);
    const renderNoData = useCallback(() => ( <div className="text-center py-12 text-gray-500"><i className="fas fa-info-circle text-4xl mb-4"></i><p>Nenhum dado encontrado para o período selecionado.</p><p className="text-sm mt-2">Tente selecionar outro período ou carregue um relatório.</p></div> ), []);
    const hasAccountsChartData = useMemo(() => dashboardData?.accountsTrends?.labels?.length > 0, [dashboardData?.accountsTrends?.labels]);
    const hasEsteiraChartData = useMemo(() => dashboardData?.esteiraTrends?.datasets?.length > 0, [dashboardData?.esteiraTrends?.datasets]);
    const hasTypedChartData = useMemo(() => dashboardData?.typedDetails?.fullData?.length > 0, [dashboardData?.typedDetails?.fullData]);
    const hasNotTypedChartData = useMemo(() => dashboardData?.notTypedDetails?.fullData?.length > 0, [dashboardData?.notTypedDetails?.fullData]);
    const hasAnyData = useMemo(() => hasAccountsChartData || hasEsteiraChartData || hasTypedChartData || hasNotTypedChartData || dashboardData?.summary?.typed > 0 || dashboardData?.summary?.notTyped > 0 || dashboardData?.summary?.activeAccounts > 0 || dashboardData?.summary?.activeAccountsAvg > 0, [hasAccountsChartData, hasEsteiraChartData, hasTypedChartData, hasNotTypedChartData, dashboardData?.summary]);
    const showTypedExpandButton = useMemo(() => hasTypedChartData && (dashboardData.typedDetails.fullData.length > 3), [hasTypedChartData, dashboardData?.typedDetails?.fullData]);
    const showNotTypedExpandButton = useMemo(() => hasNotTypedChartData && (dashboardData.notTypedDetails.fullData.length > 3), [hasNotTypedChartData, dashboardData?.notTypedDetails?.fullData]);
    const showAccountsExpandButton = useMemo(() => hasAccountsChartData && accountsChartOverflowsWhenCollapsed, [hasAccountsChartData, accountsChartOverflowsWhenCollapsed]);
    const showEsteiraExpandButton = useMemo(() => hasEsteiraChartData && esteiraChartOverflowsWhenCollapsed, [hasEsteiraChartData, esteiraChartOverflowsWhenCollapsed]);
    const calculateBarChartHeight = useCallback((dataLength) => Math.max(450, dataLength * 30 + 80), []);
    const renderScrollButtons = useCallback((chartType) => { const showButtons = chartType === 'accounts' ? showAccountsScrollButtons : showEsteiraScrollButtons; const canPrev = chartType === 'accounts' ? canAccountsScrollPrev : canEsteiraScrollPrev; const canNext = chartType === 'accounts' ? canAccountsScrollNext : canEsteiraScrollNext; const showFade = chartType === 'accounts' ? showAccountsScrollFade : showEsteiraScrollFade; const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded; if (!isExpanded || !showButtons) return null; return ( <React.Fragment><button onClick={() => handleScroll('prev', chartType)} disabled={!canPrev} className="absolute left-0 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-70 hover:bg-opacity-100 rounded-full shadow-md p-2 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Previous" data-name={`scroll-prev-button-${chartType}`}><i className="fas fa-chevron-left text-gray-600 text-sm w-4 h-4"></i></button><button onClick={() => handleScroll('next', chartType)} disabled={!canNext} className="absolute right-0 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-70 hover:bg-opacity-100 rounded-full shadow-md p-2 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Next" data-name={`scroll-next-button-${chartType}`}><i className="fas fa-chevron-right text-gray-600 text-sm w-4 h-4"></i></button>{showFade && <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none"></div>}</React.Fragment> ); }, [showAccountsScrollButtons, showEsteiraScrollButtons, canAccountsScrollPrev, canEsteiraScrollPrev, canAccountsScrollNext, canEsteiraScrollNext, showAccountsScrollFade, showEsteiraScrollFade, isAccountsChartExpanded, isEsteiraChartExpanded, handleScroll]);
    const renderComparisonPercentage = useCallback((currentValue, previousValue) => { if (previousValue === null || previousValue === undefined || currentValue === null || currentValue === undefined) return <span className="text-gray-500">(- ant.)</span>; let percentageChange; let iconClass = 'fa-solid fa-equals'; let textClass = 'text-gray-500'; let changeText = '0.0%'; if (previousValue === 0) percentageChange = (currentValue === 0) ? 0 : null; else percentageChange = ((currentValue - previousValue) / previousValue) * 100; if (percentageChange === null) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = '(+inf%)'; } else if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; } else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; } return ( <span className={`${textClass} inline-flex items-center gap-1`}><i className={iconClass}></i><span>{changeText}</span><span className="text-gray-400">(Periodo anterior)</span></span> ); }, []);

    // --- Render ---
    return (
        <div className="dashboard-container pt-6 px-6 pb-8 bg-gray-100 min-h-full">
            <LoadingOverlay isLoading={isLoading} message="Carregando dados..." />
            <Header user={user} onLogout={onLogout} onUploadClick={() => setShowUploader(prev => !prev)} isUploaderOpen={showUploader} />
            {showUploader && <div className="my-6"><FileUploader onFileUpload={handleUploadSuccess} user={user} onClose={() => setShowUploader(false)} /></div>}
            <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={period} />
            {fetchError && !isLoading && <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded"><i className="fas fa-exclamation-triangle mr-2"></i> {fetchError}</div>}

            {!isLoading && !fetchError && dashboardData?.summary && hasAnyData && (
                <React.Fragment>
                    {/* KPI Panels */}
                    <div className="kpi-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 my-6">
                         <KPIPanel title="Propostas Digitadas (Período)" value={dashboardData.summary.typed} comparison={renderComparisonPercentage(dashboardData.summary.typed, dashboardData.summary.previousTyped)} />
                         <KPIPanel title="Propostas Não Digitadas (Período)" value={dashboardData.summary.notTyped} comparison={renderComparisonPercentage(dashboardData.summary.notTyped, dashboardData.summary.previousNotTyped)} />
                         <KPIPanel title="Contas Ativas (Último dia período)" value={dashboardData.summary.activeAccounts} comparison={dashboardData.summary.activeAccountsAvg} />
                         <KPIPanel title="Faixa Limite Total (Período)" value={dashboardData.summary.faixaLimiteTotal} unit="currency" />
                         <KPIPanel title="Média Diária Limite Total (Período)" value={dashboardData.summary.limitTotalAvg} unit="currency" />
                    </div>

                    {/* Bar Charts */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                         <div className="bg-white p-4 rounded-lg shadow-md flex flex-col" style={{ minHeight: '450px' }}>
                             <div className="flex justify-between items-center mb-2"><h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Digitadas</h3>{showTypedExpandButton && <button onClick={() => setIsTypedChartExpanded(!isTypedChartExpanded)} className="btn btn-secondary btn-xs py-1 px-2">{isTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}</button>}</div>
                             <div className="flex-grow relative" style={{ height: isTypedChartExpanded ? `${calculateBarChartHeight(typedChartDisplayData.labels.length)}px` : '100%' }}>{hasTypedChartData ? <ChartComponent type="bar" data={typedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>}</div>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col" style={{ minHeight: '450px' }}>
                             <div className="flex justify-between items-center mb-2"><h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Não Digitadas</h3>{showNotTypedExpandButton && <button onClick={() => setIsNotTypedChartExpanded(!isNotTypedChartExpanded)} className="btn btn-secondary btn-xs py-1 px-2">{isNotTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}</button>}</div>
                             <div className="flex-grow relative" style={{ height: isNotTypedChartExpanded ? `${calculateBarChartHeight(notTypedChartDisplayData.labels.length)}px` : '100%' }}>{hasNotTypedChartData ? <ChartComponent type="bar" data={notTypedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>}</div>
                         </div>
                    </div>

                    {/* Line Charts */}
                     <div className="grid grid-cols-1 gap-6 mb-6">
                         {hasAccountsChartData ? (
                            <div className="bg-white p-4 rounded-lg shadow-md">
                                 <div className="flex justify-between items-center mb-4"><h3 className="text-base font-semibold text-gray-700">Evolução de Contas Ativas (Acum.) e Limite Médio</h3>{showAccountsExpandButton && <button onClick={() => toggleLineChartExpansion('accounts')} className="btn btn-secondary btn-xs py-1 px-2">{isAccountsChartExpanded ? 'Ver Resumo' : 'Ver Tudo'}</button>}</div>
                                 <div className="relative h-[400px]"><div ref={accountsChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isAccountsChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="accounts-chart-scroll-container"><div style={{ minWidth: isAccountsChartExpanded ? `${Math.max(600, (dashboardData?.accountsTrends?.labels?.length || 0) * (isMobileView ? 25 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="accounts-chart-inner-container"><ChartComponent type="line" data={accountsChartData} options={accountsChartOptions} /></div></div>{renderScrollButtons('accounts')}</div>
                             </div>
                        ) : ( <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução de Contas/Limite para exibir.</div> )}
                     </div>
                     <div className="grid grid-cols-1 gap-6 mb-6">
                          {hasEsteiraChartData ? (
                             <div className="bg-white p-4 rounded-lg shadow-md">
                                  <div className="flex justify-between items-center mb-4"><h3 className="text-base font-semibold text-gray-700">Evolução da Esteira</h3>{showEsteiraExpandButton && <button onClick={() => toggleLineChartExpansion('esteira')} className="btn btn-secondary btn-xs py-1 px-2">{isEsteiraChartExpanded ? 'Ver Resumo' : 'Ver Tudo'}</button>}</div>
                                  <div className="relative h-[400px]"><div ref={esteiraChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isEsteiraChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="esteira-chart-scroll-container"><div style={{ minWidth: isEsteiraChartExpanded ? `${Math.max(600, (dashboardData?.esteiraTrends?.labels?.length || 0) * (isMobileView ? 25 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="esteira-chart-inner-container"><ChartComponent type="line" data={esteiraChartData} options={esteiraChartOptions} /></div></div>{renderScrollButtons('esteira')}</div>
                              </div>
                         ) : ( <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução da Esteira para exibir.</div> )}
                      </div>
                </React.Fragment>
            )}

            {/* No Data Message */}
            {!isLoading && !fetchError && (!dashboardData || !hasAnyData) && renderNoData()}
        </div>
    );
}

export default DashboardPage;