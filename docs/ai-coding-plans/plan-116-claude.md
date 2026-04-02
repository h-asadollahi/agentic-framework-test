# Plan 116 — Token Usage: Replace breakdown table with a bar chart

**Assistant:** Claude (claude-sonnet-4-6 via Claude Code)
**Date:** 2026-04-02
**Scope:** Replace the "Daily / Monthly Breakdown" table in the Token Usage page with a stacked bar chart (Input + Output tokens per bucket). Keep the table data accessible via a toggle. Use Chart.js via CDN (no build step).

---

## Approach

- Load **Chart.js 4** from the official CDN (`<script>` tag at the bottom of `<body>`)
- Replace the `<div class="table-shell">` block with a `<canvas id="tokenUsageChart">` inside the same surface-card
- Add a small "Table" toggle link so power users can still see the raw numbers
- `renderTokenUsageSummary()` in `app.js` creates/updates a Chart.js instance on the canvas
- Chart type: **stacked bar** — Input tokens (accent purple) + Output tokens (soft purple) per bucket
- Tooltip shows bucket label + input / output / total on hover
- Chart and table reference the same `daily[]` data already returned by the API — no backend changes

---

## Files changed (2 only)

| File | Change |
|---|---|
| `admin/public/index.html` | Add Chart.js CDN `<script>`; replace table-shell with canvas + toggle |
| `admin/public/app.js` | Replace `daily.forEach(tr)` table rendering with Chart.js create/update logic |

---

## Detail

### `admin/public/index.html`

1. **Add CDN script** at the bottom of `<body>`, just before `<script src="/app.js">`:
   ```html
   <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
   ```

2. **Replace the table-shell block** inside the breakdown surface-card (lines 2115–2134) with:
   ```html
   <div id="tokenUsageChartWrap" style="position:relative;height:260px;">
     <canvas id="tokenUsageChart"></canvas>
   </div>
   <div id="tokenUsageTableWrap" hidden>
     <div class="table-shell">
       <div class="table-scroll">
         <table class="route-table">
           <thead>
             <tr>
               <th id="tokenUsageBreakdownDateHeader">Day</th>
               <th>Prompts</th><th>LLM Calls</th>
               <th>Input</th><th>Output</th><th>Total</th>
             </tr>
           </thead>
           <tbody id="tokenUsageDailyTable">
             <tr><td colspan="6" class="empty-state">No token usage loaded.</td></tr>
           </tbody>
         </table>
       </div>
     </div>
   </div>
   <div style="text-align:right;margin-top:8px;">
     <button id="tokenUsageViewToggle" class="ghost-button" style="font-size:0.76rem">Show table</button>
   </div>
   ```

### `admin/public/app.js`

1. **Module-level chart instance** (top of file, near `state`):
   ```js
   let _tokenUsageChart = null;
   ```

2. **Replace the `daily.forEach(tr)` block** in `renderTokenUsageSummary()` with:
   - Render table rows into `tokenUsageDailyTable` (keep existing logic unchanged — table is just hidden by default)
   - Then create/update the Chart.js stacked bar:
   ```js
   const labels = daily.map((e) => e.bucket);
   const inputData = daily.map((e) => e.inputTokens || 0);
   const outputData = daily.map((e) => e.outputTokens || 0);

   const canvas = $("tokenUsageChart");
   if (canvas) {
     if (_tokenUsageChart) {
       _tokenUsageChart.data.labels = labels;
       _tokenUsageChart.data.datasets[0].data = inputData;
       _tokenUsageChart.data.datasets[1].data = outputData;
       _tokenUsageChart.update();
     } else {
       _tokenUsageChart = new Chart(canvas, {
         type: "bar",
         data: {
           labels,
           datasets: [
             { label: "Input", data: inputData, backgroundColor: "rgba(142,126,255,0.75)", stack: "tokens" },
             { label: "Output", data: outputData, backgroundColor: "rgba(142,126,255,0.28)", stack: "tokens" },
           ],
         },
         options: {
           responsive: true, maintainAspectRatio: false,
           plugins: {
             legend: { position: "top" },
             tooltip: {
               callbacks: {
                 footer: (items) => `Total: ${humanizeCount(items.reduce((s, i) => s + i.raw, 0))}`,
               },
             },
           },
           scales: {
             x: { stacked: true, grid: { display: false } },
             y: { stacked: true, ticks: { callback: (v) => humanizeCount(v) } },
           },
         },
       });
     }
   }
   ```

3. **Wire the toggle button** (near the other event listeners at the bottom):
   ```js
   $("tokenUsageViewToggle")?.addEventListener("click", () => {
     const tableWrap = $("tokenUsageTableWrap");
     const chartWrap = $("tokenUsageChartWrap");
     const btn = $("tokenUsageViewToggle");
     const showingTable = !tableWrap.hidden;
     tableWrap.hidden = showingTable;
     chartWrap.hidden = !showingTable;
     btn.textContent = showingTable ? "Show table" : "Show chart";
   });
   ```

4. **Destroy chart on page reset** — in the `renderTokenUsageSummary` error branch, add:
   ```js
   if (_tokenUsageChart) { _tokenUsageChart.destroy(); _tokenUsageChart = null; }
   ```

---

## What does NOT change
- All backend files — zero changes
- `renderTokenUsagePrompts()`, pagination, prompt history — untouched
- Summary cards, filters, Group By select — untouched
- The table HTML and `tokenUsageDailyTable` tbody ID are kept (just hidden) so the toggle still works

---

## How to test
1. Open Admin UI → Token Usage — see stacked bar chart instead of table
2. Bars show Input (solid purple) + Output (light purple) stacked per day/month
3. Hover a bar — tooltip shows input, output, total
4. Click "Show table" → table appears, chart hides; "Show chart" toggles back
5. Switch Group By to Month — chart updates to monthly buckets
6. Switch Days filter — chart re-renders with new window
