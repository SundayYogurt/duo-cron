import { readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { PRODUCTS, PRODUCT_URL, PRO_MAX_PRODUCTS, bangkokClock, dailyStatusDue, extractShipping, improved } from './stock.mjs';
import { dailyCard, pickupCard, shippingCard, snapshotCard } from './cards.mjs';

const statePath = process.env.STATE_PATH || '.stock-state.json';
const intervalMinutes = Number(process.env.CHECK_INTERVAL_MINUTES || 1);
const token = process.env.DISCORD_BOT_TOKEN;
const channelId = process.env.DISCORD_CHANNEL_ID;
const proMaxChannelId = process.env.DISCORD_PRO_MAX_CHANNEL_ID;
const postalCode = process.env.APPLE_POSTAL_CODE || '10330';
const dailyStatusHour = Number(process.env.DAILY_STATUS_HOUR ?? 12);
const dailyStatusEnabled = process.env.DAILY_STATUS_ENABLED === 'true';
let redisClient;
const monitors = [
  { name: 'iPhone Duo', products: PRODUCTS, channelId, daily: true },
  { name: 'iPhone 18 Pro Max', products: PRO_MAX_PRODUCTS, channelId: proMaxChannelId, daily: false },
];

async function getRedis() {
  if (!redisClient) {
    const { createClient } = await import('redis');
    redisClient = createClient({ url: process.env.REDIS_URL });
    redisClient.on('error', error => console.error(`Key Value error: ${error.message}`));
    await redisClient.connect();
  }
  return redisClient;
}

function redisKey() {
  return `apple-duo:shipping:${postalCode}`;
}

function verifyConfig() {
  if (!process.argv.includes('--dry-run') && (!token || monitors.some(monitor => !/^\d{15,25}$/.test(monitor.channelId ?? '')))) {
    throw new Error('Set DISCORD_BOT_TOKEN, DISCORD_CHANNEL_ID and DISCORD_PRO_MAX_CHANNEL_ID');
  }
  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
    throw new Error('CHECK_INTERVAL_MINUTES must be an integer of at least 1');
  }
  if (!/^\d{5}$/.test(postalCode)) {
    throw new Error('APPLE_POSTAL_CODE must be a five-digit Thai postal code');
  }
  if (!Number.isInteger(dailyStatusHour) || dailyStatusHour < 0 || dailyStatusHour > 23) {
    throw new Error('DAILY_STATUS_HOUR must be an hour from 0 to 23 (Bangkok time)');
  }
}

async function readState() {
  if (process.env.REDIS_URL) {
    const raw = await (await getRedis()).get(redisKey());
    if (!raw) return { version: 1, products: {} };
    const state = JSON.parse(raw);
    if (state.version !== 1 || typeof state.products !== 'object' || !state.products) {
      throw new Error('Invalid Key Value state format');
    }
    return state;
  }
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    if (state.version !== 1 || typeof state.products !== 'object' || !state.products) {
      throw new Error('Invalid state format');
    }
    return state;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, products: {} };
    throw error;
  }
}

