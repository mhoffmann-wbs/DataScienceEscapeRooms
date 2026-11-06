import type { PyodideAPI } from 'pyodide';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadModules } from '../rooms';
import { nodePyodide } from './nodePython';
import { moduleSetup, runPython } from './pythonCore';

// The Prophet-style model in content/python/prophet.py (scope: docs/prophet-lite.md).
describe('prophet module', () => {
  let py: PyodideAPI;
  let setup: string;
  beforeAll(async () => {
    py = await nodePyodide(['pandas', 'scipy']);
    // Two years of daily data from a known multiplicative model: a trend that bends on
    // 2022-07-01, a weekly pattern, one event per year; a few days are missing.
    setup =
      moduleSetup(await loadModules(['prophet'])) +
      `
import numpy as np
import pandas as pd
_ds = pd.date_range("2021-01-01", "2022-12-31", freq="D")
_t = np.arange(len(_ds))
_trend = 100 + 0.05 * _t + 0.25 * np.maximum(_t - 546, 0)
_weekly = np.array([-0.2, -0.2, -0.1, 0.0, 0.1, 0.3, 0.1])[_ds.day_of_week]
_event = np.where(_ds.isin(pd.to_datetime(["2021-05-15", "2022-05-14"])), 1.0, 0.0)
df = pd.DataFrame({"ds": _ds, "y": _trend * (1 + _weekly + _event) * np.exp(np.random.default_rng(1).normal(0, 0.02, len(_ds)))})
df.loc[100:109, "y"] = None
events = pd.DataFrame({"holiday": "fair", "ds": pd.to_datetime(["2021-05-15", "2022-05-14", "2023-05-13"])})
`;
  }, 180_000);

  const run = async (code: string, expr: string) => {
    const out = await runPython(py, `from prophet import Prophet\n${code}`, setup, expr);
    if (!out.ok) throw new Error(out.error);
    return JSON.parse(out.check!) as unknown;
  };

  it('recovers trend, seasonality and holiday effects', async () => {
    const result = await run(
      `m = Prophet(seasonality_mode="multiplicative", holidays=events, changepoints=["2022-07-01"]).fit(df)
f = m.predict(m.make_future_dataframe(periods=200)).set_index("ds")
sat, mon = f.loc["2022-06-04", "weekly"], f.loc["2022-06-06", "weekly"]`,
      `[bool(abs(f.loc["2022-07-01", "trend"] - 127.3) < 2), round(f.loc["2023-07-01", "trend"] - f.loc["2022-07-01", "trend"], -1), round(sat - mon, 1), round(f.loc["2023-05-13", "fair"], 1), len(f)]`,
    );
    // Trend 100 + 0.05 * 546 = 127.3 on the changepoint, then 0.3 a day; Saturday - Monday = 0.5; the fair +100 %.
    expect(result).toEqual([true, 110, 0.5, 1, 730 + 200]);
  });

  it('finds the changepoint by itself and skips rows without y', async () => {
    const result = await run(
      `m = Prophet(seasonality_mode="multiplicative", holidays=events, yearly_seasonality=False).fit(df)
d = pd.Series(m.params["delta"][0], index=m.changepoints).abs()
f = m.predict()`,
      `[abs((d.idxmax() - pd.Timestamp("2022-07-01")).days) < 40, len(m.history), len(m.make_future_dataframe(periods=0)), sorted(f.columns)]`,
    );
    expect(result).toEqual([
      true,
      720,
      730,
      ['additive_terms', 'ds', 'fair', 'holidays', 'multiplicative_terms', 'trend', 'trend_lower', 'trend_upper', 'weekly', 'yhat', 'yhat_lower', 'yhat_upper'],
    ]);
  });

  it('gives intervals that widen as the forecast leaves the history', async () => {
    const result = await run(
      `m = Prophet().fit(df)
f = m.predict(m.make_future_dataframe(periods=365))
w = f["yhat_upper"] - f["yhat_lower"]`,
      `[bool((f["yhat_lower"] <= f["yhat"]).all() and (f["yhat"] <= f["yhat_upper"]).all()), bool(w.iloc[-1] > 1.4 * w.iloc[729])]`,
    );
    expect(result).toEqual([true, true]);
  });

  it("explains what isn't covered", async () => {
    for (const [code, message] of [
      ['Prophet().fit(df.rename(columns={"y": "value"}))', 'must have columns "ds" and "y"'],
      ['m = Prophet().fit(df)\nm.fit(df)', 'can only be fit once'],
      ['Prophet(growth="logistic")', 'only has linear growth'],
      ['Prophet(changepoints=["2030-01-01"]).fit(df)', 'Changepoints must fall within training data'],
    ] as const) {
      const out = await runPython(py, `from prophet import Prophet\n${code}`, setup);
      expect(out).toMatchObject({ ok: false, error: expect.stringContaining(message) });
      if (!out.ok) expect(out.error).toContain('File "prophet.py"');
    }
  });
});
