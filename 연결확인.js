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

  /* 폴더 상수는 2026-08-29 부터 SITE_ROOT_FOLDER_ID 하나뿐입니다.
     견적서·안전동의서·현장사진이 전부 현장 폴더 안으로 들어갑니다. */
  try {
    var 현장root = DriveApp.getFolderById(SITE_ROOT_FOLDER_ID);
    줄.push('현장 폴더      →  ' + 현장root.getName());

    var 연도 = 0, 낱개 = 0, 현장 = 0;
    var 하위 = 현장root.getFolders();
    while (하위.hasNext()) {
      var 이름 = 하위.next().getName();
      if (/^\d{4}$/.test(이름)) 연도 += 1;
      else if (이름 !== SITE_UNKNOWN_FOLDER) 현장 += 1;   // _현장미지정 은 아래에서 따로 센다
    }
    var 파일 = 현장root.getFiles();
    while (파일.hasNext()) { 파일.next(); 낱개 += 1; }

    줄.push('   현장 폴더 ' + 현장 + '개');
    줄.push('   연도 폴더 ' + 연도 + '개' + (연도 ? '  ★ 파일이름_정리하기(true) 로 확인하세요' : '  (정상)'));
    줄.push('   낱개 파일 ' + 낱개 + '개' + (낱개 ? '  ★ 파일이름_정리하기(true) 로 확인하세요' : '  (정상)'));

    /* _현장미지정 은 현장을 끝내 알 수 없을 때만 쓰는 예외 자리입니다.
       조용히 쌓이면 아무도 모르므로 여기에 개수를 찍습니다. */
    줄.push(미지정확인_());
  } catch (e) {
    줄.push('현장 폴더      →  실패. SITE_ROOT_FOLDER_ID 를 확인하세요');
  }

  줄.push('견적서·동의서  →  현장 폴더 안 01_견적서 · 09_동의서 (별도 폴더 없음)');

  줄.push('getPinMap      →  없음 (정상)');
  줄.push('담당자관리 시트 →  안 씀 (정상)');

  var 결과 = 줄.join('\n');
  Logger.log(결과);
  return 결과;
}



/**
 * _현장미지정 에 무엇이 얼마나 쌓였는지 봅니다.
 *
 * 여기 들어가는 것은 둘뿐입니다.
 *   · 안전동의서 화면에서 현장을 고르지 않고 제출한 동의서
 *   · 견적대장에 없는 번호로 올라온 견적서
 * 사람이 어느 현장 것인지 정해서 옮겨 주어야 하는 파일들입니다.
 */
function 미지정확인_() {
  var box = null;
  try {
    var found = DriveApp.getFolderById(SITE_ROOT_FOLDER_ID).getFoldersByName(SITE_UNKNOWN_FOLDER);
    box = found.hasNext() ? found.next() : null;
  } catch (e) {
    return '   _현장미지정  →  못 읽었습니다';
  }

  if (!box) return '   _현장미지정  없음 (정상)';

  var 세기 = function (folder) {
    var n = 0;
    var files = folder.getFiles();
    while (files.hasNext()) { files.next(); n += 1; }
    return n;
  };

  var 칸별 = [];
  var 합계 = 0;

  var 바로 = 세기(box);
  if (바로) { 칸별.push('바로 아래 ' + 바로 + '개'); 합계 += 바로; }

  var 하위 = box.getFolders();
  while (하위.hasNext()) {
    var sub = 하위.next();
    var n = 세기(sub);
    합계 += n;
    if (n) 칸별.push(sub.getName() + ' ' + n + '개');
  }

  if (!합계) return '   _현장미지정  0개 (정상)';

  return '   _현장미지정  ' + 합계 + '개  (' + 칸별.join(' · ') + ')' +
         '\n      ★ 현장을 모르는 파일입니다. 어느 현장 것인지 정해서 옮겨 주세요.' +
         '\n        ' + box.getUrl();
}