(async () => {
  // --- IndexedDB 初始化 ---
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('splitDB', 2); // 升級版本以應對結構微調
    request.onerror = () => reject('DB open error');
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('people')) db.createObjectStore('people', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('bills')) db.createObjectStore('bills', { keyPath: 'id', autoIncrement: true });
    };
  });

  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // --- 資料操作 ---
  async function addPerson(name) {
    if (!name.trim()) return;
    try {
      await tx('people', 'readwrite').add({ name: name.trim() });
      await refreshUI();
    } catch { alert('此人員已存在'); }
  }

  async function deleteBill(id) {
    await tx('bills', 'readwrite').delete(id);
    await refreshUI();
  }

  async function clearAll() {
    if(!confirm('確定要清空所有資料嗎？')) return;
    await tx('people', 'readwrite').clear();
    await tx('bills', 'readwrite').clear();
    await refreshUI();
  }

  async function getData(storeName) {
    const store = tx(storeName);
    return new Promise(res => {
      const items = [];
      store.openCursor().onsuccess = e => {
        const c = e.target.result;
        if (c) { items.push(c.value); c.continue(); } else { res(items); }
      };
    });
  }

  // --- 全域輔助函數 ---
  window.selectAllIncluded = (val) => {
    document.querySelectorAll('input[name="included[]"]').forEach(cb => cb.checked = val);
  };

  // --- UI 更新邏輯 ---
  async function refreshUI() {
    const people = await getData('people');
    const bills = await getData('bills');

    // 更新人員標籤
    document.getElementById('peopleList').innerHTML = people.map(p => 
      `<span class="badge bg-secondary p-2">${p.name}</span>`
    ).join('');

    // 更新付款人按鈕組 (比下拉選單好按)
    document.getElementById('payerGroup').innerHTML = people.map(p => `
      <input type="radio" class="btn-check" name="payer" id="pay_${p.name}" value="${p.name}" required>
      <label class="btn btn-outline-primary" for="pay_${p.name}">${p.name}</label>
    `).join('');

    // 更新包含人員 (預設全選)
    document.getElementById('includedGroup').innerHTML = people.map(p => `
      <input type="checkbox" class="btn-check" name="included[]" value="${p.name}" id="inc_${p.name}" checked>
      <label class="btn btn-outline-primary" for="inc_${p.name}">${p.name}</label>
    `).join('');

    // 更新帳目紀錄 (增加刪除鈕)
    const billsList = document.getElementById('billsList');
    billsList.innerHTML = bills.length ? bills.map(b => `
      <li class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-bold">${b.purpose} <span class="text-success">$${b.amount}</span></div>
          <small class="text-muted">${b.payer} 支 | 成員: ${b.included.join(',')}</small>
        </div>
        <span class="delete-btn" onclick="window.delBill(${b.id})">🗑️</span>
      </li>
    `).reverse().join('') : '<li class="list-group-item text-muted text-center">尚無明細</li>';

    // 計算結算
    const { balance, settlement } = calculateSettlement(people, bills);
    const sList = document.getElementById('settlementList');
    sList.innerHTML = settlement.length ? settlement.map(s => `<li class="list-group-item fw-bold text-primary">👉 ${s}</li>`).join('') : '<li class="list-group-item text-center">暫無建議</li>';

    window.lastSettlement = settlement; // 存一份供複製用
  }

  // 將刪除函數暴露給 HTML
  window.delBill = deleteBill;

  // --- 事件綁定 ---
  document.getElementById('addPersonForm').onsubmit = async e => {
    e.preventDefault();
    const input = document.getElementById('personName');
    await addPerson(input.value);
    input.value = '';
  };

  document.getElementById('addBillForm').onsubmit = async e => {
    e.preventDefault();
    const amount = parseFloat(document.getElementById('amount').value);
    const payer = document.querySelector('input[name="payer"]:checked')?.value;
    const included = Array.from(document.querySelectorAll('input[name="included[]"]:checked')).map(cb => cb.value);
    
    if(!payer || included.length === 0) return alert('請選擇付款人與包含成員');

    await tx('bills', 'readwrite').add({
      purpose: document.getElementById('purpose').value,
      amount,
      payer,
      included,
      time: new Date().toLocaleString()
    });

    e.target.reset();
    await refreshUI();
  };

  document.getElementById('copyBtn').onclick = () => {
    if(!window.lastSettlement || window.lastSettlement.length === 0) return alert('目前沒有結果可複製');
    const text = "💰 AA 分帳結算結果：\n" + window.lastSettlement.join('\n');
    navigator.clipboard.writeText(text).then(() => alert('已複製結算建議，快去 LINE 貼上吧！'));
  };

  document.getElementById('clearAllBtn').onclick = clearAll;

  // 分帳邏輯 (沿用你的，但做小數點優化)
  function calculateSettlement(people, bills) {
    const balance = {};
    people.forEach(p => balance[p.name] = 0);
    bills.forEach(b => {
      const share = b.amount / b.included.length;
      balance[b.payer] += b.amount;
      b.included.forEach(p => balance[p] -= share);
    });

    const owes = [], gains = [];
    for (const p in balance) {
      if (balance[p] < -0.01) owes.push({ name: p, amt: -balance[p] });
      else if (balance[p] > 0.01) gains.push({ name: p, amt: balance[p] });
    }

    const settlement = [];
    const owes_sorted = [...owes].sort((a,b) => b.amt - a.amt);
    const gains_sorted = [...gains].sort((a,b) => b.amt - a.amt);

    while (owes_sorted.length && gains_sorted.length) {
      const o = owes_sorted[0], g = gains_sorted[0];
      const pay = Math.min(o.amt, g.amt);
      settlement.push(`${o.name} 付 ${pay.toFixed(0)} 元給 ${g.name}`);
      o.amt -= pay; g.amt -= pay;
      if (o.amt < 0.01) owes_sorted.shift();
      if (g.amt < 0.01) gains_sorted.shift();
    }
    return { balance, settlement };
  }

  await refreshUI();
})();
