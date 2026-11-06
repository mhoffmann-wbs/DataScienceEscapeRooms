# Prophet-lite: what the TS2 room's "Prophet" covers

**Status: built as `content/python/prophet.py`, used by the TS2 room (`ts-festival`). Keep this page in sync with it.**

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

- **Fitting:** the same MAP estimate as Prophet (the Laplace prior on trend changes becomes an L1 penalty, the normal priors on seasonal and holiday terms L2 penalties, the noise level is estimated too), found with Gauss-Newton steps that each solve a non-negative least squares problem exactly, instead of Stan's L-BFGS. Fits behave the same way, but the numbers won't match the real library's to the decimal.
- **Daily seasonality** (`daily_seasonality`, for sub-daily data) works like Prophet's but is untested in rooms.
- **Uncertainty intervals:** from the residual spread plus simulated future trend changes (as often and as large as in the history), like Prophet's simulation. Widths are comparable, not identical, and the simulation uses a fixed seed, so `predict` always gives the same intervals.

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
