import React, { useState } from 'react';
import * as XLSX from 'xlsx';

function FileUploader({ onFileUpload, user, onClose }) {
    const reportError = (error) => console.error("FileUploader Error:", error);

    try {
        const [file, setFile] = useState(null);
        const [error, setError] = useState(null);
        const [loading, setLoading] = useState(false);

        const handleFileChange = (e) => {
            const selectedFile = e.target.files[0];
            if (selectedFile) {
                if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) {
                    setError('Formato de arquivo inválido. Use .xlsx ou .xls.'); setFile(null); e.target.value = ''; return;
                }
                setFile(selectedFile); setError(null); console.log("Arquivo selecionado:", selectedFile.name);
            } else { setFile(null); }
        };

        const handleUpload = async () => {
            if (!file) { setError('Selecione um arquivo primeiro'); return; }
            if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios. Faça login para continuar.'); return; }
            if (!user || !user.id) { setError('Erro: Usuário não identificado. Faça login novamente.'); console.error("Upload attempt without valid user ID", user); return; }
            setLoading(true); setError(null); console.log("Iniciando upload e processamento...");
            try {
                const processedData = await readAndProcessExcelFile(file, user.id);
                if (processedData.dailyMetrics.length === 0 && processedData.summaryMetrics.length === 0) {
                    setLoading(false); if (!error) { setError("Nenhum dado (diário ou resumo) foi extraído do arquivo. Verifique o formato."); } return;
                }
                console.log(`Processamento concluído. Métricas diárias: ${processedData.dailyMetrics.length}, Métricas de resumo: ${processedData.summaryMetrics.length}. Enviando...`);
                await onFileUpload(processedData);
                console.log("Dados enviados com sucesso via onFileUpload.");
                setFile(null); setError(null); if (document.getElementById('file-upload-input')) { document.getElementById('file-upload-input').value = ''; } if (onClose) onClose();
            } catch (err) {
                console.error("Erro durante o upload ou processamento:", err); setError(`Erro ao processar: ${err.message}`); reportError(err);
            } finally {
                setLoading(false); console.log("Processo de upload finalizado (com sucesso ou erro).");
            }
        };

        const parseBrazilianNumberInternal = (value) => {
            if (typeof value === 'number' && !isNaN(value)) {
                 return value;
            }
            if (value === null || value === undefined) {
                 return null;
            }
            let valueStr = String(value).trim();
            if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?'].includes(valueStr.toUpperCase())) {
                return null;
            }
            valueStr = valueStr.replace(/R\$\s?/g, '').trim();
            const hasComma = valueStr.includes(',');
            const hasDot = valueStr.includes('.');
            let cleanedStr = valueStr;
            if (hasComma) {
                cleanedStr = valueStr.replace(/\./g, '').replace(',', '.');
            } else if (hasDot) {
                const lastDotIndex = valueStr.lastIndexOf('.');
                if (lastDotIndex !== -1) {
                    const integerPart = valueStr.substring(0, lastDotIndex).replace(/\./g, '');
                    const decimalPart = valueStr.substring(lastDotIndex);
                    cleanedStr = integerPart + decimalPart;
                }
            }
            const number = parseFloat(cleanedStr);
            if (isNaN(number)) {
                 console.warn(`[DEBUG PARSE] Failed to parse: Original='${value}', Cleaned='${cleanedStr}' -> NaN`);
                 return null;
            } else {
                 return number;
            }
        };

        const readAndProcessExcelFile = (fileToRead, userId) => {
             console.log(`[readAndProcessExcelFile] Iniciando leitura: ${fileToRead.name}`);
             return new Promise((resolve, reject) => {
                 const reader = new FileReader();
                 reader.onload = (e) => {
                     try {
                         const data = e.target.result;
                         const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                         const firstSheetName = workbook.SheetNames[0];
                         if (!firstSheetName) return reject(new Error('A planilha está vazia.'));
                         console.log(`[readAndProcessExcelFile] Aba: "${firstSheetName}"`);
                         const worksheet = workbook.Sheets[firstSheetName];
                         const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
                         console.log(`[readAndProcessExcelFile] Linhas lidas: ${sheetData.length}.`);
                         if (sheetData.length < 3) return reject(new Error('Planilha com poucas linhas.'));

                         const processedMetrics = [];
                         const processedSummaryMetrics = [];
                         let currentMainCategory = null;
                         const dateColumns = {};
                         let totalColIndex = -1;
                         let mediaColIndex = -1;
                         let headerRowIndex = -1;
                         let fileYear = new Date().getFullYear();
                         let summaryMetricMonth = null;

                         console.log("[readAndProcessExcelFile] Procurando cabeçalho...");
                         for (let rowIndex = 0; rowIndex < Math.min(sheetData.length, 10); rowIndex++) {
                            const row = sheetData[rowIndex];
                            if (row && row.length > 2) {
                                let potentialDateCount = 0; let hasTotal = false; let hasMedia = false;
                                for (let colIdx = 1; colIdx < row.length; colIdx++) {
                                    const cellValue = row[colIdx];
                                    const cellStr = String(cellValue).toUpperCase().trim();
                                    if (cellValue instanceof Date && !isNaN(cellValue)) potentialDateCount++;
                                    else if (typeof cellValue === 'string') {
                                        if (/^(\d{1,2}[-\/][A-ZÇ]+)|([A-ZÇ]+[\s.]+\d{2})$/.test(cellStr)) potentialDateCount++;
                                        else if (cellStr === 'TOTAL') hasTotal = true;
                                        else if (cellStr === 'MEDIA' || cellStr === 'MÉDIA') hasMedia = true;
                                    } else if (typeof cellValue === 'number' && cellValue > 2000 && cellValue < 50000) {
                                         try { if (!isNaN(XLSX.SSF.parse_date_code(cellValue).y)) potentialDateCount++; } catch(e){}
                                    }
                                }
                                if (potentialDateCount >= 2 && (hasTotal || hasMedia)) {
                                    headerRowIndex = rowIndex;
                                    console.log(`[readAndProcessExcelFile] Cabeçalho encontrado no índice: ${headerRowIndex}`);
                                    let titleText = '';
                                    if(headerRowIndex > 0 && sheetData[headerRowIndex - 1]) titleText = sheetData[headerRowIndex - 1].map(String).join(' ').toUpperCase();
                                    if (!titleText && headerRowIndex > 1 && sheetData[headerRowIndex - 2]) titleText = sheetData[headerRowIndex - 2].map(String).join(' ').toUpperCase();
                                    const yearMatch = titleText.match(/(\d{4})/); const dateMatch = titleText.match(/\d{1,2}\/\d{1,2}\/(\d{4})/);
                                    if (yearMatch && yearMatch[1]) fileYear = parseInt(yearMatch[1], 10);
                                    else if (dateMatch && dateMatch[1]) fileYear = parseInt(dateMatch[1], 10);
                                    console.log(`[readAndProcessExcelFile] Ano inferido/definido inicial: ${fileYear}`);
                                    break;
                                }
                             }
                         }
                         if (headerRowIndex === -1) return reject(new Error('Linha de cabeçalho não encontrada.'));

                         const headerRow = sheetData[headerRowIndex];
                         const monthMap = { 'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5, 'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11 };
                         let firstValidDate = null;

                         const currentDate = new Date();
                         const currentYear = currentDate.getFullYear();
                         const currentMonthIndex = currentDate.getMonth();

                         console.log("[readAndProcessExcelFile] Mapeando colunas...");
                         for (let colIndex = 1; colIndex < headerRow.length; colIndex++) {
                             const headerValue = headerRow[colIndex]; if (!headerValue) continue;
                             const headerString = String(headerValue).toUpperCase().trim();

                             if (headerString === 'TOTAL') { totalColIndex = colIndex; console.log(`   - TOTAL: idx ${colIndex}`); continue; }
                             if (headerString === 'MEDIA' || headerString === 'MÉDIA') { mediaColIndex = colIndex; console.log(`   - MEDIA: idx ${colIndex}`); continue; }
                             if (['MÊS', '#REF!'].some(skip => headerString.includes(skip))) continue;

                             let parsedDate = null;
                             const annualMatch = headerString.match(/^([A-ZÇ]+)[\s.]+(\d{2})$/);
                             const monthlyMatch = headerString.match(/^(\d{1,2})[-\/]([A-ZÇ]+)$/);

                             if (annualMatch && annualMatch[1] in monthMap) {
                                 const m = monthMap[annualMatch[1]], y = parseInt(annualMatch[2], 10) + 2000;
                                 parsedDate = new Date(Date.UTC(y, m, 1));
                             } else if (monthlyMatch && monthlyMatch[2] in monthMap) {
                                 const d = parseInt(monthlyMatch[1], 10);
                                 const m = monthMap[monthlyMatch[2]];
                                 let yearForThisDate = fileYear;
                                 if (yearForThisDate === currentYear && m > currentMonthIndex) {
                                     yearForThisDate = currentYear - 1;
                                     console.log(`[DEBUG] Data "${headerString}": Mês ${m+1} > Mês Atual ${currentMonthIndex+1}. Assumindo ano anterior: ${yearForThisDate}`);
                                 }
                                 parsedDate = new Date(Date.UTC(yearForThisDate, m, d));
                            } else if (headerValue instanceof Date && !isNaN(headerValue)) {
                                 parsedDate = new Date(Date.UTC(headerValue.getFullYear(), headerValue.getMonth(), headerValue.getDate()));
                            } else if (typeof headerValue === 'number' && headerValue > 2000 && headerValue < 60000) {
                                try {
                                    const dateInfo = XLSX.SSF.parse_date_code(headerValue);
                                    if (dateInfo && !isNaN(dateInfo.y)) {
                                        let yearForThisDate = dateInfo.y;
                                        let monthIndex = dateInfo.m - 1;
                                        if (yearForThisDate === currentYear && monthIndex > currentMonthIndex) {
                                             yearForThisDate = currentYear - 1;
                                             console.log(`[DEBUG] Data Numérica ${headerValue}: Mês ${monthIndex+1} > Mês Atual ${currentMonthIndex+1}. Assumindo ano anterior: ${yearForThisDate}`);
                                        }
                                        parsedDate = new Date(Date.UTC(yearForThisDate, monthIndex, dateInfo.d));
                                    }
                                } catch(e){ console.warn(`[DEBUG] Falha ao converter número serial ${headerValue} para data.`); }
                             }

                             if (parsedDate && !isNaN(parsedDate)) {
                                 dateColumns[colIndex] = parsedDate;
                                 if (!firstValidDate || parsedDate < firstValidDate) firstValidDate = parsedDate;
                             } else {
                                 console.warn(`[DEBUG] Cabeçalho "${headerString}" (valor: ${headerValue}) na coluna ${colIndex} não pôde ser parseado como data válida.`);
                             }
                         }

                         if (Object.keys(dateColumns).length === 0) console.warn("[readAndProcessExcelFile] Nenhuma coluna de data encontrada.");
                         if (totalColIndex === -1) console.warn("[readAndProcessExcelFile] Coluna TOTAL não encontrada.");
                         if (mediaColIndex === -1) console.warn("[readAndProcessExcelFile] Coluna MEDIA não encontrada.");
                         if (firstValidDate) { const d = new Date(Date.UTC(firstValidDate.getUTCFullYear(), firstValidDate.getUTCMonth(), 1)); summaryMetricMonth = d.toISOString().split('T')[0]; console.log(`[readAndProcessExcelFile] Mês para sumários: ${summaryMetricMonth}`); }
                         else return reject(new Error("Não foi possível determinar o mês para os sumários (nenhuma data válida)."));


                         console.log("[readAndProcessExcelFile] Iterando linhas de dados...");
                         const mainCategoryKeywords = ['NÃO DIGITADAS', 'DIGITADAS', 'ESTEIRA'];
                         const specialCategoriesMap = {
                             "CONTAS ATIVAS": "CONTAS ATIVAS",
                             "FAIXA DE LIMITE": "FAIXA DE LIMITE"
                         };
                         const isRowBlank = (row) => !row || row.length === 0 || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '');
                         const isDateHeaderLike = (value) => { if (!value) return false; const str = String(value).toUpperCase().trim(); return /^(\d{1,2}[-\/][A-ZÇ]+)|([A-ZÇ]+[\s.]+\d{2})$/.test(str); };

                         for (let rowIndex = headerRowIndex + 1; rowIndex < sheetData.length; rowIndex++) {
                             const row = sheetData[rowIndex];

                             if (isRowBlank(row)) {
                                 console.log(`[DEBUG] Linha ${rowIndex + 1}: Parando (linha completamente em branco).`);
                                 break;
                             }

                             const firstCell = row[0];
                             if (firstCell === null || firstCell === undefined || String(firstCell).trim() === '') {
                                 console.log(`[DEBUG] Linha ${rowIndex + 1}: Ignorada (primeira célula vazia/nula, mas linha não totalmente em branco).`);
                                 continue;
                             }
                             let rowLabel = String(firstCell).trim();
                             const upperLabel = rowLabel.toUpperCase();


                             if (upperLabel === 'GERAL' || upperLabel === 'INTEGRADAS') {
                                 console.log(`[DEBUG] Linha ${rowIndex + 1} ("${rowLabel}"): Ignorada (Label GERAL ou INTEGRADAS).`);
                                 continue;
                             }

                             let isCategoryDefinitionRow = false;
                             let skipDataProcessing = false;

                             if (mainCategoryKeywords.includes(upperLabel)) {
                                 currentMainCategory = upperLabel;
                                 isCategoryDefinitionRow = true;
                                 console.log(`[DEBUG] Linha ${rowIndex + 1} ("${rowLabel}"): Define/Confirma Categoria Principal = ${currentMainCategory}`);

                                 const secondCellValue = row.length > 1 ? row[1] : null;
                                 if (isDateHeaderLike(String(secondCellValue))) {
                                     console.log(`[DEBUG] Linha ${rowIndex + 1} ("${rowLabel}"): É um header secundário, dados serão ignorados.`);
                                     skipDataProcessing = true;
                                 }
                             }

                             if (!currentMainCategory) {
                                 console.warn(`[DEBUG] Linha ${rowIndex + 1} ("${rowLabel}"): Pulada (sem categoria principal ativa).`);
                                 continue;
                             }
                             if (skipDataProcessing) {
                                 continue;
                             }

                             let finalCategory = currentMainCategory;
                             const subCategory = rowLabel;
                             for (const specialPrefix in specialCategoriesMap) {
                                 if (upperLabel.startsWith(specialPrefix)) {
                                     finalCategory = specialCategoriesMap[specialPrefix];
                                     console.log(`[DEBUG] Linha ${rowIndex + 1} ("${rowLabel}"): Categoria Final ajustada para ${finalCategory}`);
                                     break;
                                 }
                             }

                             if (!isCategoryDefinitionRow) {
                                 let dailyAdded = 0;
                                 for (const colIndexStr in dateColumns) {
                                     const colIndex = parseInt(colIndexStr, 10);
                                     const metricDateObj = dateColumns[colIndex];
                                     if (colIndex < row.length) {
                                         const rawValue = row[colIndex];
                                         const value = parseBrazilianNumberInternal(rawValue);
                                         if (value !== null) {
                                             const metricDate = metricDateObj.toISOString().split('T')[0];
                                             const metricMonth = summaryMetricMonth;
                                             processedMetrics.push({ metric_date: metricDate, metric_month: metricMonth, category: finalCategory, sub_category: subCategory, value: value, source_file_type: 'monthly', uploaded_by: userId });
                                             dailyAdded++;
                                         }
                                     }
                                 }
                                 if (dailyAdded > 0) console.log(`[DEBUG] Linha ${rowIndex + 1} ("${subCategory}"): ${dailyAdded} métricas DIÁRIAS adicionadas (incluindo zeros).`);
                                 else console.log(`[DEBUG] Linha ${rowIndex + 1} ("${subCategory}"): Nenhuma métrica DIÁRIA adicionada (valores nulos/inválidos).`);
                             } else {
                                 console.log(`[DEBUG] Linha ${rowIndex + 1} ("${subCategory}"): Pulada para dados DIÁRIOS (Definição de Categoria Primária).`);
                             }

                             if (summaryMetricMonth && (totalColIndex !== -1 || mediaColIndex !== -1)) {
                                 const rawTotalValue = (totalColIndex !== -1 && totalColIndex < row.length) ? row[totalColIndex] : null;
                                 const rawAverageValue = (mediaColIndex !== -1 && mediaColIndex < row.length) ? row[mediaColIndex] : null;

                                 const totalValue = parseBrazilianNumberInternal(rawTotalValue);
                                 const averageValue = parseBrazilianNumberInternal(rawAverageValue);

                                 if (totalValue !== null || averageValue !== null) {
                                     processedSummaryMetrics.push({
                                         metric_month: summaryMetricMonth,
                                         category: finalCategory,
                                         sub_category: subCategory,
                                         total_value: totalValue,
                                         average_value: averageValue,
                                         source_file_type: 'monthly',
                                         uploaded_by: userId
                                     });
                                     console.log(`[DEBUG] Linha ${rowIndex + 1} ("${subCategory}"): Métrica de RESUMO adicionada (T:${totalValue}, A:${averageValue}) (incluindo zeros).`);
                                 } else {
                                     console.log(`[DEBUG] Linha ${rowIndex + 1} ("${subCategory}"): Nenhuma métrica de RESUMO adicionada (valores nulos/inválidos).`);
                                 }
                             }
                         }

                         console.log(`[readAndProcessExcelFile] Iteração finalizada. Métricas diárias: ${processedMetrics.length}, Métricas de resumo: ${processedSummaryMetrics.length}`);
                         if (processedMetrics.length === 0 && processedSummaryMetrics.length === 0) return reject(new Error('Nenhum dado válido extraído.'));

                         resolve({ dailyMetrics: processedMetrics, summaryMetrics: processedSummaryMetrics });

                     } catch (err) { reject(new Error(`Erro no processamento: ${err.message}`)); }
                 };
                 reader.onerror = (error) => reject(new Error('Erro ao ler arquivo.'));
                 reader.readAsArrayBuffer(fileToRead);
             });
         };

        const canUpload = user && user.role !== 'guest';

        return (
             <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="file-uploader">
                 <input type="file" id="file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} />
                 <i className={`fas fa-file-excel text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
                 <div className="file-upload-text mb-4">
                     {file ? ( <p className="font-medium" data-name="selected-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste e solte o arquivo aqui ou{' '} <label htmlFor="file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione um arquivo </label>. </p> )}
                     <p className="text-xs text-gray-500 mt-1">(Formato esperado: .xlsx ou .xls com datas/meses/total/media nas colunas e categorias/métricas nas linhas)</p>
                 </div>
                 {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar arquivos. Faça login.' : 'Faça login para carregar arquivos.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Relatório</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
                 {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
             </div>
        );
    } catch (componentError) {
        console.error('FileUploader component error:', componentError);
        reportError(componentError);
        return <div className="file-upload-container error p-6 bg-red-100 text-red-700 rounded-lg">Erro ao carregar o componente de upload. Tente recarregar a página.</div>;
    }
}

export default FileUploader;