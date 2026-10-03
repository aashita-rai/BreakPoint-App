import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def plot_reps(path, title, times, h, segs):
    fig, ax = plt.subplots(figsize=(11, 3.2))
    ax.plot(times, h, lw=1.2)
    for k, s in enumerate(segs, 1):
        c = "tab:green" if s["clean"] else "tab:gray"
        ax.axvline(times[s["bottom"]], color=c, alpha=0.5, lw=0.8)
        ax.plot(times[s["bottom"]], h[s["bottom"]], "o", color=c, ms=4)
    ax.set_xlabel("time (s)"); ax.set_ylabel("hip height (leg-lengths)")
    ax.set_title(f"{title}: {len(segs)} reps (green = clean, grey = excluded)")
    fig.tight_layout(); fig.savefig(path, dpi=110); plt.close(fig)
