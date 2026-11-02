/* Dashboard: create form, search/filters, paginated table, actions */
(function () {
  const state = {
    page: 1,
    search: (window.__dashboardQuery && window.__dashboardQuery.search) || '',
    status: (window.__dashboardQuery && window.__dashboardQuery.status) || 'all',
    limit: 10,
  };

  const table = document.getElementById('urls-table');
  const paginationEl = document.getElementById('pagination');
  const searchInput = document.getElementById('search');

  function statusBadge(url) {
    if (!url.isActive) return '<span class="px-2 py-0.5 rounded text-xs bg-slate-200 text-slate-700">Disabled</span>';
    if (url.isExpired) return '<span class="px-2 py-0.5 rounded text-xs bg-amber-100 text-amber-800">Expired</span>';
    return '<span class="px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800">Active</span>';
  }

  async function load() {
    const params = new URLSearchParams({
      page: state.page, limit: state.limit, search: state.search, status: state.status,
    });
    try {
      const { data } = await apiFetch(`/api/v1/urls?${params}`);
      render(data);
    } catch (err) {
      table.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-rose-600">${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function render(data) {
    const { urls, pagination } = data;
    if (!urls.length) {
      table.innerHTML = '<tr><td colspan="5" class="py-6 text-center text-slate-400">No links yet. Create your first one above.</td></tr>';
    } else {
      table.innerHTML = urls.map((u) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50">
          <td class="py-2 pr-4">
            <a href="/${escapeHtml(u.shortCode)}" target="_blank" class="text-sky-600 font-mono hover:underline">/${escapeHtml(u.shortCode)}</a>
            <button class="copy-btn ml-2 text-xs text-slate-400 hover:text-slate-600" data-copy="${escapeHtml(u.shortUrl)}">copy</button>
          </td>
          <td class="py-2 pr-4 max-w-xs truncate text-slate-600" title="${escapeHtml(u.originalUrl)}">${escapeHtml(u.originalUrl)}</td>
          <td class="py-2 pr-4">${u.clickCount}</td>
          <td class="py-2 pr-4">${statusBadge(u)}</td>
          <td class="py-2 whitespace-nowrap">
            <a href="/dashboard/urls/${u.id}" class="text-xs text-sky-600 hover:underline mr-2">Analytics</a>
            <button class="toggle-btn text-xs text-slate-600 hover:underline mr-2" data-id="${u.id}" data-active="${u.isActive}">${u.isActive ? 'Disable' : 'Enable'}</button>
            <button class="delete-btn text-xs text-rose-600 hover:underline" data-id="${u.id}">Delete</button>
          </td>
        </tr>`).join('');
    }

    // Pagination
    paginationEl.innerHTML = '';
    if (pagination.totalPages > 1) {
      let html = '<nav class="flex items-center gap-2 mt-6 text-sm">';
      const btn = (p, label, disabled, active) =>
        `<button data-page="${p}" ${disabled ? 'disabled' : ''} class="px-3 py-1.5 rounded border ${active ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-100 disabled:opacity-40'}">${label}</button>`;
      html += btn(pagination.page - 1, 'Previous', pagination.page <= 1, false);
      for (let p = 1; p <= pagination.totalPages; p++) {
        if (p === 1 || p === pagination.totalPages || Math.abs(p - pagination.page) <= 2) {
          html += btn(p, p, false, p === pagination.page);
        } else if (Math.abs(p - pagination.page) === 3) {
          html += '<span class="text-slate-400">…</span>';
        }
      }
      html += btn(pagination.page + 1, 'Next', pagination.page >= pagination.totalPages, false);
      html += `<span class="text-slate-500 ml-2">${pagination.total} total</span></nav>`;
      paginationEl.innerHTML = html;
      paginationEl.querySelectorAll('button[data-page]').forEach((b) => {
        b.addEventListener('click', () => { state.page = Number(b.dataset.page); load(); });
      });
    }

    table.querySelectorAll('.copy-btn').forEach((b) =>
      b.addEventListener('click', () => {
        navigator.clipboard.writeText(b.dataset.copy).then(() => toast('Copied to clipboard', 'success'));
      }));
    table.querySelectorAll('.toggle-btn').forEach((b) =>
      b.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/v1/urls/${b.dataset.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: b.dataset.active !== 'true' }),
          });
          toast('Link updated', 'success');
          load();
        } catch (err) { toast(err.message, 'error'); }
      }));
    table.querySelectorAll('.delete-btn').forEach((b) =>
      b.addEventListener('click', async () => {
        if (!confirm('Delete this short link?')) return;
        try {
          await apiFetch(`/api/v1/urls/${b.dataset.id}`, { method: 'DELETE' });
          toast('Link deleted', 'success');
          load();
        } catch (err) { toast(err.message, 'error'); }
      }));
  }

  document.querySelectorAll('.filter-btn').forEach((b) =>
    b.addEventListener('click', () => {
      state.status = b.dataset.status;
      state.page = 1;
      document.querySelectorAll('.filter-btn').forEach((x) => {
        const on = x === b;
        x.className = `filter-btn px-3 py-1.5 rounded border ${on ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-300 hover:bg-slate-100'}`;
      });
      load();
    }));

  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      state.page = 1;
      load();
    }, 300);
  });

  document.getElementById('create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const payload = { originalUrl: form.originalUrl.value.trim() };
    if (form.customAlias.value.trim()) payload.customAlias = form.customAlias.value.trim();
    if (form.expiresAt.value) payload.expiresAt = new Date(form.expiresAt.value).toISOString();
    const resultEl = document.getElementById('create-result');
    try {
      const { data } = await apiFetch('/api/v1/urls', { method: 'POST', body: JSON.stringify(payload) });
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = `<div class="bg-emerald-50 border border-emerald-200 rounded px-3 py-2">Short link created: <a href="${escapeHtml(data.shortUrl)}" target="_blank" class="text-sky-700 font-mono font-medium hover:underline">${escapeHtml(data.shortUrl)}</a></div>`;
      form.reset();
      state.page = 1;
      load();
    } catch (err) {
      resultEl.classList.remove('hidden');
      const detailList = (err.details || [])
        .map((d) => `<li>${escapeHtml(d.message)}</li>`)
        .join('');
      resultEl.innerHTML = `<div class="bg-rose-50 border border-rose-200 text-rose-700 rounded px-3 py-2">${escapeHtml(err.message)}${detailList ? `<ul class="list-disc ml-5 mt-1">${detailList}</ul>` : ''}</div>`;
    }
  });

  load();
})();
