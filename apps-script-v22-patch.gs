/* =========================================================================
   N-CORE Apps Script v22 패치
   현재 쓰고 계신 코드.gs 에서 아래 5곳만 찾아 바꿔 주세요.
   기존 열 순서는 하나도 건드리지 않고 뒤에만 5개를 붙이므로
   이미 쌓인 견적대장 데이터는 그대로 유지됩니다.
   ========================================================================= */


/* ── [1] LEDGER_HEADERS 배열 끝에 5개를 추가합니다 ─────────────────────
   기존 마지막 줄 :   '사진수','현장폴더','현장폴더ID'
   아래로 교체     :                                                     */

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
  '공사기간','서명상태','서명일시','서명방식','서명본링크'
];


/* ── [2] LEDGER_COL 객체 마지막 줄에 5개를 추가합니다 ──────────────────
   기존 :   photoCount: 52, siteFolderUrl: 53, siteFolderId: 54
   아래로 교체 :                                                        */

const LEDGER_COL = {
  code: 1, savedAt: 3, staff: 4, customerName: 5, phone: 6, address: 7,
  industry: 8, pyeong: 9, floorLabel: 10, elevator: 11,
  locStatus: 12,
  totalAmount: 17, sendStatus: 24, sentAt: 25, contractStatus: 26,
  estLabor: 28, estEquip: 29, estWaste: 30, estEtc: 31, estTotal: 32,
  actWorkers: 33, actLabor: 34, actEquip: 35, actWaste: 36, actEtc: 37, actTotal: 38,
  contractAmount: 39, margin: 40, marginRate: 41, costDiff: 42,
  doneBy: 43, doneAt: 44, doneMemo: 45, fileUrl: 46,
  costTotal: 47, profit: 48, profitRate: 49, progress: 50, reportData: 51,
  photoCount: 52, siteFolderUrl: 53, siteFolderId: 54,
  workDays: 55, signStatus: 56, signedAt: 57, signMethod: 58, signedFileUrl: 59
};


/* ── [3] appendLedgerRow_ 함수를 통째로 교체합니다 ─────────────────────
   달라진 곳은 appendRow 마지막 줄 하나입니다.                          */

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
    site.workDays || 1, '서명 전', '', '', ''
  ]);
}


/* ── [4] updateLedgerFinal_ 함수를 통째로 교체합니다 ───────────────────
   사무실이 견적을 확정할 때 공사기간도 함께 갱신되도록 두 줄 추가.     */

function updateLedgerFinal_(sheet, rowNo, payload) {
  const tz = getTimeZone_();
  const amounts = payload.amounts || {};
  const profit = payload.profit || {};
  const site = payload.site || {};
  const estTotals = (payload.internal && payload.internal.totals) || {};

  sheet.getRange(rowNo, LEDGER_COL.savedAt).setValue(formatDateTimeText_(payload.savedAt, tz));

  const project = payload.project || {};
  if (project.customerName) sheet.getRange(rowNo, LEDGER_COL.customerName).setValue(project.customerName);
  if (project.phone) sheet.getRange(rowNo, LEDGER_COL.phone).setValue(project.phone);
  if (project.address) sheet.getRange(rowNo, LEDGER_COL.address).setValue(project.address);

  if (site.workDays) sheet.getRange(rowNo, LEDGER_COL.workDays).setValue(site.workDays);

  sheet.getRange(rowNo, LEDGER_COL.totalAmount, 1, 7).setValues([[
    payload.totalAmount || 0,
    amounts.demolition || 0,
    amounts.restoration || 0,
    amounts.equipment || 0,
    amounts.waste || 0,
    amounts.protection || 0,
    payload.selectedCount || 0
  ]]);

  sheet.getRange(rowNo, LEDGER_COL.estLabor, 1, 5).setValues([[
    estTotals.labor || 0, estTotals.equipment || 0, estTotals.waste || 0,
    estTotals.extra || 0, estTotals.total || 0
  ]]);

  sheet.getRange(rowNo, LEDGER_COL.costTotal, 1, 4).setValues([[
    estTotals.total || 0,
    profit.amount || 0,
    profit.rate || 0,
    PROGRESS_FINAL
  ]]);
}


/* ── [5] saveEstimateFile_ 함수를 통째로 교체합니다 ────────────────────
   서명본도 01_견적서 폴더에 넣되 파일명 뒤에 _서명본을 붙여 구분하고,
   견적대장의 서명 관련 열을 채웁니다.                                  */

function saveEstimateFile_(payload) {
  const code = String(payload.code || '').trim();
  if (!code) return { ok: false, message: '견적번호가 없습니다.' };
  if (!payload.pdfBase64) return { ok: false, message: '견적서 파일 데이터가 없습니다.' };

  const isSigned = String(payload.kind || '') === 'signed';
  const tz = getTimeZone_();
  const now = new Date();

  // 서명본이든 발송본이든 견적서이므로 같은 01_견적서 폴더에 모읍니다.
  let targetFolder = getSiteSubFolder_(code, SITE_ESTIMATE_FOLDER, payload.customerName);
  if (!targetFolder) {
    const rootFolder = getEstimateRootFolder_();
    const yearFolder = getOrCreateFolder_(rootFolder, Utilities.formatDate(now, tz, 'yyyy'));
    targetFolder = getOrCreateFolder_(yearFolder, Utilities.formatDate(now, tz, 'MM월'));
  }

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
      sheet.getRange(rowNo, LEDGER_COL.signStatus).setValue('서명완료');
      sheet.getRange(rowNo, LEDGER_COL.signedAt).setValue(
        payload.signedAt || Utilities.formatDate(now, tz, 'yyyy-MM-dd HH:mm:ss')
      );
      sheet.getRange(rowNo, LEDGER_COL.signMethod).setValue(
        String(payload.signMethod || 'tablet') === 'link' ? '고객폰 링크' : '현장 태블릿'
      );
      sheet.getRange(rowNo, LEDGER_COL.signedFileUrl).setValue(url);

      // 계약상태가 비어 있으면 서명 사실을 남겨 미계약 목록에서 빠지게 합니다.
      const contract = String(sheet.getRange(rowNo, LEDGER_COL.contractStatus).getDisplayValue() || '').trim();
      if (!contract) sheet.getRange(rowNo, LEDGER_COL.contractStatus).setValue('견적서 서명완료');
    } else {
      sheet.getRange(rowNo, LEDGER_COL.fileUrl).setValue(url);
    }
  }

  return { ok: true, code: code, signed: isSigned, url: url, folderUrl: targetFolder.getUrl() };
}


/* ── [참고] doGet 의 version 표기도 v22 로 올려 두면 배포 확인이 편합니다.
   version: 'v22'
   ========================================================================= */
