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
      total: supply + D.vatOf(supply)
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

      // 고객 폰 서명 페이지가 읽을 견적서 원본입니다.
      if (String(payload.stage || "final") === "final") {
        try { payload.docData = JSON.stringify(buildDocData()); } catch (e) { payload.docData = ""; }
      }
      return payload;
    };
  });

  wrap("resetEstimateState", function () {
    state.project.workDays = 1;
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
  `;

  function injectExtraStyle() {
    if (document.getElementById("nc2AppStyle")) return;
    const style = document.createElement("style");
    style.id = "nc2AppStyle";
    style.textContent = EXTRA_CSS;
    document.head.appendChild(style);
  }

  /* ---------------------------------------------------------------
     14. 시작
     --------------------------------------------------------------- */
  function boot() {
    D.injectStyle();
    injectExtraStyle();
    initState();
    injectWorkDaysField();
    injectButtons();
    D.buildSignModal();
    D.loadStamp(function () {
      if (document.querySelector("#page5 .nc2-screen-host")) renderEstimatePage();
    });
    initBackNav();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
