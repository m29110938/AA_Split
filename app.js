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

  // 工具：操作物件庫
  function tx(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // 新增人員
  async function addPerson(name) {
    if (!name.trim()) return;
    const store = tx('people', 'readwrite');
    try {
      await store.add({ name: name.trim() });
    } catch {
      alert('此人員已存在');
    }
    await refreshUI();
  }

  // 讀取人員列表
  async function getPeople() {
    const store = tx('people');
    return new Promise(res => {
      const items = [];
      const cursor = store.openCursor();
      cursor.onsuccess = e => {
        const c = e.target.result;
        if (c) {
          items.push(c.value);
          c.continue();
        } else {
          res(items);
        }
      };
    });
  }

  // 新增帳目
  async function addBill(bill) {
    if (!bill.purpose || bill.amount <= 0 || !bill.payer || bill.included.length === 0) {
      alert('請完整填寫帳目資料');
      return;
    }
    const store = tx('bills', 'readwrite');
    await store.add(bill);
    await refreshUI();
  }

  // 讀取所有帳目
  async function getBills() {
    const store = tx('bills');
    return new Promise(res => {
      const items = [];
      const cursor = store.openCursor();
      cursor.onsuccess = e => {
        const c = e.target.result;
        if (c) {
          items.push(c.value);
          c.continue();
        } else {
          res(items);
        }
      };
    });
  }

  // 分帳計算
  function calculateSettlement(people, bills) {
    const balance = {};
    people.forEach(p => (balance[p.name] = 0));

    bills.forEach(b => {
      const share = b.amount / b.included.length;
      b.included.forEach(p => {
        if (p !== b.payer) {
          balance[p] -= share;
          balance[b.payer] += share;
        }
      });
    });

    const owes = [];
    const gains = [];
    for (const p in balance) {
      const amt = balance[p];
      if (amt < -0.01) owes.push({ name: p, amt: -amt });
      else if (amt > 0.01) gains.push({ name: p, amt });
    }

    const settlement = [];
    while (owes.length && gains.length) {
      owes.sort((a, b) => b.amt - a.amt);
      gains.sort((a, b) => b.amt - a.amt);
      const o = owes[0];
      const g = gains[0];
      const pay = Math.min(o.amt, g.amt);
      settlement.push(`${o.name} 付 ${pay.toFixed(2)} 給 ${g.name}`);
      o.amt -= pay;
      g.amt -= pay;
      if (o.amt < 0.01) owes.shift();
      if (g.amt < 0.01) gains.shift();
    }

    return { balance, settlement };
  }

  // 更新 UI
  async function refreshUI() {
    const people = await getPeople();
    const bills = await getBills();
    // 更新人員列表
    const peopleList = document.getElementById('peopleList');
    peopleList.innerHTML = people.map(p => `<li>${p.name}</li>`).join('');

    // 更新付款人選單
    const payerSelect = document.getElementById('payerSelect');
    payerSelect.innerHTML = '<option value="">選擇付款人</option>' + people.map(p => `<option value="${p.name}">${p.name}</option>`).join('');

    // 更新包含人員checkbox群組
    const includedGroup = document.getElementById('includedGroup');
    includedGroup.innerHTML = people.map(p => `
      <input type="checkbox" class="btn-check" name="included[]" value="${p.name}" id="check_${p.name}">
      <label class="btn btn-outline-primary" for="check_${p.name}">${p.name}</label>
    `).join('');

    // 更新帳目列表
    const billsList = document.getElementById('billsList');
    if (bills.length === 0) billsList.innerHTML = '<li>無帳目資料</li>';
    else billsList.innerHTML = bills.map(b => `<li>${b.time} - ${b.purpose}：${b.amount}，付款人：${b.payer}，包含：${b.included.join(', ')}</li>`).join('');

    // 計算還款結果並顯示
    const { balance, settlement } = calculateSettlement(people, bills);

    const balanceList = document.getElementById('balanceList');
    balanceList.innerHTML = Object.entries(balance).map(([p, amt]) => `<li>${p}: ${amt.toFixed(2)}</li>`).join('');

    const settlementList = document.getElementById('settlementList');
    settlementList.innerHTML = settlement.length > 0 ? settlement.map(s => `<li>${s}</li>`).join('') : '<li>無需還款</li>';
  }

  // 綁定新增人員表單事件
  document.getElementById('addPersonForm').onsubmit = async e => {
    e.preventDefault();
    const input = document.getElementById('personName');
    await addPerson(input.value);
    input.value = '';
  };

  // 綁定新增帳目表單事件
  document.getElementById('addBillForm').onsubmit = async e => {
    e.preventDefault();
    const purpose = document.getElementById('purpose').value.trim();
    const amount = parseFloat(document.getElementById('amount').value);
    const payer = document.getElementById('payerSelect').value;
    const includedCheckboxes = document.querySelectorAll('input[name="included[]"]:checked');
    const included = Array.from(includedCheckboxes).map(cb => cb.value);
    const time = new Date().toLocaleString();

    await addBill({ purpose, amount, payer, included, time });

    // reset form
    e.target.reset();
  };

  // 頁面載入後初始化
  await refreshUI();
})();
