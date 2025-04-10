import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import getSupabaseClient, { upsertLogisticsDailyConsolidatedData, insertLogisticsDailyMetrics } from '../utils/supabaseClient';

const parseBrazilianNumberInternal = (value) => { if (typeof value === 'number' && !isNaN(value)) return value; if (value === null || value === undefined) return null; let valueStr = String(value).trim(); if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?', '#NULL!'].includes(valueStr.toUpperCase())) return null; valueStr = valueStr.replace(/R\$\s?/g, '').trim(); const hasComma = valueStr.includes(','); const hasDot = valueStr.includes('.'); let cleanedStr = valueStr; if (hasComma) { cleanedStr = valueStr.replace(/\./g, '').replace(',', '.'); } else if (hasDot) { const dotCount = (valueStr.match(/\./g) || []).length; if (dotCount > 1) { cleanedStr = valueStr.replace(/\./g, ''); } } cleanedStr = cleanedStr.replace(',', '.'); const number = parseFloat(cleanedStr); if (isNaN(number)) { return null; } if (Math.abs(number) > 1e12) { return null; } return number; };
const parseDateFromHeader = (headerValue) => { let parsedDate = null; if (headerValue instanceof Date && !isNaN(headerValue.getTime())) { parsedDate = new Date(Date.UTC(headerValue.getFullYear(), headerValue.getMonth(), headerValue.getDate())); } else if (typeof headerValue === 'string') { const trimmedValue = headerValue.trim(); const dateMatchYMD = trimmedValue.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/); const dateMatchDMYFull = trimmedValue.match(/^(\d{1,2})[\\/](\d{1,2})[\\/](\d{4})$/); if (dateMatchYMD) { const y = parseInt(dateMatchYMD[1], 10); const m = parseInt(dateMatchYMD[2], 10); const d = parseInt(dateMatchYMD[3], 10); if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) { parsedDate = new Date(Date.UTC(y, m - 1, d)); } } else if (dateMatchDMYFull) { const d = parseInt(dateMatchDMYFull[1], 10); const m = parseInt(dateMatchDMYFull[2], 10); const y = parseInt(dateMatchDMYFull[3], 10); if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) { parsedDate = new Date(Date.UTC(y, m - 1, d)); } } } else if (typeof headerValue === 'number' && headerValue > 20000 && headerValue < 60000) { try { const dateInfo = XLSX.SSF.parse_date_code(headerValue); if (dateInfo && dateInfo.y && dateInfo.m && dateInfo.d && !isNaN(dateInfo.y)) { parsedDate = new Date(Date.UTC(dateInfo.y, dateInfo.m - 1, dateInfo.d)); } } catch(e){ console.error(`[parseDate] Erro ao parsear Excel Serial ${headerValue}:`, e); } } if (parsedDate && !isNaN(parsedDate.getTime())) { return parsedDate.toISOString().split('T')[0]; } return null; };

const regionStateMap = {
    "NORTE": ["ACRE", "AMAPA", "AMAZONAS", "PARÁ", "RONDONIA", "RORAIMA", "TOCANTINS"],
    "NORDESTE": ["ALAGOAS", "BAHIA", "CEARA", "MARANHÃO", "PARAIBA", "PERNAMBUCO", "PIAUI", "RG NORTE", "SERGIPE"],
    "CENTRO OESTE": ["MATO GROSSO", "MATO GROSSO SUL", "DISTRITO FEDERAL", "GOIAS"],
    "SUDESTE": ["MINAS GERAIS", "SÃO PAULO", "RIO DE JANEIRO", "ESPÍRITO SANTO"],
    "SUL": ["PARANA", "SANTA CATARINA", "RG SUL"]
};
const allStates = Object.values(regionStateMap).flat();

