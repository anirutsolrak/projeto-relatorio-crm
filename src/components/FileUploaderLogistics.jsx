import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import getSupabaseClient from '../utils/supabaseClient';

function FileUploaderLogistics({ onFileUpload, user, onClose }) {
    const reportError = (error, context = "FileUploaderLogistics") => console.error(`[${context}] Error:`, error?.message || error);

    const [file, setFile] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) {
                setError('Formato de arquivo inválido. Use .xlsx ou .xls.'); setFile(null); if(e.target) e.target.value = ''; return;
            }
            setFile(selectedFile); setError(null); console.log("[FileUploaderLogistics] Arquivo de logística selecionado:", selectedFile.name);
        } else { setFile(null); }
    };

    const handleUpload = async () => {
        if (!file) { setError('Selecione um arquivo primeiro'); return; }
        if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios.'); return; }
        if (!user || !user.id) { setError('Erro: Usuário não identificado.'); return; }
        setLoading(true); setError(null); console.log("[FileUploaderLogistics] Iniciando upload e processamento...");
        try {
            const processedData = await readAndProcessLogisticsExcel(file, user.id);
             console.log("[FileUploaderLogistics] Dados processados antes de enviar:", {
                consolidatedCount: processedData.consolidatedMetrics?.length ?? 0,
                logisticsCount: processedData.logisticsMetrics?.length ?? 0,
                sampleConsolidated: processedData.consolidatedMetrics?.slice(0, 5),
                sampleLogistics: processedData.logisticsMetrics?.slice(0, 5)
            });
            if ((!processedData.consolidatedMetrics || processedData.consolidatedMetrics.length === 0) &&
                (!processedData.logisticsMetrics || processedData.logisticsMetrics.length === 0))
            {
                 throw new Error("Nenhum dado válido (consolidado ou por estado) foi extraído. Verifique a estrutura do arquivo e os logs.");
            }
            console.log(`[FileUploaderLogistics] Processamento concluído. Métricas Consolidadas: ${processedData.consolidatedMetrics?.length ?? 0}, Métricas Estado: ${processedData.logisticsMetrics?.length ?? 0}.`);
            console.log("[FileUploaderLogistics] Chamando onFileUpload com ambos os conjuntos de dados...");
            await onFileUpload(processedData);
            console.log("[FileUploaderLogistics] Retornou de onFileUpload.");

            setFile(null); setError(null);
            const inputElement = document.getElementById('logistics-file-upload-input');
            if (inputElement) inputElement.value = '';
            if (onClose) onClose();
        } catch (err) {
            console.error("[FileUploaderLogistics] Erro capturado no handleUpload:", err);
            reportError(err, "handleUpload");
            setError(`Erro no Upload/Processamento: ${err.message}`);
        } finally {
            setLoading(false); console.log("[FileUploaderLogistics] Processo de upload finalizado.");
        }
    };

    const parseBrazilianNumberInternal = (value) => {
        if (typeof value === 'number' && !isNaN(value)) return value;
        if (value === null || value === undefined) return null;
        let valueStr = String(value).trim();
        if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?', '#NULL!'].includes(valueStr.toUpperCase())) return null;
        valueStr = valueStr.replace(/R\$\s?/g, '').trim();
        const hasComma = valueStr.includes(','); const hasDot = valueStr.includes('.'); let cleanedStr = valueStr;
        if (hasComma) { cleanedStr = valueStr.replace(/\./g, '').replace(',', '.'); }
        else if (hasDot) { const dotCount = (valueStr.match(/\./g) || []).length; if (dotCount > 1) { cleanedStr = valueStr.replace(/\./g, ''); } }
        cleanedStr = cleanedStr.replace(',', '.');
        const number = parseFloat(cleanedStr);

        if (isNaN(number)) {
             return null;
         }
        if (Math.abs(number) > 1e12) {
            return null;
        }
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
               } catch(e){ console.error(`[parseDate] Erro ao parsear Excel Serial ${headerValue}:`, e); }
          }

          if (parsedDate && !isNaN(parsedDate.getTime())) {
               return parsedDate.toISOString().split('T')[0];
          }
          return null;
       };


    const processSheet = (sheetData, sheetName, userId, sheetIndex) => {
        console.log(`[processSheet] Iniciando processamento da aba "${sheetName}" (Índice ${sheetIndex})`);
        const metrics = [];
        let dateColumnsMap = {}; // Mapa das colunas de data para o bloco atual
        let currentCategory = null;
        let currentRegion = null; // Específico para Aba 1
        const regions = ["NORTE", "NORDESTE", "CENTRO OESTE", "SUDESTE", "SUL"];
        const MIN_VALID_DATES_IN_HEADER = 1;

        console.log(`[Sheet ${sheetIndex}] Iterando ${sheetData.length} linhas...`);
        for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
            const row = sheetData[rowIndex];
            // Pula linhas completamente vazias ou sem a primeira célula preenchida
            if (!row || row.length < 1 || !row[0] || String(row[0]).trim() === '') {

                continue;
            }

            let rowLabel = String(row[0]).trim().replace(/[\r\n]+/g, ' ');
            let rowLabelUpper = rowLabel.toUpperCase();
            let isCategoryHeader = false;
            let potentialNewCategory = null;
            let potentialNewRegion = null;

            // --- 1. Identificação de Cabeçalhos de Categoria/Região e Datas ---
            if (sheetIndex === 0) { // Aba Consolidado
                if (rowLabelUpper.startsWith("ENTREGAS -")) potentialNewCategory = "ENTREGAS";
                else if (rowLabelUpper.startsWith("DEVOLUÇÃO -")) potentialNewCategory = "DEVOLUÇÃO - MOTIVOS";
                else if (rowLabelUpper.startsWith("ENTREGA /")) potentialNewCategory = "ENTREGA / REGIÃO";
                else if (rowLabelUpper === "GERAL") potentialNewCategory = "RESET"; // Marcador para resetar
            } else { // Aba Região/Estado
                if (regions.includes(rowLabelUpper)) potentialNewRegion = rowLabelUpper;
                else if (rowLabelUpper === "GERAL") potentialNewRegion = "RESET"; // Marcador para resetar
            }

            // Se encontramos um potencial novo cabeçalho (Categoria ou Região)
            if (potentialNewCategory || potentialNewRegion) {
                isCategoryHeader = true;
                let validDatesFound = 0;
                let potentialDateMap = {};

                // Tenta ler as datas NA MESMA LINHA do cabeçalho
                for (let c = 1; c < row.length; c++) {
                    const metricDate = parseDateFromHeader(row[c]);
                    if (metricDate) {
                        validDatesFound++;
                        potentialDateMap[c] = metricDate;
                        // Pula coluna de '%' se existir
                        if (c + 1 < row.length && String(row[c + 1]).trim() === '%') c++;
                    }
                }

                // Se encontrou datas válidas, atualiza o estado
                if (validDatesFound >= MIN_VALID_DATES_IN_HEADER) {
                    dateColumnsMap = potentialDateMap; // Atualiza o mapa de datas para este bloco
                    if (sheetIndex === 0) {
                        currentCategory = (potentialNewCategory === "RESET") ? null : potentialNewCategory;
                        console.log(`%c[Sheet 0] Linha ${rowIndex + 1}: Categoria definida para "${currentCategory}". Mapa de datas:`, 'color: green; font-weight: bold;', dateColumnsMap);
                    } else {
                        currentRegion = (potentialNewRegion === "RESET") ? null : potentialNewRegion;
                        console.log(`%c[Sheet 1] Linha ${rowIndex + 1}: Região definida para "${currentRegion}". Mapa de datas:`, 'color: green; font-weight: bold;', dateColumnsMap);
                    }
                } else if (potentialNewCategory !== "RESET" && potentialNewRegion !== "RESET") {
                    // Era um cabeçalho esperado, mas sem datas válidas - Sinaliza problema
                    console.warn(`[Sheet ${sheetIndex}] Linha ${rowIndex + 1}: Cabeçalho "${rowLabel}" encontrado, mas NENHUMA data válida nas colunas subsequentes. Bloco será ignorado.`);
                     if (sheetIndex === 0) currentCategory = null; // Reseta para evitar processar linhas seguintes incorretamente
                     else currentRegion = null;
                     dateColumnsMap = {}; // Limpa o mapa de datas
                } else if (potentialNewCategory === "RESET" || potentialNewRegion === "RESET") {
                     // Era só um 'GERAL', reseta estado
                     console.log(`[Sheet ${sheetIndex}] Linha ${rowIndex + 1}: Encontrado 'GERAL', resetando categoria/região.`);
                     if (sheetIndex === 0) currentCategory = null;
                     else currentRegion = null;
                     dateColumnsMap = {}; // Limpa o mapa de datas
                 }
            }

            // --- 2. Processamento de Linhas de Dados ---
            // Só processa se NÃO for um cabeçalho de categoria/região E se tivermos uma categoria/região ativa E um mapa de datas válido
            if (!isCategoryHeader && Object.keys(dateColumnsMap).length > 0) {
                if (sheetIndex === 0 && currentCategory) { // Processa dados da Aba 0
                    const subCategory = rowLabel;

                    for (const colIndexStr in dateColumnsMap) {
                        const colIndex = parseInt(colIndexStr, 10);
                        const metricDateStr = dateColumnsMap[colIndex];
                        if (metricDateStr && colIndex < row.length) {
                            const value = parseBrazilianNumberInternal(row[colIndex]);
                            if (value !== null) {
                                metrics.push({
                                    metric_date: metricDateStr,
                                    category: currentCategory,
                                    sub_category: subCategory,
                                    value: value,
                                    source_file_type: 'logistics_consolidated',
                                    uploaded_by: userId
                                });
                            }
                        }
                    }
                } else if (sheetIndex === 1 && currentRegion) { // Processa dados da Aba 1
                    const state = rowLabel; // A primeira coluna agora é o estado

                    for (const colIndexStr in dateColumnsMap) {
                        const colIndex = parseInt(colIndexStr, 10);
                        const metricDateStr = dateColumnsMap[colIndex];
                        if (metricDateStr && colIndex < row.length) {
                            const value = parseBrazilianNumberInternal(row[colIndex]);
                            if (value !== null) {
                                metrics.push({
                                    metric_date: metricDateStr,
                                    region: currentRegion,
                                    state: state,
                                    value: value,
                                    source_file_type: 'logistics_state',
                                    uploaded_by: userId
                                });
                            }
                        }
                    }
                }
            } else if (!isCategoryHeader && Object.keys(dateColumnsMap).length === 0) {
                // console.warn(`[Sheet ${sheetIndex}] Linha ${rowIndex+1} ("${rowLabel}"): Pulada - Nenhum mapa de datas ativo.`);
            }
        } // Fim do loop pelas linhas

        console.log(`[processSheet] Finalizado processamento da aba "${sheetName}". Métricas encontradas: ${metrics.length}`);
        return metrics;
    };


    const readAndProcessLogisticsExcel = async (fileToRead, userId) => {
        console.log(`[readAndProcessLogisticsExcel] Lendo arquivo: ${fileToRead.name}`);
        const reader = new FileReader();
        const fileData = await new Promise((resolve, reject) => {
             reader.onload = (e) => resolve(e.target.result);
             reader.onerror = (e) => reject(new Error("Erro ao ler arquivo"));
             reader.readAsArrayBuffer(fileToRead);
         });

        const workbook = XLSX.read(fileData, { type: 'array', cellDates: true, cellNF: true, cellStyles: false });

        let consolidatedMetrics = [];
        let logisticsMetrics = [];


        if (workbook.SheetNames.length > 0) {
             const sheetName0 = workbook.SheetNames[0];
             const worksheet0 = workbook.Sheets[sheetName0];
             if (worksheet0) {
                  const sheetData0 = XLSX.utils.sheet_to_json(worksheet0, { header: 1, raw: false, defval: null });
                  console.log(`[readAndProcessLogisticsExcel] Iniciando processamento da Aba 0: "${sheetName0}" (${sheetData0.length} linhas)`);
                  consolidatedMetrics = processSheet(sheetData0, sheetName0, userId, 0);
              } else { console.warn("[readAndProcessLogisticsExcel] Aba índice 0 não encontrada."); }
         } else { console.warn("[readAndProcessLogisticsExcel] Nenhuma aba encontrada no arquivo."); }


         if (workbook.SheetNames.length > 1) {
             const sheetName1 = workbook.SheetNames[1];
             const worksheet1 = workbook.Sheets[sheetName1];
             if (worksheet1) {
                  const sheetData1 = XLSX.utils.sheet_to_json(worksheet1, { header: 1, raw: false, defval: null });
                   console.log(`[readAndProcessLogisticsExcel] Iniciando processamento da Aba 1: "${sheetName1}" (${sheetData1.length} linhas)`);
                  logisticsMetrics = processSheet(sheetData1, sheetName1, userId, 1);
              } else { console.warn("[readAndProcessLogisticsExcel] Aba índice 1 não encontrada."); }
          } else { console.warn("[readAndProcessLogisticsExcel] Apenas uma aba encontrada, não processando Região/Estado."); }


        return { consolidatedMetrics, logisticsMetrics };
    };

    const canUpload = user && user.role !== 'guest';

    return (
         <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="logistics-file-uploader">
             <input type="file" id="logistics-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} />
             <i className={`fas fa-truck text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
              <p className="font-semibold text-lg mb-2">Upload Relatório de Logística (ARs)</p>
             <div className="file-upload-text mb-4">
                 {file ? ( <p className="font-medium" data-name="selected-logistics-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste ou{' '} <label htmlFor="logistics-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione o arquivo </label>. </p> )}
                 <p className="text-xs text-gray-500 mt-1">(Processará 1ª aba como Consolidado e 2ª como Região/Estado)</p>
             </div>
             {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="logistics-guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar.' : 'Faça login para carregar.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="logistics-upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Logística</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="logistics-upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
             {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
         </div>
    );
}

export default FileUploaderLogistics;