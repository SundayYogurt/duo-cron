import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyCard, pickupCard, shippingCard, snapshotCard } from '../src/cards.mjs';
import { PRODUCTS, PRO_MAX_PRODUCTS } from '../src/stock.mjs';

const items = PRODUCTS.map(item => ({ ...item, label: 'จัดส่ง 22 ม.ค.', storeCount: 0 }));
const now = new Date('2026-10-20T05:00:00Z');

test('daily card contains all variants and does not call branch count a unit count', () => {
  const card = dailyCard(items, '10330', now);
  assert.equal(card.fields.length, 8);
  assert.match(card.description, /ยังไม่มี/);
  assert.match(card.footer.text, /ไม่ใช่จำนวนเครื่อง/);
});

test('pickup card names only a verified store and does not invent unit quantity', () => {
  const card = pickupCard({ ...items[0], storeCount: 1 }, 'Central World', '10330', now);
  assert.match(card.title, /Central World/);
  assert.match(card.fields.find(field => field.name === 'Stock').value, /ไม่แสดงจำนวนเครื่อง/);
  assert.equal(card.fields.find(field => field.name === 'SKU').value, 'MK2D4ZP/A');
});

test('shipping card shows old and new estimates', () => {
  const card = shippingCard({ ...items[0], label: 'จัดส่ง 21 ม.ค.' }, { label: 'จัดส่ง 22 ม.ค.' }, '10330', now);
  assert.equal(card.fields.find(field => field.name === 'กำหนดส่งเดิม').value, 'จัดส่ง 22 ม.ค.');
  assert.equal(card.fields.find(field => field.name === 'กำหนดส่งใหม่').value, 'จัดส่ง 21 ม.ค.');
});

test('Pro Max snapshot stays in its own product context', () => {
  const items = PRO_MAX_PRODUCTS.map(item => ({ ...item, label: '2-3 สัปดาห์', storeCount: 0 }));
  const card = snapshotCard(items, '10330', now);
  assert.equal(card.fields.length, 16);
  assert.match(card.title, /iPhone 18 Pro Max/);
  assert.match(card.url, /iphone-18-pro/);
});
