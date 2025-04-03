import React, { useState, useEffect } from 'react';

function PeriodFilter({ onPeriodChange, initialPeriod }) {
    const reportError = (error) => console.error("PeriodFilter Error:", error);
    try {
        const determineInitialPreset = (start, end) => {
            const today = new Date().toISOString().split('T')[0];
            if (start === today && end === today) return 'today';

            const yesterdayDate = new Date();
            yesterdayDate.setDate(yesterdayDate.getDate() - 1);
            const yesterday = yesterdayDate.toISOString().split('T')[0];
            if (start === yesterday && end === yesterday) return 'yesterday';

            const last7Date = new Date();
            last7Date.setDate(last7Date.getDate() - 6);
            if (start === last7Date.toISOString().split('T')[0] && end === today) return 'last7';

            const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
            if (start === thisMonthStart && end === today) return 'thisMonth';

             const lastMonthEndDate = new Date(new Date().getFullYear(), new Date().getMonth(), 0);
             const lastMonthStartDate = new Date(lastMonthEndDate.getFullYear(), lastMonthEndDate.getMonth(), 1);
             if (start === lastMonthStartDate.toISOString().split('T')[0] && end === lastMonthEndDate.toISOString().split('T')[0]) return 'lastMonth';

             if (start && end) return 'custom';
             return 'last7'; // Default if no initial period provided
        };

        const initialPreset = determineInitialPreset(initialPeriod?.startDate, initialPeriod?.endDate);
        const [periodPreset, setPeriodPreset] = useState(initialPreset);
        const [customStartDate, setCustomStartDate] = useState(initialPeriod?.startDate || '');
        const [customEndDate, setCustomEndDate] = useState(initialPeriod?.endDate || '');

         useEffect(() => {
            if (initialPreset === 'custom' || !initialPeriod) {
                // If initial is custom or no initial period, use the state values
                 setCustomStartDate(initialPeriod?.startDate || '');
                 setCustomEndDate(initialPeriod?.endDate || '');
            } else {
                 // If initial is a preset, calculate dates based on the preset
                 handlePresetChange(initialPreset, true); // Pass silent=true to avoid calling onPeriodChange initially
            }
         }, []); // Run only once on mount

        const handlePresetChange = (newPreset, silent = false) => {
            setPeriodPreset(newPreset);

            const today = new Date();
            let startDate = today.toISOString().split('T')[0];
            let endDate = today.toISOString().split('T')[0];

            if (newPreset === 'today') {
                 startDate = endDate;
            } else if (newPreset === 'yesterday') {
                const yesterday = new Date(today);
                yesterday.setDate(today.getDate() - 1);
                startDate = yesterday.toISOString().split('T')[0];
                endDate = startDate;
            } else if (newPreset === 'last7') {
                const last7 = new Date(today);
                last7.setDate(today.getDate() - 6);
                startDate = last7.toISOString().split('T')[0];
            } else if (newPreset === 'thisMonth') {
                startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
            } else if (newPreset === 'lastMonth') {
                 const endOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
                 const startOfLastMonth = new Date(endOfLastMonth.getFullYear(), endOfLastMonth.getMonth(), 1);
                 startDate = startOfLastMonth.toISOString().split('T')[0];
                 endDate = endOfLastMonth.toISOString().split('T')[0];
            } else if (newPreset === 'custom') {
                if (!silent) { // Only return if not silent (initial setup)
                     return;
                }
            }

             setCustomStartDate(startDate);
             setCustomEndDate(endDate);

            if (!silent) {
                 console.log(`Period changed via preset '${newPreset}':`, { startDate, endDate });
                 onPeriodChange({ startDate, endDate });
             }
        };

        const handleCustomDateSubmit = (e) => {
            e.preventDefault();
            if (!customStartDate || !customEndDate) return;

            if (new Date(customEndDate) < new Date(customStartDate)) {
                 alert("A data final não pode ser anterior à data inicial.");
                 return;
             }

            setPeriodPreset('custom');
             console.log("Custom period applied:", { startDate: customStartDate, endDate: customEndDate });
            onPeriodChange({ startDate: customStartDate, endDate: customEndDate });
        };

        return (
            <div className="filter-container bg-white p-4 rounded-lg shadow mb-6" data-name="period-filter">
                <div className="flex flex-wrap gap-2 mb-4">
                     <button
                        onClick={() => handlePresetChange('today')}
                        className={`btn ${periodPreset === 'today' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        data-name="today-button"
                    > Hoje </button>
                    <button
                        onClick={() => handlePresetChange('yesterday')}
                         className={`btn ${periodPreset === 'yesterday' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        data-name="yesterday-button"
                    > Ontem </button>
                     <button
                        onClick={() => handlePresetChange('last7')}
                         className={`btn ${periodPreset === 'last7' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        data-name="last7-button"
                    > Últimos 7 dias </button>
                    <button
                        onClick={() => handlePresetChange('thisMonth')}
                         className={`btn ${periodPreset === 'thisMonth' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        data-name="this-month-button"
                    > Este Mês </button>
                     <button
                        onClick={() => handlePresetChange('lastMonth')}
                         className={`btn ${periodPreset === 'lastMonth' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
                        data-name="last-month-button"
                    > Mês Anterior </button>
                </div>

                 <form onSubmit={handleCustomDateSubmit} className="flex flex-wrap items-end gap-x-4 gap-y-2">
                    <div className="flex-grow sm:flex-grow-0">
                         <label className="input-label text-xs mb-1" htmlFor="period-start-date">Data Inicial</label>
                        <input
                            id="period-start-date"
                            type="date"
                            className="input-field input-field-sm"
                            value={customStartDate}
                            onChange={(e) => {
                                 setCustomStartDate(e.target.value);
                                 setPeriodPreset('custom');
                             }}
                             required
                            data-name="start-date-input"
                        />
                    </div>
                    <div className="flex-grow sm:flex-grow-0">
                        <label className="input-label text-xs mb-1" htmlFor="period-end-date">Data Final</label>
                        <input
                            id="period-end-date"
                            type="date"
                            className="input-field input-field-sm"
                            value={customEndDate}
                            onChange={(e) => {
                                 setCustomEndDate(e.target.value);
                                 setPeriodPreset('custom');
                            }}
                            required
                            data-name="end-date-input"
                        />
                    </div>
                    <button
                        type="submit"
                         className="btn btn-primary btn-sm"
                         disabled={!customStartDate || !customEndDate || (new Date(customEndDate) < new Date(customStartDate))}
                        data-name="custom-date-button"
                    >
                        Aplicar Período
                    </button>
                </form>
            </div>
        );
    } catch (error) {
        console.error('PeriodFilter component error:', error);
        reportError(error);
        return <div className="filter-container error p-4 bg-red-100 text-red-700">Erro no filtro de período.</div>;
    }
}

export default PeriodFilter;