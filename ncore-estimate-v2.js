/* =========================================================================
   N-CORE 현장견적 — 견적서 v2 + 전자서명 애드온
   파일명: ncore-estimate-v2.js

   반드시 ncore-doc.js 다음에 읽혀야 합니다.
     <script src="./ncore-doc.js"></script>
     <script src="./ncore-estimate-v2.js"></script>

   이 파일이 하는 일
     1) 공사기간(일) 입력칸을 1단계 현장정보에 끼워 넣습니다.
     2) 견적서를 세금계산서형 서식으로 다시 그립니다. (서식은 ncore-doc.js)
     3) 시공사 칸에 회사 도장을 항상 자동으로 찍습니다.
     4) 발주자 칸을 누르면 서명 패드가 떠서 고객이 태블릿에 직접 서명합니다.
     5) 서명본 PDF 를 구글드라이브 01_견적서 폴더에 저장합니다.
     6) 고객 폰으로 서명 링크를 문자 발송합니다. (sign.html)
     7) 안드로이드 뒤로가기로 앱이 꺼지지 않고 직전 화면으로 돌아갑니다.
     8) [v3] 저장 확인창에서 같은 연락처의 기존 현장을 찾아 알려 줍니다.
     9) [v3] 안전동의서로 넘어갈 때 지금 보고 있는 현장을 함께 넘깁니다.

   index.html 의 기존 함수를 덮어쓰는 방식이라
   문제가 생기면 이 파일을 읽는 <script> 한 줄만 빼면 원래대로 돌아갑니다.
   ========================================================================= */

