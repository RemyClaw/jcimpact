# Year-End Playbook

A ~10-minute ritual you do **once a year** (end of December or early January) to roll the dashboard over to the new year. You do not need to know how to code — just follow the steps.

## When to run this

Any time **after the last week of December** is imported and **before** you start importing January of the new year. The safest window is **January 1–3**.

If you run it mid-year by accident, nothing is lost (the old data is preserved in the archive), but the dashboard will show an empty year until you import data. Don't do it mid-year unless you're sure.

## What it does

1. **Copies** the current year's full data to `src/data/archive/data-{YEAR}.json` (nothing is deleted — this is a safety backup).
2. **Replaces** `src/data/data.json` with a fresh empty scaffold for the new year.
3. **Leaves everything else alone** — district boundaries, code, Mapbox token, everything is untouched.

After this, the dashboard shows an empty new year. As you import each week of new data, it fills back up.

## Steps

### 1. Make sure you've imported the last week of the old year

Before archiving, confirm the final weekly CSVs (usually week 52 or 53) are in `data.json`. If they're not, import them first using the regular weekly import process.

### 2. Open Terminal and `cd` into the project

```bash
cd /Users/geremy/JCIMPACT
```

### 3. Do a dry-run first (just to see what will happen)

Replace `2026` with whichever year you're archiving:

```bash
python3 scripts/archive_year.py 2026
```

This prints a summary — how many records are there, what it plans to do. **Nothing changes yet.**

If the summary shows anything surprising (records from multiple years, unexpected totals, etc.), stop and investigate before applying.

### 4. Apply for real

Add `--apply` to actually do it:

```bash
python3 scripts/archive_year.py 2026 --apply
```

You should see:
```
✓ Archived → src/data/archive/data-2026.json
✓ New empty src/data/data.json created for 2027
```

### 5. Commit + push

The script will tell you the exact commands. They'll look like:

```bash
git add src/data/data.json src/data/archive/data-2026.json
git commit -m "chore: archive 2026 data, start fresh for 2027"
git push
```

After `git push`, Vercel automatically rebuilds and redeploys the dashboard in about 1–2 minutes.

### 6. Verify

1. Open `https://jcimpact.vercel.app` (or your custom domain) in your browser.
2. Hard refresh (Cmd+Shift+R).
3. The stat cards should all show `0`. The map should have no dots.
4. That's correct — the new year hasn't had any data imported yet.

### 7. Start importing new-year data

As normal. The first weekly import of the new year will populate the dashboard.

## Rollback

If something goes wrong, the archive file at `src/data/archive/data-{YEAR}.json` has the full old-year data. To restore:

```bash
cp src/data/archive/data-2026.json src/data/data.json
git add src/data/data.json
git commit -m "rollback: restore 2026 data"
git push
```

## FAQ

**Q: Does the old year's data disappear from the site?**
Yes, from the live dashboard. It lives on as a static archive file in `src/data/archive/` — you can always open it, share it, or build reports from it.

**Q: Can I view the 2026 archive after the rollover?**
Yes, any way you want:
- Open `src/data/archive/data-2026.json` directly in a text editor
- Ask me to pull stats from it for a report
- We can add a "view previous years" feature to the dashboard later if you want that

**Q: What if I want year-over-year comparisons like NYPD CompStat?**
That's a separate feature. Once the archives exist, we can build a "2027 vs 2026" comparison view on top of them. The archives are the prerequisite.

**Q: What if I forget to run this on Jan 1?**
No problem. The dashboard will just show mixed years until you run it. Run the archive script any time and it will clean things up. But note: if you've already imported some new-year data, you'd be archiving a mix — so try to run it before any new-year import if you can.

**Q: Do I need to update anything else at year-end?**
No. Districts don't change year over year. Code stays the same. Mapbox token stays the same. Just this one script.
