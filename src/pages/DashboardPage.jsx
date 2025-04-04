import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Header from '../components/Header';
import FileUploader from '../components/FileUploader';
import LoadingOverlay from '../components/LoadingOverlay';
import PeriodFilter from '../components/PeriodFilter';
import KPIPanel from '../components/KPIPanel';
import ChartComponent from '../components/ChartComponent';
// Ajuste os caminhos de importação dos serviços se necessário
import DashboardService from '../utils/dashboardService'; // Assumindo que as funções estão aqui agora
import getSupabaseClient from '../utils/supabaseClient';
import TruncatedTextWithPopover from '../components/TruncatedTextWithPopover'; // Mantenha se usado

function DashboardPage({ user, onLogout }) {
    const reportError = (error, context = 'DashboardPage') => console.error(`[${context}] Error:`, error?.message || error);

    // --- State Variables ---
    const [isLoading, setIsLoading] = useState(true);
    const [period, setPeriod] = useState(() => {
        const today = new Date().toISOString().split('T')[0];
        const defaultStartDate = new Date();
        defaultStartDate.setDate(defaultStartDate.getDate() - 6); // Default last 7 days
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

    // --- Refs ---
    const accountsChartScrollContainerRef = useRef(null);
    const esteiraChartScrollContainerRef = useRef(null);

    // --- State for Scroll Functionality ---
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

    // --- Service Instance ---
    // Usar useMemo para garantir que a instância do serviço seja criada apenas uma vez
    const dashboardService = useMemo(() => DashboardService(), []);

    // --- Helper Functions ---
    const debounce = (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => { clearTimeout(timeout); func(...args); };
            clearTimeout(timeout); timeout = setTimeout(later, wait);
        };
    };

    const parseBrazilianNumber = (value) => {
        if (value === null || value === undefined) return null;
        const valueStr = String(value).trim();
        if (valueStr === '' || valueStr === '-' || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?'].includes(valueStr.toUpperCase())) return null;
        const cleanedStr = valueStr.replace(/R\$\s?/g, '').replace(/\./g, '').replace(',', '.').trim();
        const number = parseFloat(cleanedStr);
        return isNaN(number) ? null : number;
    };

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
     }, [dashboardData?.accountsTrends?.labels, dashboardData?.esteiraTrends?.labels, isMobileView]); // Dependências corretas

    const checkAccountsChartOverflow = useCallback(() => checkChartOverflow('accounts'), [checkChartOverflow]);
    const checkEsteiraChartOverflow = useCallback(() => checkChartOverflow('esteira'), [checkChartOverflow]);

    const updateScrollButtons = useCallback((chartType) => {
        const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current;
        const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded;
        const setShowButtons = chartType === 'accounts' ? setShowAccountsScrollButtons : setShowEsteiraScrollButtons;
        const setCanPrev = chartType === 'accounts' ? setCanAccountsScrollPrev : setCanEsteiraScrollPrev;
        const setCanNext = chartType === 'accounts' ? setCanAccountsScrollNext : setCanEsteiraScrollNext;
        const setShowFade = chartType === 'accounts' ? setShowAccountsScrollFade : setShowEsteiraScrollFade;

        if (!container) {
             // Se o container ainda não existe, reseta tudo
             setShowButtons(false); setShowFade(false); setCanPrev(false); setCanNext(false); return;
        }
         // Se não está expandido, esconde botões e fade
        if (!isExpanded) {
             setShowButtons(false); setShowFade(false); setCanPrev(false); setCanNext(false); return;
        }

        // Lógica de cálculo de overflow e posição do scroll
        const tolerance = 5;
        const scrollLeft = Math.round(container.scrollLeft);
        const scrollWidth = Math.round(container.scrollWidth);
        const clientWidth = Math.round(container.clientWidth);

        const hasHorizontalOverflow = scrollWidth > clientWidth + tolerance;
        const isScrolledToStart = scrollLeft <= tolerance;
        const isScrolledToEnd = scrollLeft >= scrollWidth - clientWidth - tolerance;

        setShowButtons(hasHorizontalOverflow);
        setCanPrev(hasHorizontalOverflow && !isScrolledToStart);
        setCanNext(hasHorizontalOverflow && !isScrolledToEnd);
        setShowFade(hasHorizontalOverflow && !isScrolledToEnd); // Mostra fade se puder rolar para a direita

    }, [isAccountsChartExpanded, isEsteiraChartExpanded]); // Dependências corretas

    const updateAccountsScrollButtons = useCallback(() => updateScrollButtons('accounts'), [updateScrollButtons]);
    const updateEsteiraScrollButtons = useCallback(() => updateScrollButtons('esteira'), [updateScrollButtons]);

    // --- Memoized Debounced Functions ---
    const debouncedUpdateAccountsScrollButtons = useMemo(() => debounce(updateAccountsScrollButtons, 150), [updateAccountsScrollButtons]);
    const debouncedCheckAccountsChartOverflow = useMemo(() => debounce(checkAccountsChartOverflow, 150), [checkAccountsChartOverflow]);
    const debouncedUpdateEsteiraScrollButtons = useMemo(() => debounce(updateEsteiraScrollButtons, 150), [updateEsteiraScrollButtons]);
    const debouncedCheckEsteiraChartOverflow = useMemo(() => debounce(checkEsteiraChartOverflow, 150), [checkEsteiraChartOverflow]);


    // --- Effects ---

    // Resize listener
     useEffect(() => {
         const handleResize = () => {
             const mobile = window.innerWidth < 768;
             setIsMobileView(mobile);
             // Chama as funções debounced no resize
             debouncedUpdateAccountsScrollButtons();
             debouncedCheckAccountsChartOverflow();
             debouncedUpdateEsteiraScrollButtons();
             debouncedCheckEsteiraChartOverflow();
         }
         window.addEventListener('resize', handleResize);
         handleResize(); // Chama uma vez na montagem
         return () => window.removeEventListener('resize', handleResize);
         // Usar as versões debounced como dependência é importante
     }, [debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow]);


     // Scroll and Resize Observer for Charts
     useEffect(() => {
         const accountsContainer = accountsChartScrollContainerRef.current;
         const esteiraContainer = esteiraChartScrollContainerRef.current;
         let accountsResizeObserver, esteiraResizeObserver;

         const setupObservers = (container, isExpanded, updateFunc, checkFunc, debouncedUpdateFunc, debouncedCheckFunc, chartType) => {
             if (container) {
                 // Run initial checks after render might complete
                 requestAnimationFrame(() => { updateFunc(); checkFunc(); });

                 if (isExpanded) {
                     container.addEventListener('scroll', debouncedUpdateFunc, { passive: true });
                 } else {
                     container.removeEventListener('scroll', debouncedUpdateFunc);
                 }

                 // Observer for container size changes
                 const observer = new ResizeObserver(() => {
                     debouncedUpdateFunc();
                     debouncedCheckFunc();
                 });
                 observer.observe(container);

                 // Also observe the inner chart container if it exists (might influence scrollWidth)
                 const innerChartContainer = container.querySelector(`[data-name="${chartType}-chart-inner-container"]`);
                 if (innerChartContainer) {
                     observer.observe(innerChartContainer);
                 }

                 // Cleanup function
                 return () => {
                     container.removeEventListener('scroll', debouncedUpdateFunc);
                     if (observer) observer.disconnect();
                 };
             }
             // Fallback if container doesn't exist yet (run initial checks only)
             requestAnimationFrame(() => { updateFunc(); checkFunc(); });
             return () => {}; // Return empty cleanup function
         };

         const cleanupAccounts = setupObservers(
             accountsContainer, isAccountsChartExpanded,
             updateAccountsScrollButtons, checkAccountsChartOverflow,
             debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow, 'accounts'
         );
         const cleanupEsteira = setupObservers(
             esteiraContainer, isEsteiraChartExpanded,
             updateEsteiraScrollButtons, checkEsteiraChartOverflow,
             debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow, 'esteira'
         );

         // Combined cleanup function
         return () => {
             cleanupAccounts();
             cleanupEsteira();
         };
         // Dependências: estados de expansão, dados (implicito pelos check funcs), mobile view (implicito), e as funções memoizadas/debounced
      }, [
          dashboardData, isMobileView,
          isAccountsChartExpanded, isEsteiraChartExpanded,
          updateAccountsScrollButtons, checkAccountsChartOverflow, debouncedUpdateAccountsScrollButtons, debouncedCheckAccountsChartOverflow,
          updateEsteiraScrollButtons, checkEsteiraChartOverflow, debouncedUpdateEsteiraScrollButtons, debouncedCheckEsteiraChartOverflow
      ]);


    // Fetch data function (wrapped in useCallback)
    const fetchAndSetDashboardData = useCallback(async (startDate, endDate) => {
        if (!dashboardService) return; // Guard clause if service isn't ready

        setIsLoading(true);
        setFetchError(null);
        // Reset data structure before fetching
        setDashboardData({
            summary: { typed: 0, notTyped: 0, activeAccounts: 0, activeAccountsAvg: 0, faixaLimiteTotal: 0, limitTotalAvg: 0, previousTyped: 0, previousNotTyped: 0 },
            typedDetails: { categories: [], values: [], fullData: [] }, notTypedDetails: { categories: [], values: [], fullData: [] }, accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] }, esteiraTrends: { labels: [], datasets: [] }
        });
        // Reset chart expansion states on new data fetch
        setIsAccountsChartExpanded(false);
        setIsTypedChartExpanded(false);
        setIsNotTypedChartExpanded(false);
        setIsEsteiraChartExpanded(false);

        try {
            // Fetch both KPIs and Raw Data concurrently
            const [kpiResult, rawDataResult] = await Promise.all([
                dashboardService.getCalculatedKPIs(startDate, endDate),
                dashboardService.getRawMetricsData(startDate, endDate)
            ]);

            // Handle potential errors from service calls
            if (kpiResult.error) throw new Error(`Erro ao buscar KPIs: ${kpiResult.error.message || kpiResult.error}`);
            if (rawDataResult.error) throw new Error(`Erro ao buscar dados brutos: ${rawDataResult.error.message || rawDataResult.error}`);

            const kpiData = kpiResult.data;
            const rawData = rawDataResult.data;

            if (!kpiData) throw new Error('API de KPIs não retornou dados.');

            // Process data for charts (only if rawData exists)
            let processedChartData = {
                typedDetails: { categories: [], values: [], fullData: [] },
                notTypedDetails: { categories: [], values: [], fullData: [] },
                accountsTrends: { labels: [], activeAccounts: [], averageLimit: [] },
                esteiraTrends: { labels: [], datasets: [] }
            };

            if (rawData && rawData.length > 0) {
                 processedChartData.typedDetails = processCategoryData(rawData, 'DIGITADAS');
                 processedChartData.notTypedDetails = processCategoryData(rawData, 'NÃO DIGITADAS');
                 const uniqueDates = [...new Set(rawData.map(item => item.metric_date))].sort((a, b) => new Date(a) - new Date(b));
                 processedChartData.accountsTrends = processAccountsTrendData(rawData, uniqueDates);
                 processedChartData.esteiraTrends = processEsteiraTrendData(rawData, uniqueDates);
            }

            // Update state with fetched and processed data
            setDashboardData({
                summary: {
                    typed: kpiData.current_typed_sum || 0,
                    notTyped: kpiData.current_not_typed_sum || 0,
                    activeAccounts: kpiData.last_active_accounts_in_period || 0,
                    activeAccountsAvg: kpiData.current_active_accounts_avg || 0,
                    faixaLimiteTotal: kpiData.current_limit_total_sum || 0,
                    limitTotalAvg: kpiData.current_limit_total_avg || 0,
                    previousTyped: kpiData.previous_typed_sum || 0,
                    previousNotTyped: kpiData.previous_not_typed_sum || 0
                },
                ...processedChartData // Spread processed chart data
            });

        } catch (error) {
            reportError(error, 'fetchAndSetDashboardData');
            setFetchError(`Falha ao carregar dados do dashboard: ${error.message}`);
            // Optionally reset data or keep previous state on error
            // setDashboardData({...initial state...});
        } finally {
            setIsLoading(false);
            // Trigger scroll/overflow checks after data update and potential render
            requestAnimationFrame(() => {
                updateAccountsScrollButtons(); checkAccountsChartOverflow();
                updateEsteiraScrollButtons(); checkEsteiraChartOverflow();
            });
        }
    }, [dashboardService]); // Dependência do serviço


    // --- Data Processing Functions ---
    const processCategoryData = (data, category) => {
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
    };

    const formatDateLabel = (dateString, mobile) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return dateString; // Invalid date
            // Use UTC methods to format consistently regardless of local timezone
            if (mobile) {
                 const d = String(date.getUTCDate()).padStart(2, '0');
                 // Get short month name in Portuguese (requires locale support)
                 const m = date.toLocaleString('pt-BR', { month: 'short', timeZone: 'UTC' }).replace('.', '');
                 return `${d}/${m}`;
            } else {
                 const d = String(date.getUTCDate()).padStart(2, '0');
                 const m = String(date.getUTCMonth() + 1).padStart(2, '0'); // Month is 0-indexed
                 const y = date.getUTCFullYear();
                 return `${d}/${m}/${y}`;
            }
        } catch (e) { return dateString; } // Fallback
    };

     const processAccountsTrendData = (rawData, dates) => {
         return {
             labels: dates,
             activeAccounts: dates.map(date => {
                 const d = rawData.find(i => i.metric_date === date && i.category === 'CONTAS ATIVAS' && i.sub_category?.toUpperCase().includes('ACUMULADO'));
                 return d ? parseBrazilianNumber(d.value) : null;
             }),
             averageLimit: dates.map(date => {
                 const d = rawData.find(i => i.metric_date === date && i.category === 'FAIXA DE LIMITE' && i.sub_category?.toUpperCase().includes('MEDIA'));
                 return d ? parseBrazilianNumber(d.value) : null;
             })
         };
     };

    const processEsteiraTrendData = (rawData, dates) => {
        const esteiraData = rawData.filter(item => item.category === 'ESTEIRA');
        const subCategories = [...new Set(esteiraData.map(i => i.sub_category).filter(s => s && !s.toUpperCase().includes('GERAL') && !s.toUpperCase().includes('ESTEIRA')))];
        const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280']; let colorIndex = 0;
        const datasets = subCategories.map(subCat => {
            const color = colors[colorIndex++ % colors.length];
            const seriesData = dates.map(date => {
                 const entry = esteiraData.find(i => i.metric_date === date && i.sub_category === subCat);
                 return entry ? parseBrazilianNumber(entry.value) : null;
            });
            // Only include dataset if it has at least one non-null value
            if (!seriesData.some(v => v !== null)) return null;
            return { label: subCat, data: seriesData, borderColor: color, backgroundColor: `${color}33`, tension: 0.1, yAxisID: 'y', fill: true, pointRadius: dates.length > 30 ? (isEsteiraChartExpanded ? 1 : 0) : 3, pointHoverRadius: dates.length > 30 ? 3 : 5, spanGaps: true };
        }).filter(dataset => dataset !== null); // Remove null datasets
        return { labels: dates, datasets: datasets };
    };

    // --- Effect to Fetch Initial Data ---
    useEffect(() => {
        console.log("[DashboardPage Effect Mount] Fetching initial data for period:", period);
        fetchAndSetDashboardData(period.startDate, period.endDate);
    }, [fetchAndSetDashboardData]); // Dependência da função memoizada

    // --- Event Handlers ---
    const handlePeriodChange = useCallback((newPeriod) => {
        console.log("[DashboardPage] Period changed:", newPeriod);
        setPeriod(newPeriod);
        fetchAndSetDashboardData(newPeriod.startDate, newPeriod.endDate);
    }, [fetchAndSetDashboardData]); // Dependência da função memoizada

     const handleUploadSuccess = useCallback(async (processedData) => {
         setIsLoading(true);
         setFetchError(null);
         setShowUploader(false); // Fecha o uploader
         const supabase = getSupabaseClient();
         const { dailyMetrics, summaryMetrics } = processedData;

         console.log("[handleUploadSuccess] Data received for upload:", { dailyCount: dailyMetrics?.length, summaryCount: summaryMetrics?.length });

         if (!Array.isArray(dailyMetrics) || !Array.isArray(summaryMetrics)) {
              setFetchError("Erro interno: Dados inválidos recebidos do uploader.");
              setIsLoading(false); return;
         }

         try {
             // Perform upserts concurrently
             const upsertDaily = supabase
                 .from('daily_proposal_metrics')
                 .upsert(dailyMetrics, { onConflict: 'metric_date, category, sub_category' });
             const upsertSummary = supabase
                 .from('monthly_summary_metrics')
                 .upsert(summaryMetrics, { onConflict: 'metric_month, category, sub_category' });

             const [dailyResult, summaryResult] = await Promise.all([upsertDaily, upsertSummary]);

             let errors = [];
             if (dailyResult.error) errors.push(`Erro Diário: ${dailyResult.error.message}`);
             if (summaryResult.error) errors.push(`Erro Resumo: ${summaryResult.error.message}`);

             if (errors.length > 0) {
                 setFetchError(errors.join('; '));
                 reportError({ daily: dailyResult.error, summary: summaryResult.error }, 'handleUploadSuccess');
             } else {
                 console.log("[handleUploadSuccess] Upload successful. Refreshing data...");
                 // Re-fetch data for the current period after successful upload
                 fetchAndSetDashboardData(period.startDate, period.endDate);
             }
         } catch (catchError) {
              reportError(catchError, 'handleUploadSuccess');
              setFetchError(`Erro inesperado durante o salvamento: ${catchError.message}`);
          } finally {
              setIsLoading(false);
          }
      }, [period, fetchAndSetDashboardData]); // Dependências


    // --- Chart Data and Options (Memoized) ---
    const typedChartDisplayData = useMemo(() => {
        const fullData = dashboardData?.typedDetails?.fullData || [];
        if (fullData.length === 0) return { labels: [], datasets: [] };
        const dataToShow = isTypedChartExpanded ? fullData : fullData.slice(0, 3);
        return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(54, 162, 235, 0.6)', borderColor: 'rgba(54, 162, 235, 1)', borderWidth: 1 }] };
    }, [dashboardData?.typedDetails?.fullData, isTypedChartExpanded]);

    const notTypedChartDisplayData = useMemo(() => {
        const fullData = dashboardData?.notTypedDetails?.fullData || [];
        if (fullData.length === 0) return { labels: [], datasets: [] };
        const dataToShow = isNotTypedChartExpanded ? fullData : fullData.slice(0, 3);
        return { labels: dataToShow.map(e => e[0]), datasets: [{ label: 'Não Digitadas', data: dataToShow.map(e => e[1]), backgroundColor: 'rgba(255, 99, 132, 0.6)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1 }] };
    }, [dashboardData?.notTypedDetails?.fullData, isNotTypedChartExpanded]);

     const accountsChartData = useMemo(() => {
         const rawLabels = dashboardData?.accountsTrends?.labels || [];
         if (rawLabels.length === 0) return { labels: [], datasets: [] };
         const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView));
         const pointRadius = rawLabels.length > 30 ? (isAccountsChartExpanded ? 1 : 0) : 3;
         const pointHoverRadius = rawLabels.length > 30 ? 3 : 5;
         return {
             labels: formattedLabels,
             datasets: [
                 { label: 'Contas Ativas (Acum.)', data: dashboardData?.accountsTrends?.activeAccounts || [], borderColor: 'rgb(75, 192, 192)', backgroundColor: 'rgba(75, 192, 192, 0.2)', tension: 0.1, yAxisID: 'y', fill: true, pointRadius, pointHoverRadius, spanGaps: true },
                 { label: 'Limite Médio (R$)', data: dashboardData?.accountsTrends?.averageLimit || [], borderColor: 'rgb(153, 102, 255)', backgroundColor: 'rgba(153, 102, 255, 0.2)', tension: 0.1, yAxisID: 'y1', fill: true, pointRadius, pointHoverRadius, spanGaps: true }
             ]
         };
     }, [dashboardData?.accountsTrends, isMobileView, isAccountsChartExpanded]);

     const esteiraChartData = useMemo(() => {
         const rawLabels = dashboardData?.esteiraTrends?.labels || [];
         if (rawLabels.length === 0) return { labels: [], datasets: [] };
         const formattedLabels = rawLabels.map(l => formatDateLabel(l, isMobileView));
         // Adjust point radius based on expansion for existing datasets
         const updatedDatasets = (dashboardData?.esteiraTrends?.datasets || []).map(ds => ({
             ...ds,
             pointRadius: rawLabels.length > 30 ? (isEsteiraChartExpanded ? 1 : 0) : 3,
             pointHoverRadius: rawLabels.length > 30 ? 3 : 5
         }));
         return { labels: formattedLabels, datasets: updatedDatasets };
     }, [dashboardData?.esteiraTrends, isMobileView, isEsteiraChartExpanded]);


    // Common options for bar charts
    const commonBarChartOptions = useMemo(() => ({
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        scales: { x: { beginAtZero: true, ticks: { font: { size: 12 } } }, y: { ticks: { font: { size: 12 } } } }, // Adjusted font size
        plugins: { legend: { display: false }, tooltip: { bodyFont: { size: 12 }, titleFont: { size: 12 } } }, // Tooltip font size
        barPercentage: 0.5, categoryPercentage: 0.8, maxBarThickness: 30, // Adjusted bar thickness/spacing
    }), []);

    // Options for line charts (accounts and esteira)
     const lineChartBaseOptions = useMemo(() => ({
         responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
         plugins: {
             legend: { position: 'bottom', labels: { font: { size: 11 }, usePointStyle: true, pointStyle: 'line' } },
             tooltip: { callbacks: { label: (c) => `${c.dataset.label || ''}: ${c.parsed.y !== null ? c.parsed.y.toLocaleString('pt-BR') : 'N/A'}` } }
         }
     }), []); // Base options don't depend on changing state

     const accountsChartOptions = useMemo(() => ({
         ...lineChartBaseOptions, // Spread base options
         scales: {
             x: { ticks: { font: { size: 11 }, autoSkip: !isAccountsChartExpanded, maxRotation: isAccountsChartExpanded ? (isMobileView ? 60 : 45) : 0, padding: isAccountsChartExpanded ? 5 : 0 } }, // Adjusted rotation/padding
             y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Contas Ativas', font: { size: 10 } }, ticks: { font: { size: 10 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } },
             y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Limite Médio (R$)', font: { size: 10 } }, grid: { drawOnChartArea: false }, ticks: { font: { size: 10 }, callback: v => v == null ? v : 'R$' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) } }
         },
         plugins: { // Override tooltip for currency formatting
             ...lineChartBaseOptions.plugins,
             tooltip: { callbacks: { label: (c) => `${c.dataset.label || ''}: ${c.parsed.y !== null ? (c.dataset.yAxisID === 'y1' ? 'R$' + c.parsed.y.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : c.parsed.y.toLocaleString('pt-BR')) : 'N/A'}` } }
         }
     }), [isMobileView, isAccountsChartExpanded, lineChartBaseOptions]); // Depend on specific states + base options

     const esteiraChartOptions = useMemo(() => ({
         ...lineChartBaseOptions, // Spread base options
         scales: {
             x: { ticks: { font: { size: 11 }, autoSkip: !isEsteiraChartExpanded, maxRotation: isEsteiraChartExpanded ? (isMobileView ? 60 : 45) : 0, padding: isEsteiraChartExpanded ? 5 : 0 } },
             y: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Valor', font: { size: 10 } }, ticks: { font: { size: 10 }, callback: v => v == null ? v : v.toLocaleString('pt-BR') } }
         }
     }), [isMobileView, isEsteiraChartExpanded, lineChartBaseOptions]); // Depend on specific states + base options


    // --- UI Control Functions ---
    const handleScroll = (direction, chartType) => {
        const container = chartType === 'accounts' ? accountsChartScrollContainerRef.current : esteiraChartScrollContainerRef.current;
        if (container) { const scrollAmount = container.clientWidth * 0.7; container.scrollBy({ left: direction === 'prev' ? -scrollAmount : scrollAmount, behavior: 'smooth' }); }
    };

    const toggleLineChartExpansion = (chartType) => {
        if (chartType === 'accounts') setIsAccountsChartExpanded(prev => !prev);
        else if (chartType === 'esteira') setIsEsteiraChartExpanded(prev => !prev);
        // Trigger checks after state update potentially causes re-render
        requestAnimationFrame(() => {
            if (chartType === 'accounts') { updateAccountsScrollButtons(); checkAccountsChartOverflow(); }
            else if (chartType === 'esteira') { updateEsteiraScrollButtons(); checkEsteiraChartOverflow(); }
        });
    };

    const calculateBarChartHeight = (dataLength) => Math.max(400, dataLength * 25 + 80); // Adjusted base height and multiplier

    const renderNoData = () => (
        <div className="text-center py-16 text-gray-500">
            <i className="fas fa-info-circle text-5xl mb-4 text-gray-400"></i>
            <p>Nenhum dado encontrado para o período selecionado.</p>
            <p className="text-sm mt-2">Tente selecionar outro período ou carregue um relatório.</p>
        </div>
    );

     const renderScrollButtons = (chartType) => {
         const showButtons = chartType === 'accounts' ? showAccountsScrollButtons : showEsteiraScrollButtons;
         const canPrev = chartType === 'accounts' ? canAccountsScrollPrev : canEsteiraScrollPrev;
         const canNext = chartType === 'accounts' ? canAccountsScrollNext : canEsteiraScrollNext;
         const showFade = chartType === 'accounts' ? showAccountsScrollFade : showEsteiraScrollFade;
         const isExpanded = chartType === 'accounts' ? isAccountsChartExpanded : isEsteiraChartExpanded;

         if (!isExpanded || !showButtons) return null; // Only show when expanded and needed

         return (
             <React.Fragment>
                 <button onClick={(e)=>{ e.preventDefault(); handleScroll('prev', chartType); }} disabled={!canPrev} className="absolute left-1 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full shadow-md p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Previous" data-name={`scroll-prev-button-${chartType}`}>
                     <i className="fas fa-chevron-left text-gray-600 text-xs w-3 h-3"></i> {/* Smaller icon */}
                 </button>
                 <button onClick={(e)=>{ e.preventDefault(); handleScroll('next', chartType); }} disabled={!canNext} className="absolute right-1 top-1/2 transform -translate-y-1/2 z-20 bg-white bg-opacity-75 hover:bg-opacity-100 rounded-full shadow-md p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity" aria-label="Scroll Next" data-name={`scroll-next-button-${chartType}`}>
                     <i className="fas fa-chevron-right text-gray-600 text-xs w-3 h-3"></i> {/* Smaller icon */}
                 </button>
                 {/* Right fade effect */}
                 {showFade && <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none"></div>}
                  {/* Optional Left fade effect */}
                  {/* {canPrev && <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none"></div>} */}
             </React.Fragment>
         );
     };

      const renderComparisonPercentage = (currentValue, previousValue) => {
         if (previousValue === null || previousValue === undefined || currentValue === null || currentValue === undefined) return <span className="text-gray-500">(- ant.)</span>;
         let percentageChange; let iconClass = 'fa-solid fa-minus'; let textClass = 'text-gray-500'; let changeText = '0.0%';
         if (previousValue === 0) { percentageChange = (currentValue === 0) ? 0 : Infinity; } // Handle division by zero
         else { percentageChange = ((currentValue - previousValue) / previousValue) * 100; }

         if (percentageChange === Infinity) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = '(+inf%)'; }
         else if (percentageChange > 0.05) { iconClass = 'fa-solid fa-arrow-up'; textClass = 'text-green-600'; changeText = `+${percentageChange.toFixed(1)}%`; }
         else if (percentageChange < -0.05) { iconClass = 'fa-solid fa-arrow-down'; textClass = 'text-red-600'; changeText = `${percentageChange.toFixed(1)}%`; }
         // If between -0.05 and 0.05, keep default 'fa-minus' and '0.0%'

         return (
              <span className={`inline-flex items-center gap-1 ${textClass}`}>
                  <i className={iconClass} style={{ fontSize: '0.7em' }}></i> {/* Smaller icon */}
                  <span>{changeText}</span>
                  <span className="text-gray-400 font-normal">(vs ant.)</span> {/* Shorter text */}
              </span>
         );
     };

     const formatKpiValue = (val, decimals = 0) => {
         if (val == null || val === undefined) return '-';
          if (typeof val !== 'number' || isNaN(val)) return String(val);
         return val.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
     }


     // --- Derived State for Conditional Rendering ---
    const hasAccountsChartData = dashboardData?.accountsTrends?.labels?.length > 0;
    const hasEsteiraChartData = dashboardData?.esteiraTrends?.datasets?.length > 0;
    const hasTypedChartData = dashboardData?.typedDetails?.fullData?.length > 0;
    const hasNotTypedChartData = dashboardData?.notTypedDetails?.fullData?.length > 0;
    const hasSummaryData = dashboardData?.summary && Object.values(dashboardData.summary).some(v => v !== 0); // Check if summary has non-zero values
    const hasAnyData = hasAccountsChartData || hasEsteiraChartData || hasTypedChartData || hasNotTypedChartData || hasSummaryData;

    const showTypedExpandButton = hasTypedChartData && (dashboardData.typedDetails.fullData.length > 3);
    const showNotTypedExpandButton = hasNotTypedChartData && (dashboardData.notTypedDetails.fullData.length > 3);
    const showAccountsExpandButton = hasAccountsChartData && accountsChartOverflowsWhenCollapsed;
    const showEsteiraExpandButton = hasEsteiraChartData && esteiraChartOverflowsWhenCollapsed;


    // --- JSX Return ---
    return (
        // Adicionada classe min-h-screen para garantir que ocupe a altura da tela
        <div className="dashboard-container pt-6 px-6 pb-8 bg-gray-100 min-h-screen">
            <LoadingOverlay isLoading={isLoading} message="Carregando dados..." />
            <Header user={user} onLogout={onLogout} onUploadClick={() => setShowUploader(prev => !prev)} isUploaderOpen={showUploader} />

            {/* Uploader Section */}
            {showUploader && (
                <div className="my-6">
                     <FileUploader onFileUpload={handleUploadSuccess} user={user} onClose={() => setShowUploader(false)} />
                 </div>
            )}

            <PeriodFilter onPeriodChange={handlePeriodChange} initialPeriod={period} />

            {/* Error Message */}
            {fetchError && !isLoading && (
                <div className="my-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    <i className="fas fa-exclamation-triangle mr-2"></i> {fetchError}
                </div>
            )}

            {/* Dashboard Content (only render if not loading, no error, and data exists) */}
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
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Digitadas</h3>
                                {showTypedExpandButton && (
                                    <button onClick={(e) => { e.preventDefault(); setIsTypedChartExpanded(prev => !prev); }} className="btn btn-secondary btn-xs py-1 px-2">
                                        {isTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}
                                    </button>
                                )}
                            </div>
                            <div className="flex-grow relative" style={{ height: isTypedChartExpanded ? `${calculateBarChartHeight(typedChartDisplayData.labels.length)}px` : 'calc(100% - 30px)' }}> {/* Ajuste altura relativa */}
                                {hasTypedChartData ? <ChartComponent title="" type="bar" data={typedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>}
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-lg shadow-md flex flex-col" style={{ minHeight: '450px' }}>
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-base font-semibold text-gray-700">Detalhes - Propostas Não Digitadas</h3>
                                {showNotTypedExpandButton && (
                                    <button onClick={(e) => { e.preventDefault(); setIsNotTypedChartExpanded(prev => !prev); }} className="btn btn-secondary btn-xs py-1 px-2">
                                        {isNotTypedChartExpanded ? 'Ver Menos' : 'Ver Mais'}
                                    </button>
                                )}
                            </div>
                             <div className="flex-grow relative" style={{ height: isNotTypedChartExpanded ? `${calculateBarChartHeight(notTypedChartDisplayData.labels.length)}px` : 'calc(100% - 30px)' }}> {/* Ajuste altura relativa */}
                                {hasNotTypedChartData ? <ChartComponent title="" type="bar" data={notTypedChartDisplayData} options={commonBarChartOptions} /> : <div className="flex items-center justify-center h-full text-gray-400">Sem dados</div>}
                            </div>
                        </div>
                    </div>

                    {/* Line Charts */}
                    <div className="grid grid-cols-1 gap-6 mb-6">
                        {hasAccountsChartData ? (
                            <div className="bg-white p-4 rounded-lg shadow-md">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-base font-semibold text-gray-700">Evolução de Contas Ativas (Acum.) e Limite Médio</h3>
                                    {showAccountsExpandButton && (
                                        <button onClick={(e) => { e.preventDefault(); toggleLineChartExpansion('accounts'); }} className="btn btn-secondary btn-xs py-1 px-2">
                                            {isAccountsChartExpanded ? 'Ver Resumo' : 'Ver Tudo'}
                                        </button>
                                    )}
                                </div>
                                <div className="relative h-[400px]">
                                    <div ref={accountsChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isAccountsChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="accounts-chart-scroll-container">
                                        <div style={{ minWidth: isAccountsChartExpanded ? `${Math.max(600, (dashboardData?.accountsTrends?.labels?.length || 0) * (isMobileView ? 25 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="accounts-chart-inner-container">
                                            {/* Passa title vazio se não necessário */}
                                            <ChartComponent title="" type="line" data={accountsChartData} options={accountsChartOptions} />
                                        </div>
                                    </div>
                                    {renderScrollButtons('accounts')}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução de Contas/Limite para exibir.</div>
                        )}
                    </div>
                    <div className="grid grid-cols-1 gap-6 mb-6">
                        {hasEsteiraChartData ? (
                            <div className="bg-white p-4 rounded-lg shadow-md">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-base font-semibold text-gray-700">Evolução da Esteira</h3>
                                    {showEsteiraExpandButton && (
                                        <button onClick={(e) => { e.preventDefault(); toggleLineChartExpansion('esteira'); }} className="btn btn-secondary btn-xs py-1 px-2">
                                            {isEsteiraChartExpanded ? 'Ver Resumo' : 'Ver Tudo'}
                                        </button>
                                    )}
                                </div>
                                <div className="relative h-[400px]">
                                    <div ref={esteiraChartScrollContainerRef} className={`absolute inset-0 scroll-smooth ${isEsteiraChartExpanded ? 'overflow-x-auto' : 'overflow-x-hidden'}`} data-name="esteira-chart-scroll-container">
                                        <div style={{ minWidth: isEsteiraChartExpanded ? `${Math.max(600, (dashboardData?.esteiraTrends?.labels?.length || 0) * (isMobileView ? 25 : 80))}px` : '100%', height: '100%' }} className="relative" data-name="esteira-chart-inner-container">
                                            {/* Passa title vazio se não necessário */}
                                            <ChartComponent title="" type="line" data={esteiraChartData} options={esteiraChartOptions} />
                                        </div>
                                    </div>
                                    {renderScrollButtons('esteira')}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-4 rounded-lg shadow-md text-center text-gray-400">Sem dados de evolução da Esteira para exibir.</div>
                        )}
                    </div>
                </React.Fragment>
            )}

            {/* No Data Message (only shown if not loading, no error, and no data at all) */}
            {!isLoading && !fetchError && (!dashboardData || !hasAnyData) && renderNoData()}
        </div>
    );
}


export default DashboardPage;