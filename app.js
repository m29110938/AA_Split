// app.js
(async () => {
  // IndexedDB 初始化
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('splitDB', 1);
    request.onerror = () => reject('DB open error');
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('people')) {
        db.createObjectStore('people', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('bills')) {
        db.createObjectStore('bills', { keyPath: 'id', autoIncrement: true });
      }
    };
  });

  // 工具：新增刪除帳目的功能
  async function deleteBill(id) {
    const store = tx('bills', 'readwrite');
    await store.delete(id);
    await refreshUI();
  }

  // 工具：新增清空所有資料的功能 (Reset)
  async function clearAllData() {
    if (!confirm('確定要清空所有人員與帳目嗎？')) return;
    const pStore = tx('people', 'readwrite');
    const bStore = tx('bills', 'readwrite');
    await pStore.clear();
    await bStore.clear();
    await refreshUI();
  }

  // UI 優化：全選/取消全選包含人員
  window.toggleAllIncluded = (checked) => {
    const checkboxes = document.querySelectorAll('input[name="included[]"]');
    checkboxes.forEach(cb => cb.checked = checked);
  };

  // 強化版更新 UI
  async function refreshUI() {
    const people = await getPeople();
    const bills = await getBills();

    // 1. 更新人員列表 (增加刪除按鈕感)
    const peopleList = document.getElementById('peopleList');
    peopleList.innerHTML = people.map(p => 
      `<li class="list-group-item d-flex justify-content-between align-items-center">${p.name}</li>`
    ).join('');

    // 2. 更新付款人選單
    const payerSelect = document.getElementById('payerSelect');
    payerSelect.innerHTML = '<option value="">選擇付款人</option>' + 
      people.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    // 3. 更新包含人員 (增加「全選」快捷鍵)
    const includedGroup = document.getElementById('includedGroup');
    includedGroup.innerHTML = `
      <div class="mb-2 w-100">
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleAllIncluded(true)">全選</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" onclick="toggleAllIncluded(false)">清空</button>
      </div>
    ` + people.map(p => `
      <input type="checkbox" class="btn-check" name="included[]" value="${p.name}" id="check_${p.name}" checked>
      <label class="btn btn-outline-primary m-1" for="check_${p.name}">${p.name}</label>
    `).join('');

    // 4. 更新帳目列表 (加入刪除功能與視覺優化)
    const billsList = document.getElementById('billsList');
    if (bills.length === 0) {
      billsList.innerHTML = '<li class="list-group-item text-muted">目前無帳目</li>';
    } else {
      billsList.innerHTML = bills.map(b => `
        <li class="list-group-item d-flex justify-content-between align-items-start">
          <div class="ms-2 me-auto">
            <div class="fw-bold">${b.purpose} - $${b.amount}</div>
            <small class="text-muted">${b.payer} 支付 | 成員: ${b.included.join(', ')}</small>
          </div>
          <button class="btn btn-sm btn-outline-danger border-0" onclick="window.deleteBill(${b.id})">✕</button>
        </li>
      `).join('');
    }

    // 5. 計算並顯示建議 (加入一鍵複製)
    const { balance, settlement } = calculateSettlement(people, bills);
    const settlementList = document.getElementById('settlementList');
    
    if (settlement.length > 0) {
      settlementList.innerHTML = settlement.map(s => `<li class="list-group-item">${s}</li>`).join('');
      const copyBtn = `<button class="btn btn-sm btn-dark mt-2 w-100" onclick="window.copyResults()">📋 複製還款建議</button>`;
      settlementList.innerHTML += copyBtn;
    } else {
      settlementList.innerHTML = '<li class="list-group-item">無需還款</li>';
    }

    // 將函數暴露給全域環境
    window.deleteBill = deleteBill;
    window.copyResults = () => {
      const text = settlement.join('\n');
      navigator.clipboard.writeText(`💰 AA 分帳結果：\n${text}`).then(() => alert('已複製到剪貼簿'));
    };
  }

  // 綁定 Reset 按鈕
  document.getElementById('resetBtn').onclick = clearAllData;

  // 頁面載入後初始化
  await refreshUI();
})();
