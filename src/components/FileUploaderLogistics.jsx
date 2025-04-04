
import React from 'react';
import * as XLSX from 'xlsx'; // Importar a biblioteca
import getSupabaseClient from '../utils/supabaseClient'; // Ajustar caminho se necessário

function FileUploaderLogistics({ onFileUpload, user, onClose }) {
    const reportError = (error, context = "FileUploaderLogistics") => console.error(`[${context}] Error:`, error?.message || error);

    const [file, setFile] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [loading, setLoading] = React.useState(false);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile) {
            if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) {
                setError('Formato de arquivo inválido. Use .xlsx ou .xls.'); setFile(null); if(e.target) e.target.value = ''; return;
            }
            setFile(selectedFile); setError(null); console.log("Arquivo de logística selecionado:", selectedFile.name);
        } else { setFile(null); }
    };

    const handleUpload = async () => {
        if (!file) { setError('Selecione um arquivo primeiro'); return; }
        if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios.'); return; }
        if (!user || !user.id) { setError('Erro: Usuário não identificado.'); return; }
        setLoading(true); setError(null); console.log("Iniciando upload e processamento do arquivo de logística...");
        try {
            const processedData = await readAndProcessLogisticsExcel(file, user.id);
            if (!processedData || processedData.logisticsMetrics.length === 0) {
                 throw new Error("Nenhum dado de logística válido foi extraído. Verifique se o arquivo contém blocos começando com NOME_DA_REGIÃO, seguido por uma linha de datas (D/M/YYYY) e depois linhas de estados.");
            }
            console.log(`Processamento de logística concluído. Métricas: ${processedData.logisticsMetrics.length}. Enviando...`);
            await onFileUpload(processedData);
            console.log("Dados de logística enviados com sucesso via onFileUpload.");
            setFile(null); setError(null);
            const inputElement = document.getElementById('logistics-file-upload-input');
            if (inputElement) inputElement.value = '';
            if (onClose) onClose();
        } catch (err) {
            reportError(err, "handleUpload");
            setError(`Erro: ${err.message}`);
        } finally {
            setLoading(false); console.log("Processo de upload de logística finalizado.");
        }
    };

    const parseBrazilianNumberInternal = (value) => {
        if (typeof value === 'number' && !isNaN(value)) return value;
        if (value === null || value === undefined) return null;
        let valueStr = String(value).trim();
        if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?', '#NULL!'].includes(valueStr.toUpperCase())) return null;
        valueStr = valueStr.replace(/R\$\s?/g, '').trim();
        const hasComma = valueStr.includes(','); const hasDot = valueStr.includes('.'); let cleanedStr = valueStr;
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
        if (Math.abs(number) > 1e12) { return null; }
        return isNaN(number) ? null : number;
    };

     const parseDateFromHeaderLogistics = (headerValue) => {
          if (typeof headerValue === 'string') {
               const trimmedValue = headerValue.trim();
               const dateMatch = trimmedValue.match(/^(\d{1,2})[\\/](\d{1,2})[\\/](\d{4})$/);
               if (dateMatch) {
                   const d = parseInt(dateMatch[1], 10);
                   const m = parseInt(dateMatch[2], 10);
                   const y = parseInt(dateMatch[3], 10);
                   if (d > 0 && d <= 31 && m > 0 && m <= 12 && y > 1900 && y < 2100) {
                       const date = new Date(Date.UTC(y, m - 1, d));
                       if (date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d) {
                           return date;
                       }
                   }
               }
           }
          if (typeof headerValue === 'number' && headerValue > 20000 && headerValue < 60000) {
              try {
                  const dateInfo = XLSX.SSF.parse_date_code(headerValue);
                  if (dateInfo && !isNaN(dateInfo.y)) {
                      const date = new Date(Date.UTC(dateInfo.y, dateInfo.m - 1, dateInfo.d));
                      return date;
                  }
              } catch(e){}
          }
          return null;
      };

    const readAndProcessLogisticsExcel = (fileToRead, userId) => {
        console.log(`[readAndProcessLogisticsExcel] Iniciando leitura: ${fileToRead.name}`);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target.result;
                    const workbook = XLSX.read(data, { type: 'array' }); // Usar raw: true, remover cellDates/cellNF
                    const firstSheetName = workbook.SheetNames[0];
                    if (!firstSheetName) return reject(new Error('Planilha vazia ou sem abas.'));
                    console.log(`[readAndProcessLogisticsExcel] Processando Aba: "${firstSheetName}"`);
                    const worksheet = workbook.Sheets[firstSheetName];
                    const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null }); // Usar raw: true
                    console.log(`[readAndProcessLogisticsExcel] Linhas lidas (raw: true): ${sheetData.length}.`);
                    if (sheetData.length < 5) return reject(new Error('Planilha com estrutura inválida.'));

                    const processedMetrics = [];
                    let currentRegion = null;
                    let dateColumnsMap = {};
                    let expectingDateHeader = false;
                    const regions = ["NORTE", "NORDESTE", "CENTRO OESTE", "SUDESTE", "SUL"];
                    const MIN_VALID_DATES_IN_HEADER = 1;

                    console.log("[readAndProcessLogisticsExcel] Iniciando processamento linha a linha (com raw: true)...");
                    for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
                        const row = sheetData[rowIndex];
                        if (!row || row.length === 0 || row.every(cell => cell === null || String(cell).trim() === '')) {
                             if (currentRegion) {
                                 console.log(`[DEBUG] Linha vazia ${rowIndex + 1} encontrada no bloco da região ${currentRegion}, resetando contexto.`);
                                 currentRegion = null; expectingDateHeader = false; dateColumnsMap = {};
                             }
                            continue;
                        }

                        const firstCellRaw = row[0];
                        const firstCellValue = firstCellRaw ? String(firstCellRaw).trim() : "";
                        const firstCellUpper = firstCellValue.toUpperCase();

                        // --- State Machine Logic ---

                        if (expectingDateHeader) {
                             console.log(`[DEBUG] Linha ${rowIndex + 1}: Verificando se é cabeçalho de data para ${currentRegion}.`);
                             let validDatesFound = 0;
                             let potentialDateMap = {};
                             for (let colIndex = 1; colIndex < row.length; colIndex++) {
                                 const headerCell = row[colIndex]; // raw value
                                 const parsedDate = parseDateFromHeaderLogistics(headerCell);
                                 if (parsedDate) {
                                     validDatesFound++;
                                     const dateString = parsedDate.toISOString().split('T')[0];
                                     potentialDateMap[colIndex] = dateString;
                                     if (colIndex + 1 < row.length && String(row[colIndex + 1]).trim() === '%') {
                                         colIndex++;
                                     }
                                 }
                             }

                             expectingDateHeader = false; // Processed the expected line

                             if (validDatesFound >= MIN_VALID_DATES_IN_HEADER) {
                                 dateColumnsMap = potentialDateMap;
                                 console.log(`[DEBUG] Cabeçalho de data VALIDADO para ${currentRegion} com ${validDatesFound} datas:`, dateColumnsMap);
                                 // Ready for states in next iteration
                             } else {
                                 console.warn(`[WARN] Linha ${rowIndex + 1} NÃO validada como cabeçalho de data para ${currentRegion}. Resetando região.`);
                                 currentRegion = null;
                                 dateColumnsMap = {};
                                 if (regions.includes(firstCellUpper)) {
                                     console.log(`[DEBUG] Linha ${rowIndex + 1} (que falhou como header) é o início da região ${firstCellUpper}. Preparando para próximo cabeçalho.`);
                                     currentRegion = firstCellUpper;
                                     expectingDateHeader = true;
                                 }
                             }
                             continue;
                        }

                        // --- Not expecting header ---

                        if (regions.includes(firstCellUpper)) {
                             if (currentRegion && currentRegion !== firstCellUpper) {
                                 console.warn(`[WARN] Iniciando nova região ${firstCellUpper} antes de encontrar GERAL para ${currentRegion}.`);
                             }
                             currentRegion = firstCellUpper;
                             expectingDateHeader = true; // Expect header on the *next* line
                             dateColumnsMap = {};
                             console.log(`[DEBUG] Linha ${rowIndex + 1}: Encontrado início do bloco da região ${currentRegion}. Esperando cabeçalho na próxima linha.`);
                         } else if (currentRegion && firstCellUpper === "GERAL") {
                             console.log(`[DEBUG] Linha ${rowIndex + 1}: Fim do bloco da região ${currentRegion}.`);
                             currentRegion = null;
                             dateColumnsMap = {};
                         } else if (currentRegion && firstCellValue && Object.keys(dateColumnsMap).length > 0) {
                             // State row
                             const state = firstCellValue;
                             let stateMetricsAdded = 0;
                             for (const colIndexStr in dateColumnsMap) {
                                 const colIndex = parseInt(colIndexStr, 10);
                                 const metricDate = dateColumnsMap[colIndex];
                                 if (colIndex < row.length) {
                                     const rawValue = row[colIndex];
                                     const value = parseBrazilianNumberInternal(rawValue);
                                     if (value !== null) {
                                         processedMetrics.push({
                                             metric_date: metricDate, region: currentRegion, state: state,
                                             value: value, source_file_type: 'logistics', uploaded_by: userId
                                         });
                                         stateMetricsAdded++;
                                     }
                                 }
                             }
                         }

                    } // End of row loop

                    console.log(`[readAndProcessLogisticsExcel] Iteração finalizada. Total métricas extraídas: ${processedMetrics.length}`);
                    resolve({ logisticsMetrics: processedMetrics });

                } catch (err) {
                    reportError(err, "reader.onload");
                    reject(new Error(`Erro interno ao processar planilha: ${err.message}`));
                }
            };
            reader.onerror = (errorEvent) => {
                 reportError(errorEvent, "reader.onerror");
                 reject(new Error('Erro ao ler o arquivo.'));
             };
            reader.readAsArrayBuffer(fileToRead);
        });
    };

    const canUpload = user && user.role !== 'guest';

    return (
         <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="logistics-file-uploader">
             <input type="file" id="logistics-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} />
             <i className={`fas fa-truck text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
              <p className="font-semibold text-lg mb-2">Upload Relatório de Logística (ARs)</p>
             <div className="file-upload-text mb-4">
                 {file ? ( <p className="font-medium" data-name="selected-logistics-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste ou{' '} <label htmlFor="logistics-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione o arquivo </label>. </p> )}
                 <p className="text-xs text-gray-500 mt-1">(Formato: .xlsx/.xls. Aba principal com blocos: NOME_REGIÃO -> linha de datas D/M/YYYY -> linhas de ESTADO -> linha GERAL.)</p>
             </div>
             {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="logistics-guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar.' : 'Faça login para carregar.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="logistics-upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Logística</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="logistics-upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
             {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
         </div>
    );
}

export default FileUploaderLogistics;