(function () {
  "use strict";

  const D = window.NCoreDoc;
  if (!D) {
    console.error("ncore-doc.js 를 먼저 불러와야 합니다.");
    return;
  }

  const VAT_RATE = D.VAT_RATE;

  /* ---------------------------------------------------------------
     1. 금액 — 부가세 별도
     기존 총 확인 금액을 '공급가액'으로 그대로 씁니다.
     견적대장에 넘기는 totalAmount 도 공급가액 그대로 두어야
     이전 데이터와 숫자 기준이 어긋나지 않습니다.
     --------------------------------------------------------------- */
  function supplyAmount() {
    const saved = window.state && state.savedEstimate;
    if (saved && typeof saved.total === "number") return saved.total;
    return getDisplayTotalAmount();
  }

  function vatAmount() { return D.vatOf(supplyAmount()); }
  function grandTotal() { return supplyAmount() + vatAmount(); }

  window.getSupplyAmount = supplyAmount;
  window.getVatAmount = vatAmount;
  window.getGrandTotal = grandTotal;

  /* ---------------------------------------------------------------
     2. 상태
     --------------------------------------------------------------- */
  function initState() {
    if (!window.state) return;
    if (typeof state.project.workDays !== "number") state.project.workDays = 1;
    if (!state.signature) {
      state.signature = { customer: { dataUrl: "", signedAt: "", method: "" } };
    }
  }

  function isSigned() {
    return !!(state.signature && state.signature.customer && state.signature.customer.dataUrl);
  }

  function safeName(v) {
    return String(v || "고객").replace(/[\\/:*?"<>|]/g, "").trim() || "고객";
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
     3. 공사기간 입력칸
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
    state.project.workDays = Math.max(1, Math.min(365, (Number(state.project.workDays) || 1) + step));
    renderWorkDays();
    if (typeof saveDraftSoon === "function") saveDraftSoon();
  });

  /* ---------------------------------------------------------------
     4. 내역표 행 만들기
     대분류(철거·원상복구·보양청소)는 배분 금액이라 '식 1' 대표행으로,
     장비·폐기물은 실제 수량과 단가가 있으므로 그대로 펼칩니다.
     --------------------------------------------------------------- */
  const EQUIP_ROWS = [
    { key: "sky", name: "스카이차", rate: "sky" },
    { key: "ladder", name: "사다리차", rate: "ladder" },
    { key: "miniFork", name: "미니포크레인", rate: "miniFork" },
    { key: "highRental", name: "고소렌탈", rate: "highRental" },
    { key: "btScaffold", name: "비티아시바", rate: "btScaffold" }
  ];

  const WASTE_ROWS = [
    { key: "truck1Wood", spec: "1톤 목재", rate: "truck1Wood" },
    { key: "truck1Mixed", spec: "1톤 혼합", rate: "truck1Mixed" },
    { key: "truck1Concrete", spec: "1톤 폐콘크리트", rate: "truck1Concrete" },
    { key: "truck25Wood", spec: "2.5톤 목재", rate: "truck25Wood" },
    { key: "truck25Mixed", spec: "2.5톤 혼합", rate: "truck25Mixed" },
    { key: "truck25Concrete", spec: "2.5톤 폐콘크리트", rate: "truck25Concrete" },
    { key: "truck5Wood", spec: "5톤 목재", rate: "truck5Wood" },
    { key: "truck5Mixed", spec: "5톤 혼합", rate: "truck5Mixed" },
    { key: "truck5Concrete", spec: "5톤 폐콘크리트", rate: "truck5Concrete" }
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
        group: group.label, name: group.label + " 공사", spec: "일체",
        unit: "식", qty: 1, price: amount, amount: amount, note: ""
      });

      items.forEach(function (label) {
        rows.push({ sub: true, name: label });
      });
    });

    EQUIP_ROWS.forEach(function (item) {
      const qty = Number(state.equipment[item.key]) || 0;
      if (qty <= 0) return;
      const price = fixedRates[item.rate];
      rows.push({
        group: "장비", name: item.name, spec: "임대", unit: "일",
        qty: qty, price: price, amount: roundToManwon(qty * price), note: ""
      });
    });

    WASTE_ROWS.forEach(function (item) {
      const qty = Number(state.waste[item.key]) || 0;
      if (qty <= 0) return;
      const price = fixedRates[item.rate];
      rows.push({
        group: "폐기물", name: "폐기물 운반", spec: item.spec, unit: "회",
        qty: qty, price: price, amount: roundToManwon(qty * price), note: ""
      });
    });

    return rows;
  }

  /* ---------------------------------------------------------------
     5. 견적서 데이터
     이 덩어리를 그대로 서버에 저장해 두면
     고객 폰 서명 페이지가 똑같은 견적서를 그릴 수 있습니다.
     --------------------------------------------------------------- */
  function buildDocData() {
    if (typeof calc === "function") calc();
    initState();

    const saved = (window.state && state.savedEstimate) || {};
    const project = saved.project || state.project || {};
    const supply = supplyAmount();

    return {
      code: saved.code || state.estimateCode || "",
      staffName: (saved.staff && saved.staff.name) || getCurrentStaffName() || "",
      customerName: project.customerName || "",
      phone: project.phone || "",
      address: project.address || "",
      workDays: Number(project.workDays) || 1,
      dateText: D.todayText(saved.savedAt),
      rows: buildRows(),
      supply: supply,
      vat: D.vatOf(supply),
      total: supply + D.vatOf(supply),
      addonBase: (state.addon && state.addon.baseCode) || ""
    };
  }

  function viewData() {
    const data = buildDocData();
    data.sign = state.signature.customer;
    data.signable = true;
    return data;
  }

  /* ---------------------------------------------------------------
     6. 기존 렌더 함수 교체
     --------------------------------------------------------------- */
  window.buildPdfRenderPage = function () {
    if (!state.savedEstimate && typeof saveEstimateDraft === "function") saveEstimateDraft();
    const data = viewData();
    data.signable = false;   // PDF 에는 점선 안내를 넣지 않습니다.
    return D.buildDoc(data, 'id="pdfPaper"');
  };

  window.renderEstimatePage = function () {
    if (typeof calc === "function") calc();
    if (!state.savedEstimate && typeof saveEstimateDraft === "function") saveEstimateDraft();

    const panel = document.querySelector("#page5 .estimate-doc");
    if (!panel) return;

    panel.innerHTML = D.screenShell(D.buildDoc(viewData(), ""));

    D.fitScreenDoc(panel.querySelector(".nc2-screen-host"), panel);
    updateSideSummary();
    lockWhenSigned();
  };

  window.addEventListener("resize", function () {
    const host = document.querySelector("#page5 .nc2-screen-host");
    if (host) D.fitScreenDoc(host, host.closest(".estimate-doc"));
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
      '<div class="nc2-amount-row"><span>공급가액</span><strong>' + D.num(supplyAmount()) + "원</strong></div>" +
      '<div class="nc2-amount-row"><span>부가세 10%</span><strong>' + D.num(vatAmount()) + "원</strong></div>" +
      '<div class="nc2-amount-row nc2-amount-grand"><span>총 계</span><strong>' + D.num(grandTotal()) + "원</strong></div>";
  }

  /* ---------------------------------------------------------------
     7. 태블릿 서명
     --------------------------------------------------------------- */
  document.addEventListener("click", function (e) {
    const box = e.target.closest('[data-nc2-sign="customer"]');
    if (!box) return;
    e.preventDefault();

    D.openSignPad(function (result) {
      state.signature.customer = {
        dataUrl: result.dataUrl,
        signedAt: result.signedAt,
        method: "tablet"
      };
      renderEstimatePage();
    });
  });

  /* ---------------------------------------------------------------
     8. 오른쪽 버튼 — 서명본 저장 · 서명 링크 문자
     --------------------------------------------------------------- */
  function injectButtons() {
    const holder = document.querySelector("#page5 .estimate-pdf-actions");
    if (!holder || document.getElementById("nc2SignedSaveBtn")) return;

    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.id = "nc2SignLinkBtn";
    linkBtn.className = "estimate-pdf-btn secondary";
    linkBtn.textContent = "고객 폰으로 서명 링크 보내기";
    linkBtn.addEventListener("click", sendSignLink);

    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.id = "nc2SignedSaveBtn";
    saveBtn.className = "estimate-pdf-btn primary";
    saveBtn.textContent = "서명본 저장";
    saveBtn.addEventListener("click", saveSignedCopy);

    holder.insertBefore(linkBtn, holder.firstChild);
    holder.insertBefore(saveBtn, holder.firstChild);

    updateSignedButton();
  }

  function updateSignedButton() {
    const btn = document.getElementById("nc2SignedSaveBtn");
    if (!btn) return;
    btn.disabled = !isSigned();
    btn.textContent = isSigned() ? "서명본 저장" : "태블릿 서명 후 저장할 수 있습니다";
  }

  function lockWhenSigned() {
    const prev = document.getElementById("page5Prev");
    if (prev) {
      prev.disabled = isSigned();
      prev.style.opacity = isSigned() ? "0.45" : "";
      prev.title = isSigned() ? "서명이 완료된 견적서는 금액을 수정할 수 없습니다." : "";
    }
    updateSignedButton();
  }

  /* ---------------------------------------------------------------
     9. 고객 폰 서명 링크
     견적번호만으로는 남의 견적서가 열릴 수 있어
     서버에서 발급한 토큰을 함께 붙입니다.
     --------------------------------------------------------------- */
  function getSignBaseUrl() {
    const path = location.pathname.replace(/[^/]*$/, "");
    return location.origin + path + "sign.html";
  }

  /* 링크에 & 가 들어가면 문자 앱이 링크를 그 앞에서 잘라 버립니다.
     그래서 견적번호와 토큰을 점으로 이어 하나의 값으로 보냅니다. */
  function buildSignLink(code, token) {
    return getSignBaseUrl() + "?k=" + encodeURIComponent(code + "." + token);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) { /* 아래 방법으로 다시 시도합니다 */ }

    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  async function sendSignLink() {
    const btn = document.getElementById("nc2SignLinkBtn");
    const status = document.getElementById("pdfActionStatus");

    const saved = state.savedEstimate || {};
    const project = saved.project || state.project || {};
    const code = saved.code || state.estimateCode || "";
    const phone = String(project.phone || "").replace(/\D/g, "");

    if (!code) { alert("견적번호가 없습니다. 저장을 먼저 완료해 주세요."); return; }
    if (!phone) { alert("고객 연락처를 먼저 입력해 주세요."); return; }

    btn.disabled = true;
    btn.textContent = "링크 만드는 중...";
    if (status) status.textContent = "서명 링크를 만들고 있습니다.";

    try {
      const result = await jsonpRequest({ action: "signToken", code: code });
      if (!result || !result.ok || !result.token) {
        throw new Error((result && result.message) || "서명 링크를 만들지 못했습니다.");
      }

      const link = buildSignLink(code, result.token);
      lastSignLink = link;

      // 문자가 막히면 카톡에 붙여넣을 수 있도록 클립보드에 미리 담아 둡니다.
      await copyText(link);

      // 링크는 반드시 마지막 줄에 혼자 두어야 문자 앱이 끝까지 인식합니다.
      const body =
        "[N-CORE] 현장 견적서가 도착했습니다.\n" +
        "총 " + D.num(grandTotal()) + "원 (부가세 포함)\n" +
        "아래 링크에서 내용을 확인하고 서명해 주세요.\n" +
        link;

      if (status) status.textContent = "문자 앱을 여는 중입니다. 링크는 복사도 해 두었습니다.";
      window.location.href = "sms:" + phone + "?body=" + encodeURIComponent(body);

      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = "고객 폰으로 서명 링크 보내기";
        showLinkBox(link);
      }, 1200);
    } catch (err) {
      console.error(err);
      btn.disabled = false;
      btn.textContent = "고객 폰으로 서명 링크 보내기";
      if (status) status.textContent = "서명 링크를 만들지 못했습니다.";
      alert(err.message || "서명 링크를 만들지 못했습니다.");
    }
  }

  /* 만들어진 링크를 화면에도 남겨 둡니다.
     문자가 실패했을 때 카톡 등으로 직접 보낼 수 있게 하기 위함입니다. */
  let lastSignLink = "";

  function showLinkBox(link) {
    const holder = document.querySelector("#page5 .estimate-pdf-actions");
    if (!holder) return;

    let box = document.getElementById("nc2LinkBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "nc2LinkBox";
      box.className = "nc2-link-box";
      holder.appendChild(box);
    }

    box.innerHTML =
      '<div class="nc2-link-label">서명 링크 (복사됨)</div>' +
      '<div class="nc2-link-url">' + D.esc(link) + "</div>" +
      '<button type="button" class="estimate-pdf-btn secondary" id="nc2LinkCopyBtn">링크 다시 복사</button>';

    document.getElementById("nc2LinkCopyBtn").addEventListener("click", async function () {
      const ok = await copyText(lastSignLink);
      this.textContent = ok ? "복사되었습니다" : "복사하지 못했습니다";
      const self = this;
      setTimeout(function () { self.textContent = "링크 다시 복사"; }, 1600);
    });
  }

  /* ---------------------------------------------------------------
     10. 서명본 저장 (태블릿 서명분)
     --------------------------------------------------------------- */
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
      const data = viewData();
      data.signable = false;

      const blob = await D.makePdfBlob(data);
      const base64 = await D.blobToBase64(blob);

      if (status) status.textContent = "구글드라이브에 저장하고 있습니다.";

      await submitEstimateFileToDrive({
        kind: "signed",
        code: code,
        staffName: getCurrentStaffName(),
        customerName: project.customerName || "",
        savedAt: new Date().toISOString(),
        signMethod: "tablet",
        signedAt: state.signature.customer.signedAt || "",
        pdfBase64: base64
      });

      // 태블릿에도 한 부 남깁니다.
      const file = new File([blob], code + "_" + safeName(project.customerName) + "_견적서_서명본.pdf",
        { type: "application/pdf" });
      downloadPdfFile(file);

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
     11. 저장 데이터에 값 추가
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

      // 추가견적이면 원 견적번호를 함께 남깁니다.
      if (state.addon && state.addon.baseCode) {
        payload.addon = { baseCode: state.addon.baseCode, seq: state.addon.seq || "" };
      }

      // 고객 폰 서명 페이지가 읽을 견적서 원본입니다.
      if (String(payload.stage || "final") === "final") {
        try { payload.docData = JSON.stringify(buildDocData()); } catch (e) { payload.docData = ""; }
      }
      return payload;
    };
  });

  wrap("resetEstimateState", function () {
    state.project.workDays = 1;
    state.addon = null;
    state.signature = { customer: { dataUrl: "", signedAt: "", method: "" } };
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
     12. 안드로이드 뒤로가기
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
      const signModal = document.getElementById("nc2SignModal");
      if (signModal && signModal.classList.contains("show")) {
        signModal.classList.remove("show");
        history.pushState({ nc: true, i: Math.max(navIndex, 0) }, "");
        return;
      }

      const modal = document.querySelector(".modal-backdrop.show");
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
     13. 오른쪽 요약 카드 스타일
     --------------------------------------------------------------- */
  const EXTRA_CSS = `
  .nc2-amount-card{border:1px solid rgba(17,17,17,.12);border-radius:16px;background:#fff;
    padding:14px 16px;display:grid;gap:7px;}
  .nc2-amount-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
    font-size:13px;font-weight:850;color:#555;}
  .nc2-amount-row strong{color:#111;font-weight:950;font-variant-numeric:tabular-nums;}
  .nc2-amount-grand{padding-top:8px;border-top:1px solid rgba(17,17,17,.12);font-size:15px;}
  .nc2-amount-grand strong{font-size:20px;color:#B94E0D;letter-spacing:-.5px;}
  #page5 .estimate-pdf-actions.single-action{display:grid !important;gap:9px;}
  .nc2-link-box{display:grid;gap:7px;padding:12px 13px;border-radius:14px;
    background:#FFF8F3;border:1px solid rgba(215,96,22,.18);}
  .nc2-link-label{font-size:11.5px;font-weight:900;color:#B94E0D;}
  .nc2-link-url{font-size:11px;font-weight:750;color:#555;line-height:1.45;
    word-break:break-all;}
  .nc2-open-link{display:inline-flex;align-items:center;padding:4px 10px;border-radius:999px;
    background:#D76016;color:#fff;font-size:11px;font-weight:900;text-decoration:none;}

  /* v3: 같은 연락처 현장 경고 */
  .nc2-dup-box{margin:0 0 14px;padding:13px 15px;border-radius:14px;
    background:#FDF1EF;border:1px solid rgba(192,57,43,.26);}
  .nc2-dup-title{font-size:14.5px;font-weight:950;color:#C0392B;letter-spacing:-.3px;
    margin-bottom:8px;}
  .nc2-dup-row{padding:8px 10px;margin-bottom:6px;border-radius:10px;background:#FFFFFF;
    border:1px solid rgba(17,17,17,.08);}
  .nc2-dup-code{font-size:11.5px;font-weight:900;color:#C0392B;
    font-variant-numeric:tabular-nums;}
  .nc2-dup-name{font-size:13.5px;font-weight:900;color:#111;line-height:1.3;
    margin-top:2px;word-break:keep-all;}
  .nc2-dup-sub{font-size:11.5px;font-weight:800;color:#777;margin-top:2px;}
  .nc2-dup-help{font-size:12.5px;font-weight:800;color:#5A2A24;line-height:1.5;
    word-break:keep-all;margin-top:4px;}
  .nc2-dup-btn{width:100%;min-height:46px;margin-top:10px;border:0;border-radius:12px;
    background:#C0392B;color:#fff;font-size:14px;font-weight:900;cursor:pointer;
    font-family:inherit;}
  .nc2-dup-btn:active{transform:scale(.99);}
  `;

  function injectExtraStyle() {
    if (document.getElementById("nc2AppStyle")) return;
    const style = document.createElement("style");
    style.id = "nc2AppStyle";
    style.textContent = EXTRA_CSS;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------
     14. 추가견적 · 서명 현황

     완료된 견적에 추가 공사가 생기면 원 견적번호에 이어지는
     추가 견적번호(NC-260826-001-A1)를 새로 발급받아 작성합니다.
     현장 정보와 현장 폴더는 원 견적 것을 그대로 씁니다.
     --------------------------------------------------------------- */
  function chip(text, kind) {
    return '<span class="status-chip ' + (kind || "wait") + '">' + D.esc(text) + "</span>";
  }

  function buildScreens() {
    const app = document.querySelector(".app");
    if (!app || document.getElementById("pageSignStatus")) return;

    /* 서명 현황 */
    const signPage = document.createElement("section");
    signPage.id = "pageSignStatus";
    signPage.className = "screen";
    signPage.innerHTML =
      '<header class="topbar">' +
        '<div class="brand">' +
          '<div class="logo-mark">N-CORE</div>' +
          '<div class="brand-text">' +
            '<div class="title">서명 현황</div>' +
            '<div class="sub">고객이 견적서에 서명했는지 확인합니다.</div>' +
          "</div>" +
        "</div>" +
        '<div class="step-pill"><span>서명</span><span class="step-dot"></span>' +
          '<strong id="nc2SignCountLabel">0건</strong></div>' +
      "</header>" +

      '<section class="work-content">' +
        '<section class="panel work-main">' +
          '<div class="work-header">' +
            "<div>" +
              '<h1 class="work-title">발송한 견적서</h1>' +
              '<div class="work-sub">최근에 만든 것부터 표시됩니다. 서명본은 눌러서 바로 열 수 있습니다.</div>' +
            "</div>" +
            '<div class="amount-badge" id="nc2SignBadge">0건</div>' +
          "</div>" +
          '<div id="nc2SignList" class="list-scroll"></div>' +
        "</section>" +

        '<aside class="panel work-side">' +
          '<div class="filter-row">' +
            '<div class="filter-label">상태</div>' +
            '<div class="toggle-group three">' +
              '<button type="button" class="toggle-btn active" data-nc2-signfilter="전체">전체</button>' +
              '<button type="button" class="toggle-btn" data-nc2-signfilter="완료">서명완료</button>' +
              '<button type="button" class="toggle-btn" data-nc2-signfilter="대기">서명대기</button>' +
            "</div>" +
          "</div>" +
          '<div class="project-guide-list">' +
            "<div>서명대기는 링크는 보냈지만 아직 서명 전인 건입니다.</div>" +
            "<div>오래 걸리면 고객에게 직접 확인해 주세요.</div>" +
            "<div>서명본은 현장폴더 01_견적서에 함께 보관됩니다.</div>" +
          "</div>" +
          '<button type="button" id="nc2SignRefresh" class="nav-btn next" ' +
            'style="height:52px;font-size:17px;border-radius:16px;">새로고침</button>' +
        "</aside>" +
      "</section>" +

      '<nav class="bottom-nav">' +
        '<button id="nc2SignBack" class="nav-btn prev">메뉴</button>' +
        '<div class="bottom-status" id="nc2SignStatusText">불러오는 중입니다.</div>' +
        "<div></div>" +
      "</nav>";

    /* 추가견적 대상 현장 */
    const addonPage = document.createElement("section");
    addonPage.id = "pageAddonList";
    addonPage.className = "screen";
    addonPage.innerHTML =
      '<header class="topbar">' +
        '<div class="brand">' +
          '<div class="logo-mark">N-CORE</div>' +
          '<div class="brand-text">' +
            '<div class="title">추가견적 작성</div>' +
            '<div class="sub">이미 견적이 나간 현장에 추가 공사를 얹습니다.</div>' +
          "</div>" +
        "</div>" +
        '<div class="step-pill"><span>추가견적</span><span class="step-dot"></span>' +
          "<strong>현장 선택</strong></div>" +
      "</header>" +

      '<section class="work-content">' +
        '<section class="panel work-main">' +
          '<div class="work-header">' +
            "<div>" +
              '<h1 class="work-title">현장 선택</h1>' +
              '<div class="work-sub">현장을 누르면 고객정보를 그대로 이어받아 추가 공사만 산정합니다.</div>' +
            "</div>" +
            '<div class="amount-badge" id="nc2AddonBadge">0건</div>' +
          "</div>" +
          '<div id="nc2AddonList" class="list-scroll"></div>' +
        "</section>" +

        '<aside class="panel work-side">' +
          '<div class="project-guide-card">' +
            '<div class="label">작성 안내</div>' +
            '<div class="value">원 견적 → 추가견적</div>' +
          "</div>" +
          '<div class="project-guide-list">' +
            "<div>고객명·주소·연락처는 자동으로 채워집니다.</div>" +
            "<div>추가로 들어가는 인원·장비·폐기물만 입력합니다.</div>" +
            "<div>견적번호는 원 번호 뒤에 -A1, -A2 로 붙습니다.</div>" +
            "<div>사진과 서명본은 같은 현장 폴더에 모입니다.</div>" +
          "</div>" +
          '<button type="button" id="nc2AddonRefresh" class="nav-btn next" ' +
            'style="height:52px;font-size:17px;border-radius:16px;">새로고침</button>' +
        "</aside>" +
      "</section>" +

      '<nav class="bottom-nav">' +
        '<button id="nc2AddonBack" class="nav-btn prev">메뉴</button>' +
        '<div class="bottom-status" id="nc2AddonStatusText">불러오는 중입니다.</div>' +
        "<div></div>" +
      "</nav>";

    app.appendChild(signPage);
    app.appendChild(addonPage);

    document.getElementById("nc2SignBack").addEventListener("click", showMainMenu);
    document.getElementById("nc2SignRefresh").addEventListener("click", loadSignStatus);
    document.getElementById("nc2AddonBack").addEventListener("click", showMainMenu);
    document.getElementById("nc2AddonRefresh").addEventListener("click", loadAddonBases);

    document.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-nc2-signfilter]");
      if (!btn) return;
      signFilter = btn.dataset.nc2Signfilter;
      loadSignStatus();
    });
  }

  function buildMenuCards() {
    const menu = document.getElementById("menuContent");
    if (!menu || document.getElementById("nc2MenuAddon")) return;

    const safety = document.getElementById("menuSafety");

    const addonCard = document.createElement("button");
    addonCard.type = "button";
    addonCard.id = "nc2MenuAddon";
    addonCard.className = "panel menu-card office-only";
    addonCard.innerHTML =
      '<span class="menu-card-no">00</span>' +
      '<span class="menu-card-title">추가견적 작성</span>' +
      '<span class="menu-card-desc">이미 견적이 나간 현장에 추가 공사가 생겼을 때 작성합니다.</span>';
    addonCard.addEventListener("click", function () {
      showScreen("pageAddonList");
      loadAddonBases();
    });

    const signCard = document.createElement("button");
    signCard.type = "button";
    signCard.id = "nc2MenuSign";
    signCard.className = "panel menu-card office-only";
    signCard.innerHTML =
      '<span class="menu-card-no">00</span>' +
      '<span class="menu-card-title">서명 현황</span>' +
      '<span class="menu-card-desc">고객이 견적서에 서명했는지 한눈에 확인합니다.</span>';
    signCard.addEventListener("click", function () {
      showScreen("pageSignStatus");
      loadSignStatus();
    });

    if (safety) {
      menu.insertBefore(addonCard, safety);
      menu.insertBefore(signCard, safety);
    } else {
      menu.appendChild(addonCard);
      menu.appendChild(signCard);
    }
  }

  /* ---------- 서명 현황 ---------- */
  let signFilter = "전체";

  async function loadSignStatus() {
    const listEl = document.getElementById("nc2SignList");
    const statusEl = document.getElementById("nc2SignStatusText");
    const badgeEl = document.getElementById("nc2SignBadge");
    const countEl = document.getElementById("nc2SignCountLabel");
    if (!listEl) return;

    document.querySelectorAll("[data-nc2-signfilter]").forEach(function (b) {
      b.classList.toggle("active", b.dataset.nc2Signfilter === signFilter);
    });

    listEl.innerHTML = '<div class="list-empty">불러오는 중입니다...</div>';
    statusEl.textContent = "불러오는 중...";

    try {
      const result = await jsonpRequest({ action: "signStatusList", filter: signFilter });
      if (!result || !result.ok) throw new Error((result && result.message) || "불러오지 못했습니다.");

      const rows = result.rows || [];
      badgeEl.textContent = rows.length + "건";
      countEl.textContent = rows.length + "건";
      statusEl.textContent = rows.length ? "서명본은 눌러서 바로 열 수 있습니다." : "해당하는 건이 없습니다.";

      if (!rows.length) {
        listEl.innerHTML = '<div class="list-empty">해당하는 견적서가 없습니다.</div>';
        return;
      }

      listEl.innerHTML = rows.map(function (row) {
        const done = row.signStatus === "서명완료";
        return '<div class="site-row" style="cursor:default;">' +
          '<span class="site-row-main">' +
            '<span class="site-row-code">' + D.esc(row.code) + " · " + D.esc(row.staff || "-") + "</span>" +
            '<span class="site-row-title">' + D.esc(row.customerName || "-") + " · " +
              D.esc(row.address || "-") + "</span>" +
            '<span class="site-row-sub">' +
              (done ? "서명 " + D.esc(row.signedAt || "-") + " · " + D.esc(row.signMethod || "")
                    : "발송 " + D.esc(row.sendStatus || "발송 전")) +
            "</span>" +
          "</span>" +
          '<span class="site-row-right">' +
            '<span class="site-row-amount">' + D.esc(formatWon(row.totalAmount)) + "</span>" +
            chip(done ? "서명완료" : "서명대기", done ? "done" : "wait") +
            (row.signedFileUrl
              ? '<a class="nc2-open-link" href="' + D.esc(row.signedFileUrl) +
                '" target="_blank" rel="noopener">서명본 열기</a>'
              : "") +
          "</span>" +
        "</div>";
      }).join("");
    } catch (err) {
      console.error(err);
      badgeEl.textContent = "0건";
      statusEl.textContent = "불러오지 못했습니다.";
      listEl.innerHTML = '<div class="list-empty">불러오지 못했습니다.<br />' +
        D.esc(err.message || "") + "</div>";
    }
  }

  /* ---------- 추가견적 대상 현장 ---------- */
  async function loadAddonBases() {
    const listEl = document.getElementById("nc2AddonList");
    const statusEl = document.getElementById("nc2AddonStatusText");
    const badgeEl = document.getElementById("nc2AddonBadge");
    if (!listEl) return;

    listEl.innerHTML = '<div class="list-empty">불러오는 중입니다...</div>';
    statusEl.textContent = "불러오는 중...";

    try {
      const result = await jsonpRequest({ action: "addonBaseList" });
      if (!result || !result.ok) throw new Error((result && result.message) || "불러오지 못했습니다.");

      const rows = result.rows || [];
      badgeEl.textContent = rows.length + "건";
      statusEl.textContent = rows.length
        ? "현장을 눌러 추가견적 작성을 시작합니다."
        : "추가견적을 붙일 현장이 없습니다.";

      if (!rows.length) {
        listEl.innerHTML = '<div class="list-empty">추가견적을 붙일 현장이 없습니다.<br />' +
          "견적서가 만들어진 현장만 표시됩니다.</div>";
        return;
      }

      listEl.innerHTML = rows.map(function (row, index) {
        return '<button type="button" class="site-row" data-nc2-addon="' + index + '">' +
          '<span class="site-row-main">' +
            '<span class="site-row-code">' + D.esc(row.code) + " · " + D.esc(row.staff || "-") + "</span>" +
            '<span class="site-row-title">' + D.esc(row.customerName || "-") + " · " +
              D.esc(row.address || "-") + "</span>" +
            '<span class="site-row-sub">' + D.esc(row.industry || "-") + " · " +
              D.esc(String(row.pyeong || 0)) + "평 · " + D.esc(row.floorLabel || "-") +
              (row.addonCount ? " · 추가견적 " + row.addonCount + "건" : "") + "</span>" +
          "</span>" +
          '<span class="site-row-right">' +
            '<span class="site-row-amount">' + D.esc(formatWon(row.totalAmount)) + "</span>" +
            chip(row.contractStatus || "계약 전", row.contractStatus ? "done" : "wait") +
          "</span>" +
        "</button>";
      }).join("");

      listEl.querySelectorAll("[data-nc2-addon]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          startAddon(rows[Number(btn.dataset.nc2Addon)]);
        });
      });
    } catch (err) {
      console.error(err);
      badgeEl.textContent = "0건";
      statusEl.textContent = "불러오지 못했습니다.";
      listEl.innerHTML = '<div class="list-empty">불러오지 못했습니다.<br />' +
        D.esc(err.message || "") + "</div>";
    }
  }

  /* 원 현장 정보를 그대로 이어받아 추가견적 작성을 시작합니다. */
  function startAddon(row) {
    if (!row) return;

    const ok = window.confirm(
      "아래 현장의 추가견적을 작성합니다.\n\n" +
      "원 견적번호: " + row.code + "\n" +
      "고객: " + (row.customerName || "-") + "\n" +
      "현장: " + (row.address || "-") + "\n\n" +
      "고객정보는 그대로 이어받고, 추가로 들어가는 비용만 입력하시면 됩니다."
    );
    if (!ok) return;

    resetEstimateState();

    state.project.customerName = row.customerName || "";
    state.project.phone = row.phone || "";
    state.project.address = row.address || "";
    state.project.industry = row.industry || "";
    state.project.pyeong = Number(row.pyeong) || 0;
    state.project.floor = Number(row.floor) || 1;
    state.project.elevator = row.elevator || "";
    state.project.workDays = 1;

    state.addon = { baseCode: row.code };
    state.siteFolderUrl = row.siteFolderUrl || "";

    syncProjectInputsFromState();
    setActive("labor");
    showPage(0);
  }

  /* 저장할 때 추가견적 번호를 따로 발급받습니다. */
  const origIssueCode = window.issueEstimateCode;
  if (typeof origIssueCode === "function") {
    window.issueEstimateCode = async function () {
      if (state.addon && state.addon.baseCode) {
        const result = await jsonpRequest({
          action: "issueAddonCode",
          base: state.addon.baseCode,
          staffName: getCurrentStaffName()
        });
        if (!result || !result.ok || !result.code) {
          throw new Error((result && result.message) || "추가견적 번호를 발급받지 못했습니다.");
        }
        state.addon.seq = result.seq || "";
        return result;
      }
      return origIssueCode.apply(this, arguments);
    };
  }

  /* ---------------------------------------------------------------
     15. [v3] 같은 연락처 현장 알림

     저장 확인창이 뜨면 같은 연락처로 접수된 현장이 있는지 조용히 찾아보고,
     있으면 확인창 맨 위에 알려 줍니다.

     ★ 저장을 막지는 않습니다.
       같은 고객이 다른 현장을 또 맡기는 경우도 있어서
       자동으로 추가견적으로 바꾸면 오히려 위험합니다.
       판단은 사람이 하고, 프로그램은 놓치지 않게만 해 줍니다.
     --------------------------------------------------------------- */
  function dupBox() {
    const modal = document.getElementById("saveConfirmModal");
    if (!modal) return null;
    const text = modal.querySelector(".modal-text");
    if (!text) return null;

    let box = document.getElementById("nc2DupBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "nc2DupBox";
      box.className = "nc2-dup-box";
      box.style.display = "none";
      text.insertBefore(box, text.firstChild);
    }
    return box;
  }

  function hideDupBox() {
    const box = document.getElementById("nc2DupBox");
    if (box) { box.style.display = "none"; box.innerHTML = ""; }
  }

  function dupStateText(row) {
    const contract = String(row.contractStatus || "").trim();
    if (contract) return contract;
    return String(row.progress || "").trim() || "진행 중";
  }

  async function checkDuplicatePhone() {
    // 이미 추가견적으로 작성 중이면 물어볼 것이 없습니다.
    if (state.addon && state.addon.baseCode) { hideDupBox(); return; }

    const phone = String(state.project.phone || "").replace(/\D/g, "");
    if (phone.length < 9) { hideDupBox(); return; }

    const modal = document.getElementById("saveConfirmModal");
    if (!modal || !modal.classList.contains("show")) return;

    let rows = [];
    try {
      const result = await jsonpRequest({ action: "findByPhone", phone: phone, limit: "5" });
      rows = (result && result.ok && result.rows) ? result.rows : [];
    } catch (err) {
      // 조회에 실패해도 저장은 그대로 진행되어야 합니다.
      console.warn("연락처 조회 실패", err);
      return;
    }

    // 지금 작성 중인 건 자신은 뺍니다.
    const myCode = state.estimateCode || "";
    rows = rows.filter(function (row) { return row.code !== myCode; });

    // 그새 창을 닫았으면 그립니다 마시고 끝냅니다.
    if (!modal.classList.contains("show")) return;
    if (!rows.length) { hideDupBox(); return; }

    const box = dupBox();
    if (!box) return;

    box.innerHTML =
      '<div class="nc2-dup-title">⚠ 같은 연락처의 현장이 이미 있습니다</div>' +
      rows.map(function (row) {
        return '<div class="nc2-dup-row">' +
          '<div class="nc2-dup-code">' + D.esc(row.code) + "</div>" +
          '<div class="nc2-dup-name">' + D.esc(row.customerName || "-") + " · " +
            D.esc(row.address || "-") + "</div>" +
          '<div class="nc2-dup-sub">' + D.esc(String(row.savedAt || "").slice(0, 10)) +
            " · " + D.esc(dupStateText(row)) +
            (row.addonCount ? " · 추가견적 " + row.addonCount + "건" : "") + "</div>" +
        "</div>";
      }).join("") +
      '<div class="nc2-dup-help">같은 현장의 <b>추가 공사</b>라면 여기서 저장하지 마시고 ' +
        "추가견적으로 작성해 주세요. 다른 현장이면 그대로 저장하시면 됩니다.</div>" +
      '<button type="button" class="nc2-dup-btn" id="nc2DupGoBtn">추가견적으로 작성하기</button>';

    box.style.display = "block";

    document.getElementById("nc2DupGoBtn").addEventListener("click", function () {
      const ok = window.confirm(
        "지금 입력한 내용은 저장하지 않고 추가견적 화면으로 이동합니다.\n\n" +
        "이동하시겠습니까?"
      );
      if (!ok) return;
      modal.classList.remove("show");
      hideDupBox();
      showScreen("pageAddonList");
      loadAddonBases();
    });
  }

  function hookSaveConfirm() {
    // 확인창이 열릴 때마다 조용히 확인합니다.
    wrap("openSaveConfirmModal", function () {
      hideDupBox();
      setTimeout(function () { checkDuplicatePhone(); }, 30);
    });

    // 저장하거나 수정하러 나가면 알림을 지웁니다.
    ["saveConfirm", "saveEditInfo"].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener("click", hideDupBox);
    });
  }

  /* ---------------------------------------------------------------
     16. [v3] 안전동의서로 현장 넘기기

     지금 보고 있는 현장이 있으면 안전동의서 화면에 함께 넘겨
     현장을 두 번 고르지 않게 합니다.
     현장이 없으면 예전처럼 담당자만 넘어갑니다.
     --------------------------------------------------------------- */
  function safetyUrl() {
    const params = ["staff=" + encodeURIComponent(getCurrentStaffName() || "")];
    const saved = state.savedEstimate || {};
    const project = saved.project || state.project || {};
    const code = saved.code || state.estimateCode || "";

    if (code) {
      params.push("code=" + encodeURIComponent(code));
      if (project.customerName) params.push("customer=" + encodeURIComponent(project.customerName));
      if (project.address) params.push("addr=" + encodeURIComponent(project.address));
    }
    return "./safety.html?" + params.join("&");
  }

  function hookSafetyMenu() {
    const old = document.getElementById("menuSafety");
    if (!old || old.dataset.nc2Hooked) return;

    // 기존에 걸린 이동 동작을 떼어내기 위해 버튼을 새로 만들어 갈아 끼웁니다.
    const fresh = old.cloneNode(true);
    fresh.dataset.nc2Hooked = "1";
    old.parentNode.replaceChild(fresh, old);

    fresh.addEventListener("click", function () {
      window.location.href = safetyUrl();
    });
  }

  /* ---------------------------------------------------------------
     17. 시작
     --------------------------------------------------------------- */
  function boot() {
    D.injectStyle();
    injectExtraStyle();
    initState();
    injectWorkDaysField();
    injectButtons();
    D.buildSignModal();
    buildScreens();
    buildMenuCards();
    hookSaveConfirm();
    hookSafetyMenu();
    D.loadStamp(function () {
      if (document.querySelector("#page5 .nc2-screen-host")) renderEstimatePage();
    });
    initBackNav();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
