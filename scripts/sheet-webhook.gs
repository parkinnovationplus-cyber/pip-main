/**
 * Google Apps Script — Web App รับ POST แล้ว append แถวใน Google Sheet
 *
 * การตั้งค่า:
 * 1. สร้าง Google Sheet ใหม่ (หรือใช้ของเดิม) แล้วผูกสคริปต์นี้กับสเปรดชีต (Extensions > Apps Script)
 * 2. วางโค้ดนี้ใน editor แล้วบันทึก
 * 3. Deploy > New deployment > Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone (หรือตามนโยบายองค์กร)
 * 4. คัดลอก Web App URL ไปใส่ใน Cloudflare Worker env GOOGLE_SHEET_WEBHOOK
 *
 * คอลัมน์ที่ append: timestamp | userMessage | botReply | sessionId
 * (แถวแรกของชีตควรเป็นหัวตาราง — สร้างมือหรือรัน appendHeaderRow() ครั้งเดียว)
 */

function doPost(e) {
  try {
    const raw = e.postData && e.postData.contents ? e.postData.contents : "{}";
    const data = JSON.parse(raw);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      data.timestamp || "",
      data.userMessage || "",
      data.botReply || "",
      data.sessionId || "",
    ]);

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ success: false, error: String(err) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/** รันครั้งเดียวจาก editor เพื่อสร้างแถวหัวตาราง */
function appendHeaderRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  sheet.appendRow(["timestamp", "userMessage", "botReply", "sessionId"]);
}
