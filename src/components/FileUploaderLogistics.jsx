function FileUploaderLogistics({ onFileUpload, user, onClose }) {
    const reportError = (error) => console.error("FileUploaderLogistics Error:", error);

    try {
        const [file, setFile] = React.useState(null);
        const [error, setError] = React.useState(null);
        const [loading, setLoading] = React.useState(false);

        const handleFileChange = (e) => {
            const selectedFile = e.target.files[0];
            if (selectedFile) {
                if (!selectedFile.type.match(/spreadsheetml\.sheet|excel|ms-excel|openxmlformats-officedocument\.spreadsheetml\.sheet/i)) {
                    setError('Formato de arquivo inválido. Use .xlsx ou .xls.'); setFile(null); e.target.value = ''; return;
                }
                setFile(selectedFile); setError(null); console.log("Arquivo de logística selecionado:", selectedFile.name);
            } else { setFile(null); }
        };

        const handleUpload = async () => {
            if (!file) { setError('Selecione um arquivo primeiro'); return; }
            if (user?.role === 'guest') { setError('Convidados não podem carregar relatórios. Faça login para continuar.'); return; }
            if (!user || !user.id) { setError('Erro: Usuário não identificado. Faça login novamente.'); console.error("Logistics upload attempt without valid user ID", user); return; }
            setLoading(true); setError(null); console.log("Iniciando upload e processamento do arquivo de logística...");
            try {
                const processedData = await readAndProcessLogisticsExcel(file, user.id);
                if (processedData.logisticsMetrics.length === 0) {
                    setLoading(false); if (!error) { setError("Nenhum dado de logística válido foi extraído do arquivo. Verifique o formato."); } return;
                }
                console.log(`Processamento de logística concluído. Métricas: ${processedData.logisticsMetrics.length}. Enviando...`);
                await onFileUpload(processedData);
                console.log("Dados de logística enviados com sucesso via onFileUpload.");
                setFile(null); setError(null); if (document.getElementById('logistics-file-upload-input')) { document.getElementById('logistics-file-upload-input').value = ''; } if (onClose) onClose();
            } catch (err) {
                console.error("Erro durante o upload ou processamento da logística:", err); setError(`Erro ao processar logística: ${err.message}`); reportError(err);
            } finally {
                setLoading(false); console.log("Processo de upload de logística finalizado (com sucesso ou erro).");
            }
        };

        const parseBrazilianNumberInternal = (value) => {
            if (typeof value === 'number' && !isNaN(value)) { return value; }
            if (value === null || value === undefined) { return null; }
            let valueStr = String(value).trim();
            if (valueStr === '' || valueStr === '-' || /^(R\$)?\s*-?\s*$/.test(valueStr) || ['#DIV/0!', '#N/A', '#VALOR!', '#REF!', '#NOME?'].includes(valueStr.toUpperCase())) { return null; }
            valueStr = valueStr.replace(/R\$\s?/g, '').trim();
            const hasComma = valueStr.includes(','); const hasDot = valueStr.includes('.'); let cleanedStr = valueStr;
            if (hasComma) { cleanedStr = valueStr.replace(/\./g, '').replace(',', '.'); }
            else if (hasDot) { const lastDotIndex = valueStr.lastIndexOf('.'); if (lastDotIndex !== -1) { const integerPart = valueStr.substring(0, lastDotIndex).replace(/\./g, ''); const decimalPart = valueStr.substring(lastDotIndex); cleanedStr = integerPart + decimalPart; } }
            const number = parseFloat(cleanedStr);
            if (isNaN(number)) { console.warn(`[PARSE LOGISTICS] Failed: Original='${value}', Cleaned='${cleanedStr}'`); return null; }
            else { return number; }
        };

        const parseDateFromHeader = (headerValue, referenceYear) => {
             if (!headerValue) return null;
             const headerString = String(headerValue).trim();
             // Tenta formato DD/MM/YYYY ou MM/DD/YYYY (com ano)
             const fullDateMatch = headerString.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
             if (fullDateMatch) {
                 // Heurística simples: se o primeiro número > 12, assume DD/MM
                 const d = parseInt(fullDateMatch[1], 10);
                 const m = parseInt(fullDateMatch[2], 10);
                 const y = parseInt(fullDateMatch[3], 10);
                 if (d > 0 && d <= 31 && m > 0 && m <= 12) return new Date(Date.UTC(y, m - 1, d));
                 if (m > 0 && m <= 31 && d > 0 && d <= 12) return new Date(Date.UTC(y, d - 1, m));
             }
             // Tenta formato DD/MM (assume referenceYear)
             const dayMonthMatch = headerString.match(/^(\d{1,2})[\/-](\d{1,2})$/);
              if (dayMonthMatch) {
                  const d = parseInt(dayMonthMatch[1], 10);
                  const m = parseInt(dayMonthMatch[2], 10);
                  if (d > 0 && d <= 31 && m > 0 && m <= 12) return new Date(Date.UTC(referenceYear, m - 1, d));
              }
             // Tenta formato Date Object do Excel
             if (headerValue instanceof Date && !isNaN(headerValue)) {
                 return new Date(Date.UTC(headerValue.getFullYear(), headerValue.getMonth(), headerValue.getDate()));
             }
             // Tenta formato numérico serial do Excel
             if (typeof headerValue === 'number' && headerValue > 20000 && headerValue < 60000) { // Range comum para datas
                 try {
                     const dateInfo = XLSX.SSF.parse_date_code(headerValue);
                     if (dateInfo && !isNaN(dateInfo.y)) {
                          return new Date(Date.UTC(dateInfo.y, dateInfo.m - 1, dateInfo.d));
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
                         const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                         const firstSheetName = workbook.SheetNames[0];
                         if (!firstSheetName) return reject(new Error('A planilha está vazia.'));
                         console.log(`[readAndProcessLogisticsExcel] Aba: "${firstSheetName}"`);
                         const worksheet = workbook.Sheets[firstSheetName];
                         const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: null });
                         console.log(`[readAndProcessLogisticsExcel] Linhas lidas: ${sheetData.length}.`);
                         if (sheetData.length < 3) return reject(new Error('Planilha com poucas linhas.'));

                         const processedMetrics = [];
                         let currentRegion = null;
                         let dateColumns = {}; // { colIndex: 'YYYY-MM-DD' }
                         let headerRowIndex = -1;
                         const regions = ["NORTE", "NORDESTE", "CENTRO OESTE", "SUDESTE", "SUL"]; // Case insensitive comparison later
                          let referenceYear = new Date().getFullYear(); // Default to current year

                         console.log("[readAndProcessLogisticsExcel] Iterando linhas para encontrar regiões e cabeçalhos...");
                         for (let rowIndex = 0; rowIndex < sheetData.length; rowIndex++) {
                             const row = sheetData[rowIndex];
                             if (!row || row.length === 0) continue;

                             const firstCellStr = String(row[0]).toUpperCase().trim();

                             // Check if it's a region header row
                             if (regions.includes(firstCellStr)) {
                                 currentRegion = firstCellStr;
                                 headerRowIndex = rowIndex;
                                 dateColumns = {}; // Reset date columns for the new region
                                 console.log(`[DEBUG] Região encontrada: ${currentRegion} na linha ${rowIndex + 1}`);

                                  // Try to infer year from header row itself or surrounding cells
                                 let foundYearInHeader = false;
                                 for(let colIdx = 1; colIdx < row.length; colIdx++){
                                     const headerVal = row[colIdx];
                                     if(headerVal instanceof Date && !isNaN(headerVal)){
                                         referenceYear = headerVal.getFullYear();
                                         foundYearInHeader = true;
                                         console.log(`[DEBUG] Ano ${referenceYear} inferido da data na coluna ${colIdx+1} do header da região.`);
                                         break;
                                     }
                                     const dateMatchYear = String(headerVal).match(/(\d{4})/);
                                     if(dateMatchYear && parseInt(dateMatchYear[1]) > 2000){
                                         referenceYear = parseInt(dateMatchYear[1]);
                                         foundYearInHeader = true;
                                         console.log(`[DEBUG] Ano ${referenceYear} inferido do texto "${headerVal}" na coluna ${colIdx+1} do header da região.`);
                                          break;
                                     }
                                 }
                                 if(!foundYearInHeader) console.log(`[DEBUG] Não foi possível inferir o ano do header da região ${currentRegion}, usando default/anterior: ${referenceYear}`);

                                 // Map date columns for this region
                                 for (let colIndex = 1; colIndex < row.length; colIndex += 2) { // Step by 2 (Value, Percentage)
                                     const potentialDateHeader = row[colIndex];
                                     const parsedDate = parseDateFromHeader(potentialDateHeader, referenceYear);
                                     if (parsedDate) {
                                         const dateString = parsedDate.toISOString().split('T')[0];
                                         dateColumns[colIndex] = dateString;
                                     } else {
                                         if(potentialDateHeader && String(potentialDateHeader).trim() !== '%') {
                                             console.warn(`[DEBUG] Header "${potentialDateHeader}" na coluna ${colIndex + 1} da região ${currentRegion} não reconhecido como data válida.`);
                                         }
                                     }
                                 }
                                 console.log(`[DEBUG] Colunas de data mapeadas para ${currentRegion}:`, dateColumns);

                             } else if (currentRegion && rowIndex > headerRowIndex) {
                                 // Process data row (state)
                                 const state = String(row[0]).trim();
                                 const upperState = state.toUpperCase();

                                 if (state && !upperState.includes("GERAL") && !regions.includes(upperState) && Object.keys(dateColumns).length > 0) {
                                     let stateMetricsAdded = 0;
                                     for (const colIndexStr in dateColumns) {
                                         const colIndex = parseInt(colIndexStr, 10);
                                         const metricDate = dateColumns[colIndex];

                                         if (colIndex < row.length) {
                                             const rawValue = row[colIndex]; // Value is in the date column index
                                             const value = parseBrazilianNumberInternal(rawValue);

                                             if (value !== null) {
                                                 processedMetrics.push({
                                                     metric_date: metricDate,
                                                     region: currentRegion,
                                                     state: state,
                                                     value: value,
                                                     source_file_type: 'logistics',
                                                     uploaded_by: userId
                                                 });
                                                 stateMetricsAdded++;
                                             }
                                         }
                                     }
                                     if (stateMetricsAdded > 0) console.log(`[DEBUG] Estado "${state}" (Região ${currentRegion}): ${stateMetricsAdded} métricas adicionadas.`);
                                 } else if (upperState.includes("GERAL")) {
                                     // Reset currentRegion when 'GERAL' row is encountered after data rows
                                     console.log(`[DEBUG] Linha GERAL encontrada para ${currentRegion}, finalizando região.`);
                                     currentRegion = null; // Stop processing until next region header
                                     headerRowIndex = -1;
                                     dateColumns = {};
                                 }
                             }
                         }

                         console.log(`[readAndProcessLogisticsExcel] Iteração finalizada. Total métricas de logística: ${processedMetrics.length}`);
                         if (processedMetrics.length === 0) return reject(new Error('Nenhum dado de logística válido extraído. Verifique o formato do arquivo.'));

                         resolve({ logisticsMetrics: processedMetrics });

                     } catch (err) { reject(new Error(`Erro no processamento do arquivo de logística: ${err.message}`)); }
                 };
                 reader.onerror = (error) => reject(new Error('Erro ao ler arquivo de logística.'));
                 reader.readAsArrayBuffer(fileToRead);
             });
         };


        const canUpload = user && user.role !== 'guest';

        return (
             <div className="file-upload-container border-2 border-dashed border-gray-300 p-6 rounded-lg bg-gray-50 text-center relative" data-name="logistics-file-uploader">
                 <input type="file" id="logistics-file-upload-input" className="hidden" accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFileChange} disabled={loading || !canUpload} />
                 <i className={`fas fa-truck text-4xl mb-4 ${canUpload ? 'text-blue-500' : 'text-gray-400'}`}></i>
                  <p className="font-semibold text-lg mb-2">Upload Relatório de Logística</p>
                 <div className="file-upload-text mb-4">
                     {file ? ( <p className="font-medium" data-name="selected-logistics-file">{file.name}</p> ) : ( <p className="text-gray-600"> Arraste e solte o arquivo de logística aqui ou{' '} <label htmlFor="logistics-file-upload-input" className={`font-medium cursor-pointer ${canUpload ? 'text-blue-600 hover:text-blue-800 underline' : 'text-gray-500 cursor-not-allowed'}`}> selecione um arquivo </label>. </p> )}
                     <p className="text-xs text-gray-500 mt-1">(Formato esperado: .xlsx ou .xls com Regiões/Estados nas linhas e Datas/Valores nas colunas)</p>
                 </div>
                 {!canUpload ? ( <div className="file-upload-error text-sm bg-yellow-100 text-yellow-800 px-4 py-2 rounded" data-name="logistics-guest-error"> <i className="fas fa-info-circle mr-2"></i> { user?.role === 'guest' ? 'Convidados não podem carregar arquivos. Faça login.' : 'Faça login para carregar arquivos.' } </div> ) : ( <React.Fragment> {file && ( <button onClick={handleUpload} className="btn btn-primary w-full sm:w-auto" disabled={loading || !file} data-name="logistics-upload-button"> {loading ? ( <React.Fragment><i className="fas fa-spinner fa-spin mr-2"></i>Processando Logística...</React.Fragment> ) : ( <React.Fragment><i className="fas fa-upload mr-2"></i>Enviar Relatório de Logística</React.Fragment> )} </button> )} {error && ( <div className="file-upload-error mt-4 text-sm bg-red-100 text-red-700 px-4 py-2 rounded" data-name="logistics-upload-error"> <i className="fas fa-exclamation-circle mr-2"></i> {error} </div> )} </React.Fragment> )}
                 {onClose && ( <button onClick={onClose} className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 p-1 rounded-full hover:bg-gray-200 transition-colors" title="Fechar Uploader" aria-label="Fechar uploader"> <i className="fas fa-times"></i> </button> )}
             </div>
        );
    } catch (componentError) {
        console.error('FileUploaderLogistics component error:', componentError);
        reportError(componentError);
        return <div className="file-upload-container error p-6 bg-red-100 text-red-700 rounded-lg">Erro ao carregar o componente de upload de logística. Tente recarregar a página.</div>;
    }
}