// Lógica de Processamento (Adaptada para o arquivo diário)
const processSheet = (sheetData, sheetName, userId, sheetIndex, fileType) => {
    console.log(`[processSheet - Daily] Iniciando aba "${sheetName}" (Índice ${sheetIndex}) - Tipo: ${fileType}`);
    const metrics = [];
    const uniqueKeys = new Set(); // Para evitar duplicatas exatas
    let dateColumnsMap = {};
    let currentCategory = null;
    let currentRegion = null;
    const regions = Object.keys(regionStateMap);
    const MIN_VALID_DATES_IN_HEADER = 1;
    const expectedCategories = ["ENTREGAS -", "DEVOLUÇÃO -", "ENTREGA /"];
    const stateOrSubCategoryColumn = 0;
    let headerRowIndex = -1;

    // Encontrar linha de cabeçalho com datas
    for (let r = 0; r < Math.min(sheetData.length, 15); r++) {
        const row = sheetData[r]; if (!row || row.length < 2) continue;
        let potentialDateMap = {}; let validDatesFound = 0;
        let firstColUpper = String(row[stateOrSubCategoryColumn] || '').trim().toUpperCase();
        let isLikelyHeaderRow = (sheetIndex === 0 && expectedCategories.some(cat => firstColUpper.startsWith(cat))) || (sheetIndex === 1 && regions.includes(firstColUpper));
        if (isLikelyHeaderRow) {
            for (let c = 1; c < row.length; c++) {
                const metricDate = parseDateFromHeader(row[c]);
                if (metricDate) { validDatesFound++; potentialDateMap[c] = metricDate; if (c + 1 < row.length && String(row[c + 1]).trim() === '%') c++; }
            }
            if (validDatesFound >= MIN_VALID_DATES_IN_HEADER) { dateColumnsMap = potentialDateMap; headerRowIndex = r; console.log(`%c[Sheet ${sheetIndex} - Daily] Linha Cabeçalho Data índice ${r}. Datas Mapeadas: OK`, 'color: blue; font-weight: bold;'); break; }
        }
    }
    if (headerRowIndex === -1) { console.error(`[Sheet ${sheetIndex} - Daily] Nenhuma linha cabeçalho com datas válidas.`); return []; }

    console.log(`[Sheet ${sheetIndex} - Daily] Iniciando processamento de dados após cabeçalho.`);
    currentCategory = null; currentRegion = null;

    for (let rowIndex = headerRowIndex + 1; rowIndex < sheetData.length; rowIndex++) {
        const row = sheetData[rowIndex];
        if (!row || row.length <= stateOrSubCategoryColumn || !row[stateOrSubCategoryColumn] || String(row[stateOrSubCategoryColumn]).trim() === '') { continue; }
        let rowLabel = String(row[stateOrSubCategoryColumn]).trim().replace(/[\r\n]+/g, ' ');
        let rowLabelUpper = rowLabel.toUpperCase();
        let isSectionHeader = false;

        // Lógica para identificar início/fim de seção
        if (sheetIndex === 0) { // Aba Consolidado Diário
            if (expectedCategories.some(cat => rowLabelUpper.startsWith(cat))) { currentCategory = rowLabelUpper.startsWith("ENTREGAS -") ? "ENTREGAS" : (rowLabelUpper.startsWith("DEVOLUÇÃO -") ? "DEVOLUÇÃO - MOTIVOS" : "ENTREGA / REGIÃO"); isSectionHeader = true; }
            else if (rowLabelUpper === 'GERAL' || rowLabelUpper === 'TOTAL') { if (currentCategory === 'ENTREGA / REGIÃO') { currentCategory = null; } isSectionHeader = true; }
        } else { // Aba Estado Diário
            if (regions.includes(rowLabelUpper)) { currentRegion = rowLabelUpper; isSectionHeader = true; }
            else if (rowLabelUpper === 'GERAL' || rowLabelUpper === 'TOTAL') { if(currentRegion) { currentRegion = null; } isSectionHeader = true; }
        }

        if (isSectionHeader) continue; // Pula linhas de cabeçalho

        // Processa linha de dados se houver contexto e mapa de datas
        if ((sheetIndex === 0 && currentCategory) || (sheetIndex === 1 && currentRegion)) {
            if (Object.keys(dateColumnsMap).length > 0) {
                if (sheetIndex === 0) { // Aba Consolidado Diário
                    const subCategory = rowLabel;
                    if (subCategory.toUpperCase() === 'GERAL' || subCategory.toUpperCase() === 'TOTAL' || expectedCategories.some(cat => subCategory.toUpperCase().startsWith(cat))) continue;
                    for (const colIndexStr in dateColumnsMap) { const colIndex = parseInt(colIndexStr, 10); const metricDateStr = dateColumnsMap[colIndex]; if (metricDateStr && colIndex < row.length) { const value = parseBrazilianNumberInternal(row[colIndex]); if (value !== null) { const uniqueKey = `${metricDateStr}-${currentCategory}-${subCategory}`; if (!uniqueKeys.has(uniqueKey)) { metrics.push({ metric_date: metricDateStr, category: currentCategory, sub_category: subCategory, value: value, source_file_type: fileType, uploaded_by: userId }); uniqueKeys.add(uniqueKey); } } } }
                } else { // Aba Estado Diário
                    const state = rowLabel.substring(0, 50);
                    const stateUpper = state.toUpperCase();
                    if (regionStateMap[currentRegion]?.map(s=>s.toUpperCase()).includes(stateUpper)) {
                         const metricKey = 'processed_daily'; // Chave para dados DIÁRIOS por estado
                        for (const colIndexStr in dateColumnsMap) { const colIndex = parseInt(colIndexStr, 10); const metricDateStr = dateColumnsMap[colIndex]; if (metricDateStr && colIndex < row.length) { const value = parseBrazilianNumberInternal(row[colIndex]); if (value !== null) { const uniqueKey = `${metricDateStr}-${stateUpper}-${metricKey}`; if (!uniqueKeys.has(uniqueKey)) { metrics.push({ metric_date: metricDateStr, region: currentRegion, state: state, metric_key: metricKey, value: value, source_file_type: 'logistics_state_daily', uploaded_by: userId }); uniqueKeys.add(uniqueKey); } } } }
                    } else { console.warn(`[Sheet 1 - Daily] Linha ${rowIndex + 1}: Label "${rowLabel}" não é estado válido para região "${currentRegion}". Ignorando.`); }
                }
            } else { console.warn(`[Sheet ${sheetIndex} - Daily] Linha ${rowIndex + 1} ("${rowLabel}"): Ignorada - Mapa de datas vazio.`); }
        } else if (!isSectionHeader) { console.warn(`[Sheet ${sheetIndex} - Daily] Linha ${rowIndex + 1} ("${rowLabel}"): Ignorada - Contexto Categoria/Região não está definido.`); }
    }
    console.log(`[processSheet - Daily] Finalizado aba "${sheetName}". Métricas: ${metrics.length}`);
    return metrics;
};

