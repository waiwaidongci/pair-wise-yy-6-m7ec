// 环境巡检判定：纯业务规则，不做任何文件/网络 IO
// 巡检结论三态：正常 / 待复验 / 已失效

export const HUMIDITY_LIMIT = 65; // 复验合格湿度上限（低于65）
export const RECHECK_HOURS = 12; // 两次复验间隔小时
export const REQUIRED_RECHECKS = 2; // 恢复试磨所需复验次数

export const NORMAL = "正常";
export const PENDING = "待复验";
export const INVALID = "已失效";
export const STATUSES = [NORMAL, PENDING, INVALID];

// 外观缺陷：见霉点或软边即隔离（兼容“边缘发软”等说法）
export function hasDefect(appearance = "") {
  return /霉|软边|发软|边.{0,4}软/.test(appearance);
}
export function appearanceOk(appearance = "") {
  return !hasDefect(appearance);
}
export function humidityOk(humidity) {
  return Number(humidity) < HUMIDITY_LIMIT;
}

// 初次巡检判定：见霉点或软边就隔离待复验，否则正常
export function judgeInitial({ humidity, appearance } = {}) {
  return hasDefect(appearance) ? PENDING : NORMAL;
}

// 单次复验是否合格：湿度低于65 且 外观正常
export function recheckPass({ humidity, appearance } = {}) {
  return humidityOk(humidity) && appearanceOk(appearance);
}

// 复验换人：复验人不能是初检人，相邻两次复验也不能同一人
export function personError(form, inspector, now = new Date()) {
  if (!inspector || !String(inspector).trim()) return "复验须填写复验人";
  if (String(inspector).trim() === String(form.inspector || "").trim())
    return "复验须换人，不能由初检人执行";
  const passes = form.rechecks || [];
  const last = passes[passes.length - 1];
  if (last && String(last.inspector).trim() === String(inspector).trim())
    return "两次复验须由不同人员执行";
  return null;
}

// 间隔：第二次合格复验须距第一次合格复验满12小时（失败的复验不计入，也不计时）
export function spacingError(form, now = new Date()) {
  const passes = form.rechecks || [];
  if (passes.length >= 1) {
    const first = new Date(passes[0].at).getTime();
    if (now.getTime() - first < RECHECK_HOURS * 3600 * 1000)
      return "两次复验须间隔满12小时";
  }
  return null;
}

// 登记一次复验。返回 { error } 或 { form }（已按规则重算结论）
export function applyRecheck(form, { humidity, appearance, inspector, note } = {}, now = new Date()) {
  if (form.status !== PENDING)
    return { error: "当前巡检单不在待复验状态，无法复验" };
  const person = personError(form, inspector, now);
  if (person) return { error: person };

  const entry = {
    at: now.toISOString(),
    humidity: Number(humidity),
    appearance: appearance || "",
    inspector: String(inspector).trim(),
    note: note || ""
  };

  // 失败复验：留痕但不计入合格序列，序列清零
  if (!recheckPass(entry)) {
    return {
      form: {
        ...form,
        failedRechecks: [...(form.failedRechecks || []), entry]
      }
    };
  }

  const space = spacingError(form, now);
  if (space) return { error: space };

  const rechecks = [...(form.rechecks || []), entry];
  if (rechecks.length >= REQUIRED_RECHECKS) {
    return {
      form: {
        ...form,
        status: NORMAL,
        clearedAt: now.toISOString(),
        rechecks
      }
    };
  }
  return { form: { ...form, rechecks } };
}

// 失效一张巡检单（改库位或改巡检值会让原结论失效，旧单仍保留可查）
export function invalidate(form, reason, now = new Date()) {
  if (form.status === INVALID) return form;
  return {
    ...form,
    status: INVALID,
    invalidReason: reason || "原结论失效",
    invalidAt: now.toISOString()
  };
}

// 一张未失效巡检单是否允许试磨：只有“正常”可以
export function allowsGrinding(form) {
  return !!form && form.status === NORMAL;
}
