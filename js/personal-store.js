/* Personal Game Companion Store (Local-Only, Schema v2, 05:00 KST Reset, Daily Diff Timeline, Legacy Compatible) */
(function (global) {
  "use strict";

  const STORAGE_KEY = "ap_companion_state_v2";
  const LEGACY_DAY1_KEY = "ap_day1_checked_v1";
  const LEGACY_COUPON_KEY = "ap_used_coupons_v1";
  const SCHEMA_VERSION = 2;
  const DAILY_RESET_HOUR_KST = 5;

  const DEFAULT_DAILY_TASKS = [
    { id: "daily_login", label: "접속 보상 · 우편함 · 출석 수령", note: "매일 05:00 KST 초기화" },
    { id: "daily_missions", label: "일일 임무 완료 및 보상 수령", note: "재화·경험치 핵심 수급" },
    { id: "daily_stamina", label: "체력(성맥) 소모 및 파밍", note: "상한 초과 전 소모" },
    { id: "daily_housing", label: "하우징 키보 배치 · 작물 수확 및 파종", note: "오프라인 생산 유지" },
    { id: "daily_kibo_mut", label: "키보 인자 돌연변이(나선 아이콘) 확인", note: "덮어쓰기 전 확인 필수" }
  ];

  const DEFAULT_WEEKLY_TASKS = [
    { id: "weekly_boss", label: "주간 보스 · 주간 도전 콘텐츠 완료", note: "매주 월요일 05:00 KST 초기화" },
    { id: "weekly_shop", label: "주간 상점 교환 항목 구매", note: "초기화 전 필수 교환 체크" },
    { id: "weekly_events", label: "진행 중 이벤트 마감일 및 미수령 보상 점검", note: "만료 전 수령 확인" }
  ];

  function getKSTParts(nowDate) {
    const d = nowDate || new Date();
    const utcMs = d.getTime() + d.getTimezoneOffset() * 60000;
    const kst = new Date(utcMs + 9 * 3600000);
    return {
      kst,
      year: kst.getFullYear(),
      month: kst.getMonth(),
      day: kst.getDate(),
      hour: kst.getHours(),
      minute: kst.getMinutes(),
      dayOfWeek: kst.getDay()
    };
  }

  function formatYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getTodayKSTDateStr(nowDate) {
    return formatYMD(getKSTParts(nowDate).kst);
  }

  function getCurrentDailyCycleKey(nowDate) {
    const { kst, hour } = getKSTParts(nowDate);
    const shifted = new Date(kst.getTime());
    if (hour < DAILY_RESET_HOUR_KST) shifted.setDate(shifted.getDate() - 1);
    return formatYMD(shifted);
  }

  function getCurrentWeeklyCycleKey(nowDate) {
    const { kst, hour } = getKSTParts(nowDate);
    const shifted = new Date(kst.getTime());
    if (hour < DAILY_RESET_HOUR_KST) shifted.setDate(shifted.getDate() - 1);
    const dow = shifted.getDay();
    const diffToMon = dow === 0 ? -6 : 1 - dow;
    shifted.setDate(shifted.getDate() + diffToMon);
    return `W-${formatYMD(shifted)}`;
  }

  function getNextResetInfo(nowDate) {
    const { kst } = getKSTParts(nowDate);
    const nextDaily = new Date(kst.getTime());
    nextDaily.setHours(DAILY_RESET_HOUR_KST, 0, 0, 0);
    if (kst >= nextDaily) nextDaily.setDate(nextDaily.getDate() + 1);
    const diffMs = Math.max(0, nextDaily - kst);
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return {
      dailyCycleKey: getCurrentDailyCycleKey(nowDate),
      weeklyCycleKey: getCurrentWeeklyCycleKey(nowDate),
      countdownText: `${hrs}시간 ${mins}분 후 05:00 초기화`
    };
  }

  function makeCharId(name) {
    return "char_" + String(name || "").trim().toLowerCase().replace(/\s+/g, "_");
  }

  function createEmptyState() {
    const dailyKey = getCurrentDailyCycleKey();
    const weeklyKey = getCurrentWeeklyCycleKey();
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      resetConfig: {
        dailyResetHourKST: DAILY_RESET_HOUR_KST,
        weeklyResetDayKST: 1
      },
      dailyCycle: { key: dailyKey, checked: {} },
      weeklyCycle: { key: weeklyKey, checked: {} },
      cycleArchive: [],
      day1Checked: {},
      usedCoupons: {},
      profile: {
        accountLevel: null,
        storyProgress: "",
        lightMemory: null,
        starMemory: null,
        redstone: null,
        currentGoal: "",
        memo: "",
        updatedAt: null
      },
      ownedChars: {},
      history: [],
      growthHistory: [],
      lastConsultMemo: ""
    };
  }

  function safeParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return null;
    }
  }

  function normalizeNumberOrNull(val) {
    if (val === "" || val === null || val === undefined) return null;
    const n = Number(val);
    return Number.isFinite(n) ? n : null;
  }

  function migrateAndNormalize(raw) {
    const base = createEmptyState();
    if (!raw || typeof raw !== "object") return base;

    const rawHistory = Array.isArray(raw.history) && raw.history.length
      ? raw.history
      : (Array.isArray(raw.growthHistory) ? raw.growthHistory : []);

    const normalizedHistory = rawHistory.slice(0, 60).map(item => ({
      id: item.id || Date.now(),
      date: item.date || (item.recordedAt ? formatYMD(getKSTParts(new Date(item.recordedAt)).kst) : getTodayKSTDateStr()),
      recordedAt: item.recordedAt || new Date().toISOString(),
      note: String(item.note || "성장 현황 스냅샷"),
      diffs: Array.isArray(item.diffs) ? item.diffs : [],
      snapshot: item.snapshot || {}
    }));

    const merged = {
      ...base,
      schemaVersion: SCHEMA_VERSION,
      updatedAt: raw.updatedAt || base.updatedAt,
      resetConfig: {
        dailyResetHourKST: DAILY_RESET_HOUR_KST,
        weeklyResetDayKST: 1
      },
      dailyCycle: raw.dailyCycle && typeof raw.dailyCycle === "object"
        ? { key: String(raw.dailyCycle.key || base.dailyCycle.key), checked: { ...(raw.dailyCycle.checked || {}) } }
        : base.dailyCycle,
      weeklyCycle: raw.weeklyCycle && typeof raw.weeklyCycle === "object"
        ? { key: String(raw.weeklyCycle.key || base.weeklyCycle.key), checked: { ...(raw.weeklyCycle.checked || {}) } }
        : base.weeklyCycle,
      cycleArchive: Array.isArray(raw.cycleArchive) ? raw.cycleArchive.slice(0, 30) : [],
      day1Checked: raw.day1Checked && typeof raw.day1Checked === "object" ? { ...raw.day1Checked } : {},
      usedCoupons: raw.usedCoupons && typeof raw.usedCoupons === "object" ? { ...raw.usedCoupons } : {},
      profile: {
        accountLevel: normalizeNumberOrNull(raw.profile && raw.profile.accountLevel),
        storyProgress: String((raw.profile && raw.profile.storyProgress) || ""),
        lightMemory: normalizeNumberOrNull(raw.profile && raw.profile.lightMemory),
        starMemory: normalizeNumberOrNull(raw.profile && raw.profile.starMemory),
        redstone: normalizeNumberOrNull(raw.profile && raw.profile.redstone),
        currentGoal: String((raw.profile && raw.profile.currentGoal) || ""),
        memo: String((raw.profile && raw.profile.memo) || ""),
        updatedAt: (raw.profile && raw.profile.updatedAt) || null
      },
      ownedChars: raw.ownedChars && typeof raw.ownedChars === "object" ? { ...raw.ownedChars } : {},
      history: normalizedHistory,
      growthHistory: normalizedHistory,
      lastConsultMemo: String(raw.lastConsultMemo || "")
    };

    return rolloverCyclesIfNeeded(merged);
  }

  function rolloverCyclesIfNeeded(state) {
    const curDaily = getCurrentDailyCycleKey();
    const curWeekly = getCurrentWeeklyCycleKey();

    if (state.dailyCycle.key && state.dailyCycle.key !== curDaily) {
      const doneCount = Object.values(state.dailyCycle.checked || {}).filter(Boolean).length;
      state.cycleArchive.unshift({
        type: "daily",
        cycleKey: state.dailyCycle.key,
        completedCount: doneCount,
        totalCount: DEFAULT_DAILY_TASKS.length,
        archivedAt: new Date().toISOString()
      });
      state.cycleArchive = state.cycleArchive.slice(0, 30);
      state.dailyCycle = { key: curDaily, checked: {} };
    }

    if (state.weeklyCycle.key && state.weeklyCycle.key !== curWeekly) {
      const doneCount = Object.values(state.weeklyCycle.checked || {}).filter(Boolean).length;
      state.cycleArchive.unshift({
        type: "weekly",
        cycleKey: state.weeklyCycle.key,
        completedCount: doneCount,
        totalCount: DEFAULT_WEEKLY_TASKS.length,
        archivedAt: new Date().toISOString()
      });
      state.cycleArchive = state.cycleArchive.slice(0, 30);
      state.weeklyCycle = { key: curWeekly, checked: {} };
    }

    return state;
  }

  function loadState() {
    let raw = null;
    try {
      raw = safeParseJSON(localStorage.getItem(STORAGE_KEY));
    } catch (e) {}

    if (!raw) {
      raw = createEmptyState();
      try {
        const legacyDay1 = safeParseJSON(localStorage.getItem(LEGACY_DAY1_KEY));
        if (legacyDay1 && typeof legacyDay1 === "object") raw.day1Checked = legacyDay1;
      } catch (e) {}
      try {
        const legacyCoupons = safeParseJSON(localStorage.getItem(LEGACY_COUPON_KEY));
        if (legacyCoupons && typeof legacyCoupons === "object") raw.usedCoupons = legacyCoupons;
      } catch (e) {}
      saveState(raw);
      return raw;
    }

    const normalized = migrateAndNormalize(raw);
    saveState(normalized);
    return normalized;
  }

  function saveState(state) {
    state.updatedAt = new Date().toISOString();
    state.growthHistory = state.history || [];
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      localStorage.setItem(LEGACY_DAY1_KEY, JSON.stringify(state.day1Checked || {}));
      localStorage.setItem(LEGACY_COUPON_KEY, JSON.stringify(state.usedCoupons || {}));
    } catch (e) {}
  }

  function computeSnapshotDiffs(prevSnap, nextSnap) {
    if (!prevSnap || typeof prevSnap !== "object") return ["최초 기록"];
    const diffs = [];

    const numFields = [
      ["accountLevel", "계정 Lv", false],
      ["lightMemory", "빛의 기억", true],
      ["starMemory", "별의 기억", true],
      ["redstone", "레드스톤", true]
    ];

    numFields.forEach(([key, label, showDelta]) => {
      const a = prevSnap[key];
      const b = nextSnap[key];
      if (a !== null && a !== undefined && b !== null && b !== undefined && a !== b) {
        const delta = b - a;
        if (showDelta) {
          diffs.push(`${label} ${delta > 0 ? "+" : ""}${delta} (${a}→${b})`);
        } else {
          diffs.push(`${label}.${a}→${b}`);
        }
      } else if ((a === null || a === undefined) && b !== null && b !== undefined) {
        diffs.push(`${label} ${b} 등록`);
      }
    });

    const prevChars = prevSnap.ownedMap || {};
    const nextChars = nextSnap.ownedMap || {};
    Object.entries(nextChars).forEach(([id, cur]) => {
      const old = prevChars[id];
      if (!old) {
        diffs.push(`신규 획득: ${cur.name}`);
      } else {
        if (old.level !== null && cur.level !== null && old.level !== cur.level) {
          diffs.push(`${cur.name} Lv.${old.level}→${cur.level}`);
        } else if (old.level === null && cur.level !== null) {
          diffs.push(`${cur.name} Lv.${cur.level}`);
        }
        if (old.breakthrough !== null && cur.breakthrough !== null && old.breakthrough !== cur.breakthrough) {
          diffs.push(`${cur.name} ${old.breakthrough}돌→${cur.breakthrough}돌`);
        }
      }
    });

    return diffs.length ? diffs : ["수치 변동 없음"];
  }

  function buildCurrentSnapshotObject(state) {
    const ownedMap = {};
    const ownedList = [];
    Object.entries(state.ownedChars || {}).forEach(([id, v]) => {
      if (v && v.owned) {
        ownedMap[id] = { name: v.name || id, level: v.level, breakthrough: v.breakthrough };
        ownedList.push(ownedMap[id]);
      }
    });
    return {
      accountLevel: state.profile.accountLevel,
      storyProgress: state.profile.storyProgress,
      lightMemory: state.profile.lightMemory,
      starMemory: state.profile.starMemory,
      redstone: state.profile.redstone,
      currentGoal: state.profile.currentGoal,
      ownedCount: ownedList.length,
      ownedMap,
      ownedSummary: ownedList.map(c => `${c.name}${c.level !== null ? `(Lv.${c.level})` : ""}`).join(", ")
    };
  }

  function recordGrowthSnapshot(state, noteText) {
    const list = state.history || [];
    const prevSnap = list.length ? list[0].snapshot : null;
    const nextSnap = buildCurrentSnapshotObject(state);
    const diffs = computeSnapshotDiffs(prevSnap, nextSnap);

    const entry = {
      id: Date.now(),
      date: getTodayKSTDateStr(),
      recordedAt: new Date().toISOString(),
      note: String(noteText || "").trim() || "계정 현황 기록",
      diffs,
      snapshot: nextSnap
    };

    state.history = [entry, ...list].slice(0, 60);
    state.growthHistory = state.history;
    saveState(state);
    return entry;
  }

  function getLatestSnapshot(state) {
    const list = state.history || [];
    return list.length ? list[0] : null;
  }

  function buildBackupPayload(state) {
    return {
      app: "azur-promilia-companion",
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: state
    };
  }

  function validateAndImportBackup(jsonText) {
    const parsed = safeParseJSON(jsonText);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("유효한 JSON 파일이 아닙니다.");
    }
    const candidate = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
    if (!candidate.profile && !candidate.dailyCycle && !candidate.day1Checked && !candidate.ownedChars) {
      throw new Error("게임 비서 백업 형식이 아닙니다.");
    }
    const migrated = migrateAndNormalize(candidate);
    saveState(migrated);
    return migrated;
  }

  global.APPersonalStore = {
    SCHEMA_VERSION,
    DAILY_RESET_HOUR_KST,
    DEFAULT_DAILY_TASKS,
    DEFAULT_WEEKLY_TASKS,
    getTodayKSTDateStr,
    getNextResetInfo,
    makeCharId,
    normalizeNumberOrNull,
    loadState,
    saveState,
    buildBackupPayload,
    validateAndImportBackup,
    recordGrowthSnapshot,
    getLatestSnapshot,
    buildCurrentSnapshotObject
  };
})(window);
