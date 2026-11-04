# Prophet-lite: what the TS2 room's "Prophet" covers

**Status: planned scope for the TS2 room; not built yet. Update this page when it is.**

The real [Prophet](https://facebook.github.io/prophet/) library can't run in the browser: it fits its models with Stan, a C++ toolchain that Pyodide doesn't include. The TS2 room therefore ships a small replacement, written with numpy, pandas and scipy, that keeps Prophet's API names. Students write the same code they would write with the real library, for the parts it covers. Rooms and the debrief must call it "a Prophet-style model", never Prophet itself.

## Same as Prophet

| Area | What students use |
|---|---|
| Data format | A DataFrame with columns `ds` (dates) and `y`; rows with missing `y` are skipped when fitting, as in Prophet |
| Workflow | `m = Prophet(...)`, `m.fit(df)`, `future = m.make_future_dataframe(periods, freq)`, `forecast = m.predict(future)` |
| Trend | Piecewise linear trend with automatic changepoints in the first 80 % of the history (`n_changepoints`, `changepoint_range`, `changepoint_prior_scale`), or `changepoints=[...]` given by hand |
| Seasonality | Fourier terms with Prophet's defaults (yearly: period 365.25, order 10; weekly: period 7, order 3), `yearly_seasonality` / `weekly_seasonality` on, off or a Fourier order, `add_seasonality(name, period, fourier_order)` |
| Seasonality mode | `seasonality_mode="additive"` or `"multiplicative"` (`y = trend · (1 + seasonal)`) |
| Holidays | A `holidays` DataFrame with `holiday`, `ds` and optional `lower_window` / `upper_window` |
| Output | `forecast` has `ds`, `yhat`, `yhat_lower`, `yhat_upper`, `trend` and one column per seasonality and holiday, so components can be inspected and plotted with `show_plot` |

## Different from Prophet

- **Fitting:** regularised least squares (an L1 penalty on trend changes, standing in for Prophet's Laplace prior; an L2 penalty on seasonal and holiday terms) instead of Stan's MAP optimisation. Fits behave the same way qualitatively, but the numbers won't match the real library's to the decimal.
- **Uncertainty intervals:** from the residual spread plus simulated future trend changes, a simplified version of Prophet's simulation. Widths are comparable, not identical.

## Not covered

- Logistic growth with `cap` / `floor`, and flat growth
- `add_regressor` (extra regressors) and conditional seasonalities
- `add_country_holidays` (needs the `holidays` package)
- Full Bayesian sampling (`mcmc_samples`)
- The diagnostics module (`cross_validation`, `performance_metrics`); the room uses a plain train/test split instead
- Prophet's own plots (`plot`, `plot_components`); use `show_plot` with the forecast's columns

## Processing steps in the TS2 room

These match how Prophet is meant to be used, and differ on purpose from the SARIMA room (TS1):

- **Missing values:** not interpolated; the model fits on the observed rows.
- **Differencing and detrending:** not used; the trend component models the trend.
- **Log transform:** for series whose swings grow with the level, fit on `log(y)` and back-transform with `exp`, or use multiplicative seasonality.
- **Baselines:** naive and seasonal naive on the same holdout; the model must beat them.
