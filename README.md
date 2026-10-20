# iPhone Duo และ iPhone 18 Pro Max → Discord บน Render

บอตเช็ก iPhone Duo **8 รุ่นย่อย** และ iPhone 18 Pro Max **16 รุ่นย่อย** จาก Apple Store ประเทศไทยสำหรับรหัสไปรษณีย์ **10330** ทุก 1 นาที โดยแจ้ง Duo และ Pro Max ลงคนละช่อง Discord การ์ดมีรูปสินค้า รุ่น สี ความจุ SKU และลิงก์ บอตแจ้ง **เฉพาะเมื่อมีอัปเดต**: กำหนดจัดส่งเร็วขึ้น หรือมีสาขาใหม่ที่พร้อมรับสินค้า หากข้อมูลไม่เปลี่ยน บอตจะเงียบ กำหนดจัดส่งไม่ใช่วันที่พัสดุถึงบ้าน

## ก่อน deploy

1. สร้าง Application ใน [Discord Developer Portal](https://discord.com/developers/applications) แล้วคัดลอก **Bot Token** จากหน้า Bot เก็บไว้เป็นความลับ
2. ติดตั้งบอตในเซิร์ฟเวอร์ผ่านหน้า Installation/OAuth2 โดยให้สิทธิ์ **View Channels** และ **Send Messages** ในทั้งสองช่องแจ้งเตือน บอตนี้ใช้ HTTP API เพื่อส่งข้อความ ไม่ต้องเปิด Message Content Intent
3. เปิด Discord **User Settings → Advanced → Developer Mode** คลิกขวาช่อง Duo แล้วเลือก **Copy Channel ID** ช่อง Pro Max ใช้ ID `1561969840204283965` ที่ตั้งไว้ใน `render.yaml`
4. แตกไฟล์ ZIP และอัปโหลด **เนื้อหาข้างใน** ไปยังราก GitHub repository ต้องมี `render.yaml` ที่ราก repository ไม่ต้องอัปโหลดไฟล์ `.env` หรือโทเคน

## สร้างบริการบน Render

1. เข้า [Render Dashboard](https://dashboard.render.com/) เลือก **New → Blueprint** และเชื่อม GitHub repository ที่เพิ่งอัปโหลด
2. ตรวจรายการที่จะสร้างก่อนกดยืนยัน: Cron Job `apple-duo-discord-check` (กำหนด `* * * * *`) และ Key Value `apple-duo-state` (แผนชำระเงิน 256 MB พร้อมเก็บข้อมูลถาวร)
3. กรอก `DISCORD_BOT_TOKEN` และ `DISCORD_CHANNEL_ID` ของช่อง Duo เมื่อ Render ถาม ส่วน `DISCORD_PRO_MAX_CHANNEL_ID=1561969840204283965` และรหัสไปรษณีย์ `10330` กำหนดไว้แล้วใน `render.yaml`
4. หลัง deploy สำเร็จ เปิด Cron Job → **Runs → Trigger Run** รอบแรกจะบันทึกสถานะเป็นค่าเริ่มต้นโดยไม่ส่งข้อความ ดู log ว่าเช็ก Duo ครบ 8 และ Pro Max ครบ 16 รุ่นย่อย จากนั้น Cron Job จะเช็กทุก 1 นาที และแจ้งเมื่อมีการเปลี่ยนแปลงตามเกณฑ์ข้างต้น

สรุปรายวันอัตโนมัติปิดไว้ (`DAILY_STATUS_ENABLED=false`) เพื่อไม่ให้ส่งข้อความเมื่อไม่มีอัปเดต หากต้องการเปิดภายหลัง ให้ตั้งเป็น `true` และเลือก `DAILY_STATUS_HOUR` เป็นเลขชั่วโมง **0–23 ตามเวลาไทย**

สถานะวันที่เก็บใน Render Key Value เพราะ Cron Job ไม่มีดิสก์ถาวร การเช็กแต่ละรอบจะเริ่มและจบเอง ถ้ารอบก่อนยังทำงานอยู่ Render จะเลื่อนรอบถัดไป จึงไม่รับประกันระยะห่างตรง 1 นาทีเสมอ

**ค่าใช้จ่าย:** Render ระบุว่า Cron Job คิดค่าคอมพิวต์ตามเวลารัน โดยมีขั้นต่ำ US$1 ต่อเดือนต่อบริการ และ Key Value แบบเก็บข้อมูลถาวรเป็นแผนชำระเงิน ตรวจราคารวมที่ Render แสดงก่อนยืนยันสร้างบริการ

## ทดสอบในเครื่อง (ทางเลือก)

ต้องมี Node.js 20 ขึ้นไป เริ่มจากทดสอบอ่านข้อมูล Apple โดยไม่ต้องใช้โทเคน:

```powershell
node src/index.mjs --dry-run
```

หากต้องการทดสอบการส่ง Discord คัดลอก `.env.example` เป็น `.env` ใส่โทเคนและ Channel ID ในไฟล์นี้บนเครื่องเท่านั้น จากนั้นรัน:

```powershell
npm ci
node --env-file=.env src/index.mjs --test-discord
node --env-file=.env src/index.mjs --test-pro-max
node --env-file=.env src/index.mjs --once
node --env-file=.env src/index.mjs --daily-now
```

`--test-pro-max` ส่งสถานะจริงทั้ง 16 รุ่นย่อยไปยังช่อง Pro Max หนึ่งครั้งเพื่อทดสอบ `--daily-now` สั่งส่งสรุป Duo ทันทีด้วยมือ แม้สรุปรายวันอัตโนมัติจะปิดอยู่ ส่วนการรันต่อเนื่องในเครื่อง (`node --env-file=.env src/index.mjs`) เช็กทั้งสองรุ่นทุก 1 นาทีตามค่าเริ่มต้น

หลังสร้าง `.env` แล้ว ใช้ `npm start` เพื่อรันต่อเนื่องในเครื่องได้เช่นกัน สคริปต์นี้โหลด `.env` ให้อัตโนมัติ กด `Ctrl+C` เพื่อหยุด

## ข้อจำกัด

- Apple ใช้ endpoint นี้บนหน้าร้านของตน แต่ไม่มีเอกสารสาธารณะสำหรับการเรียกจากบอต หาก Apple เปลี่ยนรูปแบบข้อมูล งานจะขึ้น error แทนการแจ้งผิด
- วันที่ที่ Apple แสดงเป็นประมาณการและอาจเปลี่ยนอีก การแจ้งเตือนไม่ได้จองสินค้า
- ค่า `รับที่ร้าน X สาขา` คือ **จำนวนสาขาที่ Apple แสดงว่าพร้อมรับสินค้า** สำหรับการค้นหาด้วยรหัสไปรษณีย์ 10330 ไม่ใช่จำนวนเครื่องที่เหลืออยู่ Apple ไม่ส่งจำนวนเครื่องจริงในข้อมูลที่บอตอ่านได้
- ถ้า Apple ระบุรหัสสาขาที่พร้อมรับ บอตจะถามชื่อสาขาและแสดงบนการ์ดแจ้งเตือน หาก Apple ไม่ส่งชื่อสาขาหรือการถามชื่อสาขาล้มเหลว การ์ดจะแสดงเพียงจำนวนสาขา ไม่เดาชื่อ Central World หรือ Iconsiam
- ถ้าเชื่อม repository เดียวกันกับ GitHub Actions เวอร์ชันเก่าที่เคยตั้งไว้ ให้ปิด workflow นั้นเพื่อไม่ให้เช็กและแจ้งสองชุด แพ็ก Render นี้ไม่มี workflow ดังกล่าว

อ้างอิง: [Render Cron Jobs](https://render.com/docs/cronjobs), [Render Key Value](https://render.com/docs/key-value), [Render Blueprint](https://render.com/docs/blueprint-spec), [Discord bot authorization](https://discord.com/developers/docs/topics/oauth2)
