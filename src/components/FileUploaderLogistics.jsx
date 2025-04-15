import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import getSupabaseClient, { upsertLogisticsConsolidatedMetrics, insertLogisticsDailyMetrics } from '../utils/supabaseClient';

// Funções auxiliares (EXATAMENTE como fornecido no seu exemplo funcional)
const parseBrazilianNumberInternal = (value) => { if (typeof value === 'number' && !isNaN(value)) return value; if (value === null || value === undefined) return null; let valueStr = String(value).trim(); if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?', '#NULL!'].includes(valueStr.toUpperCase())) return null; valueStr = valueStr.replace(/R\$\s?/g, '').trim(); const hasComma = valueStr.includes(','); const hasDot = valueStr.includes('.'); let cleanedStr = valueStr; if (hasComma) { cleanedStr = valueStr.replace(/\./g, '').replace(',', '.'); } else if (hasDot) { const dotCount = (valueStr.match(/\./g) || []).length; if (dotCount > 1) { cleanedStr = valueStr.replace(/\./g, ''); } } cleanedStr = cleanedStr.replace(',', '.'); const number = parseFloat(cleanedStr); if (isNaN(number)) { return null; } if (Math.abs(number) > 1e12) { return null; } return number; };
const parseDateFromHeader = (headerValue) => { let parsedDate = null; if (headerValue instanceof Date && !isNaN(headerValue.getTime())) { parsedDate = new Date(Date.UTC(headerValue.getFullYear(), headerValue.getMonth(), headerValue.getDate())); } else if (typeof headerValue === 'string') { const trimmedValue = headerValue.trim(); const dateMatchYMD = trimmedValue.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/); const dateMatchDMYFull = trimmedValue.match(/^(\d{1,2})[\\/](\d{1,2})[\\/](\d{4})$/); if (dateMatchYMD) { const y = parseInt(dateMatchYMD[1], 10); const m = parseInt(dateMatchYMD[2], 10); const d = parseInt(dateMatchYMD[3], 10); if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) { parsedDate = new Date(Date.UTC(y, m - 1, d)); } } else if (dateMatchDMYFull) { const d = parseInt(dateMatchDMYFull[1], 10); const m = parseInt(dateMatchDMYFull[2], 10); const y = parseInt(dateMatchDMYFull[3], 10); if (y > 1990 && y < 2100 && m > 0 && m <= 12 && d > 0 && d <= 31) { parsedDate = new Date(Date.UTC(y, m - 1, d)); } } } else if (typeof headerValue === 'number' && headerValue > 20000 && headerValue < 60000) { try { const dateInfo = XLSX.SSF.parse_date_code(headerValue); if (dateInfo && dateInfo.y && dateInfo.m && dateInfo.d && !isNaN(dateInfo.y)) { parsedDate = new Date(Date.UTC(dateInfo.y, dateInfo.m - 1, dateInfo.d)); } } catch(e){ console.error(`[parseDate] Erro ao parsear Excel Serial ${headerValue}:`, e); } } if (parsedDate && !isNaN(parsedDate.getTime())) { return parsedDate.toISOString().split('T')[0]; } return null; };

// Lógica de Processamento REPLICADA do seu exemplo funcional
const processSheet = (sheetData, sheetName, userId, sheetIndex, fileType) => { // Adicionado fileType
    console.log(`[processSheet - REPLICADO V2] Iniciando aba "${sheetName}" (Índice ${sheetIndex}) - Tipo: ${fileType}`);
    const metrics = [];
    let dateColumnsMap = {};
    let currentCategory = null; // Renomeado para clareza na Aba 0
    let currentRegion = null;   // Renomeado para clareza na Aba 1
    const regions = ["NORTE", "NORDESTE", "CENTRO OESTE", "SUDESTE", "SUL"];
    const MIN_VALID_DATES_IN_HEADER = 1;
    const expectedCategories = ["ENTREGAS -", "DEVOLUÇÃO -", "ENTREGA /"];

    console.log(`[Sheet ${sheetIndex}] Iterando ${sheetData.length} linhas...`);
    for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
        const row = sheetData[rowIndex];
        if (!row || row.length < 1 || !row[0] || String(row[0]).trim() === '') continue;
        let rowLabel = String(row[0]).trim().replace(/[\r\n]+/g, ' ');
        let rowLabelUpper = rowLabel.toUpperCase();
        let isHeaderRow = false; // Flag para indicar se a linha é um cabeçalho de seção

        // --- Detecção de Cabeçalho de Data e Seção ---
        // Tenta identificar se é um cabeçalho de Categoria (Aba 0) ou Região (Aba 1)
        let potentialNewContext = null;
        if (sheetIndex === 0) {
            if (expectedCategories.some(cat => rowLabelUpper.startsWith(cat))) {
                potentialNewContext = rowLabelUpper.startsWith("ENTREGAS -") ? "ENTREGAS" : (rowLabelUpper.startsWith("DEVOLUÇÃO -") ? "DEVOLUÇÃO - MOTIVOS" : "ENTREGA / REGIÃO");
                isHeaderRow = true;
            } else if (rowLabelUpper === "GERAL" && currentCategory === "ENTREGA / REGIÃO") {
                 currentCategory = null; // Reseta APENAS se estava em ENTREGA/REGIÃO
                 console.log(`%c[Sheet 0] Fim da Categoria ENTREGA/REGIÃO (GERAL), resetando contexto.`, 'color: #9a3412;');
                 continue; // Pula linha GERAL que finaliza ENTREGA/REGIÃO
            }
        } else { // sheetIndex === 1
            if (regions.includes(rowLabelUpper)) {
                potentialNewContext = rowLabelUpper;
                isHeaderRow = true;
            } else if (rowLabelUpper === "GERAL" || rowLabelUpper === "TOTAL") {
                 if (currentRegion) { // Só reseta se tinha uma região ativa
                     console.log(`%c[Sheet 1] Fim da Região "${currentRegion}" (encontrado ${rowLabelUpper}), resetando contexto.`, 'color: #9a3412;');
                     currentRegion = null;
                 }
                 continue; // Pula linha GERAL/TOTAL
            }
        }

        // Se detectou um cabeçalho de seção, verifica se contém datas
        if (isHeaderRow && potentialNewContext) {
            let validDatesFound = 0;
            let potentialDateMap = {};
            for (let c = 1; c < row.length; c++) {
                const metricDate = parseDateFromHeader(row[c]);
                if (metricDate) { validDatesFound++; potentialDateMap[c] = metricDate; if (c + 1 < row.length && String(row[c + 1]).trim() === '%') c++; }
            }

            // Se encontrou datas válidas, ATUALIZA o contexto e o mapa de datas
            if (validDatesFound >= MIN_VALID_DATES_IN_HEADER) {
                dateColumnsMap = potentialDateMap;
                if (sheetIndex === 0) { currentCategory = potentialNewContext; }
                else { currentRegion = potentialNewContext; }
                console.log(`%c[Sheet ${sheetIndex}] Contexto ATUALIZADO para "${potentialNewContext}" na linha ${rowIndex + 1}. Datas:`, 'color: green; font-weight: bold;', dateColumnsMap);
                continue; // Pula para a próxima linha após processar o cabeçalho completo
            } else {
                // Era um cabeçalho de seção mas sem datas válidas
                console.warn(`[Sheet ${sheetIndex}] Linha ${rowIndex + 1}: Cabeçalho de seção "${rowLabel}" sem datas válidas. Ignorando seção subsequente até novo cabeçalho.`);
                 if (sheetIndex === 0) currentCategory = null; // Reseta contexto
                 else currentRegion = null;
                 dateColumnsMap = {}; // Limpa mapa de datas
                 continue; // Pula esta linha de cabeçalho inválida
            }
        }

        // --- Processamento de Linha de Dados ---
        // Só processa se NÃO for cabeçalho, tiver contexto ativo e mapa de datas
        if (!isHeaderRow && Object.keys(dateColumnsMap).length > 0) {
            if (sheetIndex === 0 && currentCategory) { // Aba 0
                const subCategory = rowLabel;
                if (subCategory.toUpperCase() === 'GERAL' || subCategory.toUpperCase() === 'TOTAL') continue; // Ignora linhas de total explícitas
                if (expectedCategories.some(cat => subCategory.toUpperCase().startsWith(cat))) continue; // Ignora se for um label de categoria por engano

                for (const colIndexStr in dateColumnsMap) { const colIndex = parseInt(colIndexStr, 10); const metricDateStr = dateColumnsMap[colIndex]; if (metricDateStr && colIndex < row.length) { const value = parseBrazilianNumberInternal(row[colIndex]); if (value !== null) { metrics.push({ metric_date: metricDateStr, category: currentCategory, sub_category: subCategory, value: value, source_file_type: fileType, uploaded_by: userId }); } } }
            } else if (sheetIndex === 1 && currentRegion) { // Aba 1
                const state = rowLabel;
                if (!state || state.length > 5 || regions.includes(state.toUpperCase())) { continue; } // Pula se não for estado válido ou for nome de região

                const metricKey = fileType === 'consolidated' ? 'processed_accumulated' : 'processed_daily';
                console.log(`[Sheet 1] Processando Linha ${rowIndex + 1}: Estado="${state}", Região Atual="${currentRegion}"`); // Log útil

                for (const colIndexStr in dateColumnsMap) {
                    const colIndex = parseInt(colIndexStr, 10); const metricDateStr = dateColumnsMap[colIndex];
                    if (metricDateStr && colIndex < row.length) {
                        const value = parseBrazilianNumberInternal(row[colIndex]);
                        if (value !== null) {
                            metrics.push({ metric_date: metricDateStr, region: currentRegion, state: state.toUpperCase(), metric_key: metricKey, value: value, source_file_type: fileType === 'consolidated' ? 'logistics_state_consolidated' : 'logistics_state_daily', uploaded_by: userId });
                        }
                    }
                }
            }
        } else if (!isHeaderRow && Object.keys(dateColumnsMap).length > 0 && (!currentCategory && !currentRegion)) {
            // Dados encontrados, mas sem contexto ativo (categoria/região não definida ou resetada)
             console.warn(`[Sheet ${sheetIndex}] Linha ${rowIndex + 1} ("${rowLabel}"): Ignorada - Contexto Categoria/Região não está definido.`);
         }
    }
    console.log(`[processSheet - REPLICADO V2] Finalizado aba "${sheetName}". Métricas: ${metrics.length}`);
    return metrics;
};

