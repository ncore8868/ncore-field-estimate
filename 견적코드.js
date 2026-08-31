/**
 * N-CORE 현장 견적 + 안전동의서 통합 Apps Script v24
 *
 * v24 추가 (2026-08-26)
 * - 추가견적: 완료된 견적에 추가 공사가 생기면 원 번호에 -A1, -A2 를 붙여 발급합니다.
 *   · action=addonBaseList  : 추가견적을 붙일 수 있는 현장 목록
 *   · action=issueAddonCode : 원 견적번호로 다음 추가견적 번호 발급
 *   추가견적은 원 현장과 같은 현장 폴더를 씁니다.
 * - 서명 현황: action=signStatusList
 * - 견적대장에 원견적번호 / 추가차수 열 추가
 *
 * v23 추가 (2026-08-25)
 * - 고객 폰 서명 (sign.html)
 *   · action=signToken  : 견적번호로 서명 링크 토큰을 발급합니다.
 *   · action=signDoc    : 토큰이 맞으면 견적서 원본을 내려줍니다.
 *   · action=saveSignature (POST) : 고객 서명본을 받아 드라이브에 보관합니다.
 * - 견적대장에 견적서데이터 / 고객서명 열 추가
 * - SIGN_SECRET 은 반드시 회사만 아는 값으로 바꿔 주세요.
 *
 * v22 추가
 * - 견적대장에 공사기간 / 서명상태 / 서명일시 / 서명방식 / 서명본링크 열 추가
 * - 견적서 서명본 저장 (action=saveEstimateFile, kind=signed)
 *   서명본도 발송본과 같은 01_견적서 폴더에 보관하고 파일명 뒤에 _서명본을 붙입니다.
 * - 서명이 끝나면 계약상태를 '견적서 서명완료'로 채워 미계약 목록에서 빠지게 합니다.
 * - getFieldReportList_ 가 참조하던 LEDGER_COL.locStatus 누락을 바로잡았습니다.
 *
 * v21 이하 기존 기능(로그인, 견적 저장, 발송이력, 현장사진, 실제원가,
 * 과거현장 조회, 미계약 현장, 안전동의서)은 그대로 유지됩니다.
 */

// 견적 자료가 쌓이는 스프레드시트.
// 편집기 [프로젝트 설정] > [스크립트 속성] 에 SHEET_ID 로 넣어주세요.
const SPREADSHEET_ID = '';

// 사람 정보(이름·PIN·등급)를 가져올 워크보드 스프레드시트.
// 스크립트 속성 WORKBOARD_ID 로 넣어주세요.
// 담당자를 이 앱에서 따로 관리하지 않고 워크보드 '직원' 시트 한 곳만 봅니다.
const WORKBOARD_STAFF_SHEET = '직원';

// PIN 을 되돌릴 수 없는 형태로 바꿀 때 쓰는 값입니다.
// ★ 워크보드의 SALT 와 반드시 같아야 합니다. 다르면 PIN 이 전부 안 맞습니다.
const WORKBOARD_SALT = 'ncore-workboard-2026';

// 워크보드 권한등급을 이 앱의 역할로 바꾸는 표
const GRADE_ROLE = { 1: '현장', 2: '사무실', 3: '사무실', 9: '관리자' };
const ESTIMATE_SHEET_NAME = '현장견적_수신';
const LEDGER_SHEET_NAME = '견적대장';
const SEND_LOG_SHEET_NAME = '발송이력';
const SAFETY_LOG_SHEET_NAME = '안전동의서_기록';

/* =========================================================
   드라이브 폴더  (2026-08-29 통일)

   현장 하나에 관한 모든 자료는 그 현장 폴더 안에 모입니다. 예외를 두지 않습니다.
   01_현장 바로 아래에는 현장 폴더(고객명_yyyyMMdd)만 둡니다.
   연도 폴더도, 낱개 파일도 만들지 않습니다.

   ※ 예전에는 SAFETY_FOLDER_ID · ESTIMATE_FOLDER_ID · SITE_ROOT_FOLDER_ID
      셋이 전부 같은 01_현장 을 가리켜서, 견적서가 연·월 폴더와 현장 폴더
      두 곳으로 갈라져 쌓였습니다. 이제 폴더 상수는 이 하나뿐입니다.
   ========================================================= */
const SITE_ROOT_FOLDER_ID = '1aDNKQwWEFBb5PsFM4FvKgjWdFHwHLji1';   // 공유 드라이브 UNION ONE > 01_현장
const SITE_ROOT_FOLDER_NAME = '01_현장';

/* 현장 폴더 안의 칸. 이것이 표준 구조입니다.
   ★ 한꺼번에 만들지 않습니다. 쓰이는 칸 하나만 그때 만듭니다(계정 안전 규칙).
      08_출퇴근사진 은 출퇴근 앱이, 나머지는 이 앱이 필요할 때 만듭니다. */
const SITE_SUBFOLDERS = [
  '00_작업파일', '01_견적서', '02_계약서', '03_현장사진',
  '04_공사중', '05_완료사진', '06_폐기물', '07_기타자료',
  '08_출퇴근사진', '09_동의서'
];
const SITE_PHOTO_FOLDER = '03_현장사진';
const SITE_ESTIMATE_FOLDER = '01_견적서';
const SITE_CONTRACT_FOLDER = '02_계약서';
const SITE_CONSENT_FOLDER = '09_동의서';

/* 현장을 끝내 알 수 없을 때만 쓰는 예외 자리입니다.
   01_현장 / _현장미지정 / 01_견적서 · 09_동의서
   파일을 잃지 않으려고 두는 것이지 정상 경로가 아닙니다.
   여기에 파일이 쌓이면 사람이 어느 현장인지 정해서 옮겨야 합니다. */
const SITE_UNKNOWN_FOLDER = '_현장미지정';
const START_COL = 3;
const EXCEL_API_KEY = 'ncore8868';
const CODE_PREFIX = 'NC';

// 서명 링크 위조를 막는 비밀키입니다.
// 견적번호가 NC-날짜-순번 규칙이라 이 값이 없으면 남의 견적서가 열립니다.
//
// ※ 이미 회사 전용 값이 들어가 있습니다. 그대로 두시면 됩니다.
//    바꾸면 이미 고객에게 보낸 서명 링크가 전부 열리지 않게 됩니다.
//    이 파일을 남에게 보여줄 일이 있으면 이 줄만 가려 주세요.
const SIGN_SECRET = 'ncore-cVlQeZz4t3QoRKsa3H4BRal2';
const SIGN_TOKEN_LENGTH = 12;

const ESTIMATE_HEADERS = [
  '코드번호','작성자','고객명','연락처','현장주소','구분','공사항목',
  '단위','수량','단가','금액','총금액','비고'
];

const LEDGER_HEADERS = [
  '견적번호','발급일시','저장일시','담당자','고객명','연락처','현장주소',
  '업종','철거평수','작업층','엘리베이터',
  '위치상태','위도','경도','위치오차(m)','위치확인시각',
  '총금액','철거','원상복구','장비','폐기물','보양/청소','선택항목수',
  '발송상태','발송일시','계약상태','비고',
  '예상인력비','예상장비비','예상폐기물비','예상기타비','예상총원가',
  '실제투입인원','실제인력비','실제장비비','실제폐기물비','실제기타비','실제총원가',
  '최종계약금액','실제마진','마진율(%)','원가차이','완료입력자','완료입력일시','완료메모',
  '견적서링크','원가총액','수익금','수익률(%)','진행상태','현장견적데이터',
  '사진수','현장폴더','현장폴더ID',
  '공사기간','서명상태','서명일시','서명방식','서명본링크',
  '견적서데이터','고객서명',
  '원견적번호','추가차수'
];

// 견적대장 열 번호 (1부터). 열을 옮기면 여기도 같이 고쳐야 합니다.
const LEDGER_COL = {
  code: 1, savedAt: 3, staff: 4, customerName: 5, phone: 6, address: 7,
  industry: 8, pyeong: 9, floorLabel: 10, elevator: 11,
  locStatus: 12, lat: 13, lng: 14, accuracy: 15, locCheckedAt: 16,
  totalAmount: 17, sendStatus: 24, sentAt: 25, contractStatus: 26,
  estLabor: 28, estEquip: 29, estWaste: 30, estEtc: 31, estTotal: 32,
  actWorkers: 33, actLabor: 34, actEquip: 35, actWaste: 36, actEtc: 37, actTotal: 38,
  contractAmount: 39, margin: 40, marginRate: 41, costDiff: 42,
  doneBy: 43, doneAt: 44, doneMemo: 45, fileUrl: 46,
  costTotal: 47, profit: 48, profitRate: 49, progress: 50, reportData: 51,
  photoCount: 52, siteFolderUrl: 53, siteFolderId: 54,
  workDays: 55, signStatus: 56, signedAt: 57, signMethod: 58, signedFileUrl: 59,
  docData: 60, signImage: 61,
  baseCode: 62, addonSeq: 63
};

const PROGRESS_FIELD = '현장견적 접수';
const PROGRESS_FINAL = '견적작성 완료';
let requestSpreadsheet = null;
let requestWorkboardSpreadsheet = null;

/* 요청 하나 안에서 같은 시트를 여러 번 잡지 않게 담아둡니다 (2026-08-28).
   getLedgerSheet_() 은 부를 때마다 머리글 한 줄을 다시 읽고 있었습니다.
   견적 한 건을 저장하면 이 함수가 서너 번 불리므로 그만큼 구글에 헛되이 물었습니다.
   ★ 요청이 끝나면 사라지는 값이라 낡은 값이 남을 일이 없습니다. */
let requestSheets = {};
let requestLedgerValues = null;
let requestStaffRows = null;      // 워크보드 명부 — 요청당 한 번만 읽는다
let requestSiteFolders = {};      // 현장 폴더 — 견적번호별로 요청당 한 번만 찾는다

/* 담당자 이름 목록만 잠깐 담아둡니다 (2026-08-28).
   앱을 열 때마다 워크보드 스프레드시트를 여느라 1~2초를 썼습니다.

   ★ 이름·직급만 담습니다. PIN 해시와 재직상태 판정은 담지 않습니다.
     로그인은 언제나 시트에서 새로 읽습니다 — 퇴사 처리한 사람이
     담아둔 값 때문에 들어오는 일이 있으면 안 됩니다.
   ★ EST_STAFF_CACHE_ON = false 로 옛 방식으로 즉시 돌아갑니다. */
const EST_STAFF_CACHE_ON = true;
const EST_STAFF_CACHE_KEY = 'estimate_staff_names_v1';
const EST_STAFF_CACHE_SECONDS = 600;

const SEND_HEADERS = [
  '발송일시','견적번호','회차','담당자','고객명','발송번호',
  '위치상태','위도','경도','위치오차(m)','비고'
];

const SAFETY_HEADERS = [
  '작성일자','제출일시','담당자','성명','연락처','문서번호','PNG 링크','PDF 링크',
  '현장견적번호','현장명'
];

