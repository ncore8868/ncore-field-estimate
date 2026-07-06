N-CORE 현장 견적 PWA 베타 설치 안내

[이 파일의 목적]
- Pretendard WOFF2 폰트가 정상 적용되는 HTTPS 실행 환경
- 태블릿 홈 화면에 앱처럼 설치
- 설치 후 주소창 없이 N-CORE 견적 프로그램 실행

[1. 배포 전]
이 폴더의 파일 구조를 바꾸지 마세요.

NCORE_FieldEstimate_PWA_Beta_v1/
 ├ index.html
 ├ PretendardVariable.woff2
 ├ manifest.webmanifest
 ├ sw.js
 └ icons/
    ├ icon-192.png
    └ icon-512.png

[2. 실제 실행]
이 폴더를 HTTPS 정적 웹호스팅에 올려야 합니다.
배포 후 생성된 https:// 주소를 갤럭시 탭 Chrome으로 엽니다.

[3. 태블릿 홈 화면 설치]
Chrome 우측 상단 ⋮
→ 앱 설치 또는 홈 화면에 추가
→ 설치
→ 홈 화면의 N-CORE 견적 아이콘 실행

[중요]
- 이 PWA 베타본은 첫 실행에 인터넷이 필요합니다.
- 구글시트 저장과 PDF 생성도 현장 데이터/와이파이가 필요합니다.
- 화면/UI 최종 보정은 반드시 이 설치형 PWA 환경에서 캡처를 받은 뒤 진행합니다.
- Google Apps Script 저장 URL은 기존 HTML에 들어가 있던 값을 그대로 유지했습니다.
