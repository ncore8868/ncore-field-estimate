/* =========================================================================
   N-CORE 현장견적 — 견적서 v2 서식 + 전자서명 (1단계)
   파일명: ncore-estimate-v2.js
   위치  : index.html 과 같은 폴더

   index.html 의 </body> 바로 위에 아래 한 줄을 추가하세요.
     <script src="./ncore-estimate-v2.js"></script>

   이 파일이 하는 일
     1) 공사기간(일) 입력칸을 1단계 현장정보에 끼워 넣습니다.
     2) 견적서를 세금계산서형 서식으로 다시 그립니다.
        (공급자 사업자정보 · 항목별 내역 · 공급가액/부가세/총계)
     3) 시공사 칸에 회사 도장을 항상 자동으로 찍습니다.
     4) 발주자 칸을 누르면 서명 패드가 떠서 고객이 직접 서명합니다.
     5) 서명본 PDF 를 구글드라이브 01_견적서 폴더에 저장합니다.
     6) 안드로이드 뒤로가기로 앱이 꺼지지 않고 직전 화면으로 돌아갑니다.

   왜 통짜 수정이 아니라 별도 파일인가
     index.html 의 기존 함수는 전역에 선언되어 있어서, 나중에 읽히는
     이 파일에서 같은 이름으로 덮어쓰면 그대로 교체됩니다.
     기존 5,000줄을 건드리지 않으므로 문제가 생기면 이 한 줄만 빼면
     즉시 원래대로 돌아갑니다.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------------
     0. 공급자 정보 · 기준값
     사업자정보가 견적서에 찍혀 있어야 철거지원금 심사에서 인정됩니다.
     상호나 주소가 바뀌면 여기만 고치면 됩니다.
     --------------------------------------------------------------- */
  const SUPPLIER = {
    bizNo: "210-88-03747",
    company: "엔코어㈜",
    ceo: "이재현",
    address: "대구광역시 동구 동화천로 77길 46, 3층",
    bizType: "건설업",
    bizItem: "철거 및 리모델링",
    tel: "010-3700-8828",
    tel2: "1551-8757",
    fax: "053-323-8868",
    email: "n-core8868@naver.com",
    insta: "n_coredemolition",
    bank: "KB국민 엔코어㈜ 675001-04-342392"
  };

  const VAT_RATE = 0.1;
  const STAMP_FILE = "./ncore-stamp.png";
  const LOGO_FILE = "./ncore-logo-v8.png";
  const MARK_FILE = "./ncore-watermark-v8.png";

  const TERMS = [
    "공사 착수 전 총 계약금액의 50%를 계약금으로 선입금하며, 입금 확인 후 공사를 진행합니다.",
    "공사 범위 외 추가 작업 및 현장 여건 변경 사항은 별도 협의 후 반영합니다.",
    "폐기물 발생량, 반출 조건 및 현장 상황에 따라 추가 비용이 발생할 수 있습니다."
  ];

  const PAPER_W = 794;
  const PAPER_H = 1123;

  /* 도장 파일이 아직 없을 때 임시로 쓰는 대체 도장.
     ncore-stamp.png 를 폴더에 넣으면 자동으로 그쪽이 우선합니다. */
  const FALLBACK_STAMP =
    "data:image/svg+xml;charset=utf-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
      '<circle cx="100" cy="100" r="92" fill="none" stroke="#C8102E" stroke-width="9"/>' +
      '<circle cx="100" cy="100" r="78" fill="none" stroke="#C8102E" stroke-width="3"/>' +
      '<text x="100" y="92" text-anchor="middle" fill="#C8102E" font-size="42" font-weight="900" font-family="sans-serif">엔코어</text>' +
      '<text x="100" y="134" text-anchor="middle" fill="#C8102E" font-size="26" font-weight="900" font-family="sans-serif">주식회사</text>' +
      "</svg>"
    );

  let stampSrc = FALLBACK_STAMP;

  /* ---------------------------------------------------------------
     1. 공통 유틸
     --------------------------------------------------------------- */
  const esc = (v) =>
    String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const num = (n) => (Math.round(Number(n) || 0)).toLocaleString("ko-KR");

  function todayText() {
    const d = new Date();
    return d.getFullYear() + "년 " +
      String(d.getMonth() + 1).padStart(2, "0") + "월 " +
      String(d.getDate()).padStart(2, "0") + "일";
  }

  function safeName(v) {
    return String(v || "고객").replace(/[\\/:*?"<>|]/g, "").trim() || "고객";
  }

  /* ---------------------------------------------------------------
     2. 금액 — 부가세 별도
     기존 총 확인 금액을 '공급가액'으로 그대로 씁니다.
     견적대장에 넘기는 totalAmount 도 공급가액 그대로 두어야
     이전 데이터와 숫자 기준이 어긋나지 않습니다.
     --------------------------------------------------------------- */
  function supplyAmount() {
    const saved = window.state && state.savedEstimate;
    if (saved && typeof saved.total === "number") return saved.total;
    return getDisplayTotalAmount();
  }

  function vatAmount() {
    return Math.round((supplyAmount() * VAT_RATE) / 10) * 10;
  }

  function grandTotal() {
    return supplyAmount() + vatAmount();
  }

  window.getSupplyAmount = supplyAmount;
  window.getVatAmount = vatAmount;
  window.getGrandTotal = grandTotal;

  /* ---------------------------------------------------------------
     3. 상태 초기화
     --------------------------------------------------------------- */
  function initState() {
    if (!window.state) return;
    if (typeof state.project.workDays !== "number") state.project.workDays = 1;
    if (!state.signature) {
      state.signature = {
        company: { auto: true },
        customer: { dataUrl: "", signedAt: "", method: "" }
      };
    }
  }

  function isSigned() {
    return !!(state.signature && state.signature.customer && state.signature.customer.dataUrl);
  }

  /* 기존 전역 함수를 감싸서 뒤에 우리 처리만 덧붙입니다. */
  function wrap(name, after) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = function () {
      const result = original.apply(this, arguments);
      try { after.apply(this, arguments); } catch (e) { console.warn(name + " 후처리 오류", e); }
      return result;
    };
  }

  /* ---------------------------------------------------------------
     4. 공사기간 입력칸 주입
     --------------------------------------------------------------- */
  function injectWorkDaysField() {
    if (document.getElementById("nc2WorkDaysField")) return;
    const pyeong = document.getElementById("sitePyeong");
    if (!pyeong) return;
    const anchor = pyeong.closest(".project-field");
    if (!anchor || !anchor.parentElement) return;

    const field = document.createElement("div");
    field.className = "project-field";
    field.id = "nc2WorkDaysField";
    field.innerHTML =
      '<span class="project-field-label">' +
        "<strong>공사기간</strong>" +
        "<span>예상 작업 일수 · 견적서에 표시됩니다</span>" +
      "</span>" +
      '<div class="site-counter">' +
        '<button type="button" data-nc2-workdays="-1">−</button>' +
        '<div class="site-value"><span id="nc2WorkDaysLabel">1</span><span class="site-unit">일</span></div>' +
        '<button type="button" data-nc2-workdays="1">+</button>' +
      "</div>";

    anchor.parentElement.insertBefore(field, anchor.nextSibling);
    renderWorkDays();
  }

  function renderWorkDays() {
    const label = document.getElementById("nc2WorkDaysLabel");
    if (label) label.textContent = Number(state.project.workDays) || 1;
  }

  document.addEventListener("click", function (event) {
    const btn = event.target.closest("[data-nc2-workdays]");
    if (!btn) return;
    event.preventDefault();
    const step = Number(btn.dataset.nc2Workdays) || 0;
    const next = (Number(state.project.workDays) || 1) + step;
    state.project.workDays = Math.max(1, Math.min(365, next));
    renderWorkDays();
    if (typeof saveDraftSoon === "function") saveDraftSoon();
  });

  /* ---------------------------------------------------------------
     5. 내역표 행 만들기
     대분류(철거·원상복구·보양청소)는 배분 금액이라 '식 1' 대표행으로,
     장비·폐기물은 실제 수량과 단가가 있으므로 그대로 펼칩니다.
     --------------------------------------------------------------- */
  const EQUIP_ROWS = [
    { key: "sky", name: "스카이차", rate: "sky", unit: "일" },
    { key: "ladder", name: "사다리차", rate: "ladder", unit: "일" },
    { key: "miniFork", name: "미니포크레인", rate: "miniFork", unit: "일" },
    { key: "highRental", name: "고소렌탈", rate: "highRental", unit: "일" },
    { key: "btScaffold", name: "비티아시바", rate: "btScaffold", unit: "일" }
  ];

  const WASTE_ROWS = [
    { key: "truck1Wood", name: "폐기물 운반", spec: "1톤 목재", rate: "truck1Wood" },
    { key: "truck1Mixed", name: "폐기물 운반", spec: "1톤 혼합", rate: "truck1Mixed" },
    { key: "truck1Concrete", name: "폐기물 운반", spec: "1톤 폐콘크리트", rate: "truck1Concrete" },
    { key: "truck25Wood", name: "폐기물 운반", spec: "2.5톤 목재", rate: "truck25Wood" },
    { key: "truck25Mixed", name: "폐기물 운반", spec: "2.5톤 혼합", rate: "truck25Mixed" },
    { key: "truck25Concrete", name: "폐기물 운반", spec: "2.5톤 폐콘크리트", rate: "truck25Concrete" },
    { key: "truck5Wood", name: "폐기물 운반", spec: "5톤 목재", rate: "truck5Wood" },
    { key: "truck5Mixed", name: "폐기물 운반", spec: "5톤 혼합", rate: "truck5Mixed" },
    { key: "truck5Concrete", name: "폐기물 운반", spec: "5톤 폐콘크리트", rate: "truck5Concrete" }
  ];

  const ALLOC_KEYS = [
    { key: "demolition", label: "철거" },
    { key: "restoration", label: "원상복구" },
    { key: "protection", label: "보양·청소" }
  ];

  function buildRows() {
    const grouped = getSelectedScopesGrouped();
    const rows = [];

    ALLOC_KEYS.forEach(function (group) {
      const amount = getCategoryAmount(group.key) || 0;
      const items = grouped[group.key] || [];
      if (amount <= 0 && !items.length) return;

      rows.push({
        head: true,
        group: group.label,
        name: group.label + " 공사",
        spec: "일체",
        unit: "식",
        qty: 1,
        price: amount,
        amount: amount,
        note: ""
      });

      items.forEach(function (label) {
        rows.push({ sub: true, group: "", name: label, spec: "", unit: "", qty: "", price: "", amount: "", note: "" });
      });
    });

    EQUIP_ROWS.forEach(function (item) {
      const qty = Number(state.equipment[item.key]) || 0;
      if (qty <= 0) return;
      const price = fixedRates[item.rate];
      rows.push({
        head: true, group: "장비", name: item.name, spec: "임대",
        unit: item.unit, qty: qty, price: price,
        amount: roundToManwon(qty * price), note: ""
      });
    });

    WASTE_ROWS.forEach(function (item) {
      const qty = Number(state.waste[item.key]) || 0;
      if (qty <= 0) return;
      const price = fixedRates[item.rate];
      rows.push({
        head: true, group: "폐기물", name: item.name, spec: item.spec,
        unit: "회", qty: qty, price: price,
        amount: roundToManwon(qty * price), note: ""
      });
    });

    return rows;
  }

  /* 같은 구분이 이어지면 첫 줄에만 구분명을 남깁니다. */
  function collapseGroupColumn(rows) {
    let last = "";
    rows.forEach(function (row) {
      if (row.sub) return;
      if (row.group && row.group === last) row.groupText = "";
      else { row.groupText = row.group; last = row.group || last; }
    });
    return rows;
  }

  /* ---------------------------------------------------------------
     6. 견적서 서식 v2
     화면과 PDF가 같은 HTML을 쓰므로 보이는 그대로 저장됩니다.
     --------------------------------------------------------------- */
  function metaRow(label, value, label2, value2) {
    if (label2) {
      return '<div class="nc2-meta-row nc2-meta-split">' +
        '<div class="nc2-meta-k">' + esc(label) + "</div>" +
        '<div class="nc2-meta-v">' + esc(value) + "</div>" +
        '<div class="nc2-meta-k">' + esc(label2) + "</div>" +
        '<div class="nc2-meta-v">' + esc(value2) + "</div>" +
        "</div>";
    }
    return '<div class="nc2-meta-row">' +
      '<div class="nc2-meta-k">' + esc(label) + "</div>" +
      '<div class="nc2-meta-v nc2-meta-wide">' + esc(value) + "</div>" +
      "</div>";
  }

  function buildDocHtml(idAttr) {
    if (typeof calc === "function") calc();
    initState();

    const saved = (window.state && state.savedEstimate) || {};
    const project = saved.project || state.project || {};
    const rows = collapseGroupColumn(buildRows());

    /* 행이 많으면 글자와 줄높이를 단계적으로 줄여 1장에 맞춥니다. */
    let density = "";
    if (rows.length > 34) density = " nc2-dense-2";
    else if (rows.length > 24) density = " nc2-dense-1";

    const supply = supplyAmount();
    const vat = vatAmount();
    const total = supply + vat;

    const customerSign = state.signature.customer;

    const bodyRows = rows.map(function (row) {
      if (row.sub) {
        return '<tr class="nc2-sub">' +
          "<td></td>" +
          '<td class="nc2-l nc2-subname">└ ' + esc(row.name) + "</td>" +
          '<td colspan="6"></td>' +
          "</tr>";
      }
      return "<tr>" +
        '<td class="nc2-c nc2-grp">' + esc(row.groupText || "") + "</td>" +
        '<td class="nc2-l">' + esc(row.name) + "</td>" +
        '<td class="nc2-c nc2-spec">' + esc(row.spec || "") + "</td>" +
        '<td class="nc2-c">' + esc(row.unit || "") + "</td>" +
        '<td class="nc2-c">' + esc(row.qty === "" ? "" : row.qty) + "</td>" +
        '<td class="nc2-r">' + (row.price === "" ? "" : num(row.price)) + "</td>" +
        '<td class="nc2-r nc2-amt">' + (row.amount === "" ? "" : num(row.amount)) + "</td>" +
        '<td class="nc2-c nc2-note">' + esc(row.note || "") + "</td>" +
        "</tr>";
    }).join("");

    const signedStamp =
      '<img class="nc2-stamp" src="' + stampSrc + '" alt="시공사 직인" />';

    const customerBox = customerSign.dataUrl
      ? '<img class="nc2-sign-img" src="' + customerSign.dataUrl + '" alt="발주자 서명" />'
      : '<span class="nc2-sign-empty">(인)</span>';

    return '' +
      '<section ' + idAttr + ' class="nc2-paper' + density + '">' +
        '<img class="nc2-watermark" src="' + MARK_FILE + '" alt="" aria-hidden="true" />' +

        /* 머리 */
        '<header class="nc2-head">' +
          '<img class="nc2-logo" src="' + LOGO_FILE + '" alt="N-CORE" />' +
          '<h1 class="nc2-title">견 적 서</h1>' +
        "</header>" +

        /* 고객 · 공급자 */
        '<div class="nc2-top">' +
          '<div class="nc2-client">' +
            '<div class="nc2-client-name">' +
              "<strong>" + esc(project.customerName || "-") + "</strong>" +
              "<span>귀하</span>" +
            "</div>" +
            '<div class="nc2-client-grid">' +
              '<div class="nc2-ck">견적일자</div><div class="nc2-cv">' + esc(todayText()) + "</div>" +
              '<div class="nc2-ck">공사기간</div><div class="nc2-cv">' + esc((Number(project.workDays) || 1) + "일") + "</div>" +
              '<div class="nc2-ck">견적번호</div><div class="nc2-cv">' + esc(saved.code || state.estimateCode || "-") + "</div>" +
              '<div class="nc2-ck">담당자</div><div class="nc2-cv">' + esc((saved.staff && saved.staff.name) || getCurrentStaffName() || "-") + "</div>" +
            "</div>" +
          "</div>" +

          '<div class="nc2-meta">' +
            metaRow("등록번호", SUPPLIER.bizNo) +
            metaRow("상호명", SUPPLIER.company, "대표자", SUPPLIER.ceo) +
            metaRow("소재지", SUPPLIER.address) +
            metaRow("업태", SUPPLIER.bizType, "종목", SUPPLIER.bizItem) +
            metaRow("전화번호", SUPPLIER.tel, "FAX", SUPPLIER.fax) +
          "</div>" +
        "</div>" +

        /* 현장 */
        '<div class="nc2-site">' +
          "<span>현장주소</span><strong>" + esc(project.address || "-") + "</strong>" +
          "<span>연락처</span><strong>" + esc(project.phone || "-") + "</strong>" +
        "</div>" +

        /* 내역 */
        '<table class="nc2-table">' +
          "<colgroup>" +
            '<col style="width:66px" /><col /><col style="width:88px" />' +
            '<col style="width:40px" /><col style="width:44px" />' +
            '<col style="width:92px" /><col style="width:104px" /><col style="width:76px" />' +
          "</colgroup>" +
          "<thead><tr>" +
            "<th>구 분</th><th>품 명</th><th>규 격</th><th>단위</th>" +
            "<th>수량</th><th>단 가</th><th>금 액</th><th>비 고</th>" +
          "</tr></thead>" +
          "<tbody>" + (bodyRows || '<tr><td colspan="8" class="nc2-c">선택된 작업 범위가 없습니다.</td></tr>') + "</tbody>" +
        "</table>" +

        /* 서명 + 합계 */
        '<div class="nc2-foot">' +
          '<div class="nc2-signs">' +
            '<div class="nc2-sign-cell">' +
              '<div class="nc2-sign-label">시공사</div>' +
              '<div class="nc2-sign-box">' + signedStamp + "</div>" +
            "</div>" +
            '<div class="nc2-sign-cell">' +
              '<div class="nc2-sign-label">발주자</div>' +
              '<div class="nc2-sign-box nc2-sign-touch" data-nc2-sign="customer">' + customerBox + "</div>" +
              (customerSign.signedAt
                ? '<div class="nc2-sign-at">' + esc(customerSign.signedAt) + "</div>"
                : '<div class="nc2-sign-at nc2-sign-hint">터치하여 서명</div>') +
            "</div>" +
          "</div>" +

          '<div class="nc2-total">' +
            '<div class="nc2-total-row"><span>합 계</span><strong>' + num(supply) + "</strong></div>" +
            '<div class="nc2-total-row"><span>부가세(10%)</span><strong>' + num(vat) + "</strong></div>" +
            '<div class="nc2-total-row nc2-total-grand"><span>총 계</span><strong>' + num(total) + "</strong></div>" +
          "</div>" +
        "</div>" +

        /* 특약 */
        '<div class="nc2-terms">' +
          "<div class=\"nc2-terms-title\">특약사항</div>" +
          "<ol>" + TERMS.map(function (t) { return "<li>" + esc(t) + "</li>"; }).join("") + "</ol>" +
        "</div>" +

        /* 푸터 */
        '<div class="nc2-bottom">' +
          '<div class="nc2-bank">계좌번호: ' + esc(SUPPLIER.bank) + "</div>" +
          '<div class="nc2-contact">' +
            "<span>" + esc(SUPPLIER.tel2) + "</span>" +
            "<span>" + esc(SUPPLIER.fax) + "</span>" +
            "<span>" + esc(SUPPLIER.email) + "</span>" +
            "<span>" + esc(SUPPLIER.insta) + "</span>" +
          "</div>" +
        "</div>" +
        '<div class="nc2-rule"></div>' +
      "</section>";
  }

  /* ---------------------------------------------------------------
     7. 기존 렌더 함수 교체
     --------------------------------------------------------------- */
  window.buildPdfRenderPage = function () {
    if (!state.savedEstimate && typeof saveEstimateDraft === "function") saveEstimateDraft();
    return buildDocHtml('id="pdfPaper"');
  };

  window.renderEstimatePage = function () {
    if (typeof calc === "function") calc();
    if (!state.savedEstimate && typeof saveEstimateDraft === "function") saveEstimateDraft();

    const panel = document.querySelector("#page5 .estimate-doc");
    if (!panel) return;

    panel.innerHTML =
      '<div class="nc2-screen-host"><div class="nc2-screen-wrap">' +
      buildDocHtml("") +
      "</div></div>";

    fitScreenDoc();
    updateSideSummary();
    lockWhenSigned();
  };

  /* 화면 폭에 맞춰 A4 원본을 통째로 축소합니다.
     보이는 화면과 저장되는 PDF가 어긋나지 않게 하려는 목적입니다. */
  function fitScreenDoc() {
    const host = document.querySelector(".nc2-screen-host");
    const wrap = document.querySelector(".nc2-screen-wrap");
    if (!host || !wrap) return;

    const availW = host.clientWidth || PAPER_W;
    const panel = host.closest(".estimate-doc");
    const availH = panel ? panel.clientHeight - 32 : 0;

    let k = availW / PAPER_W;
    if (availH > 240) k = Math.min(k, availH / PAPER_H);
    k = Math.max(0.22, Math.min(k, 1.15));

    wrap.style.transform = "scale(" + k + ")";
    host.style.height = Math.round(PAPER_H * k) + "px";
  }

  window.addEventListener("resize", function () {
    if (document.querySelector(".nc2-screen-host")) fitScreenDoc();
  });

  /* 오른쪽 요약 카드에 공급가액·부가세·총계를 붙입니다. */
  function updateSideSummary() {
    const side = document.querySelector("#page5 .estimate-side");
    if (!side) return;

    let card = document.getElementById("nc2AmountCard");
    if (!card) {
      card = document.createElement("div");
      card.id = "nc2AmountCard";
      card.className = "nc2-amount-card";
      side.insertBefore(card, side.firstChild);
    }

    card.innerHTML =
      '<div class="nc2-amount-row"><span>공급가액</span><strong>' + num(supplyAmount()) + "원</strong></div>" +
      '<div class="nc2-amount-row"><span>부가세 10%</span><strong>' + num(vatAmount()) + "원</strong></div>" +
      '<div class="nc2-amount-row nc2-amount-grand"><span>총 계</span><strong>' + num(grandTotal()) + "원</strong></div>";
  }

  /* ---------------------------------------------------------------
     8. 서명 패드
     safety.html 에서 쓰던 방식 그대로입니다.
     --------------------------------------------------------------- */
  let signCtx = null;
  let signCanvas = null;
  let drawing = false;
  let hasInk = false;

  function buildSignModal() {
    if (document.getElementById("nc2SignModal")) return;

    const modal = document.createElement("div");
    modal.id = "nc2SignModal";
    modal.className = "modal-backdrop";
    modal.innerHTML =
      '<div class="modal-card nc2-sign-card">' +
        '<div class="modal-title">발주자 서명</div>' +
        '<div class="modal-text">아래 칸에 서명해 주세요. 서명하면 견적서에 바로 반영됩니다.</div>' +
        '<div class="nc2-pad-wrap">' +
          '<canvas id="nc2SignCanvas"></canvas>' +
          '<div class="nc2-pad-guide" id="nc2PadGuide">여기에 서명</div>' +
        "</div>" +
        '<div class="nc2-sign-actions">' +
          '<button type="button" class="modal-btn cancel" id="nc2SignClear">다시 쓰기</button>' +
          '<button type="button" class="modal-btn cancel" id="nc2SignCancel">취소</button>' +
          '<button type="button" class="modal-btn confirm" id="nc2SignApply">서명 완료</button>' +
        "</div>" +
      "</div>";

    document.body.appendChild(modal);

    signCanvas = document.getElementById("nc2SignCanvas");
    signCtx = signCanvas.getContext("2d");

    signCanvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      signCanvas.setPointerCapture(e.pointerId);
      drawing = true;
      hasInk = true;
      document.getElementById("nc2PadGuide").style.display = "none";
      const p = padPoint(e);
      signCtx.beginPath();
      signCtx.moveTo(p.x, p.y);
    });

    signCanvas.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      e.preventDefault();
      const p = padPoint(e);
      signCtx.lineTo(p.x, p.y);
      signCtx.stroke();
    });

    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
      signCanvas.addEventListener(ev, function () { drawing = false; });
    });

    document.getElementById("nc2SignClear").addEventListener("click", clearPad);
    document.getElementById("nc2SignCancel").addEventListener("click", closeSignModal);
    document.getElementById("nc2SignApply").addEventListener("click", applySignature);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeSignModal(); });
  }

  function padPoint(e) {
    const r = signCanvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function resizePad() {
    const rect = signCanvas.getBoundingClientRect();
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    signCanvas.width = Math.round(rect.width * dpr);
    signCanvas.height = Math.round(rect.height * dpr);
    signCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    signCtx.lineCap = "round";
    signCtx.lineJoin = "round";
    signCtx.strokeStyle = "#111";
    signCtx.lineWidth = 3;
  }

  function clearPad() {
    const rect = signCanvas.getBoundingClientRect();
    signCtx.clearRect(0, 0, rect.width, rect.height);
    hasInk = false;
    document.getElementById("nc2PadGuide").style.display = "block";
  }

  function openSignModal() {
    buildSignModal();
    document.getElementById("nc2SignModal").classList.add("show");
    setTimeout(function () { resizePad(); clearPad(); }, 60);
  }

  function closeSignModal() {
    const modal = document.getElementById("nc2SignModal");
    if (modal) modal.classList.remove("show");
    drawing = false;
  }

  /* 서명 이미지는 여백을 잘라내 서명칸에 꽉 차게 넣습니다. */
  function trimSignature(source) {
    const w = source.width;
    const h = source.height;
    const data = source.getContext("2d").getImageData(0, 0, w, h).data;

    let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] > 12) {
          found = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (!found) return source.toDataURL("image/png");

    const pad = 10;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);

    const out = document.createElement("canvas");
    out.width = maxX - minX + 1;
    out.height = maxY - minY + 1;
    out.getContext("2d").drawImage(source, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function applySignature() {
    if (!hasInk) { alert("서명을 먼저 작성해 주세요."); return; }

    const now = new Date();
    state.signature.customer = {
      dataUrl: trimSignature(signCanvas),
      signedAt: now.getFullYear() + "-" +
        String(now.getMonth() + 1).padStart(2, "0") + "-" +
        String(now.getDate()).padStart(2, "0") + " " +
        String(now.getHours()).padStart(2, "0") + ":" +
        String(now.getMinutes()).padStart(2, "0"),
      method: "tablet"
    };

    closeSignModal();
    renderEstimatePage();
    updateSignedButton();
  }

  document.addEventListener("click", function (e) {
    const box = e.target.closest('[data-nc2-sign="customer"]');
    if (!box) return;
    e.preventDefault();
    openSignModal();
  });

  /* ---------------------------------------------------------------
     9. 서명본 저장
     --------------------------------------------------------------- */
  function injectSignedButton() {
    if (document.getElementById("nc2SignedSaveBtn")) return;
    const holder = document.querySelector("#page5 .estimate-pdf-actions");
    if (!holder) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "nc2SignedSaveBtn";
    btn.className = "estimate-pdf-btn primary";
    btn.textContent = "서명본 저장";
    holder.insertBefore(btn, holder.firstChild);
    btn.addEventListener("click", saveSignedCopy);

    updateSignedButton();
  }

  function updateSignedButton() {
    const btn = document.getElementById("nc2SignedSaveBtn");
    if (!btn) return;
    btn.disabled = !isSigned();
    btn.textContent = isSigned() ? "서명본 저장" : "고객 서명 후 저장할 수 있습니다";
  }

  function lockWhenSigned() {
    const prev = document.getElementById("page5Prev");
    if (!prev) return;
    prev.disabled = isSigned();
    prev.style.opacity = isSigned() ? "0.45" : "";
    prev.title = isSigned() ? "서명이 완료된 견적서는 금액을 수정할 수 없습니다." : "";
    updateSignedButton();
  }

  async function saveSignedCopy() {
    if (!isSigned()) return;

    const btn = document.getElementById("nc2SignedSaveBtn");
    const status = document.getElementById("pdfActionStatus");
    const saved = state.savedEstimate || {};
    const project = saved.project || state.project || {};
    const code = saved.code || state.estimateCode || "";

    if (!code) { alert("견적번호가 없습니다. 저장을 먼저 완료해 주세요."); return; }

    btn.disabled = true;
    btn.textContent = "서명본 만드는 중...";
    if (status) status.textContent = "서명본을 만들고 있습니다.";

    try {
      const file = await createEstimatePdfFile();
      const base64 = await fileToBase64(file);

      if (status) status.textContent = "구글드라이브에 저장하고 있습니다.";

      await submitEstimateFileToDrive({
        kind: "signed",
        code: code,
        staffName: getCurrentStaffName(),
        customerName: project.customerName || "",
        savedAt: new Date().toISOString(),
        signMethod: state.signature.customer.method || "tablet",
        signedAt: state.signature.customer.signedAt || "",
        pdfBase64: base64
      });

      /* 태블릿에도 한 부 남깁니다. */
      downloadPdfFile(new File([file], code + "_" + safeName(project.customerName) + "_견적서_서명본.pdf", { type: "application/pdf" }));

      btn.textContent = "서명본 저장 완료";
      if (status) status.textContent = "서명본이 현장 폴더 01_견적서에 저장되었습니다.";
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "서명본 저장";
      if (status) status.textContent = "서명본 저장에 실패했습니다. 통신 상태를 확인해 주세요.";
      alert(err.message || "서명본 저장 중 오류가 발생했습니다.");
    }
  }

  /* ---------------------------------------------------------------
     10. 저장 데이터에 값 추가
     --------------------------------------------------------------- */
  ["buildSavePayload", "buildFieldPayload"].forEach(function (name) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = function () {
      const payload = original.apply(this, arguments);
      if (!payload) return payload;
      payload.site = payload.site || {};
      payload.site.workDays = Number(state.project.workDays) || 1;
      payload.vatAmount = vatAmount();
      payload.grandTotal = grandTotal();
      payload.signed = isSigned();
      return payload;
    };
  });

  wrap("resetEstimateState", function () {
    state.project.workDays = 1;
    state.signature = {
      company: { auto: true },
      customer: { dataUrl: "", signedAt: "", method: "" }
    };
    renderWorkDays();
  });

  wrap("syncProjectInputsFromState", function () {
    injectWorkDaysField();
    renderWorkDays();
  });

  wrap("applyProjectLock", function () {
    const lock = !!state.baseLocked;
    document.querySelectorAll("[data-nc2-workdays]").forEach(function (btn) { btn.disabled = lock; });
  });

  wrap("restoreDraft", function (data) {
    if (data && data.project && data.project.workDays) {
      state.project.workDays = Number(data.project.workDays) || 1;
    }
    renderWorkDays();
  });

  /* ---------------------------------------------------------------
     11. 도장 파일 확인
     ncore-stamp.png 가 있으면 그걸 쓰고, 없으면 임시 도장으로 갑니다.
     --------------------------------------------------------------- */
  function loadStamp() {
    const img = new Image();
    img.onload = function () {
      stampSrc = STAMP_FILE;
      if (document.querySelector(".nc2-screen-host")) renderEstimatePage();
    };
    img.onerror = function () {
      console.warn("ncore-stamp.png 을 찾지 못해 임시 도장을 사용합니다.");
    };
    img.src = STAMP_FILE;
  }

  /* ---------------------------------------------------------------
     11-2. 안드로이드 뒤로가기
     갤럭시 뒤로가기 버튼을 누르면 앱이 통째로 꺼지던 문제를 잡습니다.
     화면을 옮길 때마다 방문기록을 한 칸씩 쌓아 두고,
     뒤로가기가 눌리면 앱이 닫히는 대신 직전 화면으로 되돌립니다.
     - 창(모달)이 떠 있으면 창만 닫습니다.
     - 메인 메뉴에서 누르면 원래대로 앱이 종료됩니다.
     - 서명이 끝난 견적서에서는 되돌아가지 않습니다.
     --------------------------------------------------------------- */
  const origShowPage = window.showPage;
  const origShowScreen = window.showScreen;
  const origShowLogin = window.showLoginScreen;

  let navStack = [];
  let navIndex = -1;
  let navSuppress = false;

  function sameView(a, b) {
    return !!a && !!b && a.type === b.type && String(a.value) === String(b.value);
  }

  function recordView(view) {
    if (navSuppress) return;
    if (sameView(navStack[navIndex], view)) return;

    navStack = navStack.slice(0, navIndex + 1);
    navStack.push(view);
    navIndex = navStack.length - 1;

    const entry = { nc: true, i: navIndex };
    // 첫 화면은 방문기록을 새로 쌓지 않습니다.
    // 여기서 뒤로가기를 누르면 원래대로 앱이 닫혀야 하기 때문입니다.
    if (navIndex === 0) history.replaceState(entry, "");
    else history.pushState(entry, "");
  }

  function applyView(view) {
    navSuppress = true;
    try {
      if (view.type === "page") origShowPage(Number(view.value));
      else origShowScreen(String(view.value));
    } finally {
      navSuppress = false;
    }
  }

  function openModalCount() {
    return document.querySelector(".modal-backdrop.show");
  }

  function initBackNav() {
    if (typeof origShowPage !== "function" || typeof origShowScreen !== "function") return;

    window.showPage = function (pageNo) {
      const result = origShowPage.apply(this, arguments);
      recordView({ type: "page", value: pageNo });
      return result;
    };

    window.showScreen = function (id) {
      const result = origShowScreen.apply(this, arguments);
      recordView({ type: "screen", value: id });
      return result;
    };

    if (typeof origShowLogin === "function") {
      window.showLoginScreen = function () {
        navStack = [];
        navIndex = -1;
        return origShowLogin.apply(this, arguments);
      };
    }

    window.addEventListener("popstate", function (event) {
      // 1) 창이 떠 있으면 창만 닫습니다.
      const modal = openModalCount();
      if (modal) {
        modal.classList.remove("show");
        history.pushState({ nc: true, i: Math.max(navIndex, 0) }, "");
        return;
      }

      const entry = event.state;
      if (!entry || !entry.nc) return;

      // 2) 서명이 끝난 견적서는 금액이 바뀌면 안 되므로 되돌아가지 않습니다.
      const now = navStack[navIndex];
      if (isSigned() && now && now.type === "page" && Number(now.value) === 5) {
        history.pushState({ nc: true, i: navIndex }, "");
        return;
      }

      const target = navStack[entry.i];
      if (!target) return;

      navIndex = entry.i;
      applyView(target);
    });
  }

  /* ---------------------------------------------------------------
     12. 스타일
     --------------------------------------------------------------- */
  const CSS = `
  .nc2-screen-host{width:100%;overflow:hidden;}
  .nc2-screen-wrap{width:${PAPER_W}px;height:${PAPER_H}px;transform-origin:top left;}

  .nc2-paper{position:relative;width:${PAPER_W}px;height:${PAPER_H}px;overflow:hidden;
    padding:38px 40px 26px;background:#fff;color:#111;box-sizing:border-box;
    display:flex;flex-direction:column;isolation:isolate;}
  .nc2-paper *{box-sizing:border-box;}
  .nc2-watermark{position:absolute;left:50%;top:52%;width:440px;max-height:170px;
    transform:translate(-50%,-50%);object-fit:contain;opacity:.06;
    z-index:0;pointer-events:none;}
  .nc2-paper > *:not(.nc2-watermark){position:relative;z-index:1;}

  .nc2-head{display:flex;align-items:center;justify-content:space-between;gap:20px;
    padding-bottom:14px;}
  .nc2-logo{width:auto;height:52px;max-width:280px;object-fit:contain;object-position:left center;display:block;}
  .nc2-title{margin:0;font-size:36px;font-weight:950;letter-spacing:10px;
    padding-left:10px;line-height:1;}

  .nc2-top{display:grid;grid-template-columns:minmax(0,1fr) 400px;gap:18px;align-items:stretch;}
  .nc2-client{display:flex;flex-direction:column;justify-content:space-between;min-width:0;}
  .nc2-client-name{display:flex;align-items:baseline;gap:10px;padding:0 4px 8px;
    border-bottom:2px solid #111;}
  .nc2-client-name strong{font-size:19px;font-weight:900;letter-spacing:-.5px;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .nc2-client-name span{font-size:12px;font-weight:800;color:#555;flex:0 0 auto;}
  .nc2-client-grid{margin-top:10px;display:grid;grid-template-columns:64px minmax(0,1fr);
    border:1px solid #D5D5D5;border-radius:4px;overflow:hidden;font-size:11px;}
  .nc2-ck,.nc2-cv{min-height:23px;display:flex;align-items:center;padding:0 8px;
    border-bottom:1px solid #E8E8E8;}
  .nc2-ck{background:#F6F6F4;color:#666;font-weight:850;border-right:1px solid #E8E8E8;}
  .nc2-cv{font-weight:900;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .nc2-client-grid > *:nth-last-child(-n+2){border-bottom:0;}

  .nc2-meta{border:1px solid #C9C9C9;border-radius:4px;overflow:hidden;font-size:11px;}
  .nc2-meta-row{display:grid;grid-template-columns:74px minmax(0,1fr);border-bottom:1px solid #E2E2E2;}
  .nc2-meta-row:last-child{border-bottom:0;}
  .nc2-meta-split{grid-template-columns:74px minmax(0,1fr) 58px 118px;}
  .nc2-meta-k,.nc2-meta-v{min-height:25px;display:flex;align-items:center;padding:0 9px;}
  .nc2-meta-k{background:#F6F6F4;color:#555;font-weight:900;border-right:1px solid #E2E2E2;}
  .nc2-meta-v{font-weight:900;border-right:1px solid #E2E2E2;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap;}
  .nc2-meta-v:last-child{border-right:0;}
  .nc2-meta-wide{border-right:0;}

  .nc2-site{margin-top:12px;display:grid;grid-template-columns:58px minmax(0,1fr) 46px 132px;
    border:1px solid #D5D5D5;border-radius:4px;overflow:hidden;font-size:11px;}
  .nc2-site span{min-height:25px;display:flex;align-items:center;padding:0 9px;
    background:#F6F6F4;color:#555;font-weight:900;border-right:1px solid #E8E8E8;}
  .nc2-site strong{min-height:25px;display:flex;align-items:center;padding:0 9px;
    font-weight:900;border-right:1px solid #E8E8E8;overflow:hidden;
    text-overflow:ellipsis;white-space:nowrap;}
  .nc2-site strong:last-child{border-right:0;}

  .nc2-table{width:100%;margin-top:12px;border-collapse:collapse;table-layout:fixed;
    font-size:11.5px;}
  .nc2-table th{height:24px;background:#D76016;color:#fff;font-weight:900;font-size:11px;
    border:1px solid #C05512;letter-spacing:.5px;}
  .nc2-table td{height:21px;padding:0 7px;border:1px solid #E0E0E0;font-weight:800;
    overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .nc2-table tbody tr:nth-child(even) td{background:#FAFAF9;}
  .nc2-l{text-align:left;}
  .nc2-c{text-align:center;}
  .nc2-r{text-align:right;font-variant-numeric:tabular-nums;}
  .nc2-grp{background:#F3F3F1 !important;font-weight:900;color:#333;}
  .nc2-amt{font-weight:950;}
  .nc2-spec,.nc2-note{font-size:10.5px;color:#444;}
  .nc2-sub td{height:18px;background:#fff !important;border-top:0;border-bottom:0;}
  .nc2-subname{padding-left:16px !important;font-size:10.5px;font-weight:750;color:#555;}

  .nc2-foot{margin-top:auto;padding-top:16px;display:grid;
    grid-template-columns:minmax(0,1fr) 320px;gap:20px;align-items:end;}
  .nc2-signs{display:grid;grid-template-columns:150px 150px;gap:16px;}
  .nc2-sign-cell{display:flex;flex-direction:column;align-items:center;gap:5px;}
  .nc2-sign-label{font-size:11.5px;font-weight:900;color:#333;}
  .nc2-sign-box{width:150px;height:84px;border:1px solid #BFBFBF;border-radius:3px;
    background:#fff;display:flex;align-items:center;justify-content:center;overflow:hidden;}
  .nc2-sign-touch{cursor:pointer;border-style:dashed;border-color:#D76016;background:#FFFBF8;}
  .nc2-sign-empty{font-size:14px;font-weight:850;color:#B4B4B4;}
  .nc2-sign-img{max-width:88%;max-height:80%;object-fit:contain;}
  .nc2-stamp{width:74px;height:74px;object-fit:contain;}
  .nc2-sign-at{font-size:9.5px;font-weight:800;color:#777;}
  .nc2-sign-hint{color:#D76016;}

  .nc2-total{border:1px solid #C9C9C9;border-radius:4px;overflow:hidden;}
  .nc2-total-row{display:grid;grid-template-columns:110px minmax(0,1fr);align-items:center;
    min-height:30px;border-bottom:1px solid #E2E2E2;font-size:12px;}
  .nc2-total-row:last-child{border-bottom:0;}
  .nc2-total-row span{height:100%;display:flex;align-items:center;padding:0 10px;
    background:#F6F6F4;color:#555;font-weight:900;border-right:1px solid #E2E2E2;}
  .nc2-total-row strong{display:flex;align-items:center;justify-content:flex-end;
    padding:0 12px;font-weight:950;font-variant-numeric:tabular-nums;}
  .nc2-total-grand{min-height:38px;background:#FFF3EA;}
  .nc2-total-grand span{background:#D76016;color:#fff;border-right-color:#C05512;font-size:13px;}
  .nc2-total-grand strong{font-size:19px;letter-spacing:-.5px;color:#B94E0D;}

  .nc2-terms{margin-top:14px;padding-top:9px;border-top:1px solid #DDD;}
  .nc2-terms-title{font-size:10.5px;font-weight:900;color:#333;margin-bottom:3px;}
  .nc2-terms ol{margin:0;padding-left:16px;}
  .nc2-terms li{font-size:9.5px;font-weight:750;line-height:1.55;color:#555;}

  .nc2-bottom{margin-top:10px;display:flex;align-items:center;justify-content:space-between;gap:14px;}
  .nc2-bank{padding:5px 11px;border:2px solid #111;border-radius:3px;
    font-size:11px;font-weight:950;}
  .nc2-contact{display:flex;gap:14px;font-size:9.5px;font-weight:800;color:#666;}
  .nc2-rule{position:absolute;left:0;right:0;bottom:0;height:10px;background:#D76016;z-index:1;}

  .nc2-dense-1 .nc2-table{font-size:10.5px;}
  .nc2-dense-1 .nc2-table td{height:18px;}
  .nc2-dense-1 .nc2-sub td{height:15px;}
  .nc2-dense-2 .nc2-table{font-size:9.5px;}
  .nc2-dense-2 .nc2-table td{height:15px;padding:0 5px;}
  .nc2-dense-2 .nc2-sub td{height:13px;}
  .nc2-dense-2 .nc2-subname{font-size:9px;}
  .nc2-dense-2 .nc2-spec,.nc2-dense-2 .nc2-note{font-size:9px;}

  .nc2-amount-card{border:1px solid rgba(17,17,17,.12);border-radius:16px;background:#fff;
    padding:14px 16px;display:grid;gap:7px;}
  .nc2-amount-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
    font-size:13px;font-weight:850;color:#555;}
  .nc2-amount-row strong{color:#111;font-weight:950;font-variant-numeric:tabular-nums;}
  .nc2-amount-grand{padding-top:8px;border-top:1px solid rgba(17,17,17,.12);font-size:15px;}
  .nc2-amount-grand strong{font-size:20px;color:#B94E0D;letter-spacing:-.5px;}

  .nc2-sign-card{width:min(760px,94vw);}
  .nc2-pad-wrap{position:relative;height:320px;border:2px solid #222;border-radius:14px;
    background:#fff;overflow:hidden;touch-action:none;}
  #nc2SignCanvas{display:block;width:100%;height:100%;touch-action:none;}
  .nc2-pad-guide{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    pointer-events:none;color:#C6C6C6;font-size:20px;font-weight:850;}
  .nc2-sign-actions{margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:10px;}

  @media (max-width:760px){
    .nc2-pad-wrap{height:240px;}
    .nc2-sign-actions{grid-template-columns:1fr 1fr;}
    .nc2-sign-actions .confirm{grid-column:1/-1;}
  }
  `;

  function injectStyle() {
    if (document.getElementById("nc2Style")) return;
    const style = document.createElement("style");
    style.id = "nc2Style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------
     13. 시작
     --------------------------------------------------------------- */
  function boot() {
    injectStyle();
    initState();
    injectWorkDaysField();
    injectSignedButton();
    buildSignModal();
    loadStamp();
    initBackNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
