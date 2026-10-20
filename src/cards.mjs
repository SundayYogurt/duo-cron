import { PRODUCT_URL } from './stock.mjs';

const image = 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-duo-finish-unselect-gallery-2-202609?wid=1200&hei=630&fmt=jpeg&qlt=95&.v=1788026660137';
const pink = 0xe92764;

function variantImage(item) {
  if (item.imageUrl) return item.imageUrl;
  const color = item.color === 'สตาร์ไวท์' ? 'star-white' : 'night-sky';
  return `https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/iphone-duo-finish-select-${color}-202609_AV2?wid=240&hei=180&fmt=png-alpha`;
}

function productName(item) {
  return `${item.model ?? 'iPhone Duo'} ความจุ ${item.capacity} สี${item.color}`;
}

function base(item, title, description, checkedAt = new Date()) {
  const url = item.url ?? PRODUCT_URL;
  return {
    title,
    description,
    url,
    color: pink,
    thumbnail: { url: variantImage(item) },
    fields: [
      { name: 'สินค้า', value: productName(item), inline: false },
      { name: 'Price', value: 'ดูราคาใน Apple Store', inline: true },
      { name: 'SKU', value: item.part, inline: true },
    ],
    footer: { text: 'Apple Store ประเทศไทย • จำนวนเครื่องจริงไม่เปิดเผย' },
    timestamp: checkedAt.toISOString(),
  };
}

export function shippingCard(item, previous, postalCode, checkedAt) {
  const url = item.url ?? PRODUCT_URL;
  const card = base(item, '📦 กำหนดส่งออนไลน์เร็วขึ้น', null, checkedAt);
  card.fields.push(
    { name: 'กำหนดส่งเดิม', value: previous.label, inline: true },
    { name: 'กำหนดส่งใหม่', value: item.label, inline: true },
    { name: 'พื้นที่จัดส่ง', value: postalCode, inline: true },
    { name: 'Product URL', value: `[ดูใน Apple Store](${url})`, inline: false },
  );
  return card;
}

export function pickupCard(item, storeName, postalCode, checkedAt) {
  const url = item.url ?? PRODUCT_URL;
  const title = storeName ? `🏬 Apple TH ${storeName}` : '🏬 Apple Store ไทย';
  const card = base(item, title, 'พร้อมรับสินค้าที่ร้าน', checkedAt);
  card.fields.push(
    { name: 'Stock', value: 'พร้อมรับ (ไม่แสดงจำนวนเครื่อง)', inline: true },
    { name: 'Store', value: storeName ?? 'Apple Store ไทย', inline: true },
    { name: 'จำนวนสาขาที่พร้อมรับ', value: `${item.storeCount} สาขา`, inline: true },
    { name: 'รหัสไปรษณีย์ที่ค้นหา', value: postalCode, inline: true },
    { name: 'กำหนดส่งออนไลน์', value: item.label, inline: true },
    { name: 'Product URL', value: `[ดูใน Apple Store](${url})`, inline: false },
  );
  return card;
}

export function snapshotCard(items, postalCode, checkedAt) {
  const first = items[0];
  const model = first?.model ?? 'iPhone Duo';
  return {
    title: `🔎 ทดสอบอ่านสถานะ ${model}`,
    description: `ข้อมูลจริงจาก Apple Store ประเทศไทย • รหัสไปรษณีย์ ${postalCode}`,
    url: first?.url ?? PRODUCT_URL,
    color: pink,
    thumbnail: { url: first?.imageUrl ?? image },
    fields: items.map(item => ({
      name: `${item.capacity} สี${item.color}`,
      value: `${item.label} • พร้อมรับ ${item.storeCount} สาขา\nSKU: ${item.part}`,
      inline: true,
    })),
    footer: { text: 'ข้อความทดสอบด้วยมือ • จำนวนสาขา ไม่ใช่จำนวนเครื่อง' },
    timestamp: checkedAt.toISOString(),
  };
}

export function dailyCard(items, postalCode, checkedAt) {
  const available = items.filter(item => item.storeCount > 0).length;
  return {
    title: '📅 สรุป iPhone Duo วันนี้',
    description: available
      ? `มี ${available} รุ่นย่อยที่ Apple แสดงว่าพร้อมรับที่ร้าน`
      : 'วันนี้ยังไม่มีรุ่นย่อยที่ Apple แสดงว่าพร้อมรับที่ร้าน',
    url: PRODUCT_URL,
    color: available ? pink : 0x777777,
    thumbnail: { url: image },
    fields: items.map(item => ({
      name: `${item.capacity} สี${item.color}`,
      value: `จัดส่ง: ${item.label}\nรับที่ร้าน: ${item.storeCount} สาขา\nSKU: ${item.part}`,
      inline: true,
    })),
    footer: { text: `รหัสไปรษณีย์ ${postalCode} • จำนวนสาขา ไม่ใช่จำนวนเครื่อง` },
    timestamp: checkedAt.toISOString(),
  };
}