const readAndProcessLogisticsExcel = async (fileToRead, userId, fileType) => { console.log(`[readAndProcess - REPLICADO V2] Lendo: ${fileToRead.name} (Tipo: ${fileType})`); const reader = new FileReader(); const fileData = await new Promise((resolve, reject) => { reader.onload = (e) => resolve(e.target.result); reader.onerror = reject; reader.readAsArrayBuffer(fileToRead); }); const workbook = XLSX.read(fileData, { type: 'array', cellDates: true, cellNF: true, cellStyles: false }); let consolidatedMetrics = [], dailyMetrics = []; if (workbook.SheetNames.length > 0) { const sheetName0 = workbook.SheetNames[0]; const worksheet0 = workbook.Sheets[sheetName0]; if (worksheet0) { const sheetData0 = XLSX.utils.sheet_to_json(worksheet0, { header: 1, raw: false, defval: null }); console.log(`[readAndProcess] Aba 0: "${sheetName0}" (${sheetData0.length} linhas)`); consolidatedMetrics = processSheet(sheetData0, sheetName0, userId, 0, fileType); } else { console.warn("[readAndProcess] Aba índice 0 não encontrada."); } } else { console.warn("[readAndProcess] Nenhuma aba encontrada."); } if (workbook.SheetNames.length > 1) { const sheetName1 = workbook.SheetNames[1]; const worksheet1 = workbook.Sheets[sheetName1]; if (worksheet1) { const sheetData1 = XLSX.utils.sheet_to_json(worksheet1, { header: 1, raw: false, defval: null }); console.log(`[readAndProcess] Aba 1: "${sheetName1}" (${sheetData1.length} linhas)`); dailyMetrics = processSheet(sheetData1, sheetName1, userId, 1, fileType); } else { console.warn("[readAndProcess] Aba índice 1 não encontrada."); } } else { console.warn("[readAndProcess] Apenas uma aba encontrada, não processando dados de estado/região."); } return { consolidatedMetrics, dailyMetrics }; };

