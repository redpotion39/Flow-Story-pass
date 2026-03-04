// Flow Story - Configuration
// ตั้งค่า delay แบบสุ่ม (มิลลิวินาที)

const APP_CONFIG = {
  // ==================== Debug/Test Buttons ====================
  // เปิด/ปิด ปุ่มทดสอบในหน้า AI Generator
  showTestButtons: false,  // true = แสดงปุ่มทดสอบ, false = ซ่อน
};

const CONFIG = {
  // ==================== Pin Cart Delays ====================
  delays: {
    // Step 1 -> Step 2: หลังคลิกปุ่มปักตะกร้า รอ modal เปิด
    step1ToStep2: { min: 400, max: 600 },

    // Step 2 -> Step 3: หลังคลิกยืนยัน รอหน้ากรอก Product ID
    step2ToStep3: { min: 700, max: 1000 },

    // Step 3 -> Step 4: หลังกรอก Product ID รอก่อนกดค้นหา
    step3ToStep4: { min: 200, max: 400 },

    // Step 4 -> Step 5: หลังกดค้นหา รอผลลัพธ์โหลด
    step4ToStep5: { min: 1200, max: 2000 },

    // Step 5 -> Step 6: หลังเลือกสินค้า รอก่อนกด Next
    step5ToStep6: { min: 400, max: 600 },

    // Step 6 -> Step 7: หลังกด Next รอหน้ากรอกชื่อตะกร้า
    step6ToStep7: { min: 800, max: 1200 },

    // Step 7 -> Step 8: หลังกรอกชื่อตะกร้า รอก่อนกดยืนยัน
    step7ToStep8: { min: 400, max: 600 }
  },

  // ==================== Fill Caption Delays ====================
  captionDelays: {
    // รอหลัง focus editor
    afterFocus: { min: 80, max: 150 }
  },

  // ==================== Upload Delays ====================
  uploadDelays: {
    // รอหลังคลิก upload area
    afterClickUploadArea: { min: 400, max: 600 }
  }
};

// ฟังก์ชันสุ่ม delay
function getRandomDelay(delayConfig) {
  const { min, max } = delayConfig;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ฟังก์ชัน sleep แบบสุ่ม
function randomSleep(delayConfig) {
  const delay = getRandomDelay(delayConfig);
  return new Promise(r => setTimeout(r, delay));
}
