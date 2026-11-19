"use strict";
(function (root) {
  const teams = ["인프라팀", "네트워크팀", "클라우드플랫폼팀", "DB팀"];
  const fields = ["name", "business", "users", "environments", "availability", "resources", "start", "end", "months", "contingency", "tax"];
  fields.push("primaryUser", "audience", "external", "dedicated", "variable", "privateCapacity", "urgency");
  const architecture = "3-tier-ha";
  const tiers = {web: "WEB · 화면·접속", app: "WAS · 업무 처리", db: "DB · 데이터", shared: "공통 · 네트워크·저장"};
  const catalog = [
    {id:"server", team:"인프라팀", name:"기본 서버", tier:"app", spec:"업무용 서버 / CPU·메모리 담당팀 산정"},
    {id:"web-server", team:"인프라팀", name:"WEB 서버", tier:"web", spec:"화면·접속 계층 / 독립 장애영역에 분산 배치"},
    {id:"was-server", team:"인프라팀", name:"WAS 서버", tier:"app", spec:"업무 처리 계층 / 세션·부하 분산 검토"},
    {id:"db-server", team:"DB팀", name:"DB 서버", tier:"db", spec:"데이터 계층 / 복제·절체 방식 검토"},
    {id:"san", team:"인프라팀", name:"스토리지 (SAN)", tier:"shared", spec:"컨트롤러·전원·경로·데이터 복제 구성 검토"},
    {id:"nas", team:"인프라팀", name:"파일 스토리지 (NAS)", tier:"shared", spec:"파일 공유 / 데이터 복제·장애 절체 검토"},
    {id:"backup", team:"인프라팀", name:"백업 장비", tier:"shared", spec:"백업 용량·보관 기간·복구 절차 검토"},
    {id:"l3", team:"네트워크팀", name:"L3 스위치", tier:"shared", spec:"계층 간 라우팅 / 이중 경로·링크 구성"},
    {id:"l4", team:"네트워크팀", name:"L4 스위치", tier:"shared", spec:"부하 분산 / 상태 확인·장애 절체 구성"},
    {id:"firewall", team:"네트워크팀", name:"방화벽", tier:"shared", spec:"구간 접근 제어 / 정책·세션 동기화 검토"},
    {id:"vpn", team:"네트워크팀", name:"VPN 장비", tier:"shared", spec:"암호화 연결 / 터널·접속 경로 이중화"},
    {id:"waf", team:"네트워크팀", name:"웹 방화벽 (WAF)", tier:"shared", spec:"웹 요청 보호 / 우회 경로·정책 동기화 검토"},
    {id:"ips", team:"네트워크팀", name:"침입방지 장비 (IPS)", tier:"shared", spec:"침입 탐지·차단 / 장애 우회·이중 경로 검토"},
    {id:"private-vm", team:"클라우드플랫폼팀", name:"프라이빗 클라우드 VM", tier:"app", billing:"monthly", spec:"vCPU·메모리·디스크 담당팀 산정 / 서로 다른 호스트 배치"},
    {id:"public-vm", team:"클라우드플랫폼팀", name:"퍼블릭 클라우드 VM", tier:"app", billing:"monthly", spec:"인스턴스 규격 담당팀 산정 / 독립 장애영역 배치"},
    {id:"private-host", team:"클라우드플랫폼팀", name:"프라이빗 클라우드 호스트", tier:"shared", spec:"클러스터 호스트 / N+1·장애영역별 용량 검토"},
    {id:"db-appliance", team:"DB팀", name:"DB 전용 장비", tier:"db", spec:"DB 처리 용량·라이선스·복제·절체 방식 검토"}
  ];
  const defaultEquipment = ["web-server", "was-server", "db-server", "san", "l3", "l4", "firewall", "vpn"];
  const itemFields = ["team", "name", "spec", "qty", "price", "billing", "catalogId", "tier"];
  const clone = value => JSON.parse(JSON.stringify(value));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function normalize(project) {
    const result = clone(project);
    if (!result || typeof result !== "object") return result;
    result.architecture ??= architecture;
    if (Array.isArray(result.items)) {
      for (const item of result.items) {
        if (!item || typeof item !== "object") continue;
        item.catalogId ??= "custom";
        item.tier ??= "shared";
      }
    }
    return result;
  }
  function equipmentItem(catalogId, id) {
    const equipment = catalog.find(item => item.id === catalogId);
    ensure(equipment, "장비 종류를 확인해 주세요.");
    return {id, catalogId, team:equipment.team, name:equipment.name, tier:equipment.tier,
      spec:equipment.spec, qty:2, price:"", billing:equipment.billing || "once"};
  }
  function architectureCheck(project) {
    const missingTiers = ["web", "app", "db"].filter(tier => !project.items.some(item => item.tier === tier &&
      Number.isInteger(item.qty) && item.qty >= 2 && item.name.trim()));
    const unpaired = project.items.filter(item => item.qty !== "" &&
      (!Number.isInteger(item.qty) || item.qty < 2));
    return {missingTiers, unpaired, ready:missingTiers.length === 0 && unpaired.length === 0};
  }
  function ensure(condition, message) {
    if (!condition) throw new Error(message);
  }
  function text(value, maximum = 3000) {
    return typeof value === "string" && value.length <= maximum;
  }
  function number(value, maximum, minimum = 0) {
    return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
  }
  function validDate(value) {
    if (value === "") return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function calculate(project) {
    const totals = Object.fromEntries(teams.map(team => [team, {once: 0, monthly: 0, count: 0, incomplete: 0}]));
    for (const item of project.items) {
      const team = totals[item.team];
      team.count++;
      if (!item.name.trim() || item.qty === "" || item.price === "") {
        team.incomplete++;
        continue;
      }
      const cost = item.qty * item.price;
      ensure(Number.isSafeInteger(cost), "품목 금액이 계산 가능한 범위를 넘었습니다.");
      team[item.billing === "once" ? "once" : "monthly"] += cost;
    }
    const once = Object.values(totals).reduce((sum, team) => sum + team.once, 0);
    const monthly = Object.values(totals).reduce((sum, team) => sum + team.monthly, 0);
    const base = once + monthly * project.months;
    ensure(Number.isSafeInteger(base) && base <= 100000000000000, "공급가액은 100조 원 이하로 입력해 주세요.");
    const percent = (amount, rate) => Number((BigInt(amount) * BigInt(Math.round(rate * 100)) + 5000n) / 10000n);
    const reserve = percent(base, project.contingency);
    const vat = percent(base + reserve, project.tax);
    return {teams: totals, once, monthly, base, reserve, vat, total: base + reserve + vat,
      incomplete: Object.values(totals).reduce((sum, team) => sum + team.incomplete, 0)};
  }
  function validate(project, options = {}) {
    ensure(project && typeof project === "object", "사업 데이터 형식을 확인해 주세요.");
    ensure(text(project.id, 100) && /^[a-zA-Z0-9-]+$/.test(project.id), "사업 ID가 올바르지 않습니다.");
    ensure(text(project.name, 120) && project.name.trim(), "사업명을 입력해 주세요.");
    ensure(project.architecture === undefined || project.architecture === architecture, "기본 구조는 3티어·이중화 필수입니다.");
    for (const field of ["business", "users", "environments", "availability", "resources"]) {
      ensure(text(project[field]), "사업 기준 입력값을 확인해 주세요.");
    }
    ensure(validDate(project.start) && validDate(project.end), "유효한 날짜를 입력해 주세요.");
    ensure(!project.start || !project.end || project.start <= project.end, "종료일은 시작일 이후여야 합니다.");
    ensure(Number.isInteger(project.months) && number(project.months, 1200, 1), "과금 기간은 1~1,200개월로 입력해 주세요.");
    for (const field of ["contingency", "tax"]) {
      ensure(number(project[field], 100) && Math.abs(project[field] * 100 - Math.round(project[field] * 100)) < 0.00001,
        "예비비와 부가세율은 0~100%, 소수점 둘째 자리까지 입력해 주세요.");
    }
    ensure(Array.isArray(project.items) && project.items.length <= 1000, "사업당 품목은 최대 1,000건입니다.");
    const ids = new Set();
    for (const item of project.items) {
      ensure(item && text(item.id, 100) && /^[a-zA-Z0-9-]+$/.test(item.id) && !ids.has(item.id), "품목 ID가 올바르지 않습니다.");
      ids.add(item.id);
      ensure(teams.includes(item.team) && ["once", "monthly"].includes(item.billing), "담당 팀과 과금 방식을 확인해 주세요.");
      ensure(text(item.name, 200) && text(item.spec, 2000), "품목명과 규격을 확인해 주세요.");
      ensure(item.catalogId === undefined || item.catalogId === "custom" ||
        catalog.some(entry => entry.id === item.catalogId && entry.team === item.team), "담당 팀의 장비 종류를 선택해 주세요.");
      ensure(item.tier === undefined || Object.hasOwn(tiers, item.tier), "장비의 배치 계층을 확인해 주세요.");
      ensure(item.qty === "" || (Number.isInteger(item.qty) && number(item.qty, 100000, 1)), "수량은 1~100,000의 정수로 입력해 주세요.");
      if (!options.allowUnpaired) {
        ensure(item.qty === "" || (item.qty >= 2),
          (item.name || "장비") + " 수량은 이중화 기준으로 2 이상 입력해 주세요.");
      }
      ensure(item.price === "" || (Number.isInteger(item.price) && number(item.price, 10000000000)), "단가는 0~100억 원의 정수로 입력해 주세요.");
    }
    for (const field of ["primaryUser", "audience"]) ensure(text(project[field]), "사용자와 서비스 대상을 확인해 주세요.");
    for (const field of ["external", "dedicated", "variable", "privateCapacity", "urgency"]) {
      ensure(["yes", "no", "unknown"].includes(project[field]), "환경 판단 질문의 답을 확인해 주세요.");
    }
    calculate(project);
    return project;
  }
  function merge(current, base, draft) {
    current = normalize(current);
    base = normalize(base);
    draft = normalize(draft);
    validate(base, {allowUnpaired:true});
    validate(draft);
    ensure(current.id === base.id && current.id === draft.id, "사업 ID가 일치하지 않습니다.");
    const merged = clone(current);
    const conflicts = [];
    function mergeFields(destination, original, proposal, names, label) {
      for (const field of names) {
        if (same(proposal[field], original[field])) continue;
        if (!same(destination[field], original[field]) && !same(destination[field], proposal[field])) {
          conflicts.push(label + " · " + field);
        } else destination[field] = proposal[field];
      }
    }
    mergeFields(merged, base, draft, fields, "사업 기준");
    for (const item of base.items) {
      const proposed = draft.items.find(row => row.id === item.id);
      const live = merged.items.find(row => row.id === item.id);
      if (!proposed) {
        if (live && !same(live, item)) conflicts.push(item.name || "삭제할 품목");
        else merged.items = merged.items.filter(row => row.id !== item.id);
      } else if (!same(proposed, item)) {
        if (!live) conflicts.push(item.name || "삭제된 품목");
        else mergeFields(live, item, proposed, itemFields, item.name || "품목");
      }
    }
    for (const item of draft.items.filter(row => !base.items.some(old => old.id === row.id))) {
      const existing = merged.items.find(row => row.id === item.id);
      if (existing && !same(existing, item)) conflicts.push(item.name || "추가 품목");
      else if (!existing) merged.items.push(clone(item));
    }
    if (conflicts.length) {
      const error = new Error("같은 항목이 먼저 수정되었습니다. 최신 내용과 내 입력을 비교해 주세요.");
      error.conflicts = conflicts;
      throw error;
    }
    return validate(merged);
  }
  function create(id, name) {
    return {id, name, business: "", users: "", environments: "개발 · 검증 · 운영",
      availability: "3티어(WEB·WAS·DB) 및 전 장비 이중화 필수", resources: "", start: "", end: "", months: 12, contingency: 0, tax: 10,
      architecture, items: defaultEquipment.map(equipmentId => equipmentItem(equipmentId, id + "-" + equipmentId)),
      revision: 1, primaryUser: "", audience: "", external: "unknown", dedicated: "unknown", variable: "unknown", privateCapacity: "unknown", urgency: "unknown"};
  }
  function recommend(project) {
    const candidates = [
      {name: "베어메탈", meaning: "전용 물리 서버를 직접 구성하는 방식", reasons: [], status: "검토 후보"},
      {name: "프라이빗 클라우드", meaning: "조직 내부의 공유 자원을 이용하는 방식", reasons: [], status: "검토 후보"},
      {name: "퍼블릭 클라우드", meaning: "외부 제공자의 자원을 필요한 만큼 이용하는 방식", reasons: [], status: "검토 후보"}
    ];
    const [bare, privateCloud, publicCloud] = candidates;
    const missing = [];
    for (const [key, label] of [["external", "외부 클라우드 사용 허용 여부"], ["dedicated", "전용 장비 필요 여부"], ["variable", "이용량 변동"], ["privateCapacity", "내부 클라우드 가용 자원"], ["urgency", "빠른 개시 필요 여부"]]) {
      if (project[key] === "unknown") missing.push(label);
    }
    if (project.dedicated === "yes") bare.reasons.push("전용 장비나 물리 서버 제어가 필요한 것으로 입력했습니다.");
    if (project.privateCapacity === "yes") privateCloud.reasons.push("기존 내부 클라우드 자원을 사용할 수 있습니다.");
    if (project.privateCapacity === "no") privateCloud.reasons.push("내부 클라우드 자원 확보 일정과 비용을 먼저 확인해야 합니다.");
    if (project.external === "no") {
      publicCloud.status = "사용 조건 미충족";
      publicCloud.reasons.push("외부 클라우드 사용이 허용되지 않는다고 입력했습니다.");
    }
    if (project.external === "unknown") publicCloud.reasons.push("외부 클라우드 사용 가능 여부 확인이 필요합니다.");
    if (project.variable === "yes") {
      publicCloud.reasons.push("이용량 변화에 따라 자원을 조정할 필요가 있습니다.");
      privateCloud.reasons.push("자동 확장 기능과 내부 여유 자원을 확인해야 합니다.");
      bare.reasons.push("이용량이 늘 때 장비 추가 확보 계획이 필요합니다.");
    }
    if (project.urgency === "yes") {
      publicCloud.reasons.push("빠른 개시를 원하므로 계정·연결·승인 준비 기간을 확인합니다.");
      bare.reasons.push("구매·설치와 자원 확보 기간을 확인해야 합니다.");
    }
    let preferred = [];
    if (project.external !== "unknown" && project.dedicated !== "unknown") {
      if (project.dedicated === "yes") preferred = [bare];
      else if (project.external === "no") preferred = project.privateCapacity === "yes" ? [privateCloud] : [bare, privateCloud];
      else if (project.privateCapacity === "unknown" || project.variable === "unknown" || project.urgency === "unknown") preferred = [];
      else if (project.variable === "yes" || project.urgency === "yes" || project.privateCapacity === "no") preferred = [publicCloud];
      else preferred = [privateCloud];
    }
    for (const candidate of preferred) candidate.status = "우선 검토";
    const title = preferred.length ? preferred.map(item => item.name).join(" · ") + " 우선 검토" : "추가 정보를 확인한 후 환경을 좁힙니다";
    for (const candidate of candidates) {
      if (!candidate.reasons.length) candidate.reasons.push("구성 적합성과 자원 확보 조건을 담당 팀이 검토합니다.");
    }
    return {title, candidates, missing};
  }
  const api = {architecture, tiers, catalog, defaultEquipment, normalize, equipmentItem, architectureCheck,
    recommend, teams, fields, itemFields, clone, same, validate, calculate, merge, create};
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.BudgetCore = api;
})(typeof window !== "undefined" ? window : globalThis);