const readAndProcessLogisticsExcel = async (fileToRead, userId, fileType) => { console.log(`[readAndProcess - Daily] Lendo: ${fileToRead.name} (Tipo: ${fileType})`); const reader = new FileReader(); const fileData = await new Promise((resolve, reject) => { reader.onload = (e) => resolve(e.target.result); reader.onerror = reject; reader.readAsArrayBuffer(fileToRead); }); const workbook = XLSX.read(fileData, { type: 'array', cellDates: true, cellNF: true, cellStyles: false }); let consolidatedMetrics = [], dailyMetrics = []; if (workbook.SheetNames.length > 0) { const sheetName0 = workbook.SheetNames[0]; const worksheet0 = workbook.Sheets[sheetName0]; if (worksheet0) { const sheetData0 = XLSX.utils.sheet_to_json(worksheet0, { header: 1, raw: false, defval: null }); console.log(`[readAndProcess - Daily] Aba 0: "${sheetName0}" (${sheetData0.length} linhas)`); consolidatedMetrics = processSheet(sheetData0, sheetName0, userId, 0, fileType); } } if (workbook.SheetNames.length > 1) { const sheetName1 = workbook.SheetNames[1]; const worksheet1 = workbook.Sheets[sheetName1]; if (worksheet1) { const sheetData1 = XLSX.utils.sheet_to_json(worksheet1, { header: 1, raw: false, defval: null }); console.log(`[readAndProcess - Daily] Aba 1: "${sheetName1}" (${sheetData1.length} linhas)`); dailyMetrics = processSheet(sheetData1, sheetName1, userId, 1, fileType); } } return { consolidatedMetrics, dailyMetrics }; };