function doGet(e) {
  requestSpreadsheet = null;
  requestWorkboardSpreadsheet = null;
  requestSheets = {};
  requestLedgerValues = null;
  requestStaffRows = null;
  requestSiteFolders = {};
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || '';
  const callback = params.callback || '';

  try {
    if (action === 'staffList') {
      return outputJson({ ok: true, staff: getActiveStaffNames() }, callback);
    }

    if (action === 'login') {
      return outputJson(validateStaffPin(params.pin), callback);
    }

    if (action === 'issueCode') {
      return outputJson(issueEstimateCode_(params.staffName), callback);
    }

    if (action === 'logSend') {
      return outputJson(logEstimateSend_(params), callback);
    }

    if (action === 'pendingList') {
      return outputJson(getPendingList_(params), callback);
    }

    if (action === 'saveActual') {
      return outputJson(saveActualCost_(params), callback);
    }

    if (action === 'siteWork') {
      return outputJson(siteWork_(params), callback);
    }

    if (action === 'lookupSites') {
      return outputJson(lookupSites_(params), callback);
    }

    if (action === 'siteList') {
      return outputJson(getSiteList_(params), callback);
    }

    if (action === 'fieldReportList') {
      return outputJson(getFieldReportList_(params), callback);
    }

    if (action === 'fieldReport') {
      return outputJson(getFieldReport_(params), callback);
    }

    if (action === 'myReports') {
      return outputJson(getMyReports_(params), callback);
    }

    if (action === 'unclaimedList') {
      return outputJson(getUnclaimedList_(params), callback);
    }

    if (action === 'signToken') {
      return outputJson(getSignToken_(params), callback);
    }

    if (action === 'signDoc') {
      return outputJson(getSignDoc_(params), callback);
    }

    if (action === 'signStatusList') {
      return outputJson(getSignStatusList_(params), callback);
    }

    if (action === 'addonBaseList') {
      return outputJson(getAddonBaseList_(params), callback);
    }

    if (action === 'issueAddonCode') {
      return outputJson(issueAddonCode_(params), callback);
    }

    if (action === 'findByPhone') {
      return outputJson(findByPhone_(params), callback);
    }

    if (action === 'excel') {
      if ((params.key || '') !== EXCEL_API_KEY) {
        return ContentService.createTextOutput('INVALID_KEY')
          .setMimeType(ContentService.MimeType.TEXT);
      }

      const sheet = getEstimateSheet();
      ensureEstimateHeader(sheet);
      const lastRow = Math.max(sheet.getLastRow(), 1);
      const values = sheet.getRange(1, START_COL, lastRow, ESTIMATE_HEADERS.length).getDisplayValues();
      const csv = '\uFEFF' + values.map(row => row.map(csvEscape).join(',')).join('\r\n');

      return ContentService.createTextOutput(csv)
        .setMimeType(ContentService.MimeType.CSV);
    }

    /* ★★ 모르는 action 은 실패로 돌려줍니다 (v54).
       예전에는 여기서 무조건 { ok: true, message: 'Apps Script is running' } 을
       돌려줬습니다. 그래서 화면이 없는 통로를 불러도 **성공으로 보였고**,
       findByPhone 이 몇 달 동안 조용히 아무 일도 안 하고 있었습니다.
       오타나 빠뜨린 통로가 앞으로는 바로 드러납니다.

       ★ 살아있는지 확인하는 길은 남겨 둡니다 —
         action 이 아예 없거나 'ping' 이면 지금처럼 ok: true 입니다.
         브라우저로 배포 주소를 그냥 열었을 때 쓰는 길입니다. */
    if (!action || action === 'ping') {
      return outputJson({
        ok: true,
        app: 'N-CORE 현장 견적 + 안전동의서',
        version: 'v24',
        message: 'Apps Script is running'
      }, callback);
    }

    return outputJson({
      ok: false,
      code: 'UNKNOWN_ACTION',
      message: '알 수 없는 요청입니다: ' + action
    }, callback);
  } catch (err) {
    return outputJson({ ok: false, message: err && err.message ? err.message : String(err) }, callback);
  }
}

function doPost(e) {
  requestSpreadsheet = null;
  requestWorkboardSpreadsheet = null;
  requestSheets = {};
  requestLedgerValues = null;
  requestStaffRows = null;
  requestSiteFolders = {};
  try {
    const payload = parsePostPayload_(e);
    const action = String(payload.action || '').trim();

    if (action === 'saveEstimate') {
      return outputJson(saveEstimate_(payload));
    }

    if (action === 'saveSafetyConsent') {
      return outputJson(saveSafetyConsent_(payload));
    }

    if (action === 'saveEstimateFile') {
      return outputJson(saveEstimateFile_(payload));
    }

    if (action === 'savePhoto') {
      return outputJson(savePhoto_(payload));
    }

    if (action === 'saveSignature') {
      return outputJson(saveSignature_(payload));
    }

    return outputJson({ ok: false, message: '지원하지 않는 action입니다.' });
  } catch (err) {
    return outputJson({ ok: false, message: err && err.message ? err.message : String(err) });
  }
}

function parsePostPayload_(e) {
  // 기존 견적 앱: form parameter의 payload에 JSON 전달
  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload || '{}');
  }

  // 안전동의서 앱: text/plain body에 JSON 직접 전달
  if (e && e.postData && e.postData.contents) {
    return JSON.parse(e.postData.contents || '{}');
  }

  return {};
}

/* =========================================================
   공식 견적번호 발급
   NC-YYMMDD-000 형식. 하루 단위로 001부터 시작합니다.
   여러 태블릿이 동시에 눌러도 번호가 겹치지 않도록
   LockService로 순번 발급 구간을 잠급니다.
   ========================================================= */
function issueEstimateCode_(staffNameInput) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, message: '견적번호 발급이 지연되고 있습니다. 잠시 후 다시 저장해 주세요.' };
  }

  try {
    const tz = getTimeZone_();
    const now = new Date();
    const dateKey = Utilities.formatDate(now, tz, 'yyMMdd');
    const props = PropertiesService.getScriptProperties();
    const propKey = 'CODE_SEQ_' + dateKey;

    const savedSeq = Number(props.getProperty(propKey) || 0);
    const sheetSeq = getMaxLedgerSeq_(dateKey);
    const nextSeq = Math.max(savedSeq, sheetSeq) + 1;

    props.setProperty(propKey, String(nextSeq));

    const code = CODE_PREFIX + '-' + dateKey + '-' + padNumber_(nextSeq, 3);
    const issuedAt = Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
    const staffName = resolveStaffPlainName(staffNameInput) || String(staffNameInput || '').trim();

    return { ok: true, code: code, issuedAt: issuedAt, staffName: staffName };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 견적대장에 이미 기록된 같은 날짜의 마지막 순번을 확인합니다.
 * 스크립트 속성이 초기화되더라도 번호가 겹치지 않게 하는 안전장치입니다.
 */
function getMaxLedgerSeq_(dateKey) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(LEDGER_SHEET_NAME);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  /* 오늘 번호는 언제나 시트 맨 아래쪽에 있습니다.
     대장 전체를 읽을 이유가 없어 뒤에서 400줄만 봅니다.
     (하루 400건을 넘길 일이 없고, 넘겨도 스크립트 속성이 순번을 들고 있습니다) */
  const prefix = CODE_PREFIX + '-' + dateKey + '-';
  const from = Math.max(2, lastRow - 399);
  const values = sheet.getRange(from, 1, lastRow - from + 1, 1).getDisplayValues();
  let max = 0;

  for (const row of values) {
    const code = String(row[0] || '').trim();
    if (code.indexOf(prefix) !== 0) continue;
    const seq = Number(code.slice(prefix.length));
    if (seq > max) max = seq;
  }

  return max;
}

function padNumber_(value, size) {
  let text = String(value);
  while (text.length < size) text = '0' + text;
  return text;
}

function getTimeZone_() {
  return Session.getScriptTimeZone() || 'Asia/Seoul';
}

/* =========================================================
   견적 저장
   ========================================================= */
function saveEstimate_(payload) {
  const submittedStaffName = String(
    (payload.staff && payload.staff.name) || payload.staffName || ''
  ).trim();

  const staffName = resolveStaffPlainName(submittedStaffName);
  if (!staffName) {
    return { ok: false, message: '작성자 정보가 없습니다. 로그인 후 다시 저장해 주세요.' };
  }

  const estimateCode = String(payload.code || '').trim();
  const stage = String(payload.stage || 'final');

  // 1단계: 현장반장의 현장견적. 공사항목이 아직 없으므로 견적대장에만 기록합니다.
  if (stage === 'field') {
    if (!estimateCode) return { ok: false, message: '견적번호가 없습니다.' };
    appendLedgerRow_(payload, staffName, estimateCode, PROGRESS_FIELD);
    ensureSiteFolderForCode_(estimateCode, (payload.project || {}).customerName);
    return { ok: true, stage: 'field', code: estimateCode, staffName: staffName };
  }

  // 추가견적이면 원 현장의 폴더를 그대로 이어 쓰도록 폴더 정보를 먼저 복사합니다.
  const addonBase = (payload.addon && payload.addon.baseCode) ? String(payload.addon.baseCode).trim() : '';

  // 2단계: 사무실의 견적 확정. 공사항목을 기록하고 견적대장을 갱신합니다.
  const sheet = getEstimateSheet();
  ensureEstimateHeader(sheet);

  const rows = normalizeEstimateRows(payload, staffName, estimateCode);
  if (!rows.length) {
    return { ok: false, message: '저장할 견적 항목이 없습니다.' };
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, START_COL, rows.length, ESTIMATE_HEADERS.length).setValues(rows);

  let ledgerSaved = false;
  if (estimateCode) {
    const ledger = getLedgerSheet_();
    const rowNo = findLedgerRow_(ledger, estimateCode);
    if (rowNo) {
      updateLedgerFinal_(ledger, rowNo, payload);
    } else {
      appendLedgerRow_(payload, staffName, estimateCode, PROGRESS_FINAL);
    }
    if (addonBase) copySiteFolder_(ledger, addonBase, estimateCode);
    ensureSiteFolderForCode_(estimateCode, (payload.project || {}).customerName);
    ledgerSaved = true;
  }

  return {
    ok: true,
    savedRows: rows.length,
    staffName: staffName,
    code: estimateCode,
    ledgerSaved: ledgerSaved
  };
}

/** 사무실이 견적을 확정했을 때 견적대장의 금액·상태를 갱신합니다. */
function updateLedgerFinal_(sheet, rowNo, payload) {
  const tz = getTimeZone_();
  const amounts = payload.amounts || {};
  const profit = payload.profit || {};
  const site = payload.site || {};
  const estTotals = (payload.internal && payload.internal.totals) || {};
  const row = sheet.getRange(rowNo, 1, 1, LEDGER_HEADERS.length).getValues()[0];
  const set = (column, value) => { row[column - 1] = value; };

  set(LEDGER_COL.savedAt, formatDateTimeText_(payload.savedAt, tz));

  // 연락처는 사무실이 견적을 확정할 때 채웁니다. 고객명·주소도 함께 맞춥니다.
  const project = payload.project || {};
  if (project.customerName) set(LEDGER_COL.customerName, project.customerName);
  if (project.phone) set(LEDGER_COL.phone, project.phone);
  if (project.address) set(LEDGER_COL.address, project.address);

  // 공사기간은 1단계에서 입력받아 견적서에 표시됩니다.
  if (site.workDays) set(LEDGER_COL.workDays, site.workDays);

  [
    [LEDGER_COL.totalAmount, payload.totalAmount || 0],
    [LEDGER_COL.totalAmount + 1, amounts.demolition || 0],
    [LEDGER_COL.totalAmount + 2, amounts.restoration || 0],
    [LEDGER_COL.totalAmount + 3, amounts.equipment || 0],
    [LEDGER_COL.totalAmount + 4, amounts.waste || 0],
    [LEDGER_COL.totalAmount + 5, amounts.protection || 0],
    [LEDGER_COL.totalAmount + 6, payload.selectedCount || 0],
    [LEDGER_COL.estLabor, estTotals.labor || 0],
    [LEDGER_COL.estEquip, estTotals.equipment || 0],
    [LEDGER_COL.estWaste, estTotals.waste || 0],
    [LEDGER_COL.estEtc, estTotals.extra || 0],
    [LEDGER_COL.estTotal, estTotals.total || 0],
    [LEDGER_COL.costTotal, estTotals.total || 0],
    [LEDGER_COL.profit, profit.amount || 0],
    [LEDGER_COL.profitRate, profit.rate || 0],
    [LEDGER_COL.progress, PROGRESS_FINAL]
  ].forEach(([column, value]) => set(column, value));

  // 고객 폰 서명 페이지가 읽을 견적서 원본을 저장합니다.
  if (payload.docData) set(LEDGER_COL.docData, String(payload.docData));

  sheet.getRange(rowNo, 1, 1, LEDGER_HEADERS.length).setValues([row]);
}

/* =========================================================
   현장견적 (현장반장 제출분)
   ========================================================= */
/**
 * 안전동의서 화면(safety.html)의 현장 고르기 목록입니다.
 *
 * ★ 이 길이 없으면 안전동의서가 어느 현장 것인지 정할 수 없어
 *   전부 _현장미지정 으로 떨어집니다. 화면에는 버튼이 이미 있었는데
 *   서버에 이 action 이 없어 '현장 목록을 불러오지 못했습니다' 만 떴습니다.
 *
 * 견적대장을 요청당 한 번만 읽고, 최근 것부터 limit 건만 돌려줍니다.
 * 돌려주는 것은 견적번호·고객명·주소·저장일시·담당자뿐입니다.
 * (다른 목록 API 가 이미 내보내는 값과 같습니다. 새로 여는 개인정보가 없습니다)
 */
