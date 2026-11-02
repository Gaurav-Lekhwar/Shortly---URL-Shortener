/* Details page: render simple bar charts from window.__analytics */
(function () {
  const a = window.__analytics;
  if (!a) return;

  // Clicks over time (vertical mini bars)
  const timeEl = document.getElementById('chart-time');
  if (a.clicksOverTime.length) {
    const max = Math.max(...a.clicksOverTime.map((d) => d.clicks), 1);
    timeEl.innerHTML = `
      <div class="time-bar">${a.clicksOverTime.map((d) => `
        <div class="col" style="height:${Math.max(4, (d.clicks / max) * 100)}%" title="${d.day}: ${d.clicks} clicks"></div>`).join('')}
      </div>
      <div class="flex justify-between text-xs text-slate-400 mt-1">
        <span>${a.clicksOverTime[0].day}</span><span>${a.clicksOverTime[a.clicksOverTime.length - 1].day}</span>
      </div>`;
  } else {
    timeEl.innerHTML = '<p class="text-sm text-slate-400">No clicks yet.</p>';
  }

  function breakdown(elId, rows) {
    const el = document.getElementById(elId);
    if (!rows.length) {
      el.innerHTML = '<p class="text-sm text-slate-400">No data yet.</p>';
      return;
    }
    const max = Math.max(...rows.map((r) => r.clicks), 1);
    el.innerHTML = rows.map((r) => `
      <div>
        <div class="flex justify-between text-sm mb-1"><span>${escapeHtml(r.label)}</span><span class="text-slate-500">${r.clicks}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${(r.clicks / max) * 100}%"></div></div>
      </div>`).join('');
  }

  breakdown('chart-browser', a.byBrowser);
  breakdown('chart-device', a.byDevice);
  breakdown('chart-os', a.byOs);
})();
