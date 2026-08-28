/**
 * =============================================================
 *  UNION ONE 현장견적 — 연결 확인
 *  파일명: 연결확인.js
 * -------------------------------------------------------------
 *  붙어야 할 곳이 다 붙었는지만 봅니다. 아무것도 바꾸지 않습니다.
 * =============================================================
 */
function 연결확인() {
  var 줄 = [];

  try {
    var ss = getSpreadsheet();
    줄.push('견적 시트      →  ' + ss.getName());
  } catch (e) {
    줄.push('견적 시트      →  실패. 스크립트 속성 SHEET_ID 를 확인하세요');
  }

  try {
    var wb = getWorkboardSpreadsheet_();
    줄.push('워크보드 시트  →  ' + wb.getName());
  } catch (e) {
    줄.push('워크보드 시트  →  실패. 스크립트 속성 WORKBOARD_ID 를 확인하세요');
  }

  try {
    var 직원 = readWorkboardStaff_();
    줄.push('직원           →  ' + 직원.length + '명');
    직원.forEach(function (s) {
      줄.push('   ' + s.displayName + '  ·  ' + s.phone + '  ·  등급 ' + s.grade +
              '  ·  ' + s.role + '  ·  PIN ' + (s.pinHash ? '설정됨' : '없음'));
    });
  } catch (e) {
    줄.push('직원           →  실패. ' + (e && e.message ? e.message : e));
  }

  [['현장 폴더', SITE_ROOT_FOLDER_ID],
   ['안전동의서 폴더', SAFETY_FOLDER_ID],
   ['견적서 폴더', ESTIMATE_FOLDER_ID]].forEach(function (한쌍) {
    try {
      줄.push(한쌍[0] + '  →  ' + DriveApp.getFolderById(한쌍[1]).getName());
    } catch (e) {
      줄.push(한쌍[0] + '  →  실패. 폴더 ID 를 확인하세요');
    }
  });

  줄.push('getPinMap      →  없음 (정상)');
  줄.push('담당자관리 시트 →  안 씀 (정상)');

  var 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}