function getSiteList_(params) {
  const values = ledgerValues_();
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 60) || 60, 200);
  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;

    rows.push({
      code: code,
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

function getFieldReportList_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 60) || 60, 200);
  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (String(row[LEDGER_COL.progress - 1] || '').trim() !== PROGRESS_FIELD) continue;

    rows.push({
      code: code,
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: row[LEDGER_COL.pyeong - 1] || '',
      floorLabel: row[LEDGER_COL.floorLabel - 1] || '',
      elevator: row[LEDGER_COL.elevator - 1] || '',
      costTotal: toNumber_(row[LEDGER_COL.costTotal - 1]),
      locationStatus: row[LEDGER_COL.locStatus - 1] || '',
      photoCount: toNumber_(row[LEDGER_COL.photoCount - 1]),
      siteFolderUrl: row[LEDGER_COL.siteFolderUrl - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

/**
 * 미계약 현장.
 * 견적서는 만들어졌는데 아직 계약으로 이어지지 않은 건을 오래된 순으로 돌려줍니다.
 * 사무실이 고객에게 직접 확인 전화를 걸 때 씁니다.
 */
function getUnclaimedList_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };
  const minDays = Number(params.minDays || 0) || 0;
  const now = new Date();
  const rows = [];

  for (let i = values.length - 1; i >= 0; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (String(row[LEDGER_COL.progress - 1] || '').trim() !== PROGRESS_FINAL) continue;
    if (String(row[LEDGER_COL.contractStatus - 1] || '').trim()) continue;

    const baseText = String(row[LEDGER_COL.sentAt - 1] || row[LEDGER_COL.savedAt - 1] || '').trim();
    const baseDate = baseText ? new Date(baseText.replace(/-/g, '/')) : null;
    const days = (baseDate && !isNaN(baseDate.getTime()))
      ? Math.max(0, Math.floor((now - baseDate) / 86400000))
      : 0;

    if (days < minDays) continue;

    rows.push({
      code: code,
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      phone: row[LEDGER_COL.phone - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: row[LEDGER_COL.pyeong - 1] || '',
      totalAmount: toNumber_(row[LEDGER_COL.totalAmount - 1]),
      sentAt: row[LEDGER_COL.sentAt - 1] || '',
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      sendStatus: row[LEDGER_COL.sendStatus - 1] || '',
      days: days
    });
  }

  rows.sort((a, b) => b.days - a.days);
  return { ok: true, rows: rows };
}

/**
 * 담당자 본인이 낸 현장견적 목록.
 * 반장에게는 본인이 산정한 기본 공사비까지만 돌려줍니다.
 * 사무실이 얹은 수익금과 최종 견적금액·계약금액은 내보내지 않습니다.
 */
function getMyReports_(params) {
  const staff = normalizeStaffText(params.staffName);
  if (!staff) return { ok: false, message: '담당자 정보가 없습니다.' };

  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 100) || 100, 300);
  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (normalizeStaffText(row[LEDGER_COL.staff - 1]) !== staff) continue;

    rows.push({
      code: code,
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: row[LEDGER_COL.pyeong - 1] || '',
      floorLabel: row[LEDGER_COL.floorLabel - 1] || '',
      photoCount: toNumber_(row[LEDGER_COL.photoCount - 1]),
      costTotal: toNumber_(row[LEDGER_COL.costTotal - 1]),
      progress: row[LEDGER_COL.progress - 1] || '',
      contractStatus: row[LEDGER_COL.contractStatus - 1] || '',
      sendStatus: row[LEDGER_COL.sendStatus - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

function getFieldReport_(params) {
  const code = String(params.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };

  const sheet = getLedgerSheet_();
  const rowNo = findLedgerRow_(sheet, code);
  if (!rowNo) return { ok: false, message: '현장견적을 찾지 못했습니다.' };

  const raw = String(sheet.getRange(rowNo, LEDGER_COL.reportData).getDisplayValue() || '').trim();
  if (!raw) return { ok: false, message: '현장견적 상세 데이터가 없습니다.' };

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    return { ok: false, message: '현장견적 데이터를 읽지 못했습니다.' };
  }

  return {
    ok: true,
    code: code,
    staff: sheet.getRange(rowNo, LEDGER_COL.staff).getDisplayValue(),
    report: data
  };
}

function appendLedgerRow_(payload, staffName, estimateCode, progress) {
  const sheet = getLedgerSheet_();
  const tz = getTimeZone_();
  const project = payload.project || {};
  const site = payload.site || {};
  const location = payload.location || {};
  const amounts = payload.amounts || {};
  const estTotals = (payload.internal && payload.internal.totals) || {};

  const locationOk = String(location.status || '') === 'ok';

  sheet.appendRow([
    estimateCode,
    payload.issuedAt || Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
    formatDateTimeText_(payload.savedAt, tz),
    staffName,
    project.customerName || '',
    project.phone || '',
    project.address || '',
    site.industry || '',
    site.pyeong || '',
    site.floorLabel || '',
    site.elevator || '',
    locationOk ? '확인' : '미확인',
    locationOk && location.lat != null ? location.lat : '',
    locationOk && location.lng != null ? location.lng : '',
    locationOk && location.accuracy != null ? Math.round(location.accuracy) : '',
    locationOk ? formatDateTimeText_(location.checkedAt, tz) : '',
    payload.totalAmount || 0,
    amounts.demolition || 0,
    amounts.restoration || 0,
    amounts.equipment || 0,
    amounts.waste || 0,
    amounts.protection || 0,
    payload.selectedCount || 0,
    '전송 전',
    '',
    '',
    locationOk ? '' : (location.message || '위치 확인 실패'),
    estTotals.labor || 0,
    estTotals.equipment || 0,
    estTotals.waste || 0,
    estTotals.extra || 0,
    estTotals.total || 0,
    '', '', '', '', '', '', '', '', '', '', '', '', '',
    '',
    estTotals.total || 0,
    (payload.profit && payload.profit.amount) || 0,
    (payload.profit && payload.profit.rate) || 0,
    progress || PROGRESS_FINAL,
    payload.reportData ? String(payload.reportData) : '',
    0, '', '',
    site.workDays || 1, '서명 전', '', '', '',
    payload.docData ? String(payload.docData) : '', '',
    (payload.addon && payload.addon.baseCode) || '',
    (payload.addon && payload.addon.seq) || ''
  ]);
}

/* =========================================================
   발송 기록
   전송하기를 누른 시점의 담당자·시각·위치·발송번호를 남깁니다.
   같은 견적을 여러 번 보내면 회차가 올라가며 모두 기록됩니다.
   ========================================================= */
function logEstimateSend_(params) {
  const code = String(params.code || '').trim();
  if (!code) {
    return { ok: false, message: '견적번호가 없어 발송기록을 저장할 수 없습니다.' };
  }

  const staffName = resolveStaffPlainName(params.staffName) || String(params.staffName || '').trim();
  if (!staffName) {
    return { ok: false, message: '담당자 정보가 없습니다. 로그인 후 다시 시도해 주세요.' };
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, message: '발송기록 저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    const tz = getTimeZone_();
    const sentAt = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');
    const locationOk = String(params.locStatus || '') === 'ok';
    const sheet = getSendLogSheet_();
    const seq = countSendRows_(sheet, code) + 1;

    sheet.appendRow([
      sentAt,
      code,
      seq,
      staffName,
      String(params.customerName || '').trim(),
      String(params.phone || '').trim(),
      locationOk ? '확인' : '미확인',
      locationOk && params.lat ? Number(params.lat) : '',
      locationOk && params.lng ? Number(params.lng) : '',
      locationOk && params.accuracy ? Math.round(Number(params.accuracy)) : '',
      locationOk ? '' : (String(params.memo || '').trim() || '위치 확인 실패')
    ]);

    updateLedgerSendStatus_(code, sentAt, seq);

    return { ok: true, code: code, seq: seq, sentAt: sentAt };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

function countSendRows_(sheet, code) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  let count = 0;
  for (const row of values) {
    if (String(row[0] || '').trim() === code) count++;
  }
  return count;
}

/**
 * 견적대장에서 해당 견적번호 행을 찾아 발송상태와 발송일시를 갱신합니다.
 */
function updateLedgerSendStatus_(code, sentAt, seq) {
  const sheet = getLedgerSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() !== code) continue;
    const rowNo = i + 2;
    const sendCells = {};
    sendCells[LEDGER_COL.sendStatus] = '발송완료 (' + seq + '회)';
    sendCells[LEDGER_COL.sentAt] = sentAt;
    writeCells_(sheet, rowNo, sendCells);      // 이어진 칸이라 왕복 1회
    return true;
  }
  return false;
}

/* =========================================================
   공사완료 실제원가
   ========================================================= */

/** 실제원가가 아직 입력되지 않은 현장 목록 */
function getPendingList_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 60) || 60, 200);
  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (String(row[LEDGER_COL.doneAt - 1] || '').trim()) continue;

    rows.push({
      code: code,
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: row[LEDGER_COL.pyeong - 1] || '',
      floorLabel: row[LEDGER_COL.floorLabel - 1] || '',
      elevator: row[LEDGER_COL.elevator - 1] || '',
      totalAmount: toNumber_(row[LEDGER_COL.totalAmount - 1]),
      estTotal: toNumber_(row[LEDGER_COL.estTotal - 1]),
      estLabor: toNumber_(row[LEDGER_COL.estLabor - 1]),
      estEquip: toNumber_(row[LEDGER_COL.estEquip - 1]),
      estWaste: toNumber_(row[LEDGER_COL.estWaste - 1]),
      estEtc: toNumber_(row[LEDGER_COL.estEtc - 1]),
      sendStatus: row[LEDGER_COL.sendStatus - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

/** 실제원가 저장 */
function saveActualCost_(params) {
  const code = String(params.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };

  const staffName = resolveStaffPlainName(params.staffName) || String(params.staffName || '').trim();
  if (!staffName) return { ok: false, message: '담당자 정보가 없습니다. 로그인 후 다시 시도해 주세요.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    const sheet = getLedgerSheet_();
    const rowNo = findLedgerRow_(sheet, code);
    if (!rowNo) return { ok: false, message: '견적대장에서 ' + code + ' 를 찾지 못했습니다.' };

    const workers = toNumber_(params.workers);
    const labor = toNumber_(params.laborCost);
    const equip = toNumber_(params.equipCost);
    const waste = toNumber_(params.wasteCost);
    const etc = toNumber_(params.etcCost);
    const actualTotal = labor + equip + waste + etc;
    const contract = toNumber_(params.contractAmount);
    const margin = contract - actualTotal;
    const marginRate = contract > 0 ? Math.round((margin / contract) * 1000) / 10 : 0;

    const estTotal = toNumber_(sheet.getRange(rowNo, LEDGER_COL.estTotal).getDisplayValue());
    const costDiff = actualTotal - estTotal;

    const tz = getTimeZone_();
    const doneAt = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss');

    sheet.getRange(rowNo, LEDGER_COL.actWorkers, 1, 13).setValues([[
      workers, labor, equip, waste, etc, actualTotal,
      contract, margin, marginRate, costDiff,
      staffName, doneAt, String(params.memo || '').trim()
    ]]);

    /* ★ 계약상태 '계약완료' 는 이 줄에서만 들어갑니다 (2026-08-31 확인).
       즉 '계약완료' = 공사완료 입력이 끝났다 = 그 현장 일이 끝났다 는 뜻입니다.
       출퇴근 앱의 근무 현장 목록이 이 값을 보고 끝난 현장을 뺍니다 (Api.js · apiSites_).
       ▸ 진행상태(50번 칸)는 건드리지 않습니다. 미계약 목록·추가공사 기준 목록·
         서명 현황 세 곳이 '견적작성 완료' 인 줄만 세고 있어서, 여기서 값을 바꾸면
         끝난 현장이 그 세 목록에서 같이 사라집니다. */
    if (contract > 0) {
      sheet.getRange(rowNo, LEDGER_COL.contractStatus).setValue('계약완료');
    }

    return {
      ok: true, code: code, actualTotal: actualTotal,
      margin: margin, marginRate: marginRate, costDiff: costDiff, doneAt: doneAt
    };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 이 현장에 사람이 며칠 · 몇 명 들어갔나 (v55).
 *
 * 공사완료 입력 화면에서 '투입인원' 을 ＋ 버튼으로 세고 있었습니다.
 * 그런데 출퇴근 앱이 **현장별로** 출퇴근을 이미 쌓고 있습니다.
 * 세는 일을 없애지는 않고, 참고할 숫자를 옆에 띄워 줍니다 — 칸은 사람이 채웁니다.
 *
 * ★ 맞추는 열쇠는 이름이 아니라 **현장폴더ID** 입니다.
 *   현장 이름은 고객명·주소·폴더명 중 하나라 글자가 달라질 수 있습니다.
 * ★ 이 화면은 현장 하나가 끝날 때 한 번 여는 곳이라 여기서만 남의 시트를 읽습니다.
 *   자주 도는 길(견적 작성·목록)에서는 절대 부르지 않습니다.
 * ★ 스크립트 속성 ATTENDANCE_ID 가 비어 있으면 조용히 아무것도 돌려주지 않습니다
 *   (참고줄이 안 뜰 뿐, 입력은 그대로 됩니다).
 */
function siteWork_(params) {
  const code = String((params && params.code) || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };

  const sheet = getLedgerSheet_();
  const rowNo = findLedgerRow_(sheet, code);
  if (!rowNo) return { ok: true, linked: false };

  const folderId = String(sheet.getRange(rowNo, LEDGER_COL.siteFolderId).getDisplayValue() || '').trim();
  if (!folderId) return { ok: true, linked: false };

  const ss = getAttendanceSpreadsheet_();
  if (!ss) return { ok: true, linked: false };

  const sh = ss.getSheetByName('출퇴근');
  if (!sh) return { ok: true, linked: false };

  const last = sh.getLastRow();
  if (last < 2) return { ok: true, linked: true, workers: 0, days: 0, people: [] };

  /* 뒤에서 3000줄만 본다. 여섯 명이 2년쯤 찍은 양이다. */
  const width = sh.getLastColumn();
  const start = Math.max(2, last - 3000 + 1);
  const values = sh.getRange(start, 1, last - start + 1, width).getDisplayValues();
  const head = sh.getRange(1, 1, 1, width).getDisplayValues()[0].map(String);

  const cDate = head.indexOf('날짜');
  const cName = head.indexOf('이름');
  const cIn   = head.indexOf('출근시각');
  const cFid  = head.indexOf('현장폴더ID');
  if (cDate < 0 || cFid < 0) return { ok: true, linked: false };

  const dayset = {};
  const perPerson = {};
  let workers = 0;
  let first = '', lastDay = '';

  values.forEach(function (r) {
    if (String(r[cFid] || '').trim() !== folderId) return;
    if (cIn >= 0 && !String(r[cIn] || '').trim()) return;      // 출근을 안 찍은 줄
    const d = String(r[cDate] || '').trim().slice(0, 10);
    if (!d) return;
    workers += 1;                                              // 연인원 = 출근 찍은 줄 수
    dayset[d] = true;
    const nm = cName >= 0 ? String(r[cName] || '').trim() : '';
    if (nm) perPerson[nm] = (perPerson[nm] || 0) + 1;
    if (!first || d < first) first = d;
    if (!lastDay || d > lastDay) lastDay = d;
  });

  const people = Object.keys(perPerson)
    .map(function (n) { return { name: n, days: perPerson[n] }; })
    .sort(function (a, b) { return b.days - a.days; });

  return {
    ok: true, linked: true,
    workers: workers,                    // 연인원
    days: Object.keys(dayset).length,    // 실제로 사람이 나온 날 수
    from: first, to: lastDay,
    people: people
  };
}

/** 출퇴근 스프레드시트 — 스크립트 속성 ATTENDANCE_ID. 없으면 null */
let requestAttendanceSs = null;
function getAttendanceSpreadsheet_() {
  if (requestAttendanceSs !== null) return requestAttendanceSs;
  let id = '';
  try { id = String(PropertiesService.getScriptProperties().getProperty('ATTENDANCE_ID') || '').trim(); }
  catch (err) { id = ''; }
  if (!id) { requestAttendanceSs = false; return null; }
  try { requestAttendanceSs = SpreadsheetApp.openById(id); }
  catch (err) { requestAttendanceSs = false; return null; }
  return requestAttendanceSs;
}


/** 과거 유사현장 조회 (실제원가가 입력된 현장만) */
function lookupSites_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const industry = String(params.industry || '').trim();
  const elevator = String(params.elevator || '').trim();
  const pyeong = toNumber_(params.pyeong);
  const range = toNumber_(params.range) || 10;
  const limit = Math.min(Number(params.limit || 20) || 20, 60);

  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    if (!String(row[LEDGER_COL.doneAt - 1] || '').trim()) continue;

    if (industry && industry !== '전체' && String(row[LEDGER_COL.industry - 1] || '').trim() !== industry) continue;
    if (elevator && elevator !== '전체' && String(row[LEDGER_COL.elevator - 1] || '').trim() !== elevator) continue;

    if (pyeong > 0) {
      const sitePyeong = toNumber_(row[LEDGER_COL.pyeong - 1]);
      if (Math.abs(sitePyeong - pyeong) > range) continue;
    }

    rows.push({
      code: String(row[LEDGER_COL.code - 1] || ''),
      customerName: row[LEDGER_COL.customerName - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: toNumber_(row[LEDGER_COL.pyeong - 1]),
      floorLabel: row[LEDGER_COL.floorLabel - 1] || '',
      elevator: row[LEDGER_COL.elevator - 1] || '',
      totalAmount: toNumber_(row[LEDGER_COL.totalAmount - 1]),
      estTotal: toNumber_(row[LEDGER_COL.estTotal - 1]),
      actWorkers: toNumber_(row[LEDGER_COL.actWorkers - 1]),
      actLabor: toNumber_(row[LEDGER_COL.actLabor - 1]),
      actEquip: toNumber_(row[LEDGER_COL.actEquip - 1]),
      actWaste: toNumber_(row[LEDGER_COL.actWaste - 1]),
      actEtc: toNumber_(row[LEDGER_COL.actEtc - 1]),
      actTotal: toNumber_(row[LEDGER_COL.actTotal - 1]),
      contractAmount: toNumber_(row[LEDGER_COL.contractAmount - 1]),
      margin: toNumber_(row[LEDGER_COL.margin - 1]),
      marginRate: toNumber_(row[LEDGER_COL.marginRate - 1]),
      costDiff: toNumber_(row[LEDGER_COL.costDiff - 1]),
      doneAt: row[LEDGER_COL.doneAt - 1] || '',
      memo: row[LEDGER_COL.doneMemo - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

/* =========================================================
   현장별 자료 폴더  —  드나드는 문은 여기 하나뿐입니다

   01_현장 / 고객명_yyyyMMdd / 01_견적서 · 03_현장사진 · 09_동의서 ...

   ★ 다른 곳에서 DriveApp 으로 폴더를 직접 만들지 마세요.
     견적서·사진·동의서가 서로 다른 규칙으로 흩어진 원인이 그것이었습니다.
     경로가 바뀌면 이 구역만 고치면 됩니다.
   ========================================================= */
function getSiteRootFolder_() {
  if (SITE_ROOT_FOLDER_ID) return DriveApp.getFolderById(SITE_ROOT_FOLDER_ID);
  const folders = DriveApp.getFoldersByName(SITE_ROOT_FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(SITE_ROOT_FOLDER_NAME);
}

/**
 * 현장 폴더 이름을 정합니다.  고객명_yyyyMMdd
 *
 * ★ 날짜는 '오늘' 이 아니라 견적번호 안의 날짜입니다 (NC-260828-001 → 20260828).
 *   오늘 날짜로 지으면, 견적대장의 현장폴더ID 가 비었을 때 다음 날 같은 현장을
 *   다시 찾다가 이름이 달라져 폴더가 하나 더 생깁니다.
 */
function siteFolderName_(code, customerName) {
  const hit = String(code || '').match(/-(\d{6})-/);
  const dateText = hit
    ? ('20' + hit[1])
    : Utilities.formatDate(new Date(), getTimeZone_(), 'yyyyMMdd');
  const who = String(customerName || '').trim() || '현장';
  return sanitizeFileName_(who + '_' + dateText);
}

/**
 * 견적번호에 연결된 현장 폴더를 확보합니다.  현장 폴더를 얻는 길은 이것 하나입니다.
 *
 *   ① 견적대장의 현장폴더ID 가 있으면 그것을 쓴다
 *   ② 없으면 고객명_yyyyMMdd 이름으로 01_현장 안에서 찾는다
 *   ③ 그래도 없으면 만들고, 만든 ID 를 견적대장에 적어둔다
 *   ④ 하위 폴더는 여기서 만들지 않는다 — 쓰는 쪽이 필요한 칸 하나만 만든다
 *
 * ★ 예전에는 폴더를 만들 때마다 하위 폴더 여덟 개를 한꺼번에 만들었습니다.
 *   견적 한 건 저장에 드라이브 호출이 아홉 번 몰렸습니다. 계정 안전 규칙에 어긋납니다.
 */
function ensureSiteFolderForCode_(code, customerName) {
  const key = String(code || '').trim();
  if (!key) return null;

  // 한 요청에서 같은 현장을 두 번 찾지 않습니다.
  if (Object.prototype.hasOwnProperty.call(requestSiteFolders, key)) return requestSiteFolders[key];

  let folder = null;
  try {
    const sheet = getLedgerSheet_();
    const rowNo = findLedgerRow_(sheet, key);
    if (!rowNo) { requestSiteFolders[key] = null; return null; }

    const savedId = String(sheet.getRange(rowNo, LEDGER_COL.siteFolderId).getDisplayValue() || '').trim();
    if (savedId) {
      try {
        folder = DriveApp.getFolderById(savedId);
        requestSiteFolders[key] = folder;
        return folder;
      } catch (err) { /* 폴더가 지워진 경우에만 아래에서 새로 만듭니다 */ }
    }

    const who = String(customerName || '').trim()
      || sheet.getRange(rowNo, LEDGER_COL.customerName).getDisplayValue();
    const name = siteFolderName_(key, who);

    const root = getSiteRootFolder_();
    const found = root.getFoldersByName(name);
    folder = found.hasNext() ? found.next() : root.createFolder(name);

    const folderCells = {};
    folderCells[LEDGER_COL.siteFolderUrl] = folder.getUrl();
    folderCells[LEDGER_COL.siteFolderId] = folder.getId();
    writeCells_(sheet, rowNo, folderCells);    // 이어진 칸이라 왕복 1회
  } catch (err) {
    folder = null;
  }

  requestSiteFolders[key] = folder;
  return folder;
}

/** 현장 폴더 안의 칸 하나를 가져옵니다. 없으면 그때 만듭니다. */
function getSiteSubFolder_(code, subName, customerName) {
  const folder = ensureSiteFolderForCode_(code, customerName);
  if (!folder) return null;
  return getOrCreateFolder_(folder, subName);
}

/**
 * 현장을 끝내 알 수 없을 때만 쓰는 자리입니다.
 * 01_현장 / _현장미지정 / <칸이름>
 * 파일을 잃지 않으려고 두는 것이지 정상 경로가 아닙니다.
 */
function unknownSiteFolder_(subName) {
  const box = getOrCreateFolder_(getSiteRootFolder_(), SITE_UNKNOWN_FOLDER);
  return subName ? getOrCreateFolder_(box, subName) : box;
}

/** 견적서 PDF 가 갈 곳. 발송본·서명본 모두 여기 한 곳에 모입니다. */
function estimateFolder_(code, customerName) {
  return getSiteSubFolder_(code, SITE_ESTIMATE_FOLDER, customerName)
      || unknownSiteFolder_(SITE_ESTIMATE_FOLDER);
}

/** 안전동의서가 갈 곳. */
function consentFolder_(code, customerName) {
  return getSiteSubFolder_(code, SITE_CONSENT_FOLDER, customerName)
      || unknownSiteFolder_(SITE_CONSENT_FOLDER);
}

/* =========================================================
   현장사진 업로드
   폰에서 크기를 줄여 보낸 사진을 03_현장사진 폴더에 저장합니다.
   ========================================================= */
function savePhoto_(payload) {
  const code = String(payload.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };
  if (!payload.base64) return { ok: false, message: '사진 데이터가 없습니다.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return { ok: false, message: '사진 저장이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    const folder = getSiteSubFolder_(code, SITE_PHOTO_FOLDER, payload.customerName);
    if (!folder) return { ok: false, message: '현장 폴더를 찾지 못했습니다.' };

    const index = Math.max(1, Number(payload.index) || 1);
    const baseName = sanitizeFileName_(payload.fileName || ('photo_' + index));
    const fileName = padNumber_(index, 2) + '_' + baseName.replace(/\.[^.]+$/, '') + '.jpg';

    const blob = Utilities.newBlob(Utilities.base64Decode(payload.base64), 'image/jpeg', fileName);
    const file = folder.createFile(blob);

    const sheet = getLedgerSheet_();
    const rowNo = findLedgerRow_(sheet, code);
    if (rowNo) sheet.getRange(rowNo, LEDGER_COL.photoCount).setValue(index);

    return { ok: true, code: code, index: index, url: file.getUrl(), folderUrl: folder.getUrl() };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   추가견적 · 서명 현황
   ========================================================= */

/** 추가견적을 붙일 수 있는 현장 목록 (견적서가 만들어진 건) */
function getAddonBaseList_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 80) || 80, 300);

  // 원 견적별로 이미 만들어진 추가견적 건수를 세어 둡니다.
  const addonCount = {};
  for (const row of values) {
    const base = String(row[LEDGER_COL.baseCode - 1] || '').trim();
    if (base) addonCount[base] = (addonCount[base] || 0) + 1;
  }

  const rows = [];
  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (String(row[LEDGER_COL.progress - 1] || '').trim() !== PROGRESS_FINAL) continue;

    // 추가견적에 또 추가견적을 붙이지는 않습니다. 원 견적에 모읍니다.
    if (String(row[LEDGER_COL.baseCode - 1] || '').trim()) continue;

    rows.push({
      code: code,
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      phone: row[LEDGER_COL.phone - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      industry: row[LEDGER_COL.industry - 1] || '',
      pyeong: toNumber_(row[LEDGER_COL.pyeong - 1]),
      floor: parseFloorLabel_(row[LEDGER_COL.floorLabel - 1]),
      floorLabel: row[LEDGER_COL.floorLabel - 1] || '',
      elevator: row[LEDGER_COL.elevator - 1] || '',
      totalAmount: toNumber_(row[LEDGER_COL.totalAmount - 1]),
      contractStatus: row[LEDGER_COL.contractStatus - 1] || '',
      signStatus: row[LEDGER_COL.signStatus - 1] || '',
      siteFolderUrl: row[LEDGER_COL.siteFolderUrl - 1] || '',
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      addonCount: addonCount[code] || 0
    });
  }

  return { ok: true, rows: rows };
}

/**
 * 같은 연락처로 이미 올라간 현장 찾기 (v54).
 *
 * 화면(ncore-estimate-v2.js 의 checkDuplicatePhone)이 저장 직전에 부릅니다.
 * 이미 있는 현장이면 "같은 연락처의 현장이 이미 있습니다" 를 띄워
 * 추가공사로 올려야 할 건이 새 견적으로 중복 등록되는 것을 막습니다.
 *
 * ★ 이 통로가 서버에 없어서 그 경고가 **한 번도 뜬 적이 없었습니다** (2026-08-30 점검).
 *   화면은 멀쩡히 돌고 경고만 조용히 사라지는 형태였습니다.
 *
 * 받는 것   phone (하이픈이 있어도 됩니다) · limit
 * 주는 것   { ok, rows: [{ code, customerName, address, savedAt,
 *                          progress, contractStatus, addonCount }] }
 *
 * ★ 전화번호는 숫자만 남겨서 견줍니다. 시트에 '010-1234-5678' 로 들어 있어도 찾습니다.
 */
function findByPhone_(params) {
  const want = String(params.phone || '').replace(/[^0-9]/g, '');
  if (want.length < 9) return { ok: true, rows: [] };

  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const limit = Math.min(Number(params.limit || 5) || 5, 20);

  // 원 견적별 추가견적 건수 (getAddonBaseList_ 와 같은 방식)
  const addonCount = {};
  for (const row of values) {
    const base = String(row[LEDGER_COL.baseCode - 1] || '').trim();
    if (base) addonCount[base] = (addonCount[base] || 0) + 1;
  }

  const rows = [];
  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;

    const got = String(row[LEDGER_COL.phone - 1] || '').replace(/[^0-9]/g, '');
    if (!got || got !== want) continue;

    rows.push({
      code: code,
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      savedAt: row[LEDGER_COL.savedAt - 1] || '',
      progress: row[LEDGER_COL.progress - 1] || '',
      contractStatus: row[LEDGER_COL.contractStatus - 1] || '',
      addonCount: addonCount[code] || 0
    });
  }

  return { ok: true, rows: rows };
}

/** '지하 2층' / '3층' 같은 글자를 숫자로 되돌립니다. */
function parseFloorLabel_(text) {
  const value = String(text || '').trim();
  if (!value) return 1;
  const n = toNumber_(value.replace(/[^0-9]/g, ''));
  if (!n) return 1;
  return value.indexOf('지하') !== -1 ? -n : n;
}

/**
 * 추가견적 번호를 발급합니다.
 * 원 견적번호 뒤에 -A1, -A2 순으로 붙습니다.
 */
function issueAddonCode_(params) {
  const base = String(params.base || '').trim();
  if (!base) return { ok: false, message: '원 견적번호가 없습니다.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return { ok: false, message: '번호 발급이 지연되고 있습니다. 잠시 후 다시 저장해 주세요.' };
  }

  try {
    const sheet = getLedgerSheet_();
    if (!findLedgerRow_(sheet, base)) {
      return { ok: false, message: '원 견적번호 ' + base + ' 를 찾지 못했습니다.' };
    }

    const lastRow = sheet.getLastRow();
    const prefix = base + '-A';
    let max = 0;

    if (lastRow >= 2) {
      const codes = sheet.getRange(2, LEDGER_COL.code, lastRow - 1, 1).getDisplayValues();
      for (const row of codes) {
        const code = String(row[0] || '').trim();
        if (code.indexOf(prefix) !== 0) continue;
        const seq = Number(code.slice(prefix.length));
        if (seq > max) max = seq;
      }
    }

    const seq = max + 1;
    const tz = getTimeZone_();
    const staffName = resolveStaffPlainName(params.staffName) || String(params.staffName || '').trim();

    return {
      ok: true,
      code: prefix + seq,
      seq: seq,
      base: base,
      issuedAt: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'),
      staffName: staffName
    };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

/** 추가견적이 원 현장 폴더를 그대로 쓰도록 폴더 정보를 복사합니다. */
function copySiteFolder_(sheet, baseCode, newCode) {
  try {
    const baseRow = findLedgerRow_(sheet, baseCode);
    const newRow = findLedgerRow_(sheet, newCode);
    if (!baseRow || !newRow) return false;

    const url = sheet.getRange(baseRow, LEDGER_COL.siteFolderUrl).getDisplayValue();
    const id = sheet.getRange(baseRow, LEDGER_COL.siteFolderId).getDisplayValue();
    if (!id) return false;

    const copyCells = {};
    copyCells[LEDGER_COL.siteFolderUrl] = url;
    copyCells[LEDGER_COL.siteFolderId] = id;
    writeCells_(sheet, newRow, copyCells);     // 이어진 칸이라 왕복 1회
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * 서명 현황.
 * filter 는 전체 / 완료 / 대기 중 하나입니다.
 */
function getSignStatusList_(params) {
  const values = ledgerValues_();          // 요청당 한 번만 읽는다
  if (!values.length) return { ok: true, rows: [] };

  const filter = String(params.filter || '전체').trim();
  const limit = Math.min(Number(params.limit || 100) || 100, 300);
  const rows = [];

  for (let i = values.length - 1; i >= 0 && rows.length < limit; i--) {
    const row = values[i];
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) continue;
    if (String(row[LEDGER_COL.progress - 1] || '').trim() !== PROGRESS_FINAL) continue;

    const signStatus = String(row[LEDGER_COL.signStatus - 1] || '').trim();
    const done = signStatus === '서명완료';

    if (filter === '완료' && !done) continue;
    if (filter === '대기' && done) continue;

    rows.push({
      code: code,
      staff: row[LEDGER_COL.staff - 1] || '',
      customerName: row[LEDGER_COL.customerName - 1] || '',
      address: row[LEDGER_COL.address - 1] || '',
      totalAmount: toNumber_(row[LEDGER_COL.totalAmount - 1]),
      sendStatus: row[LEDGER_COL.sendStatus - 1] || '',
      sentAt: row[LEDGER_COL.sentAt - 1] || '',
      signStatus: done ? '서명완료' : '서명대기',
      signedAt: row[LEDGER_COL.signedAt - 1] || '',
      signMethod: row[LEDGER_COL.signMethod - 1] || '',
      signedFileUrl: row[LEDGER_COL.signedFileUrl - 1] || '',
      baseCode: row[LEDGER_COL.baseCode - 1] || '',
      savedAt: row[LEDGER_COL.savedAt - 1] || ''
    });
  }

  return { ok: true, rows: rows };
}

/* =========================================================
   고객 폰 서명 (sign.html)

   견적번호가 NC-날짜-순번 규칙이라 번호만으로는 열리지 않게
   비밀키로 만든 토큰을 링크에 함께 붙입니다.
   ========================================================= */

/** 견적번호로 서명 링크 토큰을 만듭니다. */
function makeSignToken_(code) {
  const raw = Utilities.computeHmacSha256Signature(String(code || ''), SIGN_SECRET);
  let hex = '';
  for (let i = 0; i < raw.length; i++) {
    let b = raw[i];
    if (b < 0) b += 256;
    const part = b.toString(16);
    hex += (part.length === 1 ? '0' : '') + part;
  }
  return hex.slice(0, SIGN_TOKEN_LENGTH);
}

function verifySignToken_(code, token) {
  const expected = makeSignToken_(code);
  const given = String(token || '').trim().toLowerCase();
  if (given.length !== expected.length) return false;

  // 글자를 하나씩 비교하되 중간에 멈추지 않습니다.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    if (expected.charAt(i) !== given.charAt(i)) diff++;
  }
  return diff === 0;
}

function getSignToken_(params) {
  const code = String(params.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };

  const sheet = getLedgerSheet_();
  const rowNo = findLedgerRow_(sheet, code);
  if (!rowNo) return { ok: false, message: '견적대장에서 ' + code + ' 를 찾지 못했습니다.' };

  return { ok: true, code: code, token: makeSignToken_(code) };
}

/** 고객 폰에서 견적서를 열 때 씁니다. 토큰이 맞아야만 내려줍니다. */
function getSignDoc_(params) {
  const code = String(params.code || '').trim();
  const token = String(params.t || '').trim();

  if (!code || !token) return { ok: false, message: '링크가 올바르지 않습니다.' };
  if (!verifySignToken_(code, token)) return { ok: false, message: '링크가 올바르지 않습니다.' };

  const sheet = getLedgerSheet_();
  const rowNo = findLedgerRow_(sheet, code);
  if (!rowNo) return { ok: false, message: '견적서를 찾지 못했습니다.' };

  const raw = String(sheet.getRange(rowNo, LEDGER_COL.docData).getDisplayValue() || '').trim();
  if (!raw) return { ok: false, message: '견적서 내용이 아직 준비되지 않았습니다.' };

  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (err) {
    return { ok: false, message: '견적서 내용을 읽지 못했습니다.' };
  }

  const signStatus = String(sheet.getRange(rowNo, LEDGER_COL.signStatus).getDisplayValue() || '').trim();
  const signed = signStatus === '서명완료';

  return {
    ok: true,
    code: code,
    doc: doc,
    signed: signed,
    signedAt: signed ? sheet.getRange(rowNo, LEDGER_COL.signedAt).getDisplayValue() : '',
    signImage: signed ? String(sheet.getRange(rowNo, LEDGER_COL.signImage).getDisplayValue() || '') : ''
  };
}

/** 고객이 서명한 견적서를 받아 보관합니다. */
function saveSignature_(payload) {
  const code = String(payload.code || '').trim();
  const token = String(payload.t || '').trim();

  if (!code || !token) return { ok: false, message: '링크가 올바르지 않습니다.' };
  if (!verifySignToken_(code, token)) return { ok: false, message: '링크가 올바르지 않습니다.' };
  if (!payload.pdfBase64) return { ok: false, message: '서명본 파일이 없습니다.' };

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return { ok: false, message: '저장이 지연되고 있습니다. 잠시 후 다시 눌러 주세요.' };
  }

  try {
    const sheet = getLedgerSheet_();
    const rowNo = findLedgerRow_(sheet, code);
    if (!rowNo) return { ok: false, message: '견적서를 찾지 못했습니다.' };

    // 이미 서명이 끝났으면 덮어쓰지 않습니다.
    const already = String(sheet.getRange(rowNo, LEDGER_COL.signStatus).getDisplayValue() || '').trim();
    if (already === '서명완료') {
      return { ok: true, code: code, already: true, message: '이미 서명이 완료된 견적서입니다.' };
    }

    const customerName = sheet.getRange(rowNo, LEDGER_COL.customerName).getDisplayValue();

    const saved = saveEstimateFile_({
      kind: 'signed',
      code: code,
      customerName: customerName,
      signMethod: 'link',
      signedAt: String(payload.signedAt || '').trim(),
      pdfBase64: payload.pdfBase64
    });

    if (!saved || !saved.ok) {
      return { ok: false, message: (saved && saved.message) || '서명본을 저장하지 못했습니다.' };
    }

    // 서명 이미지는 견적서를 다시 열었을 때 그대로 보여 주기 위해 남깁니다.
    if (payload.signImage) {
      sheet.getRange(rowNo, LEDGER_COL.signImage).setValue(String(payload.signImage));
    }

    return { ok: true, code: code, url: saved.url };
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : String(err) };
  } finally {
    lock.releaseLock();
  }
}

/* =========================================================
   견적서 PDF 보관
   발송본과 서명본 모두 현장 폴더의 01_견적서에 넣습니다.
   서명본은 파일명 뒤에 _서명본이 붙고 견적대장 서명 열이 채워집니다.
   ========================================================= */
function saveEstimateFile_(payload) {
  const code = String(payload.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };
  if (!payload.pdfBase64) return { ok: false, message: '견적서 파일 데이터가 없습니다.' };

  const isSigned = String(payload.kind || '') === 'signed';
  const tz = getTimeZone_();
  const now = new Date();

  /* 서명본이든 발송본이든 견적서이므로 현장 폴더의 01_견적서 한 곳에 모읍니다.
     ※ 예전에는 현장을 못 찾으면 01_현장 / 2026 / 08월 로 떨어뜨렸습니다.
        그래서 견적서가 두 곳으로 갈라졌습니다. 지금은 예외도 _현장미지정 한 곳입니다. */
  const targetFolder = estimateFolder_(code, payload.customerName);

  const customerName = sanitizeFileName_(payload.customerName || '고객');
  const baseName = code + '_' + customerName + '_견적서' + (isSigned ? '_서명본' : '');
  const fileName = sanitizeFileName_(baseName) + '.pdf';

  const blob = Utilities.newBlob(
    Utilities.base64Decode(payload.pdfBase64),
    'application/pdf',
    fileName
  );

  const file = targetFolder.createFile(blob);
  const url = file.getUrl();

  const sheet = getLedgerSheet_();
  const rowNo = findLedgerRow_(sheet, code);

  if (rowNo) {
    if (isSigned) {
      /* 서명 상태 네 칸(56~59)은 이어져 있어 한 번에 씁니다.
         예전에는 칸마다 따로 써서 고객 앞에서 여섯 번을 기다렸습니다. */
      const cells = {};
      cells[LEDGER_COL.signStatus] = '서명완료';
      cells[LEDGER_COL.signedAt] =
        payload.signedAt || Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss');
      cells[LEDGER_COL.signMethod] =
        String(payload.signMethod || 'tablet') === 'link' ? '고객폰 링크' : '현장 태블릿';
      cells[LEDGER_COL.signedFileUrl] = url;

      // 계약상태가 비어 있으면 서명 사실을 남겨 미계약 목록에서 빠지게 합니다.
      const contract = String(sheet.getRange(rowNo, LEDGER_COL.contractStatus).getDisplayValue() || '').trim();
      if (!contract) cells[LEDGER_COL.contractStatus] = '견적서 서명완료';

      writeCells_(sheet, rowNo, cells);
    } else {
      sheet.getRange(rowNo, LEDGER_COL.fileUrl).setValue(url);
    }
  }

  return { ok: true, code: code, signed: isSigned, url: url, folderUrl: targetFolder.getUrl() };
}

/**
 * 한 줄의 여러 칸을 가장 적은 왕복으로 씁니다.  { 칸번호: 값 }
 *
 * 예전에는 칸마다 setValue 를 따로 불렀습니다.
 * 서명 저장 한 번에 여섯 번을 나눠 써서 고객이 그만큼 기다렸습니다.
 * 이어진 칸은 한 번에 쓰고, 사이가 조금 벌어진 곳은
 * 지금 값을 한 번 읽어 그대로 되돌려 놓고 함께 씁니다.
 */
function writeCells_(sheet, rowNo, cells) {
  const cols = Object.keys(cells).map(Number).sort(function (a, b) { return a - b; });
  if (!rowNo || !cols.length) return;

  let i = 0;
  while (i < cols.length) {
    const start = cols[i];
    let end = start;
    let j = i;
    // 사이가 4칸 이내면 같이 묶는다 (한 번 읽고 한 번 쓰는 편이 싸다)
    while (j + 1 < cols.length && cols[j + 1] - end <= 4) { end = cols[j + 1]; j += 1; }

    const width = end - start + 1;
    const wanted = cols.slice(i, j + 1);
    let values;

    if (wanted.length === width) {
      values = wanted.map(function (c) { return cells[c]; });   // 빈틈 없음 — 읽지 않는다
    } else {
      values = sheet.getRange(rowNo, start, 1, width).getValues()[0];
      wanted.forEach(function (c) { values[c - start] = cells[c]; });
    }

    sheet.getRange(rowNo, start, 1, width).setValues([values]);
    i = j + 1;
  }
}

function findLedgerRow_(sheet, code) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, LEDGER_COL.code, lastRow - 1, 1).getDisplayValues();
  for (let i = values.length - 1; i >= 0; i--) {
    if (String(values[i][0] || '').trim() === code) return i + 2;
  }
  return 0;
}

function toNumber_(value) {
  const text = String(value == null ? '' : value).replace(/[^0-9.\-]/g, '');
  const num = Number(text);
  return isNaN(num) ? 0 : num;
}

function formatDateTimeText_(value, tz) {
  if (!value) return '';
  const date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, tz || getTimeZone_(), 'yyyy-MM-dd HH:mm:ss');
}

/* =========================================================
   안전동의서
   ========================================================= */
function saveSafetyConsent_(payload) {
  if (!payload.documentNo) throw new Error('문서번호가 없습니다.');
  if (!payload.manager) throw new Error('담당자 정보가 없습니다.');
  if (!payload.name) throw new Error('성명이 없습니다.');
  if (!payload.phone) throw new Error('연락처가 없습니다.');
  if (!payload.pdfBase64) throw new Error('파일 데이터가 없습니다.');

  const manager = resolveStaffDisplayName_(payload.manager);
  if (!manager) throw new Error('사용 가능한 담당자가 아닙니다. PIN을 다시 확인해 주세요.');

  const now = new Date();
  const tz = getTimeZone_();

  /* 현장이 특정되면 그 현장 폴더의 09_동의서 로 넣습니다.
     ※ 예전에는 SAFETY_FOLDER_ID(=01_현장) 아래 연·월 폴더에 쌓았습니다.
        현장 폴더가 있어야 할 자리에 2026 / 08월 이 같이 생긴 원인입니다.
     예외는 하나뿐입니다 — 화면에서 현장을 고르지 않았거나(사무실에서 미리 뽑는 경우)
     고른 현장이 견적대장에 없을 때. 그때만 _현장미지정 / 09_동의서 로 갑니다. */
  const siteCode = String(payload.code || '').trim();
  const siteName = String(payload.customerName || '').trim();
  const targetFolder = siteCode
    ? consentFolder_(siteCode, siteName)
    : unknownSiteFolder_(SITE_CONSENT_FOLDER);

  const safeBase = sanitizeFileName_(payload.fileBase || (payload.documentNo + '_안전동의서'));
  const pdfBlob = Utilities.newBlob(
    Utilities.base64Decode(payload.pdfBase64),
    'application/pdf',
    safeBase + '.pdf'
  );
  const pdfFile = targetFolder.createFile(pdfBlob);

  // PNG는 저장용량 절약을 위해 보내오는 경우에만 함께 보관합니다.
  let pngUrl = '';
  if (payload.pngBase64) {
    const pngBlob = Utilities.newBlob(
      Utilities.base64Decode(payload.pngBase64),
      'image/png',
      safeBase + '.png'
    );
    pngUrl = targetFolder.createFile(pngBlob).getUrl();
  }

  const sheet = getSafetyLogSheet_();
  sheet.appendRow([
    payload.documentDate || Utilities.formatDate(now, tz, 'yyyy-MM-dd'),
    payload.createdAt || Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss'),
    manager,
    String(payload.name || '').trim(),
    String(payload.phone || '').trim(),
    String(payload.documentNo || '').trim(),
    pngUrl,
    pdfFile.getUrl(),
    siteCode,          // 어느 현장 폴더로 들어갔는지 나중에 알아볼 수 있게 남깁니다
    siteName
  ]);

  return {
    ok: true,
    manager: manager,
    pngUrl: pngUrl,
    pdfUrl: pdfFile.getUrl(),
    folderUrl: targetFolder.getUrl()
  };
}

/* =========================================================
   시트 준비
   ========================================================= */
function getSpreadsheet() {
  if (requestSpreadsheet) return requestSpreadsheet;

  const propId = (function () {
    try { return String(PropertiesService.getScriptProperties().getProperty('SHEET_ID') || '').trim(); }
    catch (e) { return ''; }
  })();

  const useId = SPREADSHEET_ID || propId;

  requestSpreadsheet = useId
    ? SpreadsheetApp.openById(useId)
    : SpreadsheetApp.getActiveSpreadsheet();
  return requestSpreadsheet;
}

function getEstimateSheet() {
  const ss = getSpreadsheet();
  return ss.getSheetByName(ESTIMATE_SHEET_NAME) || ss.insertSheet(ESTIMATE_SHEET_NAME);
}

function getLedgerSheet_() {
  /* 머리글 확인은 요청당 한 번이면 충분합니다.
     예전에는 부를 때마다 머리글 한 줄을 다시 읽었습니다. */
  if (requestSheets[LEDGER_SHEET_NAME]) return requestSheets[LEDGER_SHEET_NAME];

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(LEDGER_SHEET_NAME) || ss.insertSheet(LEDGER_SHEET_NAME);
  const current = sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).getDisplayValues()[0];

  // 머리글이 이미 맞으면 아무것도 쓰지 않습니다.
  // 매번 쓰면 스프레드시트가 저장을 기다리느라 응답이 느려집니다.
  if (current.join('|') !== LEDGER_HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, LEDGER_HEADERS.length).setValues([LEDGER_HEADERS]);
    sheet.setFrozenRows(1);
  }

  requestSheets[LEDGER_SHEET_NAME] = sheet;
  return sheet;
}

/**
 * 견적대장 전체를 요청당 한 번만 읽습니다.
 * 목록 화면들이 저마다 getLastRow + getDisplayValues 를 다시 부르고 있었습니다.
 * 돌려받은 배열은 고쳐 쓰지 마세요 (여러 곳이 같은 것을 봅니다).
 */
function ledgerValues_() {
  if (requestLedgerValues) return requestLedgerValues;
  const sheet = getLedgerSheet_();
  const lastRow = sheet.getLastRow();
  requestLedgerValues = (lastRow < 2)
    ? []
    : sheet.getRange(2, 1, lastRow - 1, LEDGER_HEADERS.length).getDisplayValues();
  return requestLedgerValues;
}

function getSendLogSheet_() {
  if (requestSheets[SEND_LOG_SHEET_NAME]) return requestSheets[SEND_LOG_SHEET_NAME];
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SEND_LOG_SHEET_NAME) || ss.insertSheet(SEND_LOG_SHEET_NAME);
  const current = sheet.getRange(1, 1, 1, SEND_HEADERS.length).getDisplayValues()[0];
  if (current.join('|') !== SEND_HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, SEND_HEADERS.length).setValues([SEND_HEADERS]);
    sheet.setFrozenRows(1);
  }
  requestSheets[SEND_LOG_SHEET_NAME] = sheet;
  return sheet;
}

/* 담당자관리 시트는 더 이상 쓰지 않습니다.
   사람 정보는 워크보드 '직원' 시트 한 곳에만 있습니다. */

function getSafetyLogSheet_() {
  if (requestSheets[SAFETY_LOG_SHEET_NAME]) return requestSheets[SAFETY_LOG_SHEET_NAME];
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SAFETY_LOG_SHEET_NAME) || ss.insertSheet(SAFETY_LOG_SHEET_NAME);
  const current = sheet.getRange(1, 1, 1, SAFETY_HEADERS.length).getDisplayValues()[0];
  if (current.join('|') !== SAFETY_HEADERS.join('|')) {
    sheet.getRange(1, 1, 1, SAFETY_HEADERS.length).setValues([SAFETY_HEADERS]);
    sheet.setFrozenRows(1);
  }
  requestSheets[SAFETY_LOG_SHEET_NAME] = sheet;
  return sheet;
}

