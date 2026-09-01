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

  /* ★ 비밀값은 이제 코드가 아니라 스크립트 속성에 있습니다 (2026-08-31).
     하나라도 비어 있으면 앱이 그 자리에서 멈추므로 여기서 먼저 봅니다. */
  줄.push('── 스크립트 속성 ──');
  [
    ['SHEET_ID',            '필수', '견적 스프레드시트 (NCORE_견적)'],
    ['WORKBOARD_ID',        '필수', '워크보드 스프레드시트 (UNIONONE_DATA)'],
    ['ATTENDANCE_ID',       '선택', '출퇴근 스프레드시트 (없으면 참고줄만 안 뜸)'],
    ['SIGN_SECRET',         '필수', '★ 고객 서명 링크 비밀키 — 반드시 넣어야 합니다'],
    ['SESSION_SECRET',      '필수', '★ 출입증 비밀키 — 반드시 넣어야 합니다'],
    ['SITE_ROOT_FOLDER_ID', '선택', '공유 드라이브 01_현장 폴더 (없으면 지금 값 그대로)'],
    ['WORKBOARD_SALT',      '선택', 'PIN 소금값 (없으면 지금 값 그대로)'],
    ['EXCEL_API_KEY',       '선택', '엑셀 내려받기 열쇠 (없으면 지금 값 그대로)'],
    ['SIGN_SECRET_OLD',     '한시', '옛 서명키 — 보낸 링크가 다 처리되면 지우세요']
  ].forEach(function (row) {
    var key = row[0], 구분 = row[1], 설명 = row[2];
    var 있음 = false;
    try { 있음 = !!String(PropertiesService.getScriptProperties().getProperty(key) || '').trim(); }
    catch (e) { 있음 = false; }

    var 표시;
    if (있음) 표시 = '들어 있음';
    else if (구분 === '필수') 표시 = '★ 비어 있습니다 — 넣어야 앱이 돕니다';
    else if (구분 === '한시') 표시 = '없음 (정상 — 이미 정리된 상태)';
    else 표시 = '없음';

    줄.push('   ' + (key + '                    ').slice(0, 20) + 표시 + '   · ' + 설명);
  });
  줄.push('');

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
    var 현장root = DriveApp.getFolderById(siteRootFolderId_());
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
  줄.push('staffList      →  없음 (정상 — 직원 명부를 내주던 통로였습니다)');
  줄.push('담당자관리 시트 →  안 씀 (정상)');
  줄.push('신분 확인      →  로그인 밖 통로는 ' +
          Object.keys(OPEN_ACTIONS).join(' · ') + ' 뿐 (그 외는 출입증 필요)');
  줄.push('출입증         →  ' + 출입증점검_());

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
    var found = DriveApp.getFolderById(siteRootFolderId_()).getFoldersByName(SITE_UNKNOWN_FOLDER);
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

/**
 * 출입증을 한 장 만들어 보고 그것을 도로 읽어 봅니다.
 *
 * ★ 이 줄을 넣은 이유 (2026-09-01)
 *   출입증을 확인하는 함수들이 통째로 빠진 채 배포되어 견적 앱이 멈춘 적이 있습니다.
 *   부르는 쪽만 있고 만들어진 곳이 없어도 배포는 그냥 되기 때문에,
 *   여기서 실제로 한 번 만들고 읽어 보는 것이 유일하게 확실한 확인입니다.
 */
function 출입증점검_() {
  var 시험번호 = '01000000000';
  try {
    var 표 = makePass_(시험번호);
    if (passPhone_(표) !== 시험번호) return '★ 만든 출입증을 도로 못 읽습니다';
    if (passPhone_(표 + 'x')) return '★ 망가뜨린 출입증이 통과합니다';
    if (passPhone_('')) return '★ 빈 출입증이 통과합니다';
    return '정상 (만들고 읽고 · 위조 막힘)';
  } catch (e) {
    return '★ 실패. ' + (e && e.message ? e.message : e);
  }
}
