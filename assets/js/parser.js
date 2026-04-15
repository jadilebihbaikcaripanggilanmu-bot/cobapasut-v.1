(function () {
  const IOC_PROXY_BASE = 'https://ioc-proxy-pasut.christophdaniel11.workers.dev/';

  function excelDateToJSDate(serial) {
    const utcDays = Math.floor(serial - 25569);
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    const fractionalDay = serial - Math.floor(serial) + 0.0000001;
    let totalSeconds = Math.floor(86400 * fractionalDay);
    const seconds = totalSeconds % 60;
    totalSeconds -= seconds;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor(totalSeconds / 60) % 60;

    return new Date(Date.UTC(
      dateInfo.getUTCFullYear(),
      dateInfo.getUTCMonth(),
      dateInfo.getUTCDate(),
      hours,
      minutes,
      seconds
    ));
  }

  function parseNaiveDateStringAsUTC(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) return null;

    const patterns = [
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
    ];

    for (let i = 0; i < patterns.length; i += 1) {
      const match = trimmed.match(patterns[i]);
      if (!match) continue;

      let year;
      let month;
      let day;

      if (i === 0) {
        year = Number(match[1]);
        month = Number(match[2]) - 1;
        day = Number(match[3]);
      } else {
        month = Number(match[1]) - 1;
        day = Number(match[2]);
        year = Number(match[3]);
      }

      const hour = Number(match[4] || 0);
      const minute = Number(match[5] || 0);
      const second = Number(match[6] || 0);

      return new Date(Date.UTC(year, month, day, hour, minute, second));
    }

    return null;
  }

  function parseDateValue(value) {
    if (value == null || value === '') return null;

    if (value instanceof Date && !isNaN(value.getTime())) {
      return new Date(value.getTime());
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value > 10000) {
        const date = excelDateToJSDate(value);
        return isNaN(date.getTime()) ? null : date;
      }
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;

      const parsedUtc = parseNaiveDateStringAsUTC(trimmed);
      if (parsedUtc && !isNaN(parsedUtc.getTime())) {
        return parsedUtc;
      }

      if (/z$|[+-]\d{2}:?\d{2}$/i.test(trimmed)) {
        const nativeWithZone = new Date(trimmed);
        if (!isNaN(nativeWithZone.getTime())) {
          return nativeWithZone;
        }
      }

      const native = new Date(trimmed);
      if (!isNaN(native.getTime())) {
        return native;
      }
    }

    return null;
  }

  function toNumber(value) {
    if (value == null || value === '') return NaN;
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    const normalized = String(value).trim().replace(',', '.');
    if (!normalized) return NaN;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : NaN;
  }

  function cleanHeader(header) {
    return String(header == null ? '' : header)
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function headerToKey(header) {
    return cleanHeader(header)
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function detectTimeColumn(headers) {
    const idx = headers.findIndex((h) => /time|waktu/i.test(h));
    return idx >= 0 ? idx : 0;
  }

  function detectSensorColumns(headers, dataRows) {
    const sensors = [];

    headers.forEach((header, index) => {
      const label = cleanHeader(header);
      const key = headerToKey(label);
      const lower = label.toLowerCase();

      if (!label) return;
      if (/time|waktu/i.test(label)) return;
      if (/^bat/i.test(lower) || /\(v\)/i.test(label)) return;

      const sampleValues = dataRows
        .slice(0, 25)
        .map((row) => toNumber(row[index]))
        .filter((v) => Number.isFinite(v));

      if (!sampleValues.length) return;

      sensors.push({
        index,
        key,
        label,
      });
    });

    return sensors;
  }

  function normalizeRowLength(row, length) {
    const out = Array.isArray(row) ? row.slice() : [];
    while (out.length < length) out.push('');
    return out;
  }

  function parseRowsToDataset(rows, meta = {}) {
    if (rows.length < 3) {
      throw new Error('Format data minimal harus punya 3 baris: nama stasiun, header, lalu data.');
    }

    const stationName = cleanHeader((rows[0] && rows[0][0]) || meta.stationName || 'Stasiun tanpa nama');
    const headers = normalizeRowLength(rows[1], rows[1].length).map(cleanHeader);
    const timeIndex = detectTimeColumn(headers);
    const dataRows = rows.slice(2).map((row) => normalizeRowLength(row, headers.length));
    const sensors = detectSensorColumns(headers, dataRows);

    if (!sensors.length) {
      throw new Error('Tidak ada kolom sensor yang terdeteksi. Pastikan header sensor seperti prs(m), ra2(m), rad(m), atau ras(m).');
    }

    const points = [];

    dataRows.forEach((row) => {
      const time = parseDateValue(row[timeIndex]);
      if (!time) return;

      const values = {};
      sensors.forEach((sensor) => {
        values[sensor.key] = toNumber(row[sensor.index]);
      });

      points.push({ time, values });
    });

    if (!points.length) {
      throw new Error('Tidak ada data waktu yang berhasil dibaca.');
    }

    points.sort((a, b) => a.time - b.time);

    return {
      stationName,
      headers,
      sensors,
      points,
      fileName: meta.fileName || 'data_ioc_online',
      sourceType: meta.sourceType || 'file',
      sourceUrl: meta.sourceUrl || '',
    };
  }

  async function parseSpreadsheetFile(file) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', raw: true, cellDates: false });

    if (!workbook.SheetNames.length) {
      throw new Error('Workbook kosong.');
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: false,
    });

    return parseRowsToDataset(rows, {
      fileName: file.name,
      sourceType: 'file',
    });
  }

  function findIocDataTable(doc) {
    const tables = Array.from(doc.querySelectorAll('table'));
    return tables.find((table) => {
      const text = cleanHeader(table.textContent);
      return /time\s*\(utc\)/i.test(text) && /tide gauge at/i.test(text);
    }) || null;
  }

  function parseIocHtml(html, sourceUrl = '') {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const table = findIocDataTable(doc);

    if (!table) {
      throw new Error('Tabel data IOC tidak ditemukan pada halaman. Bisa jadi format halaman berubah atau request diblokir.');
    }

    const rowsRaw = Array.from(table.querySelectorAll('tr'))
      .map((tr) => Array.from(tr.querySelectorAll('th,td')).map((cell) => cleanHeader(cell.textContent)))
      .filter((row) => row.some(Boolean));

    const headerIndex = rowsRaw.findIndex((row) => row.some((cell) => /time\s*\(utc\)/i.test(cell)));
    if (headerIndex < 0) {
      throw new Error('Header Time (UTC) tidak ditemukan pada tabel IOC.');
    }

    const stationTitleRow = rowsRaw.slice(0, headerIndex).find((row) => row.length === 1 && /tide gauge at/i.test(row[0]));
    let stationName = 'Stasiun IOC';
    if (stationTitleRow) {
      const text = stationTitleRow[0];
      stationName = cleanHeader(text.replace(/^Tide gauge at\s*/i, '')) || stationName;
    }

    const headers = rowsRaw[headerIndex];
    const dataRows = rowsRaw.slice(headerIndex + 1).filter((row) => row.length >= 2);

    const rows = [
      [stationName],
      headers,
      ...dataRows,
    ];

    return parseRowsToDataset(rows, {
      fileName: `ioc_${headerToKey(stationName) || 'station'}.html`,
      stationName,
      sourceType: 'ioc',
      sourceUrl,
    });
  }

  function normalizeEndDate(value) {
    if (!value) {
      const now = new Date();
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
    }
    return String(value).trim();
  }

  function buildIocUrl({ stationCode, periodDays, endDate }) {
    const code = String(stationCode || '').trim().toLowerCase();
    if (!code) {
      throw new Error('Kode stasiun IOC harus diisi, misalnya saba.');
    }

    const period = Number(periodDays);
    if (!Number.isFinite(period) || period <= 0) {
      throw new Error('Period IOC harus berupa angka positif.');
    }

    const end = normalizeEndDate(endDate);
    return `https://www.ioc-sealevelmonitoring.org/bgraph.php?code=${encodeURIComponent(code)}&output=tab&period=${encodeURIComponent(period)}&endtime=${encodeURIComponent(end)}`;
  }

  function extractIocParams(url) {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error('URL IOC tidak valid.');
    }

    const code = parsedUrl.searchParams.get('code');
    const period = parsedUrl.searchParams.get('period');
    const endtime = parsedUrl.searchParams.get('endtime');

    if (!code || !period || !endtime) {
      throw new Error('URL IOC harus mengandung parameter code, period, dan endtime.');
    }

    return { code, period, endtime };
  }

  function buildIocProxyUrl(url) {
    const { code, period, endtime } = extractIocParams(url);
    return `${IOC_PROXY_BASE}?code=${encodeURIComponent(code)}&period=${encodeURIComponent(period)}&endtime=${encodeURIComponent(endtime)}`;
  }

  async function fetchIocDataset(url) {
    const proxyUrl = buildIocProxyUrl(url);
    const response = await fetch(proxyUrl, {
      method: 'GET',
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`Proxy IOC merespons status ${response.status}.`);
    }

    const html = await response.text();
    return parseIocHtml(html, url);
  }

  window.PasutParser = {
    parseSpreadsheetFile,
    parseIocHtml,
    fetchIocDataset,
    buildIocUrl,
    parseDateValue,
    toNumber,
    headerToKey,
    cleanHeader,
  };
})();
