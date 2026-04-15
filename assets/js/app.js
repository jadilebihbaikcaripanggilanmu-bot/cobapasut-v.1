(function () {
  const state = {
    dataset: null,
    lastAnalysis: null,
    sourceMode: 'file',
  };

  const el = {
    sourceFile: document.getElementById('sourceFile'),
    sourceIoc: document.getElementById('sourceIoc'),
    sourceFileLabel: document.getElementById('sourceFileLabel'),
    sourceIocLabel: document.getElementById('sourceIocLabel'),
    localSourcePanel: document.getElementById('localSourcePanel'),
    iocSourcePanel: document.getElementById('iocSourcePanel'),
    fileInput: document.getElementById('fileInput'),
    fileStatus: document.getElementById('fileStatus'),
    iocStationCode: document.getElementById('iocStationCode'),
    iocPeriod: document.getElementById('iocPeriod'),
    iocEndDate: document.getElementById('iocEndDate'),
    iocUrl: document.getElementById('iocUrl'),
    buildIocUrlBtn: document.getElementById('buildIocUrlBtn'),
    fetchIocBtn: document.getElementById('fetchIocBtn'),
    stationName: document.getElementById('stationName'),
    sensorSelect: document.getElementById('sensorSelect'),
    startDate: document.getElementById('startDate'),
    endDate: document.getElementById('endDate'),
    resolutionSelect: document.getElementById('resolutionSelect'),
    maxGap: document.getElementById('maxGap'),
    constituentList: document.getElementById('constituentList'),
    processBtn: document.getElementById('processBtn'),
    resetBtn: document.getElementById('resetBtn'),
    summaryRows: document.getElementById('summaryRows'),
    summaryInterval: document.getElementById('summaryInterval'),
    summaryPeriod: document.getElementById('summaryPeriod'),
    summarySensors: document.getElementById('summarySensors'),
    analysisSummary: document.getElementById('analysisSummary'),
    downloadReportBtn: document.getElementById('downloadReportBtn'),
    downloadDataBtn: document.getElementById('downloadDataBtn'),
    plotObs: document.getElementById('plotObs'),
    plotModel: document.getElementById('plotModel'),
    plotCompare: document.getElementById('plotCompare'),
    plotAmp: document.getElementById('plotAmp'),
    plotResidual: document.getElementById('plotResidual'),
  };

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function dateToDatetimeLocalUTC(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  function datetimeLocalUTCToDate(value) {
    if (!value) return null;
    const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return null;
    return new Date(Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0)
    ));
  }

  function formatDateUTC(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  }

  function formatDateOnlyUTC(date) {
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function formatNumber(value, digits = 4) {
    return Number.isFinite(value) ? value.toFixed(digits) : 'NaN';
  }

  function setInputsEnabled(enabled) {
    [
      el.sensorSelect,
      el.startDate,
      el.endDate,
      el.resolutionSelect,
      el.maxGap,
      el.processBtn,
    ].forEach((node) => {
      node.disabled = !enabled;
    });

    el.constituentList.querySelectorAll('input').forEach((input) => {
      input.disabled = !enabled;
    });
  }

  function setStatus(message, kind = 'muted') {
    el.fileStatus.className = `status-box ${kind}`;
    el.fileStatus.innerHTML = message;
  }

  function clearPlots() {
    [el.plotObs, el.plotModel, el.plotCompare, el.plotAmp, el.plotResidual].forEach((node) => {
      Plotly.purge(node);
      node.innerHTML = '';
    });
  }

  function renderConstituentCheckboxes() {
    const defaults = Object.keys(PasutTide.CONSTITUENTS);
    el.constituentList.innerHTML = defaults.map((name) => `
      <label class="checkbox-item">
        <input type="checkbox" value="${name}" checked />
        <span>${name}</span>
      </label>
    `).join('');
  }

  function getSelectedConstituents() {
    return Array.from(el.constituentList.querySelectorAll('input:checked')).map((input) => input.value);
  }

  function populateSensorOptions(dataset) {
    el.sensorSelect.innerHTML = '<option value="">Pilih sensor</option>';
    dataset.sensors.forEach((sensor, index) => {
      const option = document.createElement('option');
      option.value = sensor.key;
      option.textContent = sensor.label;
      if (index === 0) option.selected = true;
      el.sensorSelect.appendChild(option);
    });
  }

  function updateSummaryCards(dataset) {
    const firstTime = dataset.points[0].time;
    const lastTime = dataset.points[dataset.points.length - 1].time;
    const nativeSeries = PasutTide.buildSensorSeries(dataset, dataset.sensors[0].key);
    const interval = PasutTide.inferDominantIntervalMinutes(nativeSeries.times);

    el.summaryRows.textContent = dataset.points.length.toLocaleString('id-ID');
    el.summaryInterval.textContent = `${interval} menit`;
    el.summaryPeriod.textContent = `${formatDateUTC(firstTime)} s.d. ${formatDateUTC(lastTime)} UTC`;
    el.summarySensors.textContent = dataset.sensors.map((sensor) => sensor.label).join(', ');
  }

  function setSourceMode(mode) {
    state.sourceMode = mode;
    const isFile = mode === 'file';
    el.localSourcePanel.classList.toggle('hidden', !isFile);
    el.iocSourcePanel.classList.toggle('hidden', isFile);
    el.sourceFileLabel.classList.toggle('active', isFile);
    el.sourceIocLabel.classList.toggle('active', !isFile);
  }

  function resetAnalysisOnly() {
    state.dataset = null;
    state.lastAnalysis = null;
    el.stationName.value = '';
    el.sensorSelect.innerHTML = '<option value="">Pilih sensor</option>';
    el.startDate.value = '';
    el.endDate.value = '';
    el.analysisSummary.innerHTML = 'Muat data dulu untuk melihat hasil ringkas fitting harmonik.';
    el.analysisSummary.className = 'analysis-summary muted';
    el.downloadReportBtn.disabled = true;
    el.downloadDataBtn.disabled = true;
    el.summaryRows.textContent = '-';
    el.summaryInterval.textContent = '-';
    el.summaryPeriod.textContent = '-';
    el.summarySensors.textContent = '-';
    setInputsEnabled(false);
    clearPlots();
  }

  function resetAppState() {
    resetAnalysisOnly();
    el.fileInput.value = '';
    el.iocStationCode.value = 'saba';
    el.iocPeriod.value = '30';
    el.iocEndDate.value = formatDateOnlyUTC(new Date());
    el.iocUrl.value = '';
    setSourceMode('file');
    el.sourceFile.checked = true;
    setStatus('Belum ada data yang dipilih.', 'muted');
  }

  function loadDatasetIntoUI(dataset) {
    state.dataset = dataset;
    state.lastAnalysis = null;

    const firstTime = dataset.points[0].time;
    const lastTime = dataset.points[dataset.points.length - 1].time;

    el.stationName.value = dataset.stationName;
    populateSensorOptions(dataset);
    el.startDate.value = dateToDatetimeLocalUTC(firstTime);
    el.endDate.value = dateToDatetimeLocalUTC(lastTime);
    el.resolutionSelect.value = '60';
    el.maxGap.value = '15';
    updateSummaryCards(dataset);
    setInputsEnabled(true);
    el.downloadReportBtn.disabled = true;
    el.downloadDataBtn.disabled = true;
    el.analysisSummary.innerHTML = 'Data berhasil dibaca. Silakan atur sensor, rentang waktu, dan resolusi lalu klik <strong>Proses Data</strong>.';
    el.analysisSummary.className = 'analysis-summary';

    const sourceLabel = dataset.sourceType === 'ioc' ? 'IOC online' : 'File lokal';
    const sourceExtra = dataset.sourceUrl
      ? `<strong>Sumber</strong><span class="small-break"><a href="${dataset.sourceUrl}" target="_blank" rel="noopener noreferrer">${dataset.sourceUrl}</a></span>`
      : `<strong>Sumber</strong><span>${sourceLabel}</span>`;

    setStatus(`
      <div class="kv">
        <strong>Mode</strong><span>${sourceLabel}</span>
        <strong>Nama data</strong><span>${dataset.fileName}</span>
        <strong>Stasiun</strong><span>${dataset.stationName}</span>
        <strong>Jumlah baris data</strong><span>${dataset.points.length.toLocaleString('id-ID')}</span>
        <strong>Sensor terdeteksi</strong><span>${dataset.sensors.map((s) => s.label).join(', ')}</span>
        ${sourceExtra}
      </div>
    `, 'ok');
  }

  function buildPlotLayout(yTitle) {
    return {
      margin: { l: 56, r: 20, t: 20, b: 48 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { title: 'Waktu (UTC)', showgrid: true },
      yaxis: { title: yTitle, showgrid: true },
      showlegend: true,
    };
  }

  function renderPlots(analysis) {
    const x = analysis.sampledTimes.map((date) => formatDateUTC(date));

    Plotly.newPlot(el.plotObs, [{ x, y: analysis.observed, mode: 'lines', name: 'Observasi' }], buildPlotLayout('Elevasi (m)'), { responsive: true });
    Plotly.newPlot(el.plotModel, [{ x, y: analysis.model, mode: 'lines', name: 'Model' }], buildPlotLayout('Elevasi (m)'), { responsive: true });
    Plotly.newPlot(el.plotCompare, [
      { x, y: analysis.observed, mode: 'lines', name: 'Observasi' },
      { x, y: analysis.model, mode: 'lines', name: 'Model' },
    ], buildPlotLayout('Elevasi (m)'), { responsive: true });

    const sorted = analysis.fit.constituents
      .map((name, i) => ({ name, amp: analysis.fit.amplitudo[i] }))
      .sort((a, b) => b.amp - a.amp);

    Plotly.newPlot(el.plotAmp, [{
      x: sorted.map((item) => item.name),
      y: sorted.map((item) => item.amp),
      type: 'bar',
      name: 'Amplitudo',
    }], {
      margin: { l: 56, r: 20, t: 20, b: 48 },
      paper_bgcolor: '#ffffff',
      plot_bgcolor: '#ffffff',
      xaxis: { title: 'Komponen' },
      yaxis: { title: 'Amplitudo (m)' },
      showlegend: false,
    }, { responsive: true });

    Plotly.newPlot(el.plotResidual, [{ x, y: analysis.residual, mode: 'lines', name: 'Residual' }], buildPlotLayout('Residual (m)'), { responsive: true });
  }

  function buildSummaryHTML(dataset, sensorKey, analysis) {
    const fit = analysis.fit;
    const topComponents = fit.constituents
      .map((name, i) => ({ name, amp: fit.amplitudo[i], phase: fit.faseDeg[i] }))
      .sort((a, b) => b.amp - a.amp)
      .slice(0, 4)
      .map((item) => `${item.name} (${formatNumber(item.amp, 4)} m; fase ${formatNumber(item.phase, 2)}°)`)
      .join('<br>');

    return `
      <div class="kv">
        <strong>Stasiun</strong><span>${dataset.stationName}</span>
        <strong>Sensor</strong><span>${sensorKey.toUpperCase()}</span>
        <strong>Resolusi analisis</strong><span>${analysis.meta.resolutionMinutes} menit</span>
        <strong>Interval dominan data</strong><span>${analysis.meta.nativeStepMinutes} menit</span>
        <strong>Jumlah data setelah filter</strong><span>${analysis.meta.nFiltered.toLocaleString('id-ID')}</span>
        <strong>Jumlah data valid analisis</strong><span>${analysis.meta.nResampledValid.toLocaleString('id-ID')}</span>
        <strong>Gap total</strong><span>${analysis.meta.nGap}</span>
        <strong>Gap pendek terisi</strong><span>${analysis.meta.nGapPendek}</span>
        <strong>Gap panjang tersisa</strong><span>${analysis.meta.nGapPanjang}</span>
        <strong>MSL (a0)</strong><span>${formatNumber(fit.a0, 6)} m</span>
        <strong>RMSE fitting</strong><span>${formatNumber(fit.rmse, 6)} m</span>
        <strong>MAE fitting</strong><span>${formatNumber(fit.mae, 6)} m</span>
        <strong>R²</strong><span>${formatNumber(fit.r2, 6)}</span>
        <strong>Komponen dominan</strong><span>${topComponents}</span>
      </div>
    `;
  }

  function buildReportText(dataset, sensorKey, analysis, options) {
    const fit = analysis.fit;
    const lines = [];
    lines.push('RINGKASAN ANALISIS HARMONIK PASUT');
    lines.push('================================');
    lines.push('');
    lines.push('A. INFORMASI UMUM');
    lines.push('-----------------');
    lines.push(`Stasiun                         : ${dataset.stationName}`);
    lines.push(`Sumber data                     : ${dataset.sourceType === 'ioc' ? 'IOC online' : 'File lokal'}`);
    if (dataset.sourceUrl) lines.push(`URL sumber                      : ${dataset.sourceUrl}`);
    lines.push(`File / label input              : ${dataset.fileName}`);
    lines.push(`Sensor                          : ${sensorKey.toUpperCase()}`);
    lines.push(`Waktu awal analisis             : ${formatDateUTC(options.start)} UTC`);
    lines.push(`Waktu akhir analisis            : ${formatDateUTC(options.end)} UTC`);
    lines.push(`Resolusi analisis               : ${analysis.meta.resolutionMinutes} menit`);
    lines.push(`Interval dominan data           : ${analysis.meta.nativeStepMinutes} menit`);
    lines.push(`Jumlah data setelah filter      : ${analysis.meta.nFiltered}`);
    lines.push(`Jumlah data valid analisis      : ${analysis.meta.nResampledValid}`);
    lines.push(`Maks. gap interpolasi           : ${analysis.meta.maxGapMinutes} menit`);
    lines.push(`MSL (a0)                        : ${formatNumber(fit.a0, 6)} m`);
    lines.push(`RMSE fitting                    : ${formatNumber(fit.rmse, 6)} m`);
    lines.push(`MAE fitting                     : ${formatNumber(fit.mae, 6)} m`);
    lines.push(`R^2                             : ${formatNumber(fit.r2, 6)}`);
    lines.push('');
    lines.push('B. QC GAP REPORT');
    lines.push('---------------');
    lines.push(`Jumlah gap total                : ${analysis.meta.nGap}`);
    lines.push(`Gap pendek terisi               : ${analysis.meta.nGapPendek}`);
    lines.push(`Gap panjang tersisa             : ${analysis.meta.nGapPanjang}`);
    lines.push(`Jumlah titik interpolasi        : ${analysis.meta.nInterp}`);
    lines.push(`Jumlah slot grid reguler        : ${analysis.meta.nRegularGrid}`);
    lines.push(`Jumlah slot resampling          : ${analysis.meta.nResampled}`);
    lines.push(`Jumlah NaN akhir                : ${analysis.meta.nNaFinal}`);
    lines.push('');
    lines.push('C. HASIL KOMPONEN PASUT');
    lines.push('----------------------');
    lines.push('Komp\tPeriode_jam\tOmega\tAcos\tBsin\tAmp\tFase_deg');

    fit.constituents.forEach((name, i) => {
      lines.push([
        name,
        fit.periods[i].toFixed(6),
        fit.omega[i].toFixed(6),
        fit.Acos[i].toFixed(6),
        fit.Bsin[i].toFixed(6),
        fit.amplitudo[i].toFixed(6),
        fit.faseDeg[i].toFixed(6),
      ].join('\t'));
    });

    return lines.join('\n');
  }

  function buildObservationVsModelText(analysis) {
    const lines = [];
    lines.push('OBSERVASI VS MODEL PASUT');
    lines.push('========================');
    lines.push('Waktu_UTC\tt_jam\tObservasi_m\tModel_m\tResidual_m');

    analysis.sampledTimes.forEach((time, i) => {
      lines.push([
        formatDateUTC(time),
        formatNumber(analysis.tHours[i], 3),
        formatNumber(analysis.observed[i], 6),
        formatNumber(analysis.model[i], 6),
        formatNumber(analysis.residual[i], 6),
      ].join('\t'));
    });

    return lines.join('\n');
  }

  function downloadTextFile(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    resetAnalysisOnly();
    setStatus('Membaca file...', 'muted');
    try {
      const dataset = await PasutParser.parseSpreadsheetFile(file);
      loadDatasetIntoUI(dataset);
    } catch (error) {
      resetAnalysisOnly();
      setStatus(`Gagal membaca file: ${error.message}`, 'err');
    }
  }

  function buildIocUrlFromForm() {
    return PasutParser.buildIocUrl({
      stationCode: el.iocStationCode.value,
      periodDays: el.iocPeriod.value,
      endDate: el.iocEndDate.value,
    });
  }

  function handleBuildIocUrl() {
    try {
      const url = buildIocUrlFromForm();
      el.iocUrl.value = url;
      setStatus(`URL IOC berhasil dibuat.<br><a href="${url}" target="_blank" rel="noopener noreferrer"><code>${url}</code></a>`, 'ok');
    } catch (error) {
      setStatus(`Gagal membuat URL IOC: ${error.message}`, 'err');
    }
  }

  async function handleFetchIoc() {
    resetAnalysisOnly();

    let url = el.iocUrl.value.trim();
    try {
      if (!url) {
        url = buildIocUrlFromForm();
        el.iocUrl.value = url;
      }
    } catch (error) {
      setStatus(`Gagal membuat URL IOC: ${error.message}`, 'err');
      return;
    }

    setStatus(`Mengambil data dari IOC...<br><a href="${url}" target="_blank" rel="noopener noreferrer"><code>${url}</code></a>`, 'muted');

    try {
      const dataset = await PasutParser.fetchIocDataset(url);
      loadDatasetIntoUI(dataset);
    } catch (error) {
      const msg = String(error && error.message ? error.message : error);
      const corsHint = /failed to fetch|networkerror|load failed/i.test(msg)
        ? '<br><br><strong>Kemungkinan besar request lintas-domain diblokir.</strong> Kalau ini terjadi di GitHub Pages, solusi paling aman adalah tetap upload file hasil IOC, atau nanti kita tambah proxy/serverless.'
        : '';
      setStatus(`Gagal mengambil data IOC: ${msg}${corsHint}`, 'err');
    }
  }

  function validateOptions(dataset, options) {
    if (!options.sensorKey) throw new Error('Sensor belum dipilih.');
    if (!(options.start instanceof Date) || isNaN(options.start.getTime())) throw new Error('Start date belum valid.');
    if (!(options.end instanceof Date) || isNaN(options.end.getTime())) throw new Error('End date belum valid.');
    if (options.end < options.start) throw new Error('End date harus lebih besar atau sama dengan start date.');
    if (!options.constituents.length) throw new Error('Pilih minimal satu komponen harmonik.');

    const firstTime = dataset.points[0].time;
    const lastTime = dataset.points[dataset.points.length - 1].time;
    if (options.start < firstTime || options.end > lastTime) {
      throw new Error('Rentang waktu harus berada di dalam rentang data yang tersedia.');
    }
  }

  function handleProcess() {
    if (!state.dataset) return;

    try {
      const options = {
        sensorKey: el.sensorSelect.value,
        start: datetimeLocalUTCToDate(el.startDate.value),
        end: datetimeLocalUTCToDate(el.endDate.value),
        resolutionMinutes: Number(el.resolutionSelect.value),
        maxGapMinutes: Number(el.maxGap.value),
        constituents: getSelectedConstituents(),
      };

      validateOptions(state.dataset, options);
      const analysis = PasutTide.analyzeSeries(state.dataset, options.sensorKey, options);
      state.lastAnalysis = { analysis, options };

      el.analysisSummary.innerHTML = buildSummaryHTML(state.dataset, options.sensorKey, analysis);
      el.analysisSummary.className = 'analysis-summary';
      renderPlots(analysis);
      el.downloadReportBtn.disabled = false;
      el.downloadDataBtn.disabled = false;
      setStatus('Analisis berhasil dijalankan.', 'ok');
    } catch (error) {
      el.analysisSummary.innerHTML = `Analisis gagal: ${error.message}`;
      el.analysisSummary.className = 'analysis-summary err';
      el.downloadReportBtn.disabled = true;
      el.downloadDataBtn.disabled = true;
      clearPlots();
    }
  }

  function handleDownloadReport() {
    if (!state.dataset || !state.lastAnalysis) return;
    const { analysis, options } = state.lastAnalysis;
    const report = buildReportText(state.dataset, options.sensorKey, analysis, options);
    downloadTextFile(`report_${options.sensorKey}_${options.resolutionMinutes}menit.txt`, report);
  }

  function handleDownloadData() {
    if (!state.dataset || !state.lastAnalysis) return;
    const { analysis, options } = state.lastAnalysis;
    const content = buildObservationVsModelText(analysis);
    downloadTextFile(`observasi_vs_model_${options.sensorKey}_${options.resolutionMinutes}menit.txt`, content);
  }

  function initDefaultIocValues() {
    el.iocStationCode.value = 'saba';
    el.iocPeriod.value = '30';
    el.iocEndDate.value = formatDateOnlyUTC(new Date());
  }

  function init() {
    renderConstituentCheckboxes();
    initDefaultIocValues();
    resetAppState();

    el.sourceFile.addEventListener('change', () => setSourceMode('file'));
    el.sourceIoc.addEventListener('change', () => setSourceMode('ioc'));
    el.fileInput.addEventListener('change', handleFileChange);
    el.buildIocUrlBtn.addEventListener('click', handleBuildIocUrl);
    el.fetchIocBtn.addEventListener('click', handleFetchIoc);
    el.processBtn.addEventListener('click', handleProcess);
    el.resetBtn.addEventListener('click', resetAppState);
    el.downloadReportBtn.addEventListener('click', handleDownloadReport);
    el.downloadDataBtn.addEventListener('click', handleDownloadData);
  }

  init();
})();
