import React, { useState } from 'react';
import * as XLSX from 'xlsx';

function FileUploaderEstoque({ onFileUpload, user, onClose }) {
    const reportError = (error, context = "FileUploaderEstoque") => console.error(`[${context}] Error:`, error?.message || error);

    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) {
                setError('Formato de arquivo inválido. Use .xlsx ou .xls.');
                setFile(null);
                if(e.target) e.target.value = '';
                return;
            }
            setFile(selectedFile);
            setError(null);
        } else {
            setFile(null);
        }
    };

    const handleUpload = async () => {
        if (!file) { setError('Selecione um arquivo primeiro'); return; }
        if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios.'); return; }
        if (!user || !user.id) { setError('Erro: Usuário não identificado.'); return; }
        setLoading(true);
        setError(null);
        try {
            const processedData = await readAndProcessEstoqueExcel(file, user.id);

            if (!processedData || processedData.length === 0) {
                 throw new Error("Nenhum dado válido foi extraído do arquivo. Verifique a estrutura ou os logs.");
            }

            await onFileUpload(processedData);
            setFile(null);
            setError(null);
            const inputElement = document.getElementById('estoque-file-upload-input');
            if (inputElement) inputElement.value = '';
            if (onClose) onClose();
        } catch (err) {
            reportError(err, "handleUpload");
            setError(`Erro no Upload/Processamento: ${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    const parseBrazilianNumberInternal = (value) => {
        if (typeof value === 'number' && !isNaN(value)) return value;
        if (value === null || value === undefined) return null;
        let valueStr = String(value).trim();
        if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?', '#NULL!'].includes(valueStr.toUpperCase())) return null;
        valueStr = valueStr.replace(/R\$\s?/g, '').trim();
        const hasComma = valueStr.includes(',');
        const hasDot = valueStr.includes('.');
        let cleanedStr = valueStr;
        if (hasComma) {
            cleanedStr = valueStr.replace(/\./g, '').replace(',', '.');
        } else if (hasDot) {
            const dotCount = (valueStr.match(/\./g) || []).length;
            if (dotCount > 1) {
                cleanedStr = valueStr.replace(/\./g, '');
            }
        }
        cleanedStr = cleanedStr.replace(',', '.');
        const number = parseFloat(cleanedStr);
        if (isNaN(number)) { return null; }
        if (Math.abs(number) > 1e12) { return null; }
        return number;
    };

    const parseDateFromHeader = (headerValue) => {
        let parsedDate = null;
        if (headerValue instanceof Date && !isNaN(headerValue.getTime())) {
            parsedDate = new Date(Date.UTC(headerValue.getFullYear(), headerValue.getMonth(), headerValue.getDate()));
        } else if (typeof headerValue === 'string') {
            const trimmedValue = headerValue.trim();
            const dateMatchYMD = trimmedValue.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
            const dateMatchDMYFull = trimmedValue.match(/^(\d{1,2})[\\/](\d{1,2})[\\/](\d{4})$/);
            if (dateMatchYMD) {
                const y = parseInt(dateMatchYMD[1], 10);
                const m = parseInt(dateMatchYMD[2], 10);
                const d = parseInt(dateMatchYMD[3], 10);
                if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) {
                    parsedDate = new Date(Date.UTC(y, m - 1, d));
                }
            } else if (dateMatchDMYFull) {
                const d = parseInt(dateMatchDMYFull[1], 10);
                const m = parseInt(dateMatchDMYFull[2], 10);
                const y = parseInt(dateMatchDMYFull[3], 10);
                if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) {
                   parsedDate = new Date(Date.UTC(y, m - 1, d));
               }
           }
       } else if (typeof headerValue === 'number' && headerValue > 20000 && headerValue < 60000) {
           try {
                const dateInfo = XLSX.SSF.parse_date_code(headerValue);
               if (dateInfo && dateInfo.y && dateInfo.m && dateInfo.d && !isNaN(dateInfo.y)) {
                    parsedDate = new Date(Date.UTC(dateInfo.y, dateInfo.m - 1, dateInfo.d));
                }
            } catch(e){}
        }
       if (parsedDate && !isNaN(parsedDate.getTime())) {
           return parsedDate.toISOString().split('T')[0];
       }
        return null;
    };

    const readAndProcessEstoqueExcel = async (fileToRead, userId) => {
        const reader = new FileReader();
        const fileData = await new Promise((resolve, reject) => {
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(new Error("Erro ao ler arquivo"));
            reader.readAsArrayBuffer(fileToRead);
        });

        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true, cellNF: true, cellStyles: false});
        const allMetrics = [];

        const productCodes = ['click', 'mt', 'capital']; // Siglas dos produtos

        for (let sheetIndex = 0; sheetIndex < 3; sheetIndex++) { // Itera pelas 3 abas
            const sheetName = workbook.SheetNames[sheetIndex];
            if (!sheetName) {
                console.warn(`Aba ${sheetIndex} não encontrada.`);
                continue; // Pula para a próxima aba se esta não existir
            }

            const worksheet = workbook.Sheets[sheetName];
            const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: null });


            const metrics = [];
            let currentItemType = null;
            let dateColumnsMap = {};
            const itemTypes = ["PLÁSTICO", "CARTA", "ENVELOPE"];
            const metricTypeMap = {
                 "Estoque Dia Ant.": "Estoque Dia Ant.",
                 "Embossing D+2": "Embossing",
                 "Embossing D-2": "Embossing",
                 "Saldo": "Saldo"
            };
            const knownMetricRows = Object.keys(metricTypeMap);
            const productCode = productCodes[sheetIndex]; // Define o product_code based on sheetIndex

            for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
                const row = sheetData[rowIndex];
                if (!row || row.length === 0) {
                    currentItemType = null;
                    dateColumnsMap = {};
                    continue;
                }

                const firstCellRaw = row[0];
                const firstCellValue = firstCellRaw ? String(firstCellRaw).trim() : "";

                if (itemTypes.includes(firstCellValue)) {
                    currentItemType = firstCellValue;
                    dateColumnsMap = {};
                    let datesFound = 0;

                    for (let colIndex = 1; colIndex < row.length; colIndex++) {
                        const metricDate = parseDateFromHeader(row[colIndex]);
                        if (metricDate) {
                            dateColumnsMap[colIndex] = metricDate;
                            datesFound++;
                            if (colIndex + 1 < row.length && String(row[colIndex + 1]).trim() === '%') colIndex++;
                        }
                    }

                    if (datesFound === 0) {
                         currentItemType = null;
                    }
                    continue;
                }

                if (currentItemType && Object.keys(dateColumnsMap).length > 0) {
                    let mappedMetricType = null;
                    if (knownMetricRows.includes(firstCellValue)) {
                        mappedMetricType = metricTypeMap[firstCellValue];
                    } else if (firstCellValue.toUpperCase() === "COMPRA PERDA" || firstCellValue.toUpperCase().startsWith("OBSERVAÇÃO")) {
                        continue;
                    }

                   if (mappedMetricType) {
                       let metricsAdded = 0;
                       for (const colIndexStr in dateColumnsMap) {
                            const colIndex = parseInt(colIndexStr, 10);
                            const metricDate = dateColumnsMap[colIndex];
                           if (colIndex < row.length) {
                                const value = parseBrazilianNumberInternal(row[colIndex]);
                                if (value !== null) {
                                    metrics.push({
                                        item_type: currentItemType,
                                        metric_date: metricDate,
                                        metric_type: mappedMetricType,
                                        value: value,
                                        uploaded_by: userId,
                                        product_code: productCode // Adiciona o product_code aqui
                                    });
                                    metricsAdded++;
                                }
                           }
                        }
                    } else if (firstCellValue) {
                        currentItemType = null;
                        dateColumnsMap = {};
                    }
                }
            }
            allMetrics.push(...metrics); // Adiciona as métricas da aba atual à lista geral
        } // Fim do loop das abas

        return allMetrics;
    };

    const canUpload = user && user.role !== 'guest';

    return (
        <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="estoque-file-uploader">
            <input type="file" id="estoque-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} />
            <i className={`fas fa-boxes-stacked text-4xl mb-4 ${canUpload ? 'text-indigo-500' : 'text-gray-400'}`}></i>
            <p className="font-semibold text-lg mb-2">Upload Relatório de Estoque</p>
            <div className="file-upload-text mb-4">
                 {file ? (
                    <p className="font-medium" data-name="selected-estoque-file">{file.name}</p>
                 ) : (
                    <p className="text-gray-600">
                         Arraste ou{' '}
                         <label htmlFor="estoque-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-indigo-600 hover:text-indigo-800 underline' : 'text-gray-500 cursor-not-allowed'}`}>
                            selecione o arquivo
                         </label>.
                     </p>
                 )}
                <p className="text-xs text-gray-500 mt-1">(Formato esperado: Blocos por item com datas nas colunas)</p>
             </div>
             {!canUpload ? (
                <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="estoque-guest-error">
                    <i className="fas fa-info-circle mr-2"></i>
                     { user?.role === 'guest' ? 'Convidados não podem carregar.' : 'Faça login para carregar.' }
                 </div>
             ) : (
                <React.Fragment>
                    {file && (
                        <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="estoque-upload-button">
                             {loading ? (
                                 <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment>
                             ) : (
                                <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Estoque</React.Fragment>
                            )}
                         </button>
                    )}
                    {error && (
                        <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="estoque-upload-error">
                            <i className="fas fa-exclamation-circle mr-2"></i>
                             {error}
                         </div>
                     )}
                </React.Fragment>
             )}
             {onClose && (
                <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader">
                     <i className="fas fa-times"></i>
                </button>
             )}
        </div>
    );
}

export default FileUploaderEstoque;