import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShipDate, improved, extractShipping, PRODUCTS, PRO_MAX_PRODUCTS, bangkokClock, dailyStatusDue } from '../src/stock.mjs';

test('Thai shipping date across a year boundary', () => {
  assert.equal(parseShipDate('จัดส่ง 22 ม.ค.', new Date('2026-10-20T00:00:00Z')), '2027-01-22');
  assert.equal(parseShipDate('จัดส่ง 19 ต.ค.', new Date('2026-10-20T00:00:00Z')), '2026-10-19');
  assert.equal(parseShipDate('ไม่ทราบกำหนด', new Date('2026-10-20T00:00:00Z')), null);
});

test('alerts only on a faster date after a baseline exists', () => {
  assert.equal(improved(undefined, { date: '2027-01-22' }), false);
  assert.equal(improved({ date: '2027-01-22' }, { date: '2027-01-21' }), true);
  assert.equal(improved({ date: '2027-01-22' }, { date: '2027-01-22' }), false);
  assert.equal(improved({ date: '2027-01-22' }, { date: '2027-01-23' }), false);
});

test('rejects incomplete Apple data instead of overwriting state', () => {
  const response = {
    head: { status: '200' },
    body: { content: PRODUCTS.slice(0, -1).map(product => ({
      partNumber: product.part,
      partAvailableStoresCount: 0,
      deliveryMessage: { deliveryOptionMessages: [{ displayName: 'จัดส่ง 22 ม.ค.' }] },
    })) },
  };
  assert.throws(() => extractShipping(response, new Date('2026-10-20T00:00:00Z')), /did not return/);
});

test('reads store count as branches, not units', () => {
  const response = {
    head: { status: '200' },
    body: { content: PRODUCTS.map(product => ({
      partNumber: product.part,
      partAvailableStoresCount: 2,
      eligibleStores: 'R001,R002',
      deliveryMessage: { deliveryOptionMessages: [{ displayName: 'จัดส่ง 22 ม.ค.' }] },
    })) },
  };
  assert.equal(extractShipping(response, new Date('2026-10-20T00:00:00Z'))[0].storeCount, 2);
  assert.deepEqual(extractShipping(response, new Date('2026-10-20T00:00:00Z'))[0].eligibleStoreIds, ['R001', 'R002']);
});

test('treats Apple ready-to-ship label as available today', () => {
  const response = {
    head: { status: '200' },
    body: { content: PRODUCTS.map(product => ({
      partNumber: product.part,
      partAvailableStoresCount: 0,
      deliveryMessage: { deliveryOptionMessages: [{ displayName: 'พร้อมขาย' }] },
    })) },
  };
  assert.equal(extractShipping(response, new Date('2026-10-20T17:01:00Z'))[0].date, '2026-10-21');
});

test('reads all 16 Pro Max variants with relative shipping estimates', () => {
  const response = {
    head: { status: '200' },
    body: { content: PRO_MAX_PRODUCTS.map(product => ({
      partNumber: product.part,
      partAvailableStoresCount: 0,
      deliveryMessage: { deliveryOptionMessages: [{ displayName: '2-3 สัปดาห์' }] },
    })) },
  };
  const items = extractShipping(response, new Date('2026-10-20T00:00:00Z'), PRO_MAX_PRODUCTS);
  assert.equal(items.length, 16);
  assert.equal(items[0].estimateDays, 21);
  assert.equal(items[0].date, null);
  assert.equal(improved(items[0], { ...items[0], label: '1-2 สัปดาห์', estimateDays: 14 }), true);
  assert.equal(improved(items[0], items[0]), false);
});

test('daily status follows Bangkok date and runs once per day', () => {
  const before = new Date('2026-10-20T04:59:00Z'); // 11:59 Bangkok
  const after = new Date('2026-10-20T05:01:00Z'); // 12:01 Bangkok
  assert.deepEqual(bangkokClock(after), { date: '2026-10-20', hour: 12 });
  assert.equal(dailyStatusDue({}, before, 12), false);
  assert.equal(dailyStatusDue({}, after, 12), true);
  assert.equal(dailyStatusDue({ lastDailyDate: '2026-10-20' }, after, 12), false);
  assert.equal(dailyStatusDue({}, before, 12, true), true);
  assert.equal(dailyStatusDue({ lastDailyDate: '2026-10-20' }, after, 12, true), true);
});