function ensureEstimateHeader(sheet) {
  const codeHeader = String(sheet.getRange(1, START_COL).getDisplayValue()).trim();
  const secondHeader = String(sheet.getRange(1, START_COL + 1).getDisplayValue()).trim();
  if (codeHeader === '코드번호' && secondHeader === '고객명') {
    sheet.insertColumnAfter(START_COL);
  }
  sheet.getRange(1, START_COL, 1, ESTIMATE_HEADERS.length).setValues([ESTIMATE_HEADERS]);
  sheet.setFrozenRows(1);
}

function parseStaffName(value) {
  const rawName = String(value || '').trim();
  const separatorIndex = rawName.indexOf('_');
  let role = '';
  let plainName = rawName;

  if (separatorIndex > 0) {
    role = rawName.slice(0, separatorIndex).trim();
    plainName = rawName.slice(separatorIndex + 1).replace(/_/g, ' ').trim();
  } else {
    plainName = rawName.replace(/_/g, ' ').trim();
  }

  role = role.replace(/\s+/g, ' ');
  plainName = plainName.replace(/\s+/g, ' ');

  return {
    rawName: rawName,
    role: role,
    plainName: plainName,
    displayName: role ? role + ' ' + plainName : plainName
  };
}

function normalizeStaffText(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

/* =========================================================
   담당자 — 워크보드 '직원' 시트 한 곳만 봅니다

   이 앱은 사람 정보를 따로 갖고 있지 않습니다.
   워크보드에서 신청하고 승인받으면 같은 PIN 으로 여기도 들어옵니다.
   ========================================================= */

/** 워크보드 스프레드시트를 연다 */
function getWorkboardSpreadsheet_() {
  if (requestWorkboardSpreadsheet) return requestWorkboardSpreadsheet;

  const id = (function () {
    try { return String(PropertiesService.getScriptProperties().getProperty('WORKBOARD_ID') || '').trim(); }
    catch (e) { return ''; }
  })();

  if (!id) throw new Error('워크보드 시트가 연결되지 않았습니다. 스크립트 속성 WORKBOARD_ID 를 확인해 주세요.');
  requestWorkboardSpreadsheet = SpreadsheetApp.openById(id);
  return requestWorkboardSpreadsheet;
}

/** PIN 을 되돌릴 수 없는 형태로 바꾼다 (워크보드와 같은 방식) */
function hashPin_(phone, pin) {
  const raw = WORKBOARD_SALT + '|' + normPhone_(phone) + '|' + String(pin);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

/** 전화번호를 워크보드와 똑같은 방식으로 다듬는다.

    ★ 앞의 0 을 되살리는 처리가 핵심입니다.
      시트가 01027256026 을 숫자로 읽으면 앞의 0 이 떨어져 1027256026 이 됩니다.
      워크보드도 같은 처리를 하고 있고, 이게 다르면 PIN 이 전부 안 맞습니다. */
function normPhone_(value) {
  var d = String(value || '').replace(/[^0-9]/g, '');
  if (d.length === 10 && d.charAt(0) !== '0') d = '0' + d;
  return d;
}

/** 워크보드 직원 목록을 이 앱이 쓰는 모양으로 읽어온다 */
function readWorkboardStaff_() {
  /* 한 요청에서 두 번 읽지 않는다 (로그인 → 이름 확인처럼 이어 부르는 곳이 있다) */
  if (requestStaffRows) return requestStaffRows;
  const ss = getWorkboardSpreadsheet_();
  const sheet = ss.getSheetByName(WORKBOARD_STAFF_SHEET);
  if (!sheet) throw new Error("워크보드에 '직원' 시트가 없습니다.");

  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  const values = sheet.getRange(1, 1, lastRow, lastCol).getDisplayValues();
  const head = values[0].map(String);

  const col = {};
  ['이름', '전화번호', '부서', '직급', '권한등급', '재직상태', 'PIN해시'].forEach(function (name) {
    col[name] = head.indexOf(name);
  });

  const out = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const name = col['이름'] >= 0 ? String(row[col['이름']] || '').trim() : '';
    if (!name) continue;

    const state = col['재직상태'] >= 0 ? String(row[col['재직상태']] || '재직').trim() : '재직';
    if (state !== '재직') continue;          // 승인대기·퇴사는 들어올 수 없다

    const grade = col['권한등급'] >= 0 ? Number(row[col['권한등급']] || 1) : 1;
    const rank = col['직급'] >= 0 ? String(row[col['직급']] || '').trim() : '';

    out.push({
      plainName: name,
      displayName: rank ? rank + ' ' + name : name,
      rawName: name,
      role: GRADE_ROLE[grade] || '사무실',
      grade: grade,
      phone: normPhone_(col['전화번호'] >= 0 ? row[col['전화번호']] : ''),
      pinHash: col['PIN해시'] >= 0 ? String(row[col['PIN해시']] || '').trim() : '',
      dept: col['부서'] >= 0 ? String(row[col['부서']] || '').trim() : '',
      rank: rank
    });
  }

  requestStaffRows = out;
  return out;
}

/** 지금 쓸 수 있는 담당자 이름 목록 */
function getActiveStaffNames() {
  /* 앱을 열 때마다 부르는 길입니다.
     예전에는 여기서 워크보드 스프레드시트를 열었습니다 (1~2초).
     이름·직급뿐이라 잠깐 담아둡니다. PIN 은 담지 않습니다. */
  if (EST_STAFF_CACHE_ON) {
    try {
      const hit = CacheService.getScriptCache().get(EST_STAFF_CACHE_KEY);
      if (hit) return JSON.parse(hit);
    } catch (e) { /* 없거나 깨졌으면 아래에서 읽는다 */ }
  }

  const names = readWorkboardStaff_().map(function (s) { return s.displayName; });

  if (EST_STAFF_CACHE_ON) {
    try {
      CacheService.getScriptCache()
        .put(EST_STAFF_CACHE_KEY, JSON.stringify(names), EST_STAFF_CACHE_SECONDS);
    } catch (e) { /* 못 담아도 값은 이미 있다 */ }
  }
  return names;
}

function validateStaffPin(pin) {
  const inputPin = String(pin || '').trim();
  if (!/^\d{4}$/.test(inputPin)) {
    return { ok: false, message: 'PIN 번호 4자리를 정확히 입력해 주세요.' };
  }

  let staffList;
  try {
    staffList = readWorkboardStaff_();
  } catch (err) {
    return { ok: false, message: err && err.message ? err.message : '직원 정보를 읽지 못했습니다.' };
  }

  if (!staffList.length) return { ok: false, message: '등록된 담당자가 없습니다.' };

  /* PIN 은 사람마다 다른 값으로 섞여 저장되므로
     한 사람씩 같은 방식으로 바꿔보고 맞는지 확인한다. */
  const matched = staffList.filter(function (s) {
    if (!s.pinHash || !s.phone) return false;
    return hashPin_(s.phone, inputPin) === s.pinHash;
  });

  if (!matched.length) {
    return { ok: false, message: 'PIN 번호가 맞지 않습니다. 워크보드에서 쓰시는 PIN을 입력해 주세요.' };
  }
  if (matched.length > 1) {
    return { ok: false, message: '같은 PIN을 사용하는 담당자가 있습니다. 관리자에게 알려주세요.' };
  }

  const me = matched[0];
  return {
    ok: true,
    staffName: me.plainName,
    staffDisplayName: me.displayName,
    role: me.role || '사무실',
    staffList: staffList.map(function (s) { return s.displayName; })
  };
}


function normalizeRole_(value) {
  const text = String(value || '').trim();
  if (!text) return '사무실';
  if (text.indexOf('현장') !== -1) return '현장';
  if (text.indexOf('관리') !== -1) return '관리자';
  return '사무실';
}

function resolveStaffPlainName(inputValue) {
  const identity = findActiveStaff_(inputValue);
  return identity ? identity.plainName : '';
}

function resolveStaffDisplayName_(inputValue) {
  const identity = findActiveStaff_(inputValue);
  return identity ? identity.displayName : '';
}

function findActiveStaff_(inputValue) {
  const inputName = normalizeStaffText(inputValue);
  if (!inputName) return null;

  const staffList = readWorkboardStaff_();
  for (const s of staffList) {
    const candidates = [s.rawName, s.displayName, s.plainName].map(normalizeStaffText);
    if (candidates.indexOf(inputName) !== -1) return s;
  }
  return null;
}

/* =========================================================
   행 데이터 변환
   ========================================================= */
function normalizeEstimateRows(payload, staffName, estimateCode) {
  const project = payload.project || {};
  const totalAmount = payload.totalAmount || '';
  const excelRows = Array.isArray(payload.excelRows) ? payload.excelRows : [];
  const code = estimateCode || '';

  if (excelRows.length) {
    return excelRows.map(row => [
      code || row.codeNo || '', staffName, row.customerName || '', row.customerPhone || '',
      row.siteAddress || '', row.category || '', row.item || '', row.unit || '',
      row.quantity || '', row.unitPrice || '', row.amount || '', row.totalAmount || '', row.memo || ''
    ]);
  }

  return [[
    code, staffName, project.customerName || '', project.phone || '', project.address || '',
    '', '', '식', 1, '', '', totalAmount || '', ''
  ]];
}

/* =========================================================
   공통 유틸
   ========================================================= */
function getOrCreateFolder_(parent, name) {
  const folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function sanitizeFileName_(value) {
  return String(value || '안전동의서').replace(/[\\/:*?"<>|]/g, '_').trim();
}

function outputJson(data, callback) {
  const json = JSON.stringify(data || {});
  const safeCallback = String(callback || '').replace(/[^A-Za-z0-9_$\.]/g, '');
  if (safeCallback) {
    return ContentService.createTextOutput(`${safeCallback}(${json});`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function csvEscape(value) {
  const text = String(value == null ? '' : value);
  return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

/* ============================================================
 *  속도_재기 · 대장_확인   (편집기에서 직접 실행)
 *
 *  이 앱에서 시간을 만드는 것은 계산이 아니라
 *  '구글에 몇 번 묻는가' 입니다. 그것만 셉니다.
 * ========================================================== */

/** 목록 화면들이 실제로 몇 ms 걸리는지 잰다 */
function 속도_재기() {
  const 줄 = [];

  function 재기(이름, fn) {
    // 요청이 새로 시작된 것처럼 담아둔 것을 비운다
    requestSpreadsheet = null;
    requestAttendanceSs = null;
    requestWorkboardSpreadsheet = null;
    requestSheets = {};
    requestLedgerValues = null;

    const t0 = new Date().getTime();
    let 건수 = 0;
    try {
      const r = fn();
      건수 = (r && r.rows) ? r.rows.length : 0;
    } catch (err) {
      줄.push(이름 + '  실패: ' + (err && err.message ? err.message : err));
      return;
    }
    줄.push(이름.padEnd(18) + (new Date().getTime() - t0) + 'ms   ' + 건수 + '건');
  }

  재기('현장 견적 목록', function () { return getFieldReportList_({}); });
  재기('미계약 목록',    function () { return getUnclaimedList_({}); });
  재기('실제원가 대기',  function () { return getPendingList_({}); });
  재기('서명 현황',      function () { return getSignStatusList_({}); });
  재기('추가견적 대상',  function () { return getAddonBaseList_({}); });

  // 한 요청에서 목록 두 개를 만들면 대장을 몇 번 읽는가
  requestSpreadsheet = null; requestSheets = {}; requestLedgerValues = null;
  const t0 = new Date().getTime();
  getFieldReportList_({});
  getUnclaimedList_({});
  getSignStatusList_({});
  줄.push('');
  줄.push('한 요청에서 목록 3개  ' + (new Date().getTime() - t0) + 'ms');
  줄.push('  (대장은 한 번만 읽습니다 — 예전에는 세 번 읽었습니다)');

  const 대장 = getLedgerSheet_();
  줄.push('');
  줄.push('견적대장 줄 수  ' + Math.max(대장.getLastRow() - 1, 0));
  줄.push('');
  줄.push('★ 줄 수는 시간을 거의 만들지 않습니다.');
  줄.push('   시간을 만드는 것은 스프레드시트 열기(1~2초)와');
  줄.push('   시트를 몇 번 읽고 쓰는가(한 번에 0.15~1초)입니다.');

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  try { SpreadsheetApp.getUi().alert('현장견적 속도', 결과, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return 결과;
}


/**
 * 요청당 한 번만 읽도록 바꾼 뒤에도 값이 그대로인지 확인합니다.
 * 담아둔 값과 시트에서 새로 읽은 값을 칸 하나하나 견줍니다.
 */
function 대장_확인() {
  requestSpreadsheet = null; requestSheets = {}; requestLedgerValues = null;

  const 담긴것 = ledgerValues_();

  const sheet = getLedgerSheet_();
  const lastRow = sheet.getLastRow();
  const 원본 = (lastRow < 2)
    ? []
    : sheet.getRange(2, 1, lastRow - 1, LEDGER_HEADERS.length).getDisplayValues();

  let 검사 = 0, 다름 = 0;
  const 줄 = [];

  if (담긴것.length !== 원본.length) {
    다름 += 1;
    줄.push('줄 수가 다릅니다  ' + 담긴것.length + ' vs ' + 원본.length);
  }

  const n = Math.min(담긴것.length, 원본.length);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < LEDGER_HEADERS.length; j += 1) {
      검사 += 1;
      if (String(담긴것[i][j]) !== String(원본[i][j])) {
        다름 += 1;
        if (다름 <= 12) {
          줄.push((i + 2) + '행 ' + LEDGER_HEADERS[j] +
                  '  "' + 담긴것[i][j] + '"  vs  "' + 원본[i][j] + '"');
        }
      }
    }
  }

  const 머리 = (다름 === 0)
    ? '통과 — 검사 ' + 검사 + '칸, 다른 칸 0개'
    : '★ 다른 칸 ' + 다름 + '개';

  const 결과 = 머리 + '\n\n' + 줄.join('\n');
  Logger.log(결과);
  try { SpreadsheetApp.getUi().alert('견적대장 확인', 결과, SpreadsheetApp.getUi().ButtonSet.OK); } catch (e) {}
  return 결과;
}


/* ============================================================
 *  파일이름_정리하기   —  편집기에서 손으로 한 번 실행합니다
 * ------------------------------------------------------------
 *  01_현장 아래에 잘못 생긴 연도 폴더(2026 / 08월)와 낱개 파일에서
 *  견적서 PDF 를 찾아 각 현장 폴더의 01_견적서 로 옮깁니다.
 *
 *      파일이름_정리하기(true)   무엇을 어디로 옮길지 보여주기만 합니다
 *      파일이름_정리하기()       실제로 옮깁니다
 *
 *  ★ 복사가 아니라 이동입니다. 같은 파일이 두 곳에 있으면 어느 것이 진짜인지 알 수 없습니다.
 *  ★ 한 번에 50건까지만 옮깁니다. 남으면 몇 건인지 알려드립니다.
 *    다시 실행하면 이어서 합니다. 드라이브 작업을 한 요청에 몰지 않습니다.
 *  ★ 어느 현장인지 알 수 없는 파일은 옮기지 않고 목록으로 보여줍니다.
 *  ★ 지우는 것은 다 비워진 연도·월 폴더뿐입니다. 파일은 하나도 지우지 않습니다.
 *  ★ 자동 실행(트리거)을 걸지 마세요.
 * ========================================================== */
function 파일이름_정리하기(미리보기) {
  const 미리 = (미리보기 === true);
  const 한번에 = 50;        // 한 번에 옮기는 상한
  const 훑기상한 = 500;     // 한 번에 훑어보는 파일 수 상한

  // 요청이 새로 시작된 것처럼 담아둔 것을 비웁니다.
  requestSpreadsheet = null;
  requestWorkboardSpreadsheet = null;
  requestSheets = {};
  requestLedgerValues = null;
  requestStaffRows = null;
  requestSiteFolders = {};

  const 줄 = [];
  줄.push(미리 ? '■ 미리보기 — 아무것도 옮기지 않습니다' : '■ 실제 정리');
  줄.push('');

  /* ── 견적대장을 한 번만 읽어 표를 만듭니다 ───────────────── */
  const ledger = getLedgerSheet_();
  const values = ledgerValues_();
  const 대장 = {};       // 견적번호 → 현장 정보
  const 링크주인 = {};   // 드라이브 파일ID → 견적번호 (이름에 번호가 없어도 알아냅니다)
  const 이름주인 = {};   // 고객명 → 견적번호 (그 이름이 한 곳뿐일 때만)

  values.forEach(function (row, i) {
    const code = String(row[LEDGER_COL.code - 1] || '').trim();
    if (!code) return;

    const who = String(row[LEDGER_COL.customerName - 1] || '').trim();
    대장[code] = {
      rowNo: i + 2,
      customerName: who,
      siteFolderUrl: String(row[LEDGER_COL.siteFolderUrl - 1] || '').trim(),
      siteFolderId: String(row[LEDGER_COL.siteFolderId - 1] || '').trim(),
      fileUrl: String(row[LEDGER_COL.fileUrl - 1] || '').trim(),
      signedFileUrl: String(row[LEDGER_COL.signedFileUrl - 1] || '').trim()
    };

    [대장[code].fileUrl, 대장[code].signedFileUrl].forEach(function (u) {
      const id = 드라이브ID_(u);
      if (id) 링크주인[id] = code;
    });

    if (who.length >= 2) {
      이름주인[who] = (이름주인[who] === undefined) ? code : '중복';
    }
  });

  /* ── 01_현장 아래를 훑습니다 ─────────────────────────────── */
  const root = getSiteRootFolder_();
  const 옮길것 = [];   // { file, name, code, 자리 }
  const 모름 = [];
  let 훑은수 = 0;
  let 훑기넘침 = false;

  function 훑기(folder, 자리) {
    if (훑기넘침) return;
    const files = folder.getFiles();
    while (files.hasNext()) {
      if (훑은수 >= 훑기상한) { 훑기넘침 = true; return; }
      훑은수 += 1;
      분류_(files.next(), 자리);
    }
  }

  function 분류_(file, 자리) {
    const name = file.getName();
    const id = file.getId();

    // ① 파일 이름 앞의 견적번호  ② 이름에 없으면 견적대장의 견적서링크로 되짚기
    const code = 코드찾기_(name, 대장) || 링크주인[id] || '';

    if (!code) {
      모름.push('   ' + 자리 + ' / ' + name + 힌트_(name, 이름주인));
      return;
    }
    if (!견적서인가_(name, id, 링크주인)) {
      모름.push('   ' + 자리 + ' / ' + name + '   (견적서 PDF 가 아니라 그대로 둡니다)');
      return;
    }
    옮길것.push({ file: file, name: name, code: code, 자리: 자리 });
  }

  const 연도들 = [];
  const 하위 = root.getFolders();
  while (하위.hasNext()) {
    const f = 하위.next();
    if (/^\d{4}$/.test(f.getName())) 연도들.push(f);
  }

  연도들.forEach(function (y) {
    훑기(y, SITE_ROOT_FOLDER_NAME + '/' + y.getName());
    const 달들 = y.getFolders();
    while (달들.hasNext()) {
      const m = 달들.next();
      훑기(m, SITE_ROOT_FOLDER_NAME + '/' + y.getName() + '/' + m.getName());
    }
  });

  // 01_현장 바로 아래에 떨어진 낱개 파일도 같이 봅니다.
  훑기(root, SITE_ROOT_FOLDER_NAME);

  줄.push('연도 폴더 ' + 연도들.length + '개 · 훑어본 파일 ' + 훑은수 + '개');
  if (훑기넘침) {
    줄.push('★ ' + 훑기상한 + '개까지만 훑었습니다. 이번 것을 끝내고 다시 실행하세요.');
  }
  줄.push('');

  /* ── 옮기기 ─────────────────────────────────────────────── */
  const 할것 = 옮길것.slice(0, 한번에);
  const 남은건수 = 옮길것.length - 할것.length;
  const 도착폴더 = {};
  const 도착이름 = {};   // 도착 폴더에 이미 있는 파일 이름 (폴더당 한 번만 읽습니다)
  const 실패 = [];
  const 링크확인 = [];
  const 같은이름 = [];
  let 옮김 = 0;
  let 링크수정 = 0;

  줄.push('[옮길 견적서] ' + 옮길것.length + '건' +
          (남은건수 ? '  — 이번에 ' + 할것.length + '건, 다음에 ' + 남은건수 + '건' : ''));

  할것.forEach(function (건) {
    const 정보 = 대장[건.code];
    const 갈곳 = (정보.siteFolderId ? '' : '새 ') + '현장 폴더 ' +
                 (정보.siteFolderId ? (정보.customerName || 건.code)
                                    : siteFolderName_(건.code, 정보.customerName)) +
                 ' / ' + SITE_ESTIMATE_FOLDER;

    if (미리) {
      줄.push('   ' + 건.name);
      줄.push('      ' + 건.자리 + '   →   ' + 갈곳);
      return;
    }

    try {
      let dest = 도착폴더[건.code];
      if (!dest) {
        dest = estimateFolder_(건.code, 정보.customerName);
        도착폴더[건.code] = dest;

        /* 같은 이름이 이미 있는지 보려고 도착 폴더를 한 번만 훑습니다.
           드라이브는 같은 이름을 두 개 허용하므로, 조용히 겹치면 나중에
           어느 것이 진짜인지 알 수 없습니다. 지우지 않고 알려만 드립니다. */
        const 있는것 = {};
        const 이미 = dest.getFiles();
        while (이미.hasNext()) 있는것[이미.next().getName()] = true;
        도착이름[건.code] = 있는것;
      }

      if (도착이름[건.code][건.name]) {
        같은이름.push('   ' + 갈곳 + ' / ' + 건.name);
      }
      도착이름[건.code][건.name] = true;

      건.file.moveTo(dest);
      옮김 += 1;
      줄.push('   옮김  ' + 건.name + '   →   ' + 갈곳);

      /* 링크가 비어 있으면 채웁니다.
         이미 다른 파일을 가리키고 있으면 덮어쓰지 않고 알려만 드립니다.
         옛 버전을 옮기다가 최신 링크를 지워 버릴 수 있기 때문입니다. */
      const 서명본 = 건.name.indexOf('_서명본') >= 0;
      const 칸 = 서명본 ? LEDGER_COL.signedFileUrl : LEDGER_COL.fileUrl;
      const 지금 = 서명본 ? 정보.signedFileUrl : 정보.fileUrl;
      const url = 건.file.getUrl();

      if (!지금) {
        const cells = {};
        cells[칸] = url;
        writeCells_(ledger, 정보.rowNo, cells);
        if (서명본) { 정보.signedFileUrl = url; } else { 정보.fileUrl = url; }
        링크수정 += 1;
      } else if (지금.indexOf(건.file.getId()) < 0) {
        링크확인.push('   ' + 건.code + '  ' + (서명본 ? '서명본링크' : '견적서링크') +
                      ' 가 다른 파일을 가리킵니다 — 어느 것이 맞는지 확인해 주세요');
      }
    } catch (err) {
      실패.push('   ' + 건.name + '  →  ' + (err && err.message ? err.message : err));
    }
  });

  if (!옮길것.length) 줄.push('   없습니다');
  줄.push('');

  /* ── 빈 폴더 정리 ───────────────────────────────────────── */
  const 지운폴더 = [];
  const 남긴폴더 = [];

  if (!미리) {
    연도들.forEach(function (y) {
      try {
        const 달들 = y.getFolders();
        while (달들.hasNext()) {
          const m = 달들.next();
          if (비었나_(m)) { m.setTrashed(true); 지운폴더.push(y.getName() + '/' + m.getName()); }
        }
        if (비었나_(y)) { y.setTrashed(true); 지운폴더.push(y.getName()); }
        else 남긴폴더.push(y.getName());
      } catch (err) {
        실패.push('   폴더 ' + y.getName() + '  →  ' + (err && err.message ? err.message : err));
      }
    });
  }

  /* ── 보고 ───────────────────────────────────────────────── */
  if (!미리) {
    줄.push('[결과]');
    줄.push('   옮긴 파일        ' + 옮김 + '건');
    줄.push('   채운 견적서링크  ' + 링크수정 + '건');
    줄.push('   지운 빈 폴더     ' + 지운폴더.length + '개' +
            (지운폴더.length ? '  (' + 지운폴더.join(', ') + ')' : ''));
    if (남긴폴더.length) {
      줄.push('   남긴 폴더        ' + 남긴폴더.join(', ') + '  — 안에 뭔가 남아 있어 지우지 않았습니다');
    }
    if (남은건수) {
      줄.push('   ★ ' + 남은건수 + '건이 남았습니다. 파일이름_정리하기() 를 다시 실행하세요.');
    }
    줄.push('');
  }

  if (같은이름.length) {
    줄.push('[같은 이름이 두 개가 된 곳] ' + 같은이름.length + '건');
    줄.push('   옮기기 전에 이미 같은 이름이 있었습니다. 지우지 않았으니 어느 것이');
    줄.push('   최신인지 보고 사람이 하나를 지워 주세요.');
    같은이름.forEach(function (t) { 줄.push(t); });
    줄.push('');
  }

  if (링크확인.length) {
    줄.push('[견적대장 링크 확인 필요] ' + 링크확인.length + '건');
    링크확인.forEach(function (t) { 줄.push(t); });
    줄.push('');
  }

  if (모름.length) {
    줄.push('[어느 현장인지 알 수 없어 그대로 둔 파일] ' + 모름.length + '건');
    모름.forEach(function (t) { 줄.push(t); });
    줄.push('');
  }

  if (실패.length) {
    줄.push('[실패] ' + 실패.length + '건');
    실패.forEach(function (t) { 줄.push(t); });
    줄.push('');
  }

  if (미리) {
    줄.push('실제로 옮기려면 편집기에서  파일이름_정리하기()  를 실행하세요.');
  }

  const 결과 = 줄.join('\n');
  Logger.log(결과);
  try {
    SpreadsheetApp.getUi().alert('현장 폴더 정리', 결과, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) { /* 편집기에서 실행하면 창이 없습니다. 실행 기록(로그)으로 보세요 */ }
  return 결과;
}


/** 드라이브 주소에서 파일 ID 만 뽑습니다. */
function 드라이브ID_(url) {
  const hit = String(url || '').match(/[-\w]{25,}/);
  return hit ? hit[0] : '';
}


/** 파일 이름 앞의 견적번호를 견적대장과 맞춰 봅니다. */
function 코드찾기_(name, 대장) {
  const hit = String(name || '').match(/([A-Za-z]{2,4}-\d{6}-\d{3}(?:-A\d+)?)/);
  if (!hit) return '';

  const full = hit[1].toUpperCase();
  if (대장[full]) return full;

  // 추가견적 번호가 대장에 없으면 원 견적번호로 되짚습니다.
  const base = full.replace(/-A\d+$/, '');
  return 대장[base] ? base : '';
}


/** 견적서 PDF 인지 봅니다. 아닌 것은 건드리지 않습니다. */
function 견적서인가_(name, id, 링크주인) {
  const 이름 = String(name || '');
  if (!/\.pdf$/i.test(이름)) return false;
  if (이름.indexOf('견적서') >= 0) return true;
  return !!링크주인[id];      // 견적대장이 견적서로 가리키고 있으면 견적서입니다
}


/** 옮기지 못한 파일에 '이 현장으로 보입니다' 힌트만 답니다. 옮기지는 않습니다. */
function 힌트_(name, 이름주인) {
  const 이름 = String(name || '');
  let 찾음 = '';
  for (const who in 이름주인) {
    if (이름주인[who] === '중복') continue;
    if (이름.indexOf(who) < 0) continue;
    if (찾음) return '';        // 두 현장에 걸리면 힌트를 달지 않습니다
    찾음 = who;
  }
  return 찾음 ? ('   ← ' + 찾음 + ' 현장으로 보입니다 (사람이 확인해 주세요)') : '';
}


/** 폴더가 완전히 비었는지 봅니다. */
function 비었나_(folder) {
  return !folder.getFiles().hasNext() && !folder.getFolders().hasNext();
}
