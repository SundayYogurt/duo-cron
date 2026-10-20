export const PRODUCTS = [
  ['MK2D4ZP/A', '256GB', 'สตาร์ไวท์'],
  ['MK2E4ZP/A', '256GB', 'ไนท์สกาย'],
  ['MK2F4ZP/A', '512GB', 'สตาร์ไวท์'],
  ['MK2G4ZP/A', '512GB', 'ไนท์สกาย'],
  ['MK2H4ZP/A', '1TB', 'สตาร์ไวท์'],
  ['MK2J4ZP/A', '1TB', 'ไนท์สกาย'],
  ['MK2K4ZP/A', '2TB', 'สตาร์ไวท์'],
  ['MK2L4ZP/A', '2TB', 'ไนท์สกาย'],
].map(([part, capacity, color]) => ({ part, capacity, color }));

export const PRODUCT_URL = 'https://www.apple.com/th/shop/buy-iphone/iphone-duo';
export const PRO_MAX_URL = 'https://www.apple.com/th/shop/buy-iphone/iphone-18-pro';
export const PRO_MAX_PRODUCTS = [
  ['MJXQ4ZP/A', '256GB', 'เบอร์กันดี'], ['MJXR4ZP/A', '256GB', 'ธารน้ำแข็ง'],
  ['MJXP4ZP/A', '256GB', 'เงิน'], ['MJXN4ZP/A', '256GB', 'ดำ'],
  ['MJXV4ZP/A', '512GB', 'เบอร์กันดี'], ['MJXW4ZP/A', '512GB', 'ธารน้ำแข็ง'],
  ['MJXU4ZP/A', '512GB', 'เงิน'], ['MJXT4ZP/A', '512GB', 'ดำ'],
  ['MJY04ZP/A', '1TB', 'เบอร์กันดี'], ['MJY14ZP/A', '1TB', 'ธารน้ำแข็ง'],
  ['MJXY4ZP/A', '1TB', 'เงิน'], ['MJXX4ZP/A', '1TB', 'ดำ'],
  ['MJY44ZP/A', '2TB', 'เบอร์กันดี'], ['MJY54ZP/A', '2TB', 'ธารน้ำแข็ง'],
  ['MJY34ZP/A', '2TB', 'เงิน'], ['MJY24ZP/A', '2TB', 'ดำ'],
].map(([part, capacity, color]) => ({
  part, capacity, color, model: 'iPhone 18 Pro Max', url: PRO_MAX_URL,
  imageUrl: 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-18-pro-model-unselect-gallery-1-202609?wid=1200&hei=630&fmt=jpeg&qlt=95&.v=1786041739689',
}));

const MONTHS = {
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4,
  'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8,
  'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};

export function parseShipDate(label, now = new Date()) {
  const match = label?.match(/(\d{1,2})\s*(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)/u);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2]];
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() + 1]) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    // Apple omits the year. Allow a recent past date because ship estimates
    // can briefly lag the current day when the store updates its catalog.
    if (date >= new Date(today.getTime() - 7 * 86_400_000)) {
      return date.toISOString().slice(0, 10);
    }
  }
  return null;
}

function parseRelativeDays(label) {
  const match = label?.match(/(\d+)\s*(?:[-–]\s*(\d+)\s*)?(วัน|สัปดาห์)/u);
  if (!match) return null;
  return Number(match[2] ?? match[1]) * (match[3] === 'สัปดาห์' ? 7 : 1);
}

export function extractShipping(data, now = new Date(), products = PRODUCTS) {
  if (String(data?.head?.status) !== '200' || !Array.isArray(data?.body?.content)) {
    throw new Error('Apple returned an unexpected availability response');
  }
  const byPart = new Map(data.body.content.map(item => [item.partNumber, item]));
  return products.map(product => {
    const item = byPart.get(product.part);
    if (!item) throw new Error(`Apple did not return ${product.part}`);
    const label = item.deliveryMessage?.deliveryOptionMessages?.[0]?.displayName ?? null;
    const ready = /พร้อมขาย/u.test(label ?? '');
    const date = ready ? bangkokClock(now).date : parseShipDate(label, now);
    const estimateDays = ready ? 0 : (date ? null : parseRelativeDays(label));
    if (!date && estimateDays === null) throw new Error(`Cannot read shipping estimate for ${product.part}: ${label ?? 'missing'}`);
    const storeCount = item.partAvailableStoresCount;
    if (!Number.isInteger(storeCount) || storeCount < 0) {
      throw new Error(`Cannot read available store count for ${product.part}`);
    }
    const eligibleStoreIds = typeof item.eligibleStores === 'string'
      ? [...new Set(item.eligibleStores.split(',').map(id => id.trim()).filter(Boolean))]
      : [];
    return { ...product, date, label, estimateDays, ready, storeCount, eligibleStoreIds };
  });
}

export function improved(previous, current, now = new Date()) {
  if (!previous?.label && !previous?.date && !Number.isFinite(previous?.estimateDays)) return false;
  if (current.ready && !previous.ready) return true;
  if (previous.ready) return false;
  if (previous.date && current.date) return current.date < previous.date;
  const today = bangkokClock(now).date;
  const daysFromDate = date => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  const oldDays = Number.isFinite(previous.estimateDays) ? previous.estimateDays : (previous.date ? daysFromDate(previous.date) : null);
  const newDays = Number.isFinite(current.estimateDays) ? current.estimateDays : (current.date ? daysFromDate(current.date) : null);
  return oldDays !== null && newDays !== null && newDays < oldDays;
}

export function bangkokClock(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(now).filter(part => part.type !== 'literal').map(part => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

export function dailyStatusDue(state, now, hour, force = false) {
  const clock = bangkokClock(now);
  return force || (state.lastDailyDate !== clock.date && clock.hour >= hour);
}
