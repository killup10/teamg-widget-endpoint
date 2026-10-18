/* Admin payment ledger. Amounts are stored as integer cents by the API. */
var paymentMonth = '', paymentDevice = '', paymentPlans = [];
function paymentMoney(cents) { return 'S/ ' + (cents / 100).toFixed(2); }
function paymentToday() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
function renderPayments(area) {
  if (!paymentMonth) paymentMonth = paymentToday().slice(0, 7);
  area.innerHTML = '<div class="card"><h2>Control de dinero · Soles (PEN)</h2>' +
    '<p class="small">Registra solo pagos recibidos. La fecha de vencimiento se edita por separado en Devices. Los totales no incluyen pagos pendientes.</p>' +
    '<label>Mes <input type="month" id="moneyMonth" value="' + esc(paymentMonth) + '"></label> ' +
    '<button class="act" id="moneyReload">Consultar</button><div id="moneySummary" role="status"></div>' +
    '<form id="moneyForm"><h3>Registrar pago recibido</h3>' +
    '<label>Plan <select id="moneyPlan"><option value="">Otro importe</option></select></label> ' +
    '<label>Fecha <input id="moneyDate" type="date" required value="' + paymentToday() + '"></label> ' +
    '<label>Monto S/ <input id="moneyAmount" type="number" min="0.01" max="9999999.99" step="0.01" required style="width:140px"></label><br>' +
    '<label>Cliente / TV <select id="moneyDevice"><option value="">Sin dispositivo asociado</option>' +
    DATA.devices.map(function(d) { return '<option value="' + esc(d.id) + '"' + (String(d.id) === paymentDevice ? ' selected' : '') + '>' + esc(d.note || d.name || d.id) + '</option>'; }).join('') + '</select></label> ' +
    '<label>Medio <select id="moneyMethod"><option>Yape</option><option>Plin</option><option>Transferencia</option><option>Efectivo</option><option>Otro</option></select></label><br>' +
    '<label>Concepto <input id="moneyDescription" required maxlength="200" placeholder="Ej. Renovación de Juan — noviembre" style="width:350px;max-width:90%"></label> ' +
    '<button class="act green" id="moneySave" type="submit">Registrar</button> <span id="moneyMessage" role="status"></span></form>' +
    '<div style="overflow-x:auto;margin-top:20px" id="moneyRows"></div></div>';
  document.getElementById('moneyReload').onclick = function() {
    var value = document.getElementById('moneyMonth').value;
    if (!value) return;
    paymentMonth = value;
    loadPayments(area);
  };
  var operationId = '';
  var form = document.getElementById('moneyForm');
  document.getElementById('moneyPlan').onchange = function() {
    var plan = paymentPlans.find(function(p) { return p.id === document.getElementById('moneyPlan').value; });
    var amount = document.getElementById('moneyAmount');
    amount.readOnly = !!plan;
    if (plan) {
      amount.value = (plan.amountCents / 100).toFixed(2);
      document.getElementById('moneyDescription').value = 'Renovación ' + plan.name + ' · ' + plan.months + (plan.months === 1 ? ' mes' : ' meses');
    }
  };
  document.getElementById('moneyForm').onsubmit = function(event) {
    event.preventDefault();
    var button = document.getElementById('moneySave'), message = document.getElementById('moneyMessage');
    if (button.disabled) return;
    if (!operationId) {
      var bytes = new Uint8Array(16); window.crypto.getRandomValues(bytes);
      operationId = Array.from(bytes, function(b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    }
    button.disabled = true; message.textContent = 'Guardando…';
    var payload = {id: operationId, planId: document.getElementById('moneyPlan').value,
      date: document.getElementById('moneyDate').value, amount: document.getElementById('moneyAmount').value,
      deviceId: document.getElementById('moneyDevice').value, method: document.getElementById('moneyMethod').value,
      description: document.getElementById('moneyDescription').value};
    api('/api/ott/admin/payments', 'POST', payload).then(function() {
      operationId = ''; paymentMonth = payload.date.slice(0, 7);
      if (TAB !== 'Dinero' || document.getElementById('moneyForm') !== form) return;
      document.getElementById('moneyMonth').value = paymentMonth;
      document.getElementById('moneyAmount').value = '';
      document.getElementById('moneyDescription').value = '';
      document.getElementById('moneyPlan').value = '';
      document.getElementById('moneyAmount').readOnly = false;
      message.textContent = 'Registrado.'; button.disabled = false;
      loadPayments(area);
    }).catch(function(e) { message.textContent = e.message || 'No se pudo guardar'; button.disabled = false; });
  };
  loadPayments(area);
}
var paymentReadId = 0;
function loadPayments(area) {
  var readId = ++paymentReadId;
  document.getElementById('moneySummary').textContent = 'Cargando…';
  api('/api/ott/admin/payments?month=' + encodeURIComponent(paymentMonth)).then(function(data) {
    if (TAB !== 'Dinero' || readId !== paymentReadId || !area.contains(document.getElementById('moneySummary'))) return;
    paymentPlans = data.plans || [];
    var select = document.getElementById('moneyPlan'), selectedPlan = select.value;
    select.innerHTML = '<option value="">Otro importe</option>' + paymentPlans.map(function(p) {
      return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' · ' + p.months + (p.months === 1 ? ' mes' : ' meses') + ' · ' + paymentMoney(p.amountCents) + '</option>';
    }).join('');
    select.value = selectedPlan;
    document.getElementById('moneySummary').textContent = 'Total cobrado en ' + paymentMonth + ': ' + paymentMoney(data.incomeCents);
    document.getElementById('moneyRows').innerHTML = '<p class="small">Los pagos anulados conservan su historial y no suman al total.</p>' +
      '<table><thead><tr><th>Fecha</th><th>Cliente</th><th>Plan</th><th>Concepto</th><th>Medio</th><th>Monto</th><th>Estado</th></tr></thead><tbody>' +
      data.records.map(function(r) { return '<tr><td>' + esc(r.date) + '</td><td>' + esc(r.clientName || '—') + '</td><td>' + esc(r.planName || 'Otro') + (r.months ? ' · ' + r.months + ' m' : '') + '</td><td>' + esc(r.description) + '</td><td>' + esc(r.method) + '</td><td>' + paymentMoney(r.amountCents) + '</td><td>' + (r.voided ? 'Anulado' : '<button class="act" data-money-void="' + esc(r._id) + '">Anular</button>') + '</td></tr>'; }).join('') +
      '</tbody></table>' + (data.records.length ? '' : '<p>Sin movimientos en este mes.</p>');
    Array.from(document.querySelectorAll('[data-money-void]')).forEach(function(button) {
      button.onclick = function() {
        if (!confirm('¿Anular este movimiento? Se conservará en el historial y dejará de sumar al total.')) return;
        button.disabled = true;
        api('/api/ott/admin/payments/void', 'POST', {id: button.getAttribute('data-money-void')}).then(function() {
          if (TAB === 'Dinero') loadPayments(area);
        }).catch(function(e) { button.disabled = false; alert(e.message); });
      };
    });
  }).catch(function(e) { if (TAB === 'Dinero' && readId === paymentReadId) document.getElementById('moneySummary').textContent = 'No se pudo cargar: ' + e.message; });
}
