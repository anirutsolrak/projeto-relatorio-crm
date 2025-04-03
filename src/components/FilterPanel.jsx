import React from 'react';

function FilterPanel({ filters, onFilterChange, isOpen }) {
    const reportError = (error) => console.error("FilterPanel Error:", error);
    try {
        return (
            <div
                className={`filter-panel bg-white p-4 mb-4 rounded-lg shadow-sm transition-all duration-300 ease-in-out ${isOpen ? 'block' : 'hidden'}`} // Use hidden/block for display
                data-name="filter-panel"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {filters.map((filter) => (
                        <div key={filter.id} className="space-y-1">
                            <label htmlFor={`filter-${filter.id}`} className="block text-sm font-medium text-gray-700">{filter.label}</label>
                            {filter.type === 'select' ? (
                                <select
                                    id={`filter-${filter.id}`}
                                    value={filter.value}
                                    onChange={(e) => onFilterChange(filter.id, e.target.value)}
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 input-field"
                                    data-name={`filter-${filter.id}`}
                                >
                                    {filter.options.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            ) : filter.type === 'date' ? (
                                <input
                                    id={`filter-${filter.id}`}
                                    type="date"
                                    value={filter.value}
                                    onChange={(e) => onFilterChange(filter.id, e.target.value)}
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 input-field"
                                    data-name={`filter-${filter.id}`}
                                />
                            ) : (
                                <input
                                    id={`filter-${filter.id}`}
                                    type="text"
                                    value={filter.value}
                                    onChange={(e) => onFilterChange(filter.id, e.target.value)}
                                    className="w-full border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 input-field"
                                    data-name={`filter-${filter.id}`}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <div className="flex justify-end mt-4">
                    <button
                        onClick={() => onFilterChange('apply', true)} // Assuming 'apply' triggers the filter action
                        className="btn btn-primary"
                        data-name="apply-filters-button"
                    >
                        Aplicar Filtros
                    </button>
                </div>
            </div>
        );
    } catch (error) {
        console.error('FilterPanel component error:', error);
        reportError(error);
        return <div className="filter-panel error">Erro ao carregar filtros.</div>;
    }
}

export default FilterPanel;