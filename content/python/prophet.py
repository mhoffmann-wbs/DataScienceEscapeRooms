"""A small Prophet-style forecasting model for the escape rooms.

This is NOT the real Prophet library, which needs Stan and can't run in the browser. It keeps
Prophet's API names for the parts it covers (see docs/prophet-lite.md), so code written here
also runs with the real library:

    from prophet import Prophet
    m = Prophet(seasonality_mode="multiplicative", holidays=events)
    m.fit(df)                                    # df has columns ds (dates) and y
    future = m.make_future_dataframe(periods=90)
    forecast = m.predict(future)                 # ds, yhat, yhat_lower, yhat_upper, trend, ...

The model is y = trend * (1 + multiplicative terms) + additive terms, with a piecewise linear
trend, Fourier seasonalities and holiday effects. It is fitted by maximising the same posterior
as Prophet (a Laplace prior on trend changes, normal priors on seasonal and holiday terms), with
Gauss-Newton steps instead of Stan's L-BFGS, so numbers come close to the real library's but
don't match exactly.
"""
import numpy as np
import pandas as pd
from scipy.linalg import cho_factor, cho_solve
from scipy.optimize import nnls

__all__ = ["Prophet"]


class Prophet:
    """A Prophet-style model: linear trend with changepoints, seasonalities and holidays."""

    def __init__(self, growth="linear", changepoints=None, n_changepoints=25, changepoint_range=0.8,
                 yearly_seasonality="auto", weekly_seasonality="auto", daily_seasonality="auto",
                 holidays=None, seasonality_mode="additive", seasonality_prior_scale=10.0,
                 holidays_prior_scale=10.0, changepoint_prior_scale=0.05, mcmc_samples=0,
                 interval_width=0.80, uncertainty_samples=1000, holidays_mode=None):
        if growth != "linear":
            raise NotImplementedError("This Prophet-style model only has linear growth (no 'logistic' or 'flat').")
        if mcmc_samples:
            raise NotImplementedError("This Prophet-style model has no MCMC sampling; leave mcmc_samples at 0.")
        if seasonality_mode not in ("additive", "multiplicative"):
            raise ValueError('seasonality_mode must be "additive" or "multiplicative"')
        if holidays_mode not in (None, "additive", "multiplicative"):
            raise ValueError('holidays_mode must be "additive" or "multiplicative"')
        self.growth = growth
        self.changepoints = None if changepoints is None else pd.Series(pd.to_datetime(changepoints), name="ds")
        self.specified_changepoints = changepoints is not None
        self.n_changepoints = 0 if changepoints is not None else int(n_changepoints)
        self.changepoint_range = changepoint_range
        self.yearly_seasonality = yearly_seasonality
        self.weekly_seasonality = weekly_seasonality
        self.daily_seasonality = daily_seasonality
        self.holidays = None if holidays is None else _check_holidays(holidays)
        self.seasonality_mode = seasonality_mode
        self.holidays_mode = holidays_mode or seasonality_mode
        self.seasonality_prior_scale = float(seasonality_prior_scale)
        self.holidays_prior_scale = float(holidays_prior_scale)
        self.changepoint_prior_scale = float(changepoint_prior_scale)
        self.interval_width = interval_width
        self.uncertainty_samples = int(uncertainty_samples or 0)
        self.seasonalities = {}
        self.history = None
        self.params = {}

    def add_seasonality(self, name, period, fourier_order, prior_scale=None, mode=None):
        """Adds a seasonality with the given period (in days) and Fourier order. Call before fit."""
        if self.history is not None:
            raise Exception("Seasonality must be added prior to model fitting.")
        if mode not in (None, "additive", "multiplicative"):
            raise ValueError('mode must be "additive" or "multiplicative"')
        self.seasonalities[name] = {
            "period": float(period), "fourier_order": int(fourier_order),
            "prior_scale": float(prior_scale if prior_scale is not None else self.seasonality_prior_scale),
            "mode": mode or self.seasonality_mode,
        }
        return self

    # ---- fitting ----

    def fit(self, df):
        """Fits the model to df (columns ds and y). Rows without a y are skipped."""
        if self.history is not None:
            raise Exception("Prophet object can only be fit once. Instantiate a new object.")
        if "ds" not in df or "y" not in df:
            raise ValueError('Dataframe must have columns "ds" and "y" with the dates and values respectively.')
        df = df[["ds", "y"]].copy()
        df["ds"] = pd.to_datetime(df["ds"])
        df["y"] = pd.to_numeric(df["y"])
        if df["ds"].isna().any():
            raise ValueError("Found NaN in column ds.")
        if np.isinf(df["y"]).any():
            raise ValueError("Found infinity in column y.")
        self.history_dates = pd.Series(np.sort(df["ds"].unique()), name="ds")
        history = df[df["y"].notna()].sort_values("ds").reset_index(drop=True)
        if len(history) < 2:
            raise ValueError("Dataframe has less than 2 non-NaN rows.")
        self.start = history["ds"].iloc[0]
        self.t_scale = history["ds"].iloc[-1] - self.start
        self.y_scale = float(np.abs(history["y"]).max()) or 1.0
        history["t"] = self._t(history["ds"])
        history["y_scaled"] = history["y"] / self.y_scale
        self.history = history

        self._set_auto_seasonalities()
        self._set_changepoints()
        X, names, prior_scales, modes = self._features(history["ds"])
        self.train_component_cols = names
        self.component_modes = modes

        t = history["t"].values
        y = history["y_scaled"].values
        R = np.maximum(t[:, None] - self.changepoints_t[None, :], 0.0)
        mult = np.array([modes[c] == "multiplicative" for c in names], dtype=bool)
        Xm, Xa = X * mult, X * ~mult
        S, F, n = R.shape[1], X.shape[1], len(y)
        # theta = (k, m, u, v, beta) with delta = u - v and u, v >= 0, which turns the Laplace prior
        # on delta into a linear cost. Priors as in Prophet: k, m ~ N(0, 5), delta ~ Laplace(0,
        # changepoint_prior_scale), beta ~ N(0, prior scale), sigma ~ half-N(0, 0.5). The tiny
        # ridge on u and v only keeps the quadratic problem below strictly convex.
        precision = np.concatenate([[1 / 25, 1 / 25], np.full(2 * S, 1e-3), 1 / np.asarray(prior_scales, dtype=float) ** 2])
        cost = np.concatenate([[0.0, 0.0], np.full(2 * S, 1 / self.changepoint_prior_scale), np.zeros(F)])
        free = np.r_[0, 1, 2 + 2 * S:2 + 2 * S + F]   # k, m, beta; the rest are u and v
        bound = np.r_[2:2 + 2 * S]

        def predict(theta):
            trend = theta[0] * t + theta[1] + R @ (theta[2:2 + S] - theta[2 + S:2 + 2 * S])
            seasonal = 1 + Xm @ theta[2 + 2 * S:]
            return trend, seasonal, trend * seasonal + Xa @ theta[2 + 2 * S:]

        def best_sigma(theta):
            r = predict(theta)[2] - y
            return np.sqrt((np.sqrt(n ** 2 + 16 * (r @ r)) - n) / 8) or 1e-9

        def objective(theta, sigma):
            r = predict(theta)[2] - y
            return n * np.log(sigma) + r @ r / (2 * sigma ** 2) + 2 * sigma ** 2 + precision @ theta ** 2 / 2 + cost @ theta

        def solve(H, g):
            """Exact minimum of theta @ H @ theta / 2 + g @ theta with u, v >= 0: the free
            parameters are profiled out, which leaves a small non-negative least squares problem."""
            Hff, Hfb, Hbb = H[np.ix_(free, free)], H[np.ix_(free, bound)], H[np.ix_(bound, bound)]
            f = cho_factor(Hff)
            Q = Hbb - Hfb.T @ cho_solve(f, Hfb)
            c = g[bound] - Hfb.T @ cho_solve(f, g[free])
            L = np.linalg.cholesky((Q + Q.T) / 2)
            out = np.empty(len(g))
            out[bound] = nnls(L.T, -np.linalg.solve(L, c), maxiter=50 * len(c))[0] if len(c) else c
            out[free] = -cho_solve(f, g[free] + Hfb @ out[bound])
            return out

        # Gauss-Newton: linearise the model around theta, solve that quadratic problem exactly and
        # update sigma in closed form. Additive models are linear in theta, so only sigma needs
        # iterating; multiplicative ones take a few more steps.
        k0 = (y[-1] - y[0]) / (t[-1] - t[0]) if t[-1] > t[0] else 0.0
        theta = np.concatenate([[k0, y[0] - k0 * t[0]], np.zeros(2 * S + F)])
        sigma = best_sigma(theta)
        best = objective(theta, sigma)
        for _ in range(100):
            trend, seasonal, yhat = predict(theta)
            J = np.column_stack([t * seasonal, seasonal, R * seasonal[:, None], -R * seasonal[:, None], Xm * trend[:, None] + Xa])
            H = J.T @ J / sigma ** 2 + np.diag(precision)
            g = cost - J.T @ (y - yhat + J @ theta) / sigma ** 2
            target = solve(H, g)
            step = 1.0
            while step > 1e-4:
                candidate = theta + step * (target - theta)
                candidate_sigma = best_sigma(candidate)
                value = objective(candidate, candidate_sigma)
                if value <= best:
                    break
                step /= 2
            if value > best:
                break
            gain = best - value
            theta, sigma, best = candidate, candidate_sigma, value
            if gain <= 1e-10 * abs(best):
                break
        delta = theta[2:2 + S] - theta[2 + S:2 + 2 * S]
        self.params = {"k": np.array([[theta[0]]]), "m": np.array([[theta[1]]]), "delta": delta[None, :],
                       "beta": theta[None, 2 + 2 * S:], "sigma_obs": np.array([[sigma]])}
        return self

    def _t(self, ds):
        span = self.t_scale / pd.Timedelta(days=1)
        return ((pd.to_datetime(ds) - self.start) / pd.Timedelta(days=1)).values / (span or 1.0)

    def _set_auto_seasonalities(self):
        dates = self.history["ds"]
        span = (dates.iloc[-1] - dates.iloc[0]).days
        step = dates.diff().dropna().min() / pd.Timedelta(days=1) if len(dates) > 1 else 1
        for name, setting, period, order, auto_on in (
            ("yearly", self.yearly_seasonality, 365.25, 10, span >= 730),
            ("weekly", self.weekly_seasonality, 7, 3, span >= 14 and step < 7),
            ("daily", self.daily_seasonality, 1, 4, span >= 2 and step < 1),
        ):
            if name in self.seasonalities:
                continue
            if setting == "auto":
                on = auto_on
            elif setting is True or setting is False:
                on = setting
            else:
                on, order = int(setting) > 0, int(setting)
            if on:
                self.seasonalities[name] = {"period": period, "fourier_order": order,
                                            "prior_scale": self.seasonality_prior_scale, "mode": self.seasonality_mode}

    def _set_changepoints(self):
        ds = self.history["ds"]
        if self.specified_changepoints:
            if len(self.changepoints) and (self.changepoints.min() < ds.min() or self.changepoints.max() > ds.max()):
                raise ValueError("Changepoints must fall within training data.")
            self.changepoints = self.changepoints[self.changepoints > ds.min()].sort_values().reset_index(drop=True)
        else:
            hist_size = int(np.floor(len(ds) * self.changepoint_range))
            n = min(self.n_changepoints, hist_size - 1)
            self.n_changepoints = max(n, 0)
            if n > 0:
                idx = np.linspace(0, hist_size - 1, n + 1).round().astype(int)
                self.changepoints = ds.iloc[idx].iloc[1:].reset_index(drop=True)
            else:
                self.changepoints = pd.Series(pd.to_datetime([]), name="ds")
        self.changepoints_t = np.sort(self._t(self.changepoints)) if len(self.changepoints) else np.zeros(0)

    def _features(self, ds):
        """Seasonal and holiday columns for the dates in ds, with their prior scales and modes."""
        ds = pd.to_datetime(pd.Series(ds)).reset_index(drop=True)
        days = (ds - pd.Timestamp("1970-01-01")) / pd.Timedelta(days=1)
        cols, names, scales, modes = [], [], [], {}
        self._components = {}
        for name, s in self.seasonalities.items():
            start = len(names)
            for i in range(s["fourier_order"]):
                x = 2.0 * (i + 1) * np.pi * days.values / s["period"]
                for fun, label in ((np.sin, "sin"), (np.cos, "cos")):
                    cols.append(fun(x))
                    names.append(f"{name}_delim_{label}{i + 1}")
                    scales.append(s["prior_scale"])
                    modes[names[-1]] = s["mode"]
            self._components[name] = (start, len(names), s["mode"])
        if self.holidays is not None:
            for holiday, rows in self.holidays.groupby("holiday", sort=False):
                start = len(names)
                offsets = {}
                for _, row in rows.iterrows():
                    scale = row["prior_scale"] if "prior_scale" in row and pd.notna(row["prior_scale"]) else self.holidays_prior_scale
                    for off in range(int(row["lower_window"]), int(row["upper_window"]) + 1):
                        offsets.setdefault(off, (set(), scale))[0].add(row["ds"] + pd.Timedelta(days=off))
                for off in sorted(offsets):
                    dates, scale = offsets[off]
                    cols.append(ds.isin(dates).values.astype(float))
                    names.append(f"{holiday}_delim_{'+' if off >= 0 else '-'}{abs(off)}")
                    scales.append(scale)
                    modes[names[-1]] = self.holidays_mode
                self._components[holiday] = (start, len(names), self.holidays_mode)
        X = np.column_stack(cols) if cols else np.zeros((len(ds), 0))
        return X, names, scales, modes

    # ---- forecasting ----

    def make_future_dataframe(self, periods, freq="D", include_history=True):
        """A DataFrame with column ds: the history's dates (if include_history) plus `periods` future dates."""
        if self.history is None:
            raise Exception("Model has not been fit.")
        last = self.history_dates.max()
        dates = pd.date_range(start=last, periods=periods + 1, freq=freq)
        dates = dates[dates > last][:periods]
        if include_history:
            dates = np.concatenate([self.history_dates.values, dates.values])
        return pd.DataFrame({"ds": pd.to_datetime(dates)})

    def predict(self, df=None):
        """Forecast for the dates in df (default: the history): yhat, its interval, trend and each component."""
        if self.history is None:
            raise Exception("Model has not been fit.")
        ds = self.history["ds"] if df is None else pd.to_datetime(pd.DataFrame(df)["ds"])
        ds = pd.Series(ds).reset_index(drop=True)
        if ds.isna().any():
            raise ValueError("Found NaN in column ds.")
        t = self._t(ds)
        k, m = self.params["k"][0, 0], self.params["m"][0, 0]
        delta, beta = self.params["delta"][0], self.params["beta"][0]
        trend = k * t + m + np.maximum(t[:, None] - self.changepoints_t[None, :], 0.0) @ delta
        X, _, _, _ = self._features(ds)
        out = pd.DataFrame({"ds": ds, "trend": trend * self.y_scale})
        mult = np.zeros(len(ds))
        add = np.zeros(len(ds))
        hol = np.zeros(len(ds))
        holiday_names = set(self.holidays["holiday"]) if self.holidays is not None else set()
        for name, (a, b, mode) in self._components.items():
            value = X[:, a:b] @ beta[a:b]
            if mode == "multiplicative":
                mult += value
                out[name] = value
            else:
                add += value
                out[name] = value * self.y_scale
            if name in holiday_names:
                hol += out[name].values
        if holiday_names:
            out["holidays"] = hol
        out["additive_terms"] = add * self.y_scale
        out["multiplicative_terms"] = mult
        out["yhat"] = (trend * (1 + mult) + add) * self.y_scale
        if self.uncertainty_samples:
            lo, hi, tlo, thi = self._intervals(t, trend, mult, add)
            out["yhat_lower"], out["yhat_upper"] = lo, hi
            out["trend_lower"], out["trend_upper"] = tlo, thi
        cols = ["ds", "trend"] + (["trend_lower", "trend_upper", "yhat_lower", "yhat_upper"] if self.uncertainty_samples else [])
        return out[cols + [c for c in out.columns if c not in cols and c != "yhat"] + ["yhat"]]

    def _intervals(self, t, trend, mult, add):
        """Simulates future trend changes (as often and as large as in the history) plus noise."""
        rng = np.random.default_rng(0)
        n_samples = self.uncertainty_samples
        delta = self.params["delta"][0]
        scale = np.mean(np.abs(delta)) + 1e-8
        rate = len(self.changepoints_t)
        t_max = max(t.max(), 1.0)
        future = t > 1.0
        trends = np.tile(trend, (n_samples, 1))
        if future.any() and rate:
            n_changes = rng.poisson(rate * (t_max - 1.0), n_samples)
            for i in np.nonzero(n_changes)[0]:
                where = rng.uniform(1.0, t_max, n_changes[i])
                change = rng.laplace(0, scale, n_changes[i])
                trends[i] += np.maximum(t[:, None] - where[None, :], 0.0) @ change
        sigma = self.params["sigma_obs"][0, 0]
        noise = rng.normal(0, sigma, trends.shape)
        yhat = (trends * (1 + mult) + add + noise) * self.y_scale
        q = (1 - self.interval_width) / 2
        lo, hi = np.quantile(yhat, [q, 1 - q], axis=0)
        tlo, thi = np.quantile(trends * self.y_scale, [q, 1 - q], axis=0)
        return lo, hi, tlo, thi


def _check_holidays(holidays):
    holidays = pd.DataFrame(holidays).copy()
    if "holiday" not in holidays or "ds" not in holidays:
        raise ValueError('holidays must be a DataFrame with "holiday" and "ds" columns.')
    holidays["ds"] = pd.to_datetime(holidays["ds"])
    for col in ("lower_window", "upper_window"):
        if col not in holidays:
            holidays[col] = 0
        holidays[col] = holidays[col].fillna(0).astype(int)
    if (holidays["lower_window"] > 0).any():
        raise ValueError("Holiday lower_window should be <= 0")
    if (holidays["upper_window"] < 0).any():
        raise ValueError("Holiday upper_window should be >= 0")
    holidays["holiday"] = holidays["holiday"].astype(str)
    return holidays
