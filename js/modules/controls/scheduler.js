/**
 * Scheduler Module
 * ตั้งเวลารัน workflow อัตโนมัติแบบ cron-like ผ่าน chrome.alarms API
 */

Object.assign(Controls, {

  // คอนฟิก scheduler
  SCHEDULE_STORAGE_KEY: 'flowScheduleConfig',
  ALARM_PREFIX: 'flow_schedule_',
  MAX_SCHEDULED_RUNS: 20,

  // รูปแบบ cron ที่รองรับ
  CRON_PRESETS: {
    daily_morning: '0 9 * * *',     // ทุกวัน 9 โมงเช้า
    daily_evening: '0 18 * * *',    // ทุกวัน 6 โมงเย็น
    weekday_only: '0 10 * * 1-5',   // จันทร์-ศุกร์ 10 โมง
    twice_daily: '0 9,18 * * *',    // วันละ 2 ครั้ง
    every_6h: '0 */6 * * *',        // ทุก 6 ชั่วโมง
    weekly_monday: '0 9 * * 1'      // ทุกวันจันทร์ 9 โมง
  },

  /**
   * ตั้งเวลารัน workflow
   * @param {Object} config - ค่าคอนฟิกการตั้งเวลา
   * @param {string} config.name - ชื่อ schedule
   * @param {string} config.expression - cron expression หรือชื่อ preset
   * @param {Object} config.workflowConfig - คอนฟิกที่จะส่งให้ workflow
   * @param {boolean} config.enabled - เปิด/ปิด
   */
  async scheduleRun(config) {
    try {
      console.log('[Controls] Scheduling run:', config);

      // ดึง schedules ที่มีอยู่
      const { flowScheduleConfig } = await chrome.storage.local.get(this.SCHEDULE_STORAGE_KEY);
      const schedules = flowScheduleConfig || [];

      // เช็คจำนวน schedule ไม่เกินลิมิต
      if (schedules.length >= this.MAX_SCHEDULED_RUNS) {
        Helpers.showToast(`ตั้งเวลาได้สูงสุด ${this.MAX_SCHEDULED_RUNS} รายการ`, 'error');
        return { success: false, error: 'Max schedules reached' };
      }

      // สร้าง schedule ID
      const scheduleId = `${this.ALARM_PREFIX}${Date.now()}`;

      // แปลง cron expression เป็น alarm config
      const alarmConfig = this.parseScheduleExpression(config.expression);
      if (!alarmConfig) {
        Helpers.showToast('รูปแบบ cron ไม่ถูกต้อง', 'error');
        return { success: false, error: 'Invalid cron expression' };
      }

      // สร้าง schedule object
      const schedule = {
        id: scheduleId,
        name: config.name || `Schedule ${schedules.length + 1}`,
        expression: config.expression,
        workflowConfig: config.workflowConfig || {},
        enabled: config.enabled !== false,
        createdAt: Date.now(),
        lastRunAt: null,
        runCount: 0,
        nextRunAt: alarmConfig.when
      };

      // ลงทะเบียน chrome alarm
      if (schedule.enabled) {
        await chrome.alarms.create(scheduleId, {
          when: alarmConfig.when,
          periodInMinutes: alarmConfig.periodInMinutes
        });
        console.log('[Controls] Alarm created:', scheduleId, alarmConfig);
      }

      // บันทึกลง storage
      schedules.push(schedule);
      await chrome.storage.local.set({ [this.SCHEDULE_STORAGE_KEY]: schedules });

      console.log('[Controls] Schedule saved:', schedule);
      Helpers.showToast(`ตั้งเวลา "${schedule.name}" สำเร็จ`, 'success');

      return { success: true, schedule };

    } catch (err) {
      console.error('[Controls] Schedule error:', err);
      Helpers.showToast('ไม่สามารถตั้งเวลาได้', 'error');
      return { success: false, error: err.message };
    }
  },

  /**
   * ยกเลิก schedule ที่ระบุ
   * @param {string} id - Schedule ID
   */
  async cancelSchedule(id) {
    try {
      console.log('[Controls] Cancelling schedule:', id);

      // ลบ alarm
      await chrome.alarms.clear(id);

      // ลบออกจาก storage
      const { flowScheduleConfig } = await chrome.storage.local.get(this.SCHEDULE_STORAGE_KEY);
      const schedules = (flowScheduleConfig || []).filter(s => s.id !== id);
      await chrome.storage.local.set({ [this.SCHEDULE_STORAGE_KEY]: schedules });

      console.log('[Controls] Schedule cancelled:', id);
      return { success: true };

    } catch (err) {
      console.error('[Controls] Cancel schedule error:', err);
      Helpers.showToast('ไม่สามารถยกเลิกได้', 'error');
      return { success: false, error: err.message };
    }
  },

  /**
   * ดึงรายการ schedules ทั้งหมด
   */
  async getScheduledRuns() {
    try {
      const { flowScheduleConfig } = await chrome.storage.local.get(this.SCHEDULE_STORAGE_KEY);
      const schedules = flowScheduleConfig || [];

      // อัปเดต nextRunAt จาก chrome alarms
      const alarms = await chrome.alarms.getAll();
      const alarmMap = {};
      alarms.forEach(a => { alarmMap[a.name] = a; });

      // เติมข้อมูล alarm ลงใน schedule
      const enriched = schedules.map(s => ({
        ...s,
        alarmActive: !!alarmMap[s.id],
        nextRunAt: alarmMap[s.id]?.scheduledTime || s.nextRunAt
      }));

      console.log('[Controls] Scheduled runs:', enriched.length);
      return enriched;

    } catch (err) {
      console.error('[Controls] Get schedules error:', err);
      return [];
    }
  },

  /**
   * รัน workflow ตาม alarm ที่ถูกทริกเกอร์
   * @param {Object} alarmInfo - ข้อมูล alarm จาก chrome.alarms.onAlarm
   */
  async executeScheduledRun(alarmInfo) {
    try {
      // เช็คว่าเป็น alarm ของเราไหม
      if (!alarmInfo.name.startsWith(this.ALARM_PREFIX)) {
        return;
      }

      console.log('[Controls] Executing scheduled run:', alarmInfo.name);

      // หา schedule config
      const { flowScheduleConfig } = await chrome.storage.local.get(this.SCHEDULE_STORAGE_KEY);
      const schedules = flowScheduleConfig || [];
      const schedule = schedules.find(s => s.id === alarmInfo.name);

      if (!schedule || !schedule.enabled) {
        console.log('[Controls] Schedule not found or disabled:', alarmInfo.name);
        return;
      }

      // อัปเดตสถิติ
      schedule.lastRunAt = Date.now();
      schedule.runCount++;

      // คำนวณ nextRunAt ถัดไป
      const nextAlarm = this.parseScheduleExpression(schedule.expression);
      if (nextAlarm) {
        schedule.nextRunAt = nextAlarm.when;
      }

      await chrome.storage.local.set({ [this.SCHEDULE_STORAGE_KEY]: schedules });

      // เริ่มรัน workflow
      const result = await Controls.startWorkflow(schedule.workflowConfig);
      console.log('[Controls] Scheduled run completed:', result);

      return result;

    } catch (err) {
      console.error('[Controls] Scheduled run error:', err);
      Helpers.showToast('การรันตามเวลาล้มเหลว', 'error');
    }
  },

  /**
   * แปลง cron expression เป็น chrome alarm config
   * @param {string} expr - cron expression (e.g. "0 9 * * *") หรือชื่อ preset
   * @returns {Object|null} - { when, periodInMinutes }
   */
  parseScheduleExpression(expr) {
    try {
      // เช็คว่าเป็น preset ไหม
      if (this.CRON_PRESETS[expr]) {
        expr = this.CRON_PRESETS[expr];
      }

      const parts = expr.split(' ');
      if (parts.length !== 5) {
        console.log('[Controls] Invalid cron format:', expr);
        return null;
      }

      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // คำนวณเวลาถัดไปจาก cron
      const now = new Date();
      const next = new Date();

      // ตั้งนาทีและชั่วโมง
      next.setMinutes(minute === '*' ? now.getMinutes() : parseInt(minute));
      next.setHours(hour === '*' ? now.getHours() : parseInt(hour));
      next.setSeconds(0);
      next.setMilliseconds(0);

      // ถ้าเวลาผ่านไปแล้ว ให้เลื่อนไปวันถัดไป
      if (next.getTime() <= now.getTime()) {
        next.setDate(next.getDate() + 1);
      }

      // คำนวณ period
      let periodInMinutes = 1440; // ค่าเริ่มต้น = วันละครั้ง
      if (hour.includes('/')) {
        const interval = parseInt(hour.split('/')[1]);
        periodInMinutes = interval * 60;
      }
      if (dayOfWeek !== '*' && dayOfWeek !== '1-5') {
        periodInMinutes = 10080; // สัปดาห์ละครั้ง
      }

      console.log('[Controls] Parsed schedule:', { when: next.getTime(), periodInMinutes });
      return {
        when: next.getTime(),
        periodInMinutes
      };

    } catch (err) {
      console.error('[Controls] Parse cron error:', err);
      return null;
    }
  }

});