async function saveState(state) {
  if (process.env.REDIS_URL) {
    await (await getRedis()).set(redisKey(), JSON.stringify(state));
    return;
  }
  await mkdir(dirname(statePath), { recursive: true });
  const tempPath = `${statePath}.tmp`;
  await writeFile(tempPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  await rename(tempPath, statePath);
}

async function getShipping(products) {
  const url = new URL('https://www.apple.com/th/shop/sba/availability-message');
  products.forEach((product, index) => url.searchParams.set(`parts.${index}`, product.part));
  url.searchParams.set('location', postalCode);
  const response = await fetch(url, {
    headers: { accept: 'application/json', 'user-agent': 'Apple-Duo-Availability-Notifier/1.0' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Apple HTTP ${response.status}`);
  return extractShipping(await response.json(), new Date(), products);
}

async function sendDiscord(message, targetChannelId) {
  const endpoint = `https://discord.com/api/v10/channels/${targetChannelId}/messages`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bot ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...(typeof message === 'string' ? { content: message } : message), allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.ok) return;
    if (response.status === 429 && attempt === 0) {
      const details = await response.json();
      const delay = Math.min(Math.max(Number(details.retry_after) || 1, 1), 30);
      await new Promise(resolve => setTimeout(resolve, delay * 1000));
      continue;
    }
    throw new Error(`Discord HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
}

async function getStoreNames(item) {
  if (!item.eligibleStoreIds.length) return new Map();
  const url = new URL('https://www.apple.com/th/shop/sba/pickup-detail');
  url.searchParams.set('product', item.part);
  item.eligibleStoreIds.forEach((id, index) => url.searchParams.set(`stores.${index}`, id));
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'Apple-Duo-Availability-Notifier/1.0' },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Apple HTTP ${response.status}`);
    const data = await response.json();
    if (String(data?.head?.status) !== '200' || !Array.isArray(data?.body?.content)) {
      throw new Error('unexpected pickup response');
    }
    return new Map(data.body.content
      .filter(store => typeof store.storeId === 'string' && typeof store.storeName === 'string')
      .map(store => [store.storeId, store.storeName]));
  } catch (error) {
    console.warn(`Store names unavailable for ${item.part}: ${error.message}`);
    return new Map();
  }
}

function savedProduct(item) {
  return { date: item.date, label: item.label, estimateDays: item.estimateDays,
    ready: item.ready, storeCount: item.storeCount, eligibleStoreIds: item.eligibleStoreIds };
}

async function checkOnce(monitor, forceDaily = false) {
  const current = await getShipping(monitor.products);
  const state = await readState();
  const checkedAt = new Date();
  const today = bangkokClock(checkedAt).date;

  
  // ส่งรายงานซ้ำทุกครั้ง เฉพาะ iPhone 18 Pro Max
  if (monitor.name === 'iPhone 18 Pro Max') {
    await sendDiscord(
      { embeds: [snapshotCard(current, postalCode, checkedAt)] },
      monitor.channelId
    );

    console.log(`Periodic snapshot sent: ${monitor.name}`);
  }

  
  if (monitor.daily && process.env.SEND_TEST_ON_FIRST_RUN === 'true' && Object.keys(state.products).length === 0) {
    await sendDiscord(`✅ บอตติดตาม iPhone Duo เริ่มทำงานแล้ว (รหัสไปรษณีย์ ${postalCode})\n${PRODUCT_URL}`, monitor.channelId);
  }
  for (const item of current) {
    const previous = state.products[item.part];
    if (improved(previous, item, checkedAt)) {
      await sendDiscord({ embeds: [shippingCard(item, previous, postalCode, checkedAt)] }, monitor.channelId);
      state.lastImprovementDate = today;
      state.products[item.part] = savedProduct(item);
      await saveState(state);
      console.log(`Alerted: ${item.part} ${previous.date} -> ${item.date}`);
    }
    const previousIds = Array.isArray(previous?.eligibleStoreIds) ? previous.eligibleStoreIds : [];
    const newIds = item.eligibleStoreIds.filter(id => !previousIds.includes(id));
    const pickupAppeared = Number.isInteger(previous?.storeCount) && item.storeCount > 0 &&
      (previous.storeCount === 0 || newIds.length > 0 ||
        (item.eligibleStoreIds.length === 0 && item.storeCount > previous.storeCount));
    if (pickupAppeared) {
      const names = await getStoreNames(item);
      const storeNames = newIds.map(id => names.get(id)).filter(Boolean);
      if (storeNames.length) {
        await sendDiscord({ embeds: storeNames.slice(0, 10).map(name => pickupCard(item, name, postalCode, checkedAt)) }, monitor.channelId);
      } else {
        await sendDiscord({ embeds: [pickupCard(item, null, postalCode, checkedAt)] }, monitor.channelId);
      }
      state.products[item.part] = savedProduct(item);
      await saveState(state);
      console.log(`Pickup available: ${item.part} ${item.storeCount} stores`);
    }
    if (previous?.date !== item.date || previous?.label !== item.label || previous?.estimateDays !== item.estimateDays ||
        previous?.ready !== item.ready || previous?.storeCount !== item.storeCount ||
        JSON.stringify(previousIds) !== JSON.stringify(item.eligibleStoreIds)) {
      state.products[item.part] = savedProduct(item);
      // Persist after each successful alert so a later failure cannot resend it.
      await saveState(state);
    }
  }
  if (monitor.daily && (forceDaily || (dailyStatusEnabled && dailyStatusDue(state, checkedAt, dailyStatusHour)))) {
    await sendDiscord({ embeds: [dailyCard(current, postalCode, checkedAt)] }, monitor.channelId);
    state.lastDailyDate = today;
    await saveState(state);
    console.log(`Daily status sent for ${today}`);
  }
  console.log(`Checked ${monitor.name}: ${current.length} variants at ${new Date().toISOString()}`);
}

async function checkAll() {
  let failures = 0;
  for (const monitor of monitors) {
    try {
      await checkOnce(monitor);
    } catch (error) {
      failures++;
      console.error(`${monitor.name} check failed: ${error.message}`);
    }
  }
  if (failures) throw new Error(`${failures} monitor check(s) failed`);
}

async function main() {
  verifyConfig();
  if (process.argv.includes('--dry-run')) {
    for (const monitor of monitors) {
      for (const item of await getShipping(monitor.products)) {
        console.log(`${monitor.name} ${item.capacity} ${item.color}: ${item.label} | รับที่ร้าน ${item.storeCount} สาขา`);
      }
    }
    return;
  }
  if (process.argv.includes('--test-discord')) {
    await sendDiscord(`✅ บอตติดตาม iPhone Duo เชื่อมต่อแล้ว\n${PRODUCT_URL}`, channelId);
    console.log('Test message sent');
    return;
  }
  if (process.argv.includes('--test-pro-max')) {
    const items = await getShipping(PRO_MAX_PRODUCTS);
    await sendDiscord({ embeds: [snapshotCard(items, postalCode, new Date())] }, proMaxChannelId);
    console.log(`iPhone 18 Pro Max snapshot sent: ${items.length} variants`);
    return;
  }
  if (process.argv.includes('--once')) {
    try {
      await checkAll();
    } finally {
      if (redisClient?.isOpen) await redisClient.quit();
    }
    return;
  }
  if (process.argv.includes('--daily-now')) {
    try {
      await checkOnce(monitors[0], true);
    } finally {
      if (redisClient?.isOpen) await redisClient.quit();
    }
    return;
  }
  while (true) {
    try {
      await checkAll();
    } catch (error) {
      console.error(`Check failed: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMinutes * 60_000));
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
