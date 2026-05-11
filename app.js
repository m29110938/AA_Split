// app.js
(async () => {
    // --- 1. IndexedDB 初始化 ---
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('splitDB', 2); // 版本 2
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

    // 工具：資料庫交易
    function tx(storeName, mode = 'readonly') {
        return db.transaction(storeName, mode).objectStore(storeName);
    }

    // 工具：取得所有資料
    async function getAll(storeName) {
        return new Promise(res => {
            const items = [];
            tx(storeName).openCursor().onsuccess = e => {
                const c = e.target.result;
                if (c) { items.push(c.value); c.continue(); }
                else { res(items); }
            };
        });
    }

    // --- 2. 核心功能函數 ---

    // 新增人員
    async function addPerson(name) {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        try {
            await tx('people', 'readwrite').add({ name: trimmedName });
            await refreshUI();
        } catch (e) {
            alert('此人員已存在');
        }
    }

    // 刪除單筆帳目
    window.delBill = async (id) => {
        if (!confirm('確定要刪除這筆帳目嗎？')) return;
        await tx('bills', 'readwrite').delete(id);
        await refreshUI();
    };

    // 清空所有資料
    document.getElementById('clearAllBtn').onclick = async () => {
        if (!confirm('將清空所有人員與帳目，確定嗎？')) return;
        await tx('people', 'readwrite').clear();
        await tx('bills', 'readwrite').clear();
        await refreshUI();
    };

    // 全選/取消全選人員
    window.selectAllIncluded = (val) => {
        const checkboxes = document.querySelectorAll('input[name="included[]"]');
        checkboxes.forEach(cb => cb.checked = val);
    };

    // 一鍵複製結果
    document.getElementById('copyBtn').onclick = () => {
        if (!window.currentSettlementText) return alert('目前沒有結算結果可複製');
        navigator.clipboard.writeText(window.currentSettlementText).then(() => {
            alert('✅ 已複製結算建議，快去 LINE 貼上吧！');
        });
    };

    // --- 3. UI 更新邏輯 ---

    async function refreshUI() {
        const people = await getAll('people');
        const bills = await getAll('bills');

        // A. 更新參與人員標籤 (解決圓點問題)
        const peopleList = document.getElementById('peopleList');
        peopleList.innerHTML = people.map(p => 
            `<span class="badge bg-light text-dark border p-2 fw-normal">${p.name}</span>`
        ).join('');

        // B. 更新付款人選擇 (Radio Group)
        const payerGroup = document.getElementById('payerGroup');
        if (people.length === 0) {
            payerGroup.innerHTML = '<small class="text-muted">請先新增人員</small>';
        } else {
            payerGroup.innerHTML = people.map(p => `
                <input type="radio" class="btn-check" name="payer" id="pay_${p.name}" value="${p.name}" required>
                <label class="btn btn-outline-primary btn-sm" for="pay_${p.name}">${p.name}</label>
            `).join('');
        }

        // C. 更新包含人員選擇 (Checkbox Group)
        const includedGroup = document.getElementById('includedGroup');
        if (people.length === 0) {
            includedGroup.innerHTML = '<small class="text-muted">請先新增人員</small>';
        } else {
            includedGroup.innerHTML = people.map(p => `
                <input type="checkbox" class="btn-check" name="included[]" value="${p.name}" id="inc_${p.name}" checked>
                <label class="btn btn-outline-info btn-sm" for="inc_${p.name}">${p.name}</label>
            `).join('');
        }

        // D. 更新帳目紀錄清單
        const billsList = document.getElementById('billsList');
        if (bills.length === 0) {
            billsList.innerHTML = '<li class="list-group-item text-center text-muted">暫無明細</li>';
        } else {
            // 最新的帳目排在最上面
            billsList.innerHTML = bills.slice().reverse().map(b => `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <div class="fw-bold">${b.purpose} <span class="text-success">$${b.amount}</span></div>
                        <small class="text-muted">${b.payer} 付款 | 成員: ${b.included.join(', ')}</small>
                    </div>
                    <button class="btn btn-sm btn-link text-danger p-0" onclick="window.delBill(${b.id})">🗑️</button>
                </li>
            `).join('');
        }

        // E. 計算結算建議
        renderSettlement(people, bills);
    }

    // --- 4. 分帳演算法 ---
    function renderSettlement(people, bills) {
        const balance = {};
        people.forEach(p => balance[p.name] = 0);

        bills.forEach(b => {
            const share = b.amount / b.included.length;
            balance[b.payer] += b.amount; // 付款人先拿回全部
            b.included.forEach(p => balance[p] -= share); // 每個人扣掉應付份額
        });

        const owes = [], gains = [];
        for (const p in balance) {
            const amt = balance[p];
            if (amt < -0.01) owes.push({ name: p, amt: -amt });
            else if (amt > 0.01) gains.push({ name: p, amt });
        }

        const settlementLines = [];
        const owes_sorted = [...owes].sort((a, b) => b.amt - a.amt);
        const gains_sorted = [...gains].sort((a, b) => b.amt - a.amt);

        while (owes_sorted.length && gains_sorted.length) {
            const o = owes_sorted[0], g = gains_sorted[0];
            const pay = Math.min(o.amt, g.amt);
            settlementLines.push(`${o.name} 付 ${pay.toFixed(0)} 元給 ${g.name}`);
            
            o.amt -= pay; g.amt -= pay;
            if (o.amt < 0.01) owes_sorted.shift();
            if (g.amt < 0.01) gains_sorted.shift();
        }

        const sList = document.getElementById('settlementList');
        if (settlementLines.length > 0) {
            sList.innerHTML = settlementLines.map(s => `<li class="list-group-item fw-bold text-primary">👉 ${s}</li>`).join('');
            window.currentSettlementText = "💰 AA 分帳結算結果：\n" + settlementLines.join('\n');
        } else {
            sList.innerHTML = '<li class="list-group-item text-center text-muted">目前餘額抵銷，無需還款</li>';
            window.currentSettlementText = "";
        }
    }

    // --- 5. 表單事件監聽 ---

    // 新增人員表單
    document.getElementById('addPersonForm').onsubmit = async e => {
        e.preventDefault();
        const input = document.getElementById('personName');
        await addPerson(input.value);
        input.value = '';
    };

    // 新增帳目表單
    document.getElementById('addBillForm').onsubmit = async e => {
        e.preventDefault();
        const purpose = document.getElementById('purpose').value;
        const amount = parseFloat(document.getElementById('amount').value);
        const payerRadio = document.querySelector('input[name="payer"]:checked');
        const includedCbs = document.querySelectorAll('input[name="included[]"]:checked');
        
        if (!payerRadio) return alert('請選擇誰付錢');
        const included = Array.from(includedCbs).map(cb => cb.value);
        if (included.length === 0) return alert('請至少選擇一名包含成員');

        await tx('bills', 'readwrite').add({
            purpose,
            amount,
            payer: payerRadio.value,
            included,
            time: new Date().toLocaleString()
        });

        e.target.reset(); // 重置表單
        await refreshUI();
    };

    // 初始載入
    await refreshUI();
})();
