/* =========================================================================
   N-CORE 견적서 서식 공용 모듈
   파일명: ncore-doc.js

   이 파일 하나가 견적서의 생김새를 책임집니다.
   - index.html (우리 태블릿)  → ncore-estimate-v2.js 가 불러 씁니다.
   - sign.html  (고객 폰 서명) → 직접 불러 씁니다.

   서식을 고칠 일이 있으면 이 파일만 고치면 양쪽이 같이 바뀝니다.
   ========================================================================= */

(function () {
  "use strict";

  /* ---------------------------------------------------------------
     공급자 정보
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

  const TERMS = [
    "공사 착수 전 총 계약금액의 50%를 계약금으로 선입금하며, 입금 확인 후 공사를 진행합니다.",
    "공사 범위 외 추가 작업 및 현장 여건 변경 사항은 별도 협의 후 반영합니다.",
    "폐기물 발생량, 반출 조건 및 현장 상황에 따라 추가 비용이 발생할 수 있습니다."
  ];

  const PAPER_W = 794;
  const PAPER_H = 1123;

  const LOGO_FILE = "./ncore-logo-v8.png";
  const MARK_FILE = "./ncore-watermark-v8.png";
  const STAMP_FILE = "./ncore-stamp.png";

  /* 도장 파일이 없을 때 임시로 쓰는 대체 도장 */
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
     유틸
     --------------------------------------------------------------- */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function num(n) {
    return (Math.round(Number(n) || 0)).toLocaleString("ko-KR");
  }

  function todayText(date) {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "년 " +
      String(d.getMonth() + 1).padStart(2, "0") + "월 " +
      String(d.getDate()).padStart(2, "0") + "일";
  }

  function nowStamp() {
    const d = new Date();
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0") + " " +
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0");
  }

  function vatOf(supply) {
    return Math.round(((Number(supply) || 0) * VAT_RATE) / 10) * 10;
  }

  /* 도장 파일이 있으면 그걸 쓰고, 없으면 임시 도장으로 갑니다. */
  function loadStamp(onReady) {
    const img = new Image();
    img.onload = function () {
      stampSrc = STAMP_FILE;
      if (typeof onReady === "function") onReady(stampSrc);
    };
    img.onerror = function () {
      console.warn("ncore-stamp.png 을 찾지 못해 임시 도장을 사용합니다.");
      if (typeof onReady === "function") onReady(stampSrc);
    };
    img.src = STAMP_FILE;
  }

  function getStampSrc() {
    return stampSrc;
  }

  /* ---------------------------------------------------------------
     내역표 구분 열 합치기
     같은 구분이 이어지면 첫 줄에만 구분명을 남깁니다.
     --------------------------------------------------------------- */
  function collapseGroups(rows) {
    let last = "";
    return (rows || []).map(function (row) {
      const copy = Object.assign({}, row);
      if (copy.sub) return copy;
      if (copy.group && copy.group === last) copy.groupText = "";
      else { copy.groupText = copy.group || ""; last = copy.group || last; }
      return copy;
    });
  }

  /* ---------------------------------------------------------------
     견적서 HTML 만들기

     data = {
       code, staffName, customerName, phone, address,
       workDays, dateText,
       rows: [{ group,name,spec,unit,qty,price,amount,note,sub }],
       supply, vat, total,
       sign: { dataUrl, signedAt },
       signable: true/false      // 발주자 칸을 누를 수 있는지
     }
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

  function buildDoc(data, idAttr) {
    const d = data || {};
    const rows = collapseGroups(d.rows);

    // 원 견적에 이어 붙는 추가 공사면 제목과 표기를 바꿉니다.
    const isAddon = !!d.addonBase;
    const docTitle = isAddon ? "추가 견적서" : "견 적 서";

    /* 행이 많으면 글자와 줄높이를 단계적으로 줄여 1장에 맞춥니다. */
    let density = "";
    if (rows.length > 34) density = " nc2-dense-2";
    else if (rows.length > 24) density = " nc2-dense-1";

    const supply = Number(d.supply) || 0;
    const vat = (d.vat != null) ? Number(d.vat) : vatOf(supply);
    const total = (d.total != null) ? Number(d.total) : (supply + vat);

    const sign = d.sign || {};

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
        '<td class="nc2-c">' + esc(row.qty === "" || row.qty == null ? "" : row.qty) + "</td>" +
        '<td class="nc2-r">' + (row.price === "" || row.price == null ? "" : num(row.price)) + "</td>" +
        '<td class="nc2-r nc2-amt">' + (row.amount === "" || row.amount == null ? "" : num(row.amount)) + "</td>" +
        '<td class="nc2-c nc2-note">' + esc(row.note || "") + "</td>" +
        "</tr>";
    }).join("");

    const customerBox = sign.dataUrl
      ? '<img class="nc2-sign-img" src="' + sign.dataUrl + '" alt="발주자 서명" />'
      : '<span class="nc2-sign-empty">(인)</span>';

    const touchClass = (!sign.dataUrl && d.signable) ? " nc2-sign-touch" : "";
    const touchAttr = (!sign.dataUrl && d.signable) ? ' data-nc2-sign="customer"' : "";

    const signFoot = sign.signedAt
      ? '<div class="nc2-sign-at">' + esc(sign.signedAt) + "</div>"
      : (d.signable
          ? '<div class="nc2-sign-at nc2-sign-hint">터치하여 서명</div>'
          : '<div class="nc2-sign-at">&nbsp;</div>');

    return '' +
      '<section ' + (idAttr || "") + ' class="nc2-paper' + density + '">' +
        '<img class="nc2-watermark" src="' + MARK_FILE + '" alt="" aria-hidden="true" />' +

        /* 머리 */
        '<header class="nc2-head">' +
          '<img class="nc2-logo" src="' + LOGO_FILE + '" alt="N-CORE" />' +
          '<h1 class="nc2-title' + (isAddon ? " nc2-title-addon" : "") + '">' + docTitle + "</h1>" +
        "</header>" +

        /* 고객 · 공급자 */
        '<div class="nc2-top">' +
          '<div class="nc2-client">' +
            '<div class="nc2-client-name">' +
              "<strong>" + esc(d.customerName || "-") + "</strong>" +
              "<span>귀하</span>" +
            "</div>" +
            '<div class="nc2-client-grid">' +
              '<div class="nc2-ck">견적일자</div><div class="nc2-cv">' + esc(d.dateText || todayText()) + "</div>" +
              '<div class="nc2-ck">공사기간</div><div class="nc2-cv">' + esc((Number(d.workDays) || 1) + "일") + "</div>" +
              '<div class="nc2-ck">견적번호</div><div class="nc2-cv">' + esc(d.code || "-") + "</div>" +
              (isAddon
                ? '<div class="nc2-ck">원 견적</div><div class="nc2-cv">' + esc(d.addonBase) + "</div>"
                : '<div class="nc2-ck">담당자</div><div class="nc2-cv">' + esc(d.staffName || "-") + "</div>") +
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
          "<span>현장주소</span><strong>" + esc(d.address || "-") + "</strong>" +
          "<span>연락처</span><strong>" + esc(d.phone || "-") + "</strong>" +
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
              '<div class="nc2-sign-box"><img class="nc2-stamp" src="' + stampSrc + '" alt="시공사 직인" /></div>' +
              '<div class="nc2-sign-at">' + esc(SUPPLIER.company) + "</div>" +
            "</div>" +
            '<div class="nc2-sign-cell">' +
              '<div class="nc2-sign-label">발주자</div>' +
              '<div class="nc2-sign-box' + touchClass + '"' + touchAttr + ">" + customerBox + "</div>" +
              signFoot +
            "</div>" +
          "</div>" +

          '<div class="nc2-total">' +
            '<div class="nc2-total-row"><span>합 계</span><strong>' + num(supply) + "</strong></div>" +
            '<div class="nc2-total-row"><span>부가세(10%)</span><strong>' + num(vat) + "</strong></div>" +
            '<div class="nc2-total-row nc2-total-grand"><span>총 계</span><strong>' + num(total) + "</strong></div>" +
          "</div>" +
        "</div>" +

        /* 추가공사 안내 */
        (isAddon
          ? '<div class="nc2-addon-note">본 견적서는 ' + esc(d.addonBase) +
            ' 현장의 <strong>추가 공사</strong>에 대한 별도 견적입니다. 기존 계약 금액에 합산됩니다.</div>'
          : "") +

        /* 특약 */
        '<div class="nc2-terms">' +
          '<div class="nc2-terms-title">특약사항</div>' +
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
     화면 폭에 맞춰 A4 원본을 통째로 축소합니다.
     보이는 화면과 저장되는 PDF가 어긋나지 않게 하려는 목적입니다.
     --------------------------------------------------------------- */
  function fitScreenDoc(hostEl, maxHeightEl) {
    const host = hostEl || document.querySelector(".nc2-screen-host");
    if (!host) return;
    const wrap = host.querySelector(".nc2-screen-wrap");
    if (!wrap) return;

    const availW = host.clientWidth || PAPER_W;
    const panel = maxHeightEl || host.closest(".estimate-doc");
    const availH = panel ? panel.clientHeight - 32 : 0;

    let k = availW / PAPER_W;
    if (availH > 240) k = Math.min(k, availH / PAPER_H);
    k = Math.max(0.22, Math.min(k, 1.15));

    wrap.style.transform = "scale(" + k + ")";
    host.style.height = Math.round(PAPER_H * k) + "px";
  }

  function screenShell(html) {
    return '<div class="nc2-screen-host"><div class="nc2-screen-wrap">' + html + "</div></div>";
  }

  /* ---------------------------------------------------------------
     서명 패드
     --------------------------------------------------------------- */
  let signCanvas = null;
  let signCtx = null;
  let drawing = false;
  let hasInk = false;
  let onApply = null;

  function buildSignModal() {
    if (document.getElementById("nc2SignModal")) return;

    const modal = document.createElement("div");
    modal.id = "nc2SignModal";
    modal.className = "nc2-modal";
    modal.innerHTML =
      '<div class="nc2-modal-card">' +
        '<div class="nc2-modal-title">발주자 서명</div>' +
        '<div class="nc2-modal-text">아래 칸에 서명해 주세요. 서명하면 견적서에 바로 반영됩니다.</div>' +
        '<div class="nc2-pad-wrap">' +
          '<canvas id="nc2SignCanvas"></canvas>' +
          '<div class="nc2-pad-guide" id="nc2PadGuide">여기에 서명</div>' +
        "</div>" +
        '<div class="nc2-sign-actions">' +
          '<button type="button" class="nc2-btn ghost" id="nc2SignClear">다시 쓰기</button>' +
          '<button type="button" class="nc2-btn ghost" id="nc2SignCancel">취소</button>' +
          '<button type="button" class="nc2-btn" id="nc2SignApply">서명 완료</button>' +
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
    document.getElementById("nc2SignCancel").addEventListener("click", closeSignPad);
    document.getElementById("nc2SignApply").addEventListener("click", applyPad);
    modal.addEventListener("click", function (e) { if (e.target === modal) closeSignPad(); });
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

  function openSignPad(callback) {
    buildSignModal();
    onApply = callback;
    document.getElementById("nc2SignModal").classList.add("show");
    setTimeout(function () { resizePad(); clearPad(); }, 60);
  }

  function closeSignPad() {
    const modal = document.getElementById("nc2SignModal");
    if (modal) modal.classList.remove("show");
    drawing = false;
  }

  /* 서명 이미지가 시트 칸 하나에 들어갈 수 있는 크기.
     구글 시트는 칸 하나에 50,000자까지만 받습니다.
     ★ 서명판은 화면 해상도의 2~3배로 크게 그립니다(선이 매끄럽게 보이려고).
       예전에는 그 큰 그림을 줄이지 않고 그대로 보냈습니다. 선이 조금 많은
       서명이면 한도를 넘겨서, **고객이 서명을 마친 마지막 순간에 실패**했습니다.
       그때는 이미 서명본 PDF 와 '서명완료' 표시가 저장된 뒤라,
       고객 화면에만 실패라고 뜨는 가장 나쁜 모양이었습니다.
     서명은 선 몇 개라 가로 600px 이면 충분합니다. 견적서 PDF 도 같이 가벼워집니다. */
  const SIGN_MAX_WIDTH = 600;

  /* 서명 이미지의 빈 여백을 잘라 서명칸에 꽉 차게 넣습니다. */
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

    const cropW = maxX - minX + 1;
    const cropH = maxY - minY + 1;

    /* 너무 크면 줄여서 담습니다 (비율은 그대로). */
    const scale = Math.min(1, SIGN_MAX_WIDTH / cropW);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cropW * scale));
    out.height = Math.max(1, Math.round(cropH * scale));

    const ctx = out.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, minX, minY, cropW, cropH, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  }

  function applyPad() {
    if (!hasInk) { alert("서명을 먼저 작성해 주세요."); return; }
    const result = { dataUrl: trimSignature(signCanvas), signedAt: nowStamp() };
    closeSignPad();
    if (typeof onApply === "function") onApply(result);
  }

  /* ---------------------------------------------------------------
     A4 원본을 그대로 캡처해 PDF 로 만듭니다.
     --------------------------------------------------------------- */
  async function renderCanvas(html) {
    if (!window.html2canvas) {
      throw new Error("이미지 생성 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }

    let host = document.getElementById("nc2RenderHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "nc2RenderHost";
      document.body.appendChild(host);
    }

    host.innerHTML = html;
    const paper = host.querySelector(".nc2-paper");

    await Promise.all(Array.from(paper.querySelectorAll("img")).map(function (img) {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(function (resolve) { img.onload = resolve; img.onerror = resolve; });
    }));
    await new Promise(function (r) { requestAnimationFrame(function () { requestAnimationFrame(r); }); });

    const canvas = await html2canvas(paper, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#FFFFFF",
      logging: false
    });

    host.innerHTML = "";
    return canvas;
  }

  async function makePdfBlob(data) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error("PDF 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.");
    }

    const canvas = await renderCanvas(buildDoc(data, ""));
    const jsPDF = window.jspdf.jsPDF;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    return pdf.output("blob");
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = function () { reject(new Error("파일을 읽지 못했습니다.")); };
      reader.readAsDataURL(blob);
    });
  }

  /* ---------------------------------------------------------------
     스타일
     --------------------------------------------------------------- */
  const CSS = `
  .nc2-screen-host{width:100%;overflow:hidden;}
  .nc2-screen-wrap{width:${PAPER_W}px;height:${PAPER_H}px;transform-origin:top left;}

  #nc2RenderHost{position:fixed;left:-20000px;top:0;width:${PAPER_W}px;height:${PAPER_H}px;
    overflow:hidden;pointer-events:none;background:#fff;}

  .nc2-paper{position:relative;width:${PAPER_W}px;height:${PAPER_H}px;overflow:hidden;
    padding:38px 40px 26px;background:#fff;color:#111;box-sizing:border-box;
    display:flex;flex-direction:column;isolation:isolate;
    font-family:"NCorePretendard","Pretendard",-apple-system,BlinkMacSystemFont,
      "Segoe UI","Noto Sans KR","Apple SD Gothic Neo",sans-serif;
    font-variant-numeric:tabular-nums;}
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
  .nc2-sign-touch{cursor:pointer;border:2px dashed #D76016;background:#FFF4EA;
    animation:nc2Pulse 1.6s ease-in-out infinite;}
  @keyframes nc2Pulse{
    0%,100%{background:#FFF4EA;border-color:#D76016;}
    50%{background:#FFE6D2;border-color:#B94E0D;}
  }
  .nc2-sign-touch .nc2-sign-empty{color:#D76016;}
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

  .nc2-title-addon{font-size:31px;letter-spacing:6px;}

  .nc2-addon-note{margin-top:12px;padding:8px 11px;border-radius:5px;
    background:#FFF4EA;border:1px solid rgba(215,96,22,.28);
    color:#8A4412;font-size:10.5px;font-weight:850;line-height:1.5;}

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

  /* 서명 패드 */
  .nc2-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;
    justify-content:center;padding:16px;background:rgba(17,17,17,.42);}
  .nc2-modal.show{display:flex;}
  .nc2-modal-card{width:min(760px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;
    background:#fff;border-radius:22px;padding:22px;
    box-shadow:0 28px 70px rgba(17,17,17,.22);
    font-family:"NCorePretendard","Pretendard",-apple-system,BlinkMacSystemFont,
      "Segoe UI","Noto Sans KR","Apple SD Gothic Neo",sans-serif;}
  .nc2-modal-title{font-size:23px;font-weight:950;letter-spacing:-.8px;color:#111;margin-bottom:8px;}
  .nc2-modal-text{font-size:14px;font-weight:750;line-height:1.55;color:#666;margin-bottom:16px;}
  .nc2-pad-wrap{position:relative;height:320px;border:2px solid #222;border-radius:14px;
    background:#fff;overflow:hidden;touch-action:none;}
  #nc2SignCanvas{display:block;width:100%;height:100%;touch-action:none;}
  .nc2-pad-guide{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);
    pointer-events:none;color:#C6C6C6;font-size:20px;font-weight:850;}
  .nc2-sign-actions{margin-top:12px;display:grid;grid-template-columns:1fr 1fr 1.3fr;gap:10px;}
  .nc2-btn{min-height:56px;border:0;border-radius:16px;background:#D76016;color:#fff;
    font-size:17px;font-weight:900;cursor:pointer;font-family:inherit;}
  .nc2-btn.ghost{background:#F1F1EF;color:#333;border:1px solid rgba(17,17,17,.12);}
  .nc2-btn:disabled{opacity:.5;cursor:not-allowed;}

  @media (max-width:760px){
    .nc2-pad-wrap{height:240px;}
    .nc2-sign-actions{grid-template-columns:1fr 1fr;}
    .nc2-sign-actions .nc2-btn:not(.ghost){grid-column:1/-1;}
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
     공개
     --------------------------------------------------------------- */
  window.NCoreDoc = {
    SUPPLIER: SUPPLIER,
    VAT_RATE: VAT_RATE,
    PAPER_W: PAPER_W,
    PAPER_H: PAPER_H,
    esc: esc,
    num: num,
    todayText: todayText,
    nowStamp: nowStamp,
    vatOf: vatOf,
    injectStyle: injectStyle,
    buildDoc: buildDoc,
    screenShell: screenShell,
    fitScreenDoc: fitScreenDoc,
    openSignPad: openSignPad,
    buildSignModal: buildSignModal,
    loadStamp: loadStamp,
    getStampSrc: getStampSrc,
    renderCanvas: renderCanvas,
    makePdfBlob: makePdfBlob,
    blobToBase64: blobToBase64
  };
})();
