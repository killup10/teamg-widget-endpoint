'use strict';
const plans = require('./web/payment-plans.json');

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    value.slice(0, 4) !== '0000' && Number.isFinite(Date.parse(value + 'T00:00:00Z')) &&
    new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
function limaDate() { return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10); }
function validate(body) {
  if (!body || !/^[a-f0-9]{32}$/.test(body.id || '')) throw new Error('Identificador de operación inválido');
  if (!validDate(body.date)) throw new Error('Fecha inválida');
  const amount = String(body.amount || '').trim().replace(',', '.');
  if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(amount)) throw new Error('Ingresa un monto positivo con hasta 2 decimales');
  const parts = amount.split('.');
  const cents = Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0'));
  if (!cents) throw new Error('El monto debe ser mayor que cero');
  const plan = body.planId ? plans.find(p => p.id === body.planId) : null;
  if (body.planId && !plan) throw new Error('Plan inválido');
  if (plan && plan.amountCents !== cents) throw new Error('El monto no coincide con el plan seleccionado');
  const description = String(body.description || '').trim();
  if (!description || description.length > 200) throw new Error('Ingresa un concepto de hasta 200 caracteres');
  return { _id: body.id, type: 'income', date: body.date, amountCents: cents, currency: 'PEN',
    planId: plan ? plan.id : '', planName: plan ? plan.name : '', months: plan ? plan.months : 0,
    description, deviceId: String(body.deviceId || ''), method: String(body.method || '').slice(0, 60),
    created: new Date().toISOString(), voided: false };
}
function summary(records, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Mes inválido');
  const rows = records.filter(r => r.date && r.date.slice(0, 7) === month);
  let incomeCents = 0;
  for (const row of rows) {
    if (row.voided) continue;
    if (row.type === 'income') incomeCents += row.amountCents;
  }
  rows.sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created));
  return { records: rows, incomeCents, currency: 'PEN', month, plans };
}
module.exports = { validDate, limaDate, validate, summary, plans };