// Componente React
function FileUploaderLogisticsDaily({ onFileUpload, user, onClose }) {
    const reportError = (error, context = "FileUploaderLogisticsDaily") => console.error(`[${context}] Error:`, error?.message || error);
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => { const selectedFile = e.target.files[0]; if (selectedFile) { if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) { setError('Formato inválido. Use .xlsx ou .xls.'); setFile(null); if(e.target) e.target.value = ''; return; } setFile(selectedFile); setError(null); console.log("[FileUploaderLogisticsDaily] Arquivo diário selecionado:", selectedFile.name); } else { setFile(null); } };

    const handleUpload = async () => {
        if (!file) { setError('Selecione um arquivo primeiro'); return; }
        if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios.'); return; }
        if (!user || !user.id) { setError('Erro: Usuário não identificado.'); return; }
        setLoading(true); setError(null); console.log("[FileUploaderLogisticsDaily] Iniciando upload e processamento...");
        try {
            // Chama readAndProcess com fileType 'daily'
            const processedData = await readAndProcessLogisticsExcel(file, user.id, 'daily');
             console.log("[FileUploaderLogisticsDaily] Dados processados:", { dailyConsolidatedCount: processedData.consolidatedMetrics?.length ?? 0, dailyStateCount: processedData.dailyMetrics?.length ?? 0 });
             if ((!processedData.consolidatedMetrics || processedData.consolidatedMetrics.length === 0) && (!processedData.dailyMetrics || processedData.dailyMetrics.length === 0)) { throw new Error("Nenhum dado válido (diário consolidado ou diário por estado) foi extraído."); }
            console.log("[FileUploaderLogisticsDaily] Enviando dados diários para Supabase...");
            // Chama as funções corretas para salvar dados diários
            const results = await Promise.allSettled([
                upsertLogisticsDailyConsolidatedData(processedData.consolidatedMetrics), // Salva na tabela DIÁRIA CONSOLIDADA
                insertLogisticsDailyMetrics(processedData.dailyMetrics)           // Salva na tabela de ESTADO DIÁRIO (com metric_key='processed_daily')
            ]);
            const dailyConsolidatedResult = results[0]; const dailyStateResult = results[1];
            let errors = []; let successSummary = { processedDailyConsolidated: 0, processedDailyState: 0 };
            if (dailyConsolidatedResult.status === 'rejected') { console.error("[Daily] Falha upsert diário consolidado:", dailyConsolidatedResult.reason); errors.push(`Erro Consolidado Diário: ${dailyConsolidatedResult.reason?.message || '?'}`); }
            else if (dailyConsolidatedResult.value?.error) { console.error("[Daily] Erro retornado upsertDailyConsolidated:", dailyConsolidatedResult.value.error); errors.push(`Erro Consolidado Diário: ${dailyConsolidatedResult.value.error.message || '?'}`); }
            else { successSummary.processedDailyConsolidated = dailyConsolidatedResult.value?.data?.length ?? 0; }
            if (dailyStateResult.status === 'rejected') { console.error("[Daily] Falha upsert diário estado:", dailyStateResult.reason); errors.push(`Erro Diário Estado: ${dailyStateResult.reason?.message || '?'}`); }
            else if (dailyStateResult.value?.error) { console.error("[Daily] Erro retornado insertDailyState:", dailyStateResult.value.error); errors.push(`Erro Diário Estado: ${dailyStateResult.value.error.message || '?'}`); }
            else { successSummary.processedDailyState = dailyStateResult.value?.data?.length ?? 0; }
            if (errors.length > 0) { throw new Error(errors.join(' | ')); }
            console.log("[FileUploaderLogisticsDaily] Upload concluído.", successSummary);

            if (onFileUpload) { onFileUpload(successSummary); } // Chama callback da página
            setFile(null); setError(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (onClose) onClose();
        } catch (err) { console.error("[Daily] Erro handleUpload:", err); reportError(err, "handleUpload"); setError(`Erro: ${err.message}`); }
        finally { setLoading(false); console.log("[FileUploaderLogisticsDaily] Finalizado."); }
    };

     const canUpload = user && user.role !== 'guest';

     return (
         <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="logistics-daily-file-uploader">
             <input type="file" id="logistics-daily-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} ref={fileInputRef}/>
             <i className={`fas fa-calendar-day text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
              <p className="font-semibold text-lg mb-2">Upload Relatório Diário (Logística)</p>
             <div className="file-upload-text mb-4">
                 {file ? ( <p className="font-medium" data-name="selected-logistics-daily-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste ou{' '} <label htmlFor="logistics-daily-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione o arquivo </label>. </p> )}
                 <p className="text-xs text-gray-500 mt-1">(Processará 1ª aba como Consolidado Diário e 2ª como Estado Diário)</p>
             </div>
             {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="logistics-daily-guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar.' : 'Faça login para carregar.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="logistics-daily-upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Diário</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="logistics-daily-upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
             {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
         </div>
    );
}

export default FileUploaderLogisticsDaily;