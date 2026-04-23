// Check auth first
(async () => {
  const res = await fetch('/auth/status');
  const data = await res.json();
  if (!data.data?.authenticated) window.location.href = '/login';
})();

async function loadBuckets() {
  const list = document.getElementById('bucket-list');
  try {
    const res = await fetch('/api/buckets');
    if (res.status === 401) { window.location.href = '/login'; return; }
    const data = await res.json();
    const buckets = data.data || [];

    if (buckets.length === 0) {
      list.innerHTML = `
        <div class="text-center py-10 text-gray-400 dark:text-gray-500">
          <i class="fas fa-database text-4xl mb-3 block opacity-30"></i>
          <p>No buckets yet. Add your first bucket.</p>
        </div>`;
      return;
    }

    list.innerHTML = buckets.map(b => `
      <div class="group flex items-center gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all cursor-pointer" onclick="selectBucket('${b.id}', '${escHtml(b.name)}')">
        <div class="flex-shrink-0 w-10 h-10 bg-blue-50 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
          <i class="fas fa-bucket text-blue-500 dark:text-blue-400"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-gray-900 dark:text-white truncate">${escHtml(b.name)}</p>
          <p class="text-xs text-gray-400 truncate">${escHtml(b.endpoint || '')}</p>
        </div>
        <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onclick="event.stopPropagation(); deleteBucket('${b.id}', '${escHtml(b.name)}')" class="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="Remove from panel">
            <i class="fas fa-trash text-sm"></i>
          </button>
          <i class="fas fa-chevron-right text-gray-300 dark:text-gray-600"></i>
        </div>
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="text-center py-8 text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>Failed to load buckets</div>`;
  }
}

function selectBucket(id, name) {
  sessionStorage.setItem('activeBucketId', id);
  sessionStorage.setItem('activeBucketName', name);
  window.location.href = '/';
}

function openCreateModal() {
  document.getElementById('create-modal').classList.remove('hidden');
  document.getElementById('create-modal').classList.add('flex');
}

function closeCreateModal() {
  document.getElementById('create-modal').classList.add('hidden');
  document.getElementById('create-modal').classList.remove('flex');
  document.getElementById('create-form').reset();
}

async function submitCreate(e) {
  e.preventDefault();
  const btn = document.getElementById('create-btn');
  const btnText = document.getElementById('create-btn-text');
  btn.disabled = true;
  btnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';

  const payload = {
    name: document.getElementById('f-name').value.trim(),
    endpoint: document.getElementById('f-endpoint').value.trim(),
    accessKeyId: document.getElementById('f-access-key').value.trim(),
    secretAccessKey: document.getElementById('f-secret-key').value.trim(),
    publicUrl: document.getElementById('f-public-url').value.trim(),
    createOnCloudflare: document.getElementById('f-create-cf').checked,
  };

  try {
    const res = await fetch('/api/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to add bucket');
    showToast('Bucket added successfully', 'success');
    closeCreateModal();
    loadBuckets();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Add Bucket';
  }
}

async function deleteBucket(id, name) {
  if (!confirm(`Remove "${name}" from panel?\n\nThis does NOT delete the bucket from Cloudflare.`)) return;
  try {
    const res = await fetch(`/api/buckets/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to remove bucket');
    // Clear active bucket if it was the deleted one
    if (sessionStorage.getItem('activeBucketId') === id) {
      sessionStorage.removeItem('activeBucketId');
      sessionStorage.removeItem('activeBucketName');
    }
    showToast('Bucket removed from panel', 'success');
    loadBuckets();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Import from Cloudflare ---
async function openImportModal() {
  document.getElementById('import-modal').classList.remove('hidden');
  document.getElementById('import-modal').classList.add('flex');
  showImportStep(1);
  loadCfBuckets();
}

function closeImportModal() {
  document.getElementById('import-modal').classList.add('hidden');
  document.getElementById('import-modal').classList.remove('flex');
  document.getElementById('import-form').reset();
}

function showImportStep(step) {
  document.getElementById('import-step-1').classList.toggle('hidden', step !== 1);
  document.getElementById('import-step-2').classList.toggle('hidden', step !== 2);
}

function backToStep1() {
  showImportStep(1);
}

async function loadCfBuckets() {
  const list = document.getElementById('cf-bucket-list');
  list.innerHTML = '<div class="flex items-center justify-center py-8"><i class="fas fa-spinner fa-spin text-gray-400 text-2xl"></i></div>';
  try {
    const res = await fetch('/api/buckets/cf-list');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to fetch from Cloudflare');
    const buckets = data.data || [];
    if (buckets.length === 0) {
      list.innerHTML = '<p class="text-center text-gray-400 py-6">No buckets found in your Cloudflare account.</p>';
      return;
    }
    list.innerHTML = buckets.map(b => `
      <div class="flex items-center justify-between p-3 border rounded-xl ${
        b.alreadyAdded
          ? 'border-gray-200 dark:border-gray-700 opacity-50'
          : 'border-gray-200 dark:border-gray-700 hover:border-orange-400 cursor-pointer'
      }" ${!b.alreadyAdded ? `onclick="selectCfBucket('${escHtml(b.name)}', '${escHtml(b.endpoint)}')"`  : ''}>
        <div class="flex items-center gap-3">
          <i class="fas fa-bucket text-orange-400"></i>
          <div>
            <p class="font-medium text-gray-900 dark:text-white text-sm">${escHtml(b.name)}</p>
            <p class="text-xs text-gray-400">${b.creationDate ? new Date(b.creationDate).toLocaleDateString() : ''}</p>
          </div>
        </div>
        ${b.alreadyAdded
          ? '<span class="text-xs text-green-500 font-medium"><i class="fas fa-check mr-1"></i>Added</span>'
          : '<i class="fas fa-chevron-right text-gray-300"></i>'
        }
      </div>
    `).join('');
  } catch (err) {
    list.innerHTML = `<div class="text-center py-6 text-red-400"><i class="fas fa-exclamation-circle mr-2"></i>${escHtml(err.message)}</div>`;
  }
}

function selectCfBucket(name, endpoint) {
  document.getElementById('i-name').value = name;
  document.getElementById('i-endpoint').value = endpoint;
  document.getElementById('import-bucket-name-label').textContent = name;
  document.getElementById('import-form').reset();
  document.getElementById('i-name').value = name;
  document.getElementById('i-endpoint').value = endpoint;
  showImportStep(2);
}

async function submitImport(e) {
  e.preventDefault();
  const btn = document.getElementById('import-btn');
  const btnText = document.getElementById('import-btn-text');
  btn.disabled = true;
  btnText.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i> Adding...';

  const payload = {
    name: document.getElementById('i-name').value,
    endpoint: document.getElementById('i-endpoint').value,
    accessKeyId: document.getElementById('i-access-key').value.trim(),
    secretAccessKey: document.getElementById('i-secret-key').value.trim(),
    publicUrl: document.getElementById('i-public-url').value.trim(),
    createOnCloudflare: false,
  };

  try {
    const res = await fetch('/api/buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || 'Failed to add bucket');
    showToast('Bucket imported successfully', 'success');
    closeImportModal();
    loadBuckets();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btnText.textContent = 'Add Bucket';
  }
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  sessionStorage.clear();
  window.location.href = '/login';
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500' };
  const toast = document.createElement('div');
  toast.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-xl shadow-lg text-sm flex items-center gap-2 animate-fade-in`;
  toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i> ${escHtml(message)}`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

loadBuckets();
