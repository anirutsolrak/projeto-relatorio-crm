import React from 'react';
// *** Garanta que este import esteja correto e o componente exista ***
import TruncatedTextWithPopover from './TruncatedTextWithPopover';

function KPIPanel({ title, value, unit, comparison }) {
    const reportError = (error) => console.error("KPIPanel Error:", error);
    try {
        const formatValue = (val) => {
            if (val == null || val === undefined) return '-';
            if (typeof val === 'number') {
                let options = {};
                if (unit === 'currency') {
                     options = { minimumFractionDigits: 2, maximumFractionDigits: 2, style: 'currency', currency: 'BRL' };
                     return val.toLocaleString('pt-BR', options);
                } else {
                     options = { minimumFractionDigits: 0, maximumFractionDigits: 0 };
                     return val.toLocaleString('pt-BR', options);
                 }
            }
            return String(val);
        };

        const formatComparison = (compVal) => {
             if (typeof compVal === 'number' && !isNaN(compVal) && title && title.includes('Contas Ativas')) {
                 const adjustedAvg = compVal;
                 const options = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
                 return `Média período: ${adjustedAvg.toLocaleString('pt-BR', options)}`;
             }
             if (React.isValidElement(compVal)) {
                 return compVal;
            }
            return compVal != null ? String(compVal) : '';
        };

        const formattedValue = formatValue(value);
        const formattedComparison = formatComparison(comparison);

        return (
            React.createElement('div', {
                // O card principal é flex column
                className: "kpi-card bg-white p-4 rounded-lg shadow-md border border-gray-100 flex flex-col justify-between min-h-[100px]",
                'data-name': `kpi-panel-${title?.toLowerCase().replace(/\s+/g, '-')}`
            },
                // Container superior para título e valor (permite overflow hidden se necessário)
                React.createElement('div', { className: "overflow-hidden" },
                    // Container *específico* para o título, limitando sua largura
                    React.createElement('div', { className: "w-full" }, // Garante que o div tente ocupar a largura disponível
                        React.createElement(TruncatedTextWithPopover, {
                            className: "kpi-title text-sm font-medium text-gray-500 mb-1 block", // Mantém block
                            title: title // Tooltip HTML com título completo
                        },
                            title // Conteúdo a ser truncado
                        )
                    ),
                    // Container *específico* para o valor
                    React.createElement('div', { className: "w-full" },
                        React.createElement(TruncatedTextWithPopover, {
                            className: "kpi-value text-3xl font-semibold text-gray-800 block", // Mantém block
                            title: typeof formattedValue === 'string' ? formattedValue : undefined
                        },
                            formattedValue
                        )
                    )
                ),
                // Container *específico* para a comparação (empurrado para baixo por justify-between)
                formattedComparison ? React.createElement('div', { className: "w-full mt-1" }, // Adiciona margem superior
                    React.createElement(TruncatedTextWithPopover, {
                        className: "kpi-comparison text-xs text-gray-600 block", // Mantém block
                        title: typeof formattedComparison === 'string' ? formattedComparison : undefined
                    },
                        formattedComparison
                    )
                ) : null // Renderiza null se não houver comparação
            )
        );
     } catch (error) {
         console.error('KPIPanel component error:', error);
         reportError(error);
         // Retorna um placeholder de erro mais informativo
         return <div className="kpi-card error p-4 flex items-center justify-center text-red-500">Erro no KPI</div>;
     }
}

export default KPIPanel;