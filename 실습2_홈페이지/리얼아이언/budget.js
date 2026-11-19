"use strict";
(() => {
  const C = window.BudgetCore;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  const money = value => new Intl.NumberFormat("ko-KR").format(value) + "원";
  const uid = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  let projects = [];
  let base = null;
  let draft = null;
  let activeTeam = C.teams[0];
  let dirty = false;
  let saving = false;
  let refreshSequence = 0;
  let remoteProject = null;
  const helpers = {
    "인프라팀":"예) 서버, 스토리지, 백업 장비 · 서버 규격과 수량을 입력합니다.",
    "네트워크팀":"예) 스위치, 방화벽, 회선 · 장비 구매와 월 회선비를 구분합니다.",
    "클라우드플랫폼팀":"예) 프라이빗 클라우드 VM, 퍼블릭 클라우드 자원 · 월 단가에는 자원 1개 기준 비용을 입력합니다.",
    "DB팀":"예) DB 서버, DB 라이선스, 관리 서비스 · 서버 비용을 다른 팀과 중복 계상하지 않도록 확인합니다."
  };
  function notify(text, error = false) {
    $("#message").textContent = text;
    $("#message").classList.toggle("error", error);
    $("#message").hidden = !text;
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {cache:"no-store", ...options,
      headers:{"Content-Type":"application/json", ...options.headers}});
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(result.error || "요청을 처리하지 못했습니다.");
      error.conflicts = result.conflicts;
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function setDirty(value) {
    dirty = value;
    $("#dirty-status").textContent = value ? "저장하지 않은 변경이 있어요." : "공유 서버에 저장된 내용입니다.";
    $("#dirty-status").classList.toggle("unsaved", value);
    $("#estimate-caption").textContent = value ? "현재 입력 초안 · 저장 전" : "공유 저장본 기준";
    $("#mobile-dirty").textContent = value ? "저장 전 초안" : "공유 저장본";
  }
  function projectOptions() {
    $("#project-select").innerHTML = projects.length
      ? projects.map(project => '<option value="' + escape(project.id) + '">' + escape(project.name) + '</option>').join("")
      : '<option value="">등록된 사업 없음</option>';
    if (draft) $("#project-select").value = draft.id;
  }
  function useProject(project) {
    base = project ? C.normalize(project) : null;
    draft = project ? C.normalize(project) : null;
    remoteProject = null;
    $("#remote-notice").hidden = true;
    $("#comparison").hidden = true;
    setDirty(false);
    render();
  }
  function render() {
    projectOptions();
    $("#empty").hidden = !!draft;
    $("#workspace").hidden = !draft;
    $("#top-save").disabled = !draft || saving;
    if (!draft) return;
    document.querySelectorAll("[data-field]").forEach(input => {input.value = draft[input.dataset.field];});
    $("#project-info").textContent = draft.updatedAt
      ? "최근 저장 · " + new Date(draft.updatedAt).toLocaleString("ko-KR") + " · " + (draft.updatedBy || "사업 생성") + " · 버전 " + draft.revision
      : "새 사업의 산정 기준을 입력해 주세요.";
    renderItems();
    renderResults();
  }
  function renderItems() {
    $("#team-tabs").innerHTML = C.teams.map(team =>
      '<button type="button" data-team="' + team + '" aria-pressed="' + (team === activeTeam) + '">' + team + '</button>').join("");
    $("#team-help").textContent = helpers[activeTeam];
    const rows = draft.items.filter(item => item.team === activeTeam);
    $("#items").innerHTML = rows.length ? rows.map(item => {
      const selectOption = (value, label) => '<option value="' + value + '"' + (item.billing === value ? ' selected' : '') + '>' + label + '</option>';
      const equipmentOptions = [{id:"custom", name:"직접 입력"}, ...C.catalog.filter(entry => entry.team === item.team)]
        .map(entry => '<option value="' + entry.id + '"' + (item.catalogId === entry.id ? ' selected' : '') + '>' + entry.name + '</option>').join("");
      const tierOptions = Object.entries(C.tiers).map(([value, label]) =>
        '<option value="' + value + '"' + (item.tier === value ? ' selected' : '') + '>' + label + '</option>').join("");
      return '<article class="item" data-id="' + item.id + '"><div class="item-heading"><strong>' + escape(item.name || "새 품목") + '</strong><button type="button" class="remove" data-remove="' + item.id + '">품목 삭제</button></div><div class="item-grid">' +
        '<label class="equipment-choice">장비 종류<select data-equipment>' + equipmentOptions + '</select></label>' +
        '<label class="tier-choice">배치 계층<select data-item-field="tier">' + tierOptions + '</select></label>' +
        '<label>품목명<input data-item-field="name" maxlength="200" value="' + escape(item.name) + '" placeholder="예) 업무용 서버"></label>' +
        '<label>총 수량 · 최소 2개<input data-item-field="qty" type="number" min="2" max="100000" step="1" value="' + escape(item.qty) + '" placeholder="예) 2 이상" aria-describedby="quantity-' + item.id + '"><span class="quantity-warning" id="quantity-' + item.id + '" hidden></span></label>' +
        '<label>단위당 가격 (원)<input data-item-field="price" type="number" min="0" max="10000000000" step="1" value="' + escape(item.price) + '" placeholder="직접 입력"></label>' +
        '<label class="spec">규격·산정 근거<input data-item-field="spec" maxlength="2000" value="' + escape(item.spec) + '" placeholder="예) 8코어, 메모리 32GB / 환경별 2대"></label>' +
        '<label>과금 방식<select data-item-field="billing">' + selectOption("once", "일회성 구매·구축") + selectOption("monthly", "매월 사용") + '</select></label></div><div class="item-foot"><span class="small">수량 × 단위당 가격' + (item.billing === "monthly" ? " × 과금 개월" : "") + '</span><strong class="item-cost"></strong></div></article>';
    }).join("") : '<p class="empty">이 팀의 품목을 추가해 수량과 단가를 입력해 주세요.</p>';
    updateItemCosts();
  }
  function updateItemCosts() {
    for (const item of draft.items.filter(item => item.team === activeTeam)) {
      const row = document.querySelector('[data-id="' + item.id + '"]');
      if (!row) continue;
      const complete = item.name.trim() && Number.isInteger(item.qty) && item.qty >= 2 && Number.isInteger(item.price) && item.price >= 0;
      const cost = complete ? item.qty * item.price * (item.billing === "monthly" ? draft.months : 1) : NaN;
      row.querySelector(".item-cost").textContent = complete && Number.isSafeInteger(cost) ? money(cost) :
        (item.qty !== "" && (item.qty < 2) ? "이중화 수량 확인 필요" : "입력 확인 필요");
      row.querySelector(".item-heading strong").textContent = item.name || "새 품목";
      const quantityInvalid = item.qty !== "" && (!Number.isInteger(item.qty) || item.qty < 2 || item.qty > 100000);
      row.querySelector('[data-item-field="qty"]').setAttribute("aria-invalid", String(quantityInvalid));
      row.querySelector(".quantity-warning").hidden = !quantityInvalid;
      row.querySelector(".quantity-warning").textContent = quantityInvalid ? "이중화 수량을 2~100,000의 정수로 입력해 주세요." : "";
      row.querySelector(".item-foot span").textContent = "수량 × 단위당 가격" + (item.billing === "monthly" ? " × 과금 개월" : "");
    }
  }
  function renderResults() {
    const architecture = C.architectureCheck(draft);
    $("#architecture-status").textContent = architecture.ready
      ? "수량·계층 입력 기준 충족 · 장애영역과 절체 구성은 기술팀 검토 필요"
      : [
          architecture.missingTiers.length ? "미작성 계층 · " + architecture.missingTiers.map(tier => C.tiers[tier]).join(", ") : "",
          architecture.unpaired.length ? "이중화 수량 확인 · " + architecture.unpaired.map(item => item.name || "새 품목").join(", ") : ""
        ].filter(Boolean).join(" / ");
    $("#architecture-status").classList.toggle("error", !architecture.ready);
    const recommendation = C.recommend(draft);
    $("#environment-results").innerHTML = '<h3 style="margin-top:24px">' + recommendation.title + '</h3>' +
      (recommendation.missing.length ? '<p class="small">추가 확인 · ' + recommendation.missing.join(", ") + '</p>' : '') +
      '<div class="recommendation">' + recommendation.candidates.map(candidate =>
        '<article class="candidate ' + (candidate.status === "우선 검토" ? "preferred" : "") + '"><strong>' + candidate.status + '</strong><h3>' + candidate.name + '</h3><p>' + candidate.meaning + '</p><ul>' + candidate.reasons.map(reason => '<li>' + reason + '</li>').join("") + '</ul></article>').join("") + '</div>';
    try {
      C.validate(draft);
      const total = C.calculate(draft);
      const emptyTeams = C.teams.filter(team => total.teams[team].count === 0);
      $("#mobile-total").textContent = money(total.total);
      $("#totals").innerHTML = '<div class="total">총 가견적<strong id="grand-total">' + money(total.total) + '</strong></div>' +
        '<p class="budget-components">일회성 ' + money(total.once) + '<br>매월 ' + money(total.monthly) + ' · ' + draft.months + '개월</p>' +
        '<details class="cost-breakdown"><summary>기간·예비비·부가세 내역</summary><dl>' +
        [["일회성 비용",total.once], ["월 비용",total.monthly], ["공급가액 · " + draft.months + "개월",total.base], ["예비비 · " + draft.contingency + "%",total.reserve], ["부가세 · " + draft.tax + "%",total.vat]]
        .map(([label,value]) => '<div><dt>' + label + '</dt><dd>' + money(value) + '</dd></div>').join("") +
        '</dl></details>' +
        (total.incomplete ? '<p class="notice error">미입력 품목 ' + total.incomplete + '건이 합계에서 제외되어 있습니다.</p>' : '') +
        (emptyTeams.length ? '<p class="small">품목 미작성 팀 · ' + emptyTeams.join(", ") + '</p>' : '') +
        (!architecture.ready ? '<p class="notice error">3티어·이중화 구성 검토 중인 가견적입니다.</p>' : '') +
        (!draft.items.length ? '<p class="small">품목을 입력하면 가견적이 계산됩니다.</p>' : '');
      $("#team-totals").innerHTML = '<h3>팀별 합계</h3>' + C.teams.map(team => {
        const value = total.teams[team];
        return '<p><span>' + team + '<span>입력 ' + value.count + '건 · 미완성 ' + value.incomplete + '건</span></span><strong>' + money(value.once + value.monthly * draft.months) + '</strong></p>';
      }).join("");
      $("#csv").disabled = false;
    } catch (error) {
      $("#totals").textContent = error.message;
      $("#mobile-total").textContent = "입력 확인 필요";
      $("#team-totals").textContent = "";
      $("#csv").disabled = true;
    }
    updateItemCosts();
  }
  async function refresh() {
    const sequence = ++refreshSequence;
    const result = await api("/api/projects");
    if (sequence !== refreshSequence) return;
    projects = result.projects;
    if (!draft) useProject(projects[0] || null);
    else {
      const latest = projects.find(project => project.id === draft.id);
      if (!latest) {
        if (dirty) {
          remoteProject = null;
          notify("다른 사용자가 이 사업을 삭제했습니다. 내 초안은 JSON으로 내려받을 수 있습니다.", true);
        } else useProject(projects[0] || null);
      } else if (latest.revision > base.revision) {
        if (dirty || saving) {
          remoteProject = latest;
          $("#remote-notice").hidden = false;
        } else useProject(latest);
      }
      projectOptions();
    }
  }
  function canDiscard() {
    return !dirty || confirm("저장하지 않은 입력이 있습니다. 변경을 버리고 이동할까요?");
  }
  function download(name, content, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filename(extension) {
    return (draft.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80) || "사업") + "-가견적." + extension;
  }
  document.querySelectorAll("[data-field]").forEach(input => {
    input.addEventListener("input", () => {
      draft[input.dataset.field] = input.type === "number" ? (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : "") : input.value;
      setDirty(true);
      renderResults();
    });
  });
  $("#items").addEventListener("input", event => {
    const input = event.target.closest("[data-item-field]");
    if (!input) return;
    const item = draft.items.find(item => item.id === input.closest("[data-id]").dataset.id);
    item[input.dataset.itemField] = input.type === "number" ? (Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : "") : input.value;
    setDirty(true);
    renderResults();
  });
  $("#items").addEventListener("change", event => {
    const select = event.target.closest("[data-equipment]");
    if (!select) return;
    const item = draft.items.find(row => row.id === select.closest("[data-id]").dataset.id);
    if (select.value === "custom") item.catalogId = "custom";
    else Object.assign(item, C.equipmentItem(select.value, item.id));
    setDirty(true);
    renderItems();
    renderResults();
    notify(select.value === "custom" ? "직접 입력으로 전환했습니다. 기존 입력값을 수정할 수 있어요." :
      "장비 기본 용도·계층과 이중화 수량 2개를 채웠습니다. 단가는 새로 입력해 주세요.");
  });
  $("#team-tabs").addEventListener("click", event => {
    const button = event.target.closest("[data-team]");
    if (!button) return;
    activeTeam = button.dataset.team;
    renderItems();
  });
  $("#add-item").addEventListener("click", () => {
    const item = {id:uid(),team:activeTeam,catalogId:"custom",tier:"shared",name:"",spec:"",qty:2,price:"",billing:"once"};
    draft.items.push(item);
    setDirty(true);
    renderItems();
    renderResults();
    document.querySelector('[data-id="' + item.id + '"] input').focus();
  });
  $("#items").addEventListener("click", event => {
    const button = event.target.closest("[data-remove]");
    if (!button || !confirm("이 품목을 삭제할까요? 변경 저장 후 공유 견적에 반영됩니다.")) return;
    draft.items = draft.items.filter(item => item.id !== button.dataset.remove);
    setDirty(true);
    renderItems();
    renderResults();
  });
  $("#months-from-dates").addEventListener("click", () => {
    if (!draft.start || !draft.end || draft.end < draft.start) return notify("시작일과 종료일을 올바르게 입력해 주세요.", true);
    const monthIndex = date => Number(date.slice(0,4)) * 12 + Number(date.slice(5,7));
    draft.months = monthIndex(draft.end) - monthIndex(draft.start) + 1;
    document.querySelector('[data-field="months"]').value = draft.months;
    setDirty(true);
    renderResults();
  });
  $("#add-architecture").addEventListener("click", () => {
    if (!confirm("물리서버 기준의 기본 구성을 추가할까요? 기존 직접 입력 품목과 자원 중복 여부를 확인해 주세요.")) return;
    let count = 0;
    for (const equipmentId of C.defaultEquipment) {
      const equipment = C.catalog.find(entry => entry.id === equipmentId);
      if (draft.items.some(item => item.catalogId === equipmentId && item.tier === equipment.tier)) continue;
      draft.items.push(C.equipmentItem(equipmentId, uid()));
      count++;
    }
    setDirty(true);
    renderItems();
    renderResults();
    notify(count ? "기본 품목 " + count + "건을 추가했습니다. 각 팀에서 규격과 단가를 입력해 주세요." : "기본 품목이 이미 등록되어 있습니다.");
  });
  $("#project-select").addEventListener("change", event => {
    if (!canDiscard()) {
      event.target.value = draft.id;
      return;
    }
    useProject(projects.find(project => project.id === event.target.value));
    notify("");
  });
  $("#create").addEventListener("click", async () => {
    const name = $("#new-name").value.trim();
    if (!name) return notify("새 사업명을 입력해 주세요.", true);
    if (!canDiscard()) return;
    $("#create").disabled = true;
    try {
      const result = await api("/api/projects", {method:"POST", body:JSON.stringify({name})});
      projects.unshift(result.project);
      useProject(result.project);
      $("#new-name").value = "";
      notify("사업을 만들었습니다. 내용을 입력한 뒤 변경 저장을 눌러 주세요.");
      await refresh();
    } catch (error) {notify(error.message, true);}
    finally {$("#create").disabled = false;}
  });
  $("#budget-form").addEventListener("submit", async event => {
    event.preventDefault();
    if (saving) return;
    try {
      C.validate(draft);
      const editor = $("#editor").value.trim();
      if (!editor) {
        $("#editor").focus();
        return notify("공유 변경 이력을 위해 작성자 이름 또는 닉네임을 입력해 주세요.", true);
      }
      saving = true;
      document.querySelectorAll("#application input, #application select, #application textarea, #application button").forEach(control => {control.disabled = true;});
      const result = await api("/api/projects/" + draft.id, {method:"PUT", body:JSON.stringify({base, draft, editor})});
      projects = projects.map(project => project.id === result.project.id ? result.project : project);
      useProject(result.project);
      notify("변경 내용을 공유 서버에 저장했습니다.");
      try {localStorage.setItem("aki-budget-editor", editor);} catch {}
      await refresh();
    } catch (error) {
      notify(error.message + (error.conflicts ? " 충돌 항목: " + error.conflicts.join(", ") : ""), true);
      if (error.status === 409) {
        await refresh().catch(() => {});
        $("#compare").click();
      }
    } finally {
      saving = false;
      document.querySelectorAll("#application input, #application select, #application textarea, #application button").forEach(control => {control.disabled = false;});
      if (draft) renderResults();
    }
  });
  $("#reload").addEventListener("click", async () => {
    if (!canDiscard()) return;
    try {
      const result = await api("/api/projects");
      projects = result.projects;
      useProject(projects.find(project => project.id === draft?.id) || projects[0] || null);
      notify("최신 저장본을 불러왔습니다.");
    } catch (error) {notify(error.message, true);}
  });
  $("#compare").addEventListener("click", () => {
    if (!remoteProject) return;
    const labels = {name:"사업명",business:"사업 설명",months:"과금 개월",tax:"부가세율",contingency:"예비비율"};
    const changes = C.fields.filter(field => !C.same(base[field], remoteProject[field]))
      .map(field => (labels[field] || field) + "\n최신: " + remoteProject[field] + "\n내 입력: " + draft[field]);
    for (const item of remoteProject.items) {
      const original = base.items.find(row => row.id === item.id);
      if (!C.same(original, item)) changes.push(item.team + " · " + (item.name || "새 품목") + "\n최신 수량: " + item.qty + " / 단가: " + item.price + " / 규격: " + item.spec);
    }
    for (const item of base.items.filter(row => !remoteProject.items.some(live => live.id === row.id))) changes.push("최신본에서 삭제된 품목: " + item.name);
    $("#comparison").textContent = changes.join("\n\n") || "최신 저장 정보만 갱신되었습니다.";
    $("#comparison").hidden = false;
  });
  $("#json").addEventListener("click", () => {
    download(filename("json"), JSON.stringify({version:1,state:dirty ? "unsaved-draft" : "saved",project:draft}, null, 2), "application/json");
    notify(dirty ? "현재 입력 초안을 내려받았습니다. 서버 저장은 별도로 필요합니다." : "공유 저장본을 내려받았습니다.");
  });
  $("#csv").addEventListener("click", () => {
    try {
      C.validate(draft);
      const total = C.calculate(draft);
      const emptyTeams = C.teams.filter(team => total.teams[team].count === 0);
      const recommendation = C.recommend(draft);
      const architecture = C.architectureCheck(draft);
      const rows = [["사업명",draft.name],["상태",dirty ? "저장 전 초안" : "공유 저장본"],["사업 설명",draft.business],
        ["기본 아키텍처","3티어(WEB·WAS·DB)·전 장비 이중화 필수"],["수량 기준","이중화 총 수량 최소 2개 · 단가는 장비 1개당"],
        ["계층·수량 검토",architecture.ready ? "입력 기준 충족·기술팀 구성 검토 필요" : "구성 검토 중"],
        ["미작성 계층",architecture.missingTiers.map(tier => C.tiers[tier]).join(", ")],
        ["주사용자",draft.primaryUser],["서비스 대상",draft.audience],["과금 개월",draft.months],
        ["환경 검토",recommendation.title],["미입력 품목 수",total.incomplete],["품목 미작성 팀",emptyTeams.join(", ")],
        [],["담당 팀","장비 종류","배치 계층","품목","규격","과금 방식","총 수량","단가(원)","기간 합계(원)","입력 상태"]];
      for (const item of draft.items) {
        const complete = item.name.trim() && item.qty !== "" && item.price !== "";
        const equipment = C.catalog.find(entry => entry.id === item.catalogId);
        rows.push([item.team,equipment ? equipment.name : "직접 입력",C.tiers[item.tier],item.name,item.spec,item.billing === "once" ? "일회성" : "월 과금",item.qty,item.price,
          complete ? item.qty * item.price * (item.billing === "monthly" ? draft.months : 1) : "", complete ? "입력" : "미입력·합계 제외"]);
      }
      rows.push([],["일회성 비용",total.once],["월 비용",total.monthly],["공급가액",total.base],["예비비",total.reserve],["부가세",total.vat],["총 가견적",total.total]);
      const cell = value => {
        let text = String(value ?? "");
        if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
        return '"' + text.replace(/"/g, '""') + '"';
      };
      download(filename("csv"), "\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
    } catch (error) {notify(error.message, true);}
  });
  $("#delete-project").addEventListener("click", async () => {
    if (!confirm("이 사업과 모든 팀의 견적 품목을 공유 서버에서 삭제할까요?")) return;
    try {
      await api("/api/projects/" + draft.id, {method:"DELETE", body:JSON.stringify({revision:base.revision})});
      projects = projects.filter(project => project.id !== draft.id);
      useProject(projects[0] || null);
      notify("사업을 삭제했습니다.");
    } catch (error) {notify(error.message, true);}
  });
  window.addEventListener("beforeunload", event => {
    if (dirty) {event.preventDefault();event.returnValue = "";}
  });
  async function initialize() {
    if (location.protocol === "file:") {
      $("#file-help").hidden = false;
      $("#connection").textContent = "서버 접속 필요";
      return;
    }
    $("#application").hidden = false;
    try {
      try {$("#editor").value = localStorage.getItem("aki-budget-editor") || "";} catch {}
      await refresh();
      const events = new EventSource("/api/events");
      events.onopen = () => {$("#connection").textContent = "실시간 공유 연결됨";};
      events.onmessage = () => refresh().catch(() => notify("최신 내용을 받지 못했습니다. 서버 연결을 확인해 주세요.", true));
      events.onerror = () => {$("#connection").textContent = "재연결 중 · 저장 전 연결 확인";};
    } catch (error) {
      $("#connection").textContent = "연결 실패";
      notify("공유 서버에 연결하지 못했습니다. 서버 실행 여부를 확인하고 새로고침해 주세요. " + error.message, true);
    }
  }
  initialize();
})();
