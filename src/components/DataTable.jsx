import React, { useState } from 'react';

function DataTable({ columns, data, onRowClick, onSort }) {
    const reportError = (error) => console.error("DataTable Error:", error);
    try {
        const [sortConfig, setSortConfig] = useState(null);

        const handleSort = (key) => {
            if (!onSort) return;
            let direction = 'asc';
            if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
                direction = 'desc';
            }
            setSortConfig({ key, direction });
            onSort(key, direction);
        };

        return (
            <div className="table-container overflow-auto rounded-lg border border-gray-200" data-name="data-table">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            {columns.map((column) => (
                                <th
                                    key={column.key}
                                    scope="col"
                                    className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.sortable && onSort ? 'cursor-pointer sortable' : ''}`}
                                    onClick={column.sortable && onSort ? () => handleSort(column.key) : undefined}
                                    data-name={`column-header-${column.key}`}
                                >
                                    <div className="flex items-center">
                                        {column.title}
                                        {column.sortable && onSort && (
                                            <span className="sort-icon ml-1.5">
                                                <i
                                                    className={`fas fa-sort${sortConfig?.key === column.key ? (sortConfig.direction === 'asc' ? '-up' : '-down') : ''} ${sortConfig?.key === column.key ? 'active text-blue-600' : 'text-gray-400'}`}
                                                ></i>
                                            </span>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {(data || []).map((row, rowIndex) => (
                            <tr
                                key={row.id || rowIndex} // Prefer a unique row ID if available
                                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''}`}
                                onClick={onRowClick ? () => onRowClick(row) : undefined}
                                data-name={`table-row-${row.id || rowIndex}`}
                            >
                                {columns.map((column) => (
                                    <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                        {column.render ? column.render(row[column.key], row) : row[column.key]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {(!data || data.length === 0) && (
                    <div className="text-center py-8 text-gray-500">
                         Nenhum dado para exibir.
                    </div>
                )}
            </div>
        );
    } catch (error) {
        console.error('DataTable component error:', error);
        reportError(error);
         return <div className="table-container error">Erro ao carregar a tabela.</div>;
    }
}

export default DataTable;