'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const tax = require('../lib/tax');

function makeOrder(overrides) {
  return Object.assign({
    id: 42,
    date: '2021-11-21',
    customer: 'In-memory customer',
    paymentMode: 'cash',
    items: [{ id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 100, qty: 2 }],
    coupon: ''
  }, overrides || {});
}

test('CURRENT BEHAVIOUR: checkout applies the HSN slab while the invoice falls back to default GST', function () {
  const order = makeOrder();
  const checkout = pricing.computeTotals(order.items, order.coupon);
  const printedInvoice = invoice.computeInvoiceFigures(order);

  assert.equal(tax.getRateForItem(order.items[0]), 0.05);
  assert.deepEqual(
    { subtotal: checkout.subtotal, tax: checkout.tax, total: checkout.total },
    { subtotal: 200, tax: 10, total: 210 }
  );
  assert.deepEqual(
    { subtotal: printedInvoice.subtotal, tax: printedInvoice.tax, total: printedInvoice.total },
    { subtotal: 200, tax: 36, total: 236 }
  );
});

test('CURRENT BEHAVIOUR: invoice GST ignores an HSN slab even when displaying that HSN', function () {
  const figures = invoice.computeInvoiceFigures(makeOrder());

  assert.equal(figures.rows[0].hsn, '1006');
  assert.equal(figures.rows[0].gstPercent, 18);
  assert.equal(figures.rows[0].lineTax, 36);
});

test('CURRENT BEHAVIOUR: invoice percentage discount is calculated on subtotal plus tax', function () {
  const order = makeOrder({
    items: [{ id: 2, name: 'Coffee', hsn: '0901', price: 1000, qty: 1 }],
    coupon: 'WELCOME'
  });
  const checkout = pricing.computeTotals(order.items, order.coupon);
  const printedInvoice = invoice.computeInvoiceFigures(order);

  assert.equal(checkout.discount, 50);
  assert.equal(printedInvoice.discount, 59);
  assert.equal(checkout.tax, 171);
  assert.equal(printedInvoice.tax, 180);
  // At one uniform tax rate, the larger invoice discount offsets its larger tax.
  assert.equal(checkout.total, printedInvoice.total);
});

test('CURRENT BEHAVIOUR: invoice honors a configured inactive coupon when recalculating an old order', function () {
  const figures = invoice.computeInvoiceFigures(makeOrder({
    items: [{ id: 3, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }],
    coupon: 'DIWALI20'
  }));

  assert.equal(figures.discount, 236);
  assert.equal(figures.total, 944);
});

test('CURRENT BEHAVIOUR: rendered invoice warns when its recalculated total differs from the ledger total', function () {
  const html = invoice.render(makeOrder({ total: 210 }));

  assert.match(html, /Invoice computed total \(₹236\.00\)/);
  assert.match(html, /Order Ledger recorded total \(₹210\.00\)/);
  assert.match(html, /differs from Order Ledger recorded total/);
});
