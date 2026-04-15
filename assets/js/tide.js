(function () {
  const CONSTITUENTS = {
    M2: 12.4206,
    S2: 12.0,
    K1: 23.9345,
    O1: 25.8193,
    N2: 12.6583,
    K2: 11.9672,
    P1: 24.0659,
    Q1: 26.8684,
  };

  function cloneDate(date) {
    return new Date(date.getTime());
  }

  function utcDate(y, m, d, hh = 0, mm = 0, ss = 0) {
    return new Date(Date.UTC(y, m, d, hh, mm, ss));
  }

  function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60000);
  }

  function diffMinutes(a, b) {
    return (b.getTime() - a.getTime()) / 60000;
  }

  function diffHours(a, b) {
    return (b.getTime() - a.getTime()) / 3600000;
  }

  function mode(numbers) {
    const counts = new Map();
    let bestValue = null;
    let bestCount = 0;

    numbers.forEach((num) => {
      const key = Number(num);
      const count = (counts.get(key) || 0) + 1;
      counts.set(key, count);
      if (count > bestCount) {
        bestCount = count;
        bestValue = key;
      }
    });

    return bestValue;
  }

  function uniqueSortedTimeseries(times, values) {
    const combined = times.map((time, i) => ({ time, value: values[i] }))
      .filter((item) => item.time instanceof Date && !isNaN(item.time.getTime()))
      .filter((item) => Number.isFinite(item.value))
      .sort((a, b) => a.time - b.time);

    const outTimes = [];
    const outValues = [];
    let lastKey = null;

    combined.forEach((item) => {
      const key = item.time.getTime();
      if (key !== lastKey) {
        outTimes.push(item.time);
        outValues.push(item.value);
        lastKey = key;
      }
    });

    return { times: outTimes, values: outValues };
  }

  function buildSensorSeries(dataset, sensorKey) {
    const times = [];
    const values = [];

    dataset.points.forEach((point) => {
      const value = point.values[sensorKey];
      if (!Number.isFinite(value)) return;
      times.push(point.time);
      values.push(value);
    });

    return uniqueSortedTimeseries(times, values);
  }

  function inferDominantIntervalMinutes(times) {
    if (times.length < 2) return 1;
    const diffs = [];
    for (let i = 1; i < times.length; i += 1) {
      const d = Math.round(diffMinutes(times[i - 1], times[i]));
      if (d > 0 && Number.isFinite(d)) diffs.push(d);
    }
    return diffs.length ? mode(diffs) || 1 : 1;
  }

  function filterByDateRange(times, values, start, end) {
    const outTimes = [];
    const outValues = [];
    for (let i = 0; i < times.length; i += 1) {
      if (times[i] >= start && times[i] <= end) {
        outTimes.push(times[i]);
        outValues.push(values[i]);
      }
    }
    return { times: outTimes, values: outValues };
  }

  function buildRegularGrid(start, end, stepMinutes) {
    if (!(start instanceof Date) || !(end instanceof Date) || end < start) {
      return [];
    }

    const grid = [];
    let current = cloneDate(start);
    while (current <= end) {
      grid.push(cloneDate(current));
      current = addMinutes(current, stepMinutes);
    }
    return grid;
  }

  function regularizeSeries(times, values, nativeStepMinutes) {
    const grid = buildRegularGrid(times[0], times[times.length - 1], nativeStepMinutes);
    const series = new Array(grid.length).fill(NaN);
    const map = new Map();

    grid.forEach((time, idx) => map.set(time.getTime(), idx));

    let placedCount = 0;
    times.forEach((time, idx) => {
      const pos = map.get(time.getTime());
      if (pos != null) {
        series[pos] = values[idx];
        placedCount += 1;
      }
    });

    return { grid, series, placedCount };
  }

  function interpolateShortGaps(grid, series, nativeStepMinutes, maxGapMinutes) {
    const filled = series.slice();
    const gapInfo = {
      nGap: 0,
      nGapPendek: 0,
      nGapPanjang: 0,
      nInterp: 0,
    };

    const maxSlots = Math.max(0, Math.round(maxGapMinutes / nativeStepMinutes));
    let i = 0;

    while (i < filled.length) {
      if (!Number.isNaN(filled[i])) {
        i += 1;
        continue;
      }

      const start = i;
      while (i < filled.length && Number.isNaN(filled[i])) i += 1;
      const end = i - 1;
      const gapLength = end - start + 1;
      gapInfo.nGap += 1;

      const left = start - 1;
      const right = end + 1;
      const canFill = left >= 0 && right < filled.length && Number.isFinite(filled[left]) && Number.isFinite(filled[right]) && gapLength <= maxSlots;

      if (!canFill) {
        gapInfo.nGapPanjang += 1;
        continue;
      }

      const y0 = filled[left];
      const y1 = filled[right];
      for (let k = start; k <= end; k += 1) {
        const ratio = (k - left) / (right - left);
        filled[k] = y0 + ratio * (y1 - y0);
        gapInfo.nInterp += 1;
      }
      gapInfo.nGapPendek += 1;
    }

    return { grid, series: filled, gapInfo };
  }

  function seriesToMap(times, values) {
    const map = new Map();
    times.forEach((time, idx) => {
      map.set(time.getTime(), values[idx]);
    });
    return map;
  }

  function resampleRegularSeries(grid, values, start, end, resolutionMinutes) {
    const targetGrid = buildRegularGrid(start, end, resolutionMinutes);
    const sourceMap = seriesToMap(grid, values);
    const targetValues = targetGrid.map((time) => {
      const exact = sourceMap.get(time.getTime());
      return exact == null ? NaN : exact;
    });

    return { times: targetGrid, values: targetValues };
  }

  function gaussianSolve(matrix, vector) {
    const n = matrix.length;
    const A = matrix.map((row) => row.slice());
    const b = vector.slice();

    for (let i = 0; i < n; i += 1) {
      let maxRow = i;
      let maxVal = Math.abs(A[i][i]);
      for (let k = i + 1; k < n; k += 1) {
        const val = Math.abs(A[k][i]);
        if (val > maxVal) {
          maxVal = val;
          maxRow = k;
        }
      }

      if (maxVal < 1e-12) {
        throw new Error('Sistem least squares singular atau hampir singular. Coba kurangi jumlah komponen atau tambah data.');
      }

      if (maxRow !== i) {
        [A[i], A[maxRow]] = [A[maxRow], A[i]];
        [b[i], b[maxRow]] = [b[maxRow], b[i]];
      }

      const pivot = A[i][i];
      for (let j = i; j < n; j += 1) {
        A[i][j] /= pivot;
      }
      b[i] /= pivot;

      for (let k = 0; k < n; k += 1) {
        if (k === i) continue;
        const factor = A[k][i];
        if (factor === 0) continue;
        for (let j = i; j < n; j += 1) {
          A[k][j] -= factor * A[i][j];
        }
        b[k] -= factor * b[i];
      }
    }

    return b;
  }

  function fitHarmonics(tHours, values, selectedConstituents) {
    const cleanT = [];
    const cleanH = [];

    for (let i = 0; i < tHours.length; i += 1) {
      if (Number.isFinite(tHours[i]) && Number.isFinite(values[i])) {
        cleanT.push(tHours[i]);
        cleanH.push(values[i]);
      }
    }

    if (!selectedConstituents.length) {
      throw new Error('Pilih minimal satu komponen harmonik.');
    }

    const nObs = cleanH.length;
    const nComp = selectedConstituents.length;
    const nParam = 1 + 2 * nComp;

    if (nObs < nParam) {
      throw new Error(`Data valid hanya ${nObs} titik, sedangkan model membutuhkan minimal ${nParam} titik.`);
    }

    const periods = selectedConstituents.map((name) => {
      const key = String(name).toUpperCase();
      if (!CONSTITUENTS[key]) throw new Error(`Komponen ${key} belum ada di database.`);
      return CONSTITUENTS[key];
    });
    const omega = periods.map((p) => (2 * Math.PI) / p);

    const G = cleanT.map((t) => {
      const row = [1];
      for (let i = 0; i < omega.length; i += 1) {
        row.push(Math.cos(omega[i] * t));
        row.push(Math.sin(omega[i] * t));
      }
      return row;
    });

    const GTG = Array.from({ length: nParam }, () => Array(nParam).fill(0));
    const GTh = Array(nParam).fill(0);

    for (let i = 0; i < nObs; i += 1) {
      const row = G[i];
      const h = cleanH[i];
      for (let c = 0; c < nParam; c += 1) {
        GTh[c] += row[c] * h;
        for (let r = 0; r < nParam; r += 1) {
          GTG[c][r] += row[c] * row[r];
        }
      }
    }

    const m = gaussianSolve(GTG, GTh);
    const model = G.map((row) => row.reduce((sum, val, idx) => sum + val * m[idx], 0));
    const residual = cleanH.map((h, i) => h - model[i]);
    const mse = residual.reduce((sum, r) => sum + r * r, 0) / residual.length;
    const mae = residual.reduce((sum, r) => sum + Math.abs(r), 0) / residual.length;
    const meanH = cleanH.reduce((sum, h) => sum + h, 0) / cleanH.length;
    const ssTot = cleanH.reduce((sum, h) => sum + (h - meanH) ** 2, 0);
    const ssRes = residual.reduce((sum, r) => sum + r ** 2, 0);
    const r2 = ssTot > 0 ? 1 - (ssRes / ssTot) : NaN;

    const Acos = [];
    const Bsin = [];
    const amplitudo = [];
    const faseDeg = [];

    for (let i = 0; i < nComp; i += 1) {
      const a = m[2 * i + 1];
      const b = m[2 * i + 2];
      Acos.push(a);
      Bsin.push(b);
      amplitudo.push(Math.hypot(a, b));
      faseDeg.push((((Math.atan2(b, a) * 180) / Math.PI) % 360 + 360) % 360);
    }

    return {
      constituents: selectedConstituents.map((name) => String(name).toUpperCase()),
      periods,
      omega,
      m,
      a0: m[0],
      Acos,
      Bsin,
      amplitudo,
      faseDeg,
      modelClean: model,
      residualClean: residual,
      rmse: Math.sqrt(mse),
      mae,
      r2,
      nObs,
      nParam,
    };
  }

  function reconstructFromFit(tHours, fit) {
    return tHours.map((t) => {
      if (!Number.isFinite(t)) return NaN;
      let value = fit.a0;
      for (let i = 0; i < fit.constituents.length; i += 1) {
        value += fit.Acos[i] * Math.cos(fit.omega[i] * t) + fit.Bsin[i] * Math.sin(fit.omega[i] * t);
      }
      return value;
    });
  }

  function createHoursFromStart(times) {
    if (!times.length) return [];
    const t0 = times[0];
    return times.map((time) => diffHours(t0, time));
  }

  function analyzeSeries(dataset, sensorKey, options) {
    const series = buildSensorSeries(dataset, sensorKey);
    if (!series.times.length) {
      throw new Error(`Tidak ada data valid untuk sensor ${sensorKey}.`);
    }

    const start = options.start;
    const end = options.end;
    const resolutionMinutes = Number(options.resolutionMinutes);
    const maxGapMinutes = Number(options.maxGapMinutes);
    const selectedConstituents = options.constituents;

    const filtered = filterByDateRange(series.times, series.values, start, end);
    if (!filtered.times.length) {
      throw new Error('Tidak ada data pada rentang waktu yang dipilih.');
    }

    const nativeStepMinutes = inferDominantIntervalMinutes(filtered.times);
    const regularized = regularizeSeries(filtered.times, filtered.values, nativeStepMinutes);
    const filled = interpolateShortGaps(regularized.grid, regularized.series, nativeStepMinutes, maxGapMinutes);
    const sampled = resampleRegularSeries(filled.grid, filled.series, start, end, resolutionMinutes);

    const tHours = createHoursFromStart(sampled.times);
    const fit = fitHarmonics(tHours, sampled.values, selectedConstituents);
    const model = reconstructFromFit(tHours, fit);
    const residual = sampled.values.map((v, i) => (Number.isFinite(v) && Number.isFinite(model[i]) ? v - model[i] : NaN));

    let evalCount = 0;
    let evalMse = 0;
    for (let i = 0; i < residual.length; i += 1) {
      if (Number.isFinite(residual[i])) {
        evalCount += 1;
        evalMse += residual[i] ** 2;
      }
    }

    return {
      meta: {
        nativeStepMinutes,
        resolutionMinutes,
        maxGapMinutes,
        nFiltered: filtered.times.length,
        nRegularGrid: regularized.grid.length,
        nResampled: sampled.times.length,
        nResampledValid: sampled.values.filter((v) => Number.isFinite(v)).length,
        nNaFinal: filled.series.filter((v) => Number.isNaN(v)).length,
        ...filled.gapInfo,
      },
      sampledTimes: sampled.times,
      observed: sampled.values,
      tHours,
      model,
      residual,
      fit,
    };
  }

  window.PasutTide = {
    CONSTITUENTS,
    analyzeSeries,
    buildSensorSeries,
    inferDominantIntervalMinutes,
    createHoursFromStart,
  };
})();