function FileUploaderLogistics({ onFileUpload, user, onClose }) {
    const reportError = (error, context = "FileUploaderLogisticsConsolidated") => console.error(`[${context}] Error:`, error?.message || error);
    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => { const selectedFile = e.target.files[0]; if (selectedFile) { if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) { setError('Formato inválido. Use .xlsx ou .xls.'); setFile(null); if(e.target) e.target.value = ''; return; } setFile(selectedFile); setError(null); console.log("[FileUploaderLogisticsConsolidated] Arquivo consolidado selecionado:", selectedFile.name); } else { setFile(null); } };

    const handleUpload = async () => {
        if (!file) { setError('Selecione um arquivo primeiro'); return; }
        if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios.'); return; }
        if (!user || !user.id) { setError('Erro: Usuário não identificado.'); return; }
        setLoading(true); setError(null); console.log("[FileUploaderLogisticsConsolidated] Iniciando upload e processamento...");
        try {
            const processedData = await readAndProcessLogisticsExcel(file, user.id, 'consolidated');
             console.log("[FileUploaderLogisticsConsolidated] Dados processados:", { consolidatedCount: processedData.consolidatedMetrics?.length ?? 0, stateCount: processedData.dailyMetrics?.length ?? 0 });
             if ((!processedData.consolidatedMetrics || processedData.consolidatedMetrics.length === 0) && (!processedData.dailyMetrics || processedData.dailyMetrics.length === 0)) { throw new Error("Nenhum dado válido (consolidado ou estado/região) foi extraído."); }
            console.log("[FileUploaderLogisticsConsolidated] Enviando dados consolidados para Supabase...");
            const results = await Promise.allSettled([
                upsertLogisticsConsolidatedMetrics(processedData.consolidatedMetrics),
                insertLogisticsDailyMetrics(processedData.dailyMetrics)
            ]);
            const consolidatedResult = results[0]; const stateResult = results[1];
            let errors = []; let successSummary = { processedConsolidated: 0, processedState: 0 };
            if (consolidatedResult.status === 'rejected') { console.error("[Consolidated] Falha upsert consolidado:", consolidatedResult.reason); errors.push(`Erro Consolidado: ${consolidatedResult.reason?.message || '?'}`); }
            else if (consolidatedResult.value?.error) { console.error("[Consolidated] Erro retornado upsertConsolidated:", consolidatedResult.value.error); errors.push(`Erro Consolidado: ${consolidatedResult.value.error.message || '?'}`); }
            else { successSummary.processedConsolidated = consolidatedResult.value?.data?.length ?? 0; }
            if (stateResult.status === 'rejected') { console.error("[Consolidated] Falha upsert estado:", stateResult.reason); errors.push(`Erro Estado/Região: ${stateResult.reason?.message || '?'}`); }
            else if (stateResult.value?.error) { console.error("[Consolidated] Erro retornado insertDailyState:", stateResult.value.error); errors.push(`Erro Estado/Região: ${stateResult.value.error.message || '?'}`); }
            else { successSummary.processedState = stateResult.value?.data?.length ?? 0; }
            if (errors.length > 0) { throw new Error(errors.join(' | ')); }
            console.log("[FileUploaderLogisticsConsolidated] Upload concluído.", successSummary);
            if (onFileUpload) { onFileUpload(successSummary); }
            setFile(null); setError(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
            if (onClose) onClose();
        } catch (err) { console.error("[Consolidated] Erro handleUpload:", err); reportError(err, "handleUpload"); setError(`Erro: ${err.message}`); }
        finally { setLoading(false); console.log("[FileUploaderLogisticsConsolidated] Finalizado."); }
    };

    const canUpload = user && user.role !== 'guest';

    return (
         <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="logistics-consolidated-file-uploader">
             <input type="file" id="logistics-consolidated-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} ref={fileInputRef}/>
             <i className={`fas fa-file-invoice-dollar text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
              <p className="font-semibold text-lg mb-2">Upload Relatório Consolidado (Logística)</p>
             <div className="file-upload-text mb-4">
                 {file ? ( <p className="font-medium" data-name="selected-logistics-consolidated-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste ou{' '} <label htmlFor="logistics-consolidated-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione o arquivo </label>. </p> )}
                 <p className="text-xs text-gray-500 mt-1">(Processará 1ª aba como Consolidado e 2ª como Estado/Região Consolidado)</p>
             </div>
             {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="logistics-consolidated-guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar.' : 'Faça login para carregar.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="logistics-consolidated-upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Consolidado</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="logistics-consolidated-upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
             {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
         </div>
    );
}

export default FileUploaderLogistics;