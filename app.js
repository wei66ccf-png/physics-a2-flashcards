const byId = id => document.getElementById(id);
const decks = [...DECKS, ...COMPLEX_DECKS];
const courseNames = {physics:'大学物理 A2',complex:'复变函数',all:'全部课程'};
const all = decks.flatMap(deck => deck.questions.map(question => ({...question, deck})));
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const ratingButtons = [...document.querySelectorAll('[data-grade]')];
const retryMinutes = 10;
const maxIntervalDays = 60;
const goalKey = 'shiguang-a2-daily-goal';
const storageKey = 'shiguang-a2-questions';
function readRecords() {
  const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}
let records = {};
try { records = readRecords(); } catch {}

function refreshRecords() {
  try { records = {...records, ...readRecords()}; } catch {}
}

const hasPracticed = record => Boolean(record?.grade || record?.reviewDay || record?.attempts?.length);
let target = 10;
try {
  const savedTarget = Number(localStorage.getItem(goalKey));
  if (Number.isInteger(savedTarget) && savedTarget >= 1 && savedTarget <= all.length) target = savedTarget;
} catch {}
byId('goal').value = target;
byId('goal').max = all.length;
let mode = 'today';
let course = 'physics';
try {
  const storedCourse = localStorage.getItem('shiguang-course');
  if (Object.hasOwn(courseNames, storedCourse)) course = storedCourse;
} catch {}
byId('course-select').value = course;
const belongs = (question, key = course) => key === 'all' || (question.deck.course || 'physics') === key;
const byQuestionId = new Map(all.map(q => [q.id,q]));
let selected = [];
try {
  const saved = JSON.parse(localStorage.getItem('shiguang-exam') || '[]');
  if (Array.isArray(saved)) selected = [...new Set(saved)].filter(id => byQuestionId.has(id));
} catch {}
const inExam = () => mode === 'exam';
const inLibrary = () => ['all','due','hard','star'].includes(mode);
const paperKey = 'shiguang-paper-progress';
let examRun = null;

function paperProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(paperKey) || 'null');
    if (saved?.signature === selected.join(',') && Array.isArray(saved.done)) {
      return new Set(saved.done.filter(id => selected.includes(id)));
    }
  } catch {}
  return new Set();
}

function beginExam() {
  if (!selected.length) return;
  const done = paperProgress();
  examRun = {signature:selected.join(','), done:done.size === selected.length ? new Set() : done};
  savePaperProgress();
  openMode('exam');
}

function savePaperProgress() {
  try {
    localStorage.setItem(paperKey, JSON.stringify({signature:examRun.signature,done:[...examRun.done]}));
  } catch {}
}
const inExtra = () => mode === 'extra';
let extraBatch = null;
const extraKey = () => 'shiguang-extra-batch-' + course;

function loadExtra() {
  try {
    const saved = JSON.parse(localStorage.getItem(extraKey()) || 'null');
    if (saved?.course !== course || saved.day !== dayKey() || !Array.isArray(saved.pending)) return null;
    if (!['new','review'].includes(saved.kind) || !Number.isInteger(saved.total)) return null;
    const pending = [...new Set(saved.pending)].map(id => byQuestionId.get(id))
      .filter(q => q && belongs(q) && (saved.kind === 'review' || !hasPracticed(records[q.id])));
    return pending.length ? {...saved,pending} : null;
  } catch { return null; }
}

function saveExtra() {
  try {
    if (!extraBatch.pending.length) localStorage.removeItem(extraKey());
    else localStorage.setItem(extraKey(), JSON.stringify({...extraBatch,course,day:dayKey(),pending:extraBatch.pending.map(q => q.id)}));
  } catch {}
}
let queue = [];
let practiceOrder = all;

function shuffled(items) {
  const result = [...items];
  for (let end = result.length - 1; end > 0; end--) {
    const pick = Math.floor(Math.random() * (end + 1));
    [result[end],result[pick]] = [result[pick],result[end]];
  }
  return result;
}
let index = 0;
let revealed = false;
let toastTimer;

function updateChapters() {
  const dropdown = byId('deck');
  dropdown.replaceChildren(new Option('全部章节', '0'));
  for (const deck of decks) {
    if (belongs({deck})) dropdown.append(new Option(deck.name, deck.id));
  }
}
updateChapters();

const examScope = byId('exam-scope');
examScope.append(new Option('全部课程', 'all'),new Option(courseNames.physics,'physics'),new Option(courseNames.complex,'complex'));
for (const deck of decks) examScope.append(new Option(deck.name, 'deck:' + deck.id));

function eligible() {
  const scope = examScope.value || 'all';
  return all.filter(q => scope.startsWith('deck:') ? String(q.deck.id) === scope.slice(5) : belongs(q, scope));
}

function saveExam() {
  try { localStorage.setItem('shiguang-exam', JSON.stringify(selected)); }
  catch { toast('试卷只保留在当前页面'); }
}

function makeExamRow(question, picked) {
  const li = document.createElement('li');
  const label = document.createElement('button');
  label.className = 'exam-preview';
  label.onclick = () => previewQuestion(question);
  label.textContent = `${question.deck.name} · 第 ${question.number} 题`;
  const button = document.createElement('button');
  button.className = 'outline';
  button.textContent = picked ? '移除' : '加入';
  button.setAttribute('aria-label', button.textContent + label.textContent);
  button.onclick = () => {
    selected = picked ? selected.filter(id => id !== question.id) : [...new Set([...selected,question.id])];
    saveExam();
    renderBuilder();
  };
  li.append(label,button);
  return li;
}

function renderBuilder() {
  const pool = eligible();
  const term = byId('exam-query').value.trim().toLowerCase();
  const available = pool.filter(q => !selected.includes(q.id) &&
    `${q.deck.name} 第${q.number}题 ${q.number} ${q.text}`.toLowerCase().includes(term));
  byId('exam-pool').replaceChildren(...available.map(q => makeExamRow(q,false)));
  byId('exam-selection').replaceChildren(...selected.map(id => makeExamRow(byQuestionId.get(id),true)));
  byId('exam-count').textContent = `${selected.length} 道`;
  byId('exam-size').max = pool.length;
  byId('exam-status').textContent = `范围内 ${pool.length} 道，当前可加入 ${available.length} 道`;
  byId('exam-start').disabled = !selected.length;
  const completed = paperProgress().size;
  byId('exam-start').textContent = completed && completed === selected.length ? '重新做卷' : completed ? `继续做卷（${completed}/${selected.length}）` : '开始做卷';
  byId('exam-random').textContent = selected.length ? '随机替换试卷' : '随机组卷';
}

const modeRoutes = {today:'', all:'library', due:'due', hard:'hard', star:'favorites',
  builder:'builder', history:'history', exam:'exam', extra:'extra'};
const libraryTitles = {all:'题库', due:'已到期', hard:'重点重练', star:'我的收藏'};

function openMode(next) {
  mode = next;
  if (mode === 'today' || inLibrary()) practiceOrder = shuffled(all);
  if (!inExtra()) extraBatch = null;
  const view = inExam() ? 'builder' : inExtra() ? 'today' : inLibrary() ? 'all' : mode;
  for (const control of modeButtons) {
    const active = ['due','hard','star'].includes(control.dataset.mode)
      ? control.dataset.mode === mode : control.dataset.mode === view;
    control.setAttribute('aria-pressed', active);
  }
  byId('library-all').setAttribute('aria-pressed', mode === 'all');
  const builderOpen = mode === 'builder';
  const historyOpen = mode === 'history';
  const route = modeRoutes[mode];
  const desiredHash = route ? '#' + route : '';
  if (window.location.hash !== desiredHash) {
    try {
      const url = new URL(window.location.href);
      url.hash = desiredHash;
      window.history.replaceState(null, '', url.href);
    } catch {}
  }
  byId('history').hidden = !historyOpen;
  byId('builder').hidden = !builderOpen;
  byId('study').hidden = builderOpen || historyOpen;
  byId('exam-finished').hidden = true;
  byId('exam-return').hidden = !inExam();
  byId('extra-return').hidden = !inExtra();
  byId('shuffle').hidden = !inLibrary();
  byId('work-title').textContent = builderOpen ? '自由组卷' : historyOpen ? '练习历史'
    : inExam() ? '试卷练习' : inExtra() ? extraBatch.title : libraryTitles[mode] || '今日复习';
  if (builderOpen) {
    byId('stats').textContent = '随机抽题，或从题库逐题添加';
    renderBuilder();
  } else if (historyOpen) {
    refreshRecords();
    byId('stats').textContent = courseNames[course];
    renderHistory();
  } else filter();
}

function modeFromUrl() {
  const hash = window.location.hash.slice(1);
  const key = Object.keys(modeRoutes).find(k => modeRoutes[k] === hash);
  if (key === 'extra') {
    refreshRecords();
    extraBatch = loadExtra();
    return extraBatch ? 'extra' : 'today';
  }
  if (key === 'exam') {
    if (!selected.length) return 'builder';
    examRun = {signature:selected.join(','), done:paperProgress()};
  }
  return key || 'today';
}

examScope.onchange = () => renderBuilder();
byId('exam-query').oninput = renderBuilder;
byId('random-form').onsubmit = event => {
  event.preventDefault();
  const pool = eligible();
  const n = Number(byId('exam-size').value);
  if (!Number.isInteger(n) || n < 1 || n > pool.length) return;
  selected = shuffled(pool).slice(0,n).map(q => q.id);
  saveExam();
  renderBuilder();
  toast(`已随机抽取 ${n} 道题，可继续增删`);
};
byId('exam-start').onclick = beginExam;
byId('exam-return').onclick = () => openMode('builder');
byId('exam-finished-builder').onclick = () => openMode('builder');
byId('exam-finished-history').onclick = () => openMode('history');
byId('library-all').onclick = () => openMode('all');
byId('clear-library').onclick = () => {
  byId('search').value = '';
  byId('deck').value = '0';
  filter();
};
byId('course-select').onchange = event => {
  course = event.target.value;
  try { localStorage.setItem('shiguang-course',course); } catch {}
  byId('search').value = '';
  updateChapters();
  examScope.value = course;
  openMode(inLibrary() || ['builder','history'].includes(mode) ? mode : 'today');
};

function toast(message) {
  byId('toast').textContent = message;
  byId('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => byId('toast').classList.remove('show'), 2300);
}

function save() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
    return true;
  } catch {
    toast('无法保存进度，请导出学习记录');
    return false;
  }
}

function dayKey(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

function dailyCounts(now = Date.now()) {
  const today = dayKey(new Date(now));
  const scoped = all.filter(q => belongs(q));
  const completed = scoped.filter(q => records[q.id]?.reviewDay === today).length;
  const due = scoped.filter(q => records[q.id]?.grade && records[q.id].due <= now);
  const fresh = scoped.filter(q => !hasPracticed(records[q.id]));
  return {completed, due, fresh};
}

function reviewSchedule(record, grade, now = Date.now()) {
  if (grade === 'hard') return {due:now + retryMinutes * 60000, intervalDays:0};
  if (record?.intervalDays > 0 && record.due > now) {
    return {due:record.due, intervalDays:record.intervalDays};
  }
  const lastInterval = record?.intervalDays || 0;
  const startingDays = grade === 'good' ? 1 : 3;
  const multiplier = grade === 'good' ? 1.7 : 2.5;
  const intervalDays = Math.min(maxIntervalDays, Math.max(startingDays, Math.round(lastInterval * multiplier)));
  const due = new Date(now);
  due.setDate(due.getDate() + intervalDays);
  due.setHours(0, 0, 0, 0);
  return {due:due.getTime(), intervalDays};
}

function todayQueue(matchesFilter) {
  const {completed, due, fresh} = dailyCounts();
  const today = dayKey();
  const pendingDue = due.filter(q => records[q.id].reviewDay !== today);
  const remaining = Math.max(0, target - completed);
  const eligibleIds = new Set([...pendingDue,...fresh].map(q => q.id));
  return practiceOrder.filter(q => eligibleIds.has(q.id) && matchesFilter(q)).slice(0, remaining);
}

function showDailyProgress() {
  const {completed, due, fresh} = dailyCounts();
  byId('daily-progress').textContent = `${completed} / ${target} 道${completed >= target ? ' · 已达标' : ''}`;
  byId('goal-progress').max = target;
  byId('goal-progress').value = Math.min(target, completed);
  const pending = due.filter(q => records[q.id].reviewDay !== dayKey()).length;
  byId('daily-plan').textContent = `待复习 ${pending} 道 · 新题 ${fresh.length} 道 · 同一天每题只计一次`;

  const mayAdd = mode === 'today' && completed >= target;
  byId('extra-form').hidden = !mayAdd;
  byId('extra-resume').hidden = !mayAdd || !loadExtra();
  if (mayAdd && document.activeElement !== byId('extra-size')) updateExtraOptions();
}

function extraCandidates(kind) {
  return all.filter(q => belongs(q) && hasPracticed(records[q.id]) === (kind === 'review'));
}

function updateExtraOptions() {
  const fresh = extraCandidates('new').length;
  const old = extraCandidates('review').length;
  const kind = byId('extra-kind');
  byId('extra-new-option').disabled = !fresh;
  byId('extra-review-option').disabled = !old;
  if (kind.value === 'new' && !fresh && old) kind.value = 'review';
  if (kind.value === 'review' && !old && fresh) kind.value = 'new';
  const isReview = kind.value === 'review';
  const count = isReview ? old : fresh;
  const size = byId('extra-size');
  size.max = count;
  size.disabled = !count;
  if (count && (!size.value || Number(size.value) > count)) size.value = Math.min(count,5);
  byId('extra-start').disabled = !count;
  byId('extra-hint').textContent = count
    ? `当前课程可选 ${count} 道${isReview ? '旧题' : '新题'}`
    : '当前课程暂无可加练的题目';
}

byId('extra-kind').onchange = updateExtraOptions;
byId('extra-return').onclick = () => openMode('today');
byId('extra-resume').onclick = () => {
  refreshRecords();
  extraBatch = loadExtra();
  if (extraBatch) openMode('extra');
  else showDailyProgress();
};
byId('extra-form').onsubmit = event => {
  event.preventDefault();
  refreshRecords();
  if (mode !== 'today' || dailyCounts().completed < target) return;
  const kind = byId('extra-kind').value;
  const count = Number(byId('extra-size').value);
  const pool = extraCandidates(kind);
  if (!Number.isInteger(count) || count < 1 || count > pool.length) return;
  extraBatch = {
    kind,
    title: kind === 'new' ? '新题加练' : '旧题复习',
    total: count,
    pending: shuffled(pool).slice(0,count),
  };
  saveExtra();
  openMode('extra');
  byId('card').scrollIntoView({block:'start'});
};

function matchesMode(question) {
  const record = records[question.id];
  if (mode === 'star') return Boolean(record?.star);
  if (mode === 'hard') return record?.grade === 'hard';
  if (mode === 'due') return Boolean(record?.grade && record.due <= Date.now());
  return true;
}

function filter({keepPosition = false} = {}) {
  refreshRecords();
  const deck = Number(byId('deck').value);
  const term = byId('search').value.trim().toLowerCase().replace(/\s+/g, '');
  function matchesFilter(question) {
    const searchable = (question.text + question.deck.name + question.type).toLowerCase().replace(/\s+/g, '');
    if (mode === 'today') return belongs(question);
    return belongs(question) && (!deck || question.deck.id === deck) && searchable.includes(term) && matchesMode(question);
  }
  queue = inExtra() ? extraBatch.pending : inExam() ? selected.filter(id => !examRun.done.has(id)).map(id => byQuestionId.get(id)) : mode === 'today' ? todayQueue(matchesFilter) : (keepPosition ? queue : practiceOrder).filter(matchesFilter);
  index = keepPosition && queue.length ? index % queue.length : 0;
  revealed = false;
  render();
}

function render() {
  const question = queue[index];
  showDailyProgress();
  const scoped = all.filter(q => belongs(q));
  const mastered = scoped.filter(q => ['good','easy'].includes(records[q.id]?.grade)).length;
  byId('stats').textContent = inExtra() ? `已完成 ${extraBatch.total - queue.length} / ${extraBatch.total} 道` : inExam() ? `已完成 ${examRun.done.size} / ${selected.length} 道` : `${courseNames[course]} · ${scoped.length} 道题 · 已掌握 ${mastered} 道`;
  byId('daily-section').hidden = mode !== 'today';
  byId('study-filters').hidden = !inLibrary();
  const paperComplete = inExam() && !queue.length;
  byId('exam-finished').hidden = !paperComplete;
  byId('study').hidden = paperComplete;
  if (paperComplete) {
    byId('exam-finished-summary').textContent = `已完成全部 ${selected.length} 道题，评分可在练习历史查看。`;
    return;
  }
  byId('card').hidden = !question;
  byId('empty').hidden = Boolean(question);
  byId('shuffle').disabled = mode === 'today' || queue.length < 2;
  byId('empty').textContent = mode === 'today'
    ? dailyCounts().completed >= target ? '今日目标已完成。可在上方选择加练范围和题数。' : '当前没有安排的题目。可在重点重练中加练，或稍后回来复习。'
    : '没有符合条件的题目。可切换分类或清除筛选。';
  byId('position').textContent = question ? `第 ${index + 1} / ${queue.length} 题` : '0 道题';
  if (!question) return;
  const title = `第 ${question.number} 题 · ${question.type}`;
  const starred = Boolean(records[question.id]?.star);
  byId('chapter').textContent = question.deck.name;
  byId('title').textContent = title;
  byId('star').textContent = starred ? '★ 取消收藏' : '☆ 收藏本题';
  byId('star').setAttribute('aria-pressed', starred);
  if (question.image) byId('prompt').src = question.image;
  else byId('prompt').removeAttribute('src');
  const promptCard = `${question.deck.id}:q:${question.number}`;
  if (byId('prompt-document').dataset.card !== promptCard) byId('prompt-document').dataset.card = promptCard;
  byId('prompt').alt = question.deck.name + '，' + title + '原题';
  const pdfPath = question.deck.source || `assets/${question.deck.id}-q.pdf`;
  byId('original').href = ((typeof offlinePDF === 'function' && offlinePDF(pdfPath)) || pdfPath) + '#page=' + question.page;
  byId('prev').disabled = index === 0;
  byId('next').disabled = index === queue.length - 1;
  const hasAnswer = Boolean(question.answer);
  byId('solution').hidden = !revealed || !hasAnswer;
  byId('no-answer').hidden = hasAnswer;
  byId('reveal').firstChild.textContent = hasAnswer ? '查看本题答案 ' : '完成本题并自评 ';
  byId('rating-title').textContent = hasAnswer ? '这道题掌握得怎么样？' : '你对本题的掌握程度';
  byId('add-current').textContent = selected.includes(question.id) ? '已加入试卷' : '加入试卷';
  byId('add-current').disabled = selected.includes(question.id);
  byId('add-current').hidden = inExam();
  byId('rating').hidden = !revealed;
  byId('reveal').hidden = revealed;
  if (revealed) {
    for (const button of ratingButtons) {
      const level = button.dataset.grade;
      const record = records[question.id];
      const schedule = reviewSchedule(record, level);
      byId('interval-' + level).textContent = level === 'hard'
        ? '10 分钟后重练'
        : schedule.due === record?.due && record.due > Date.now()
          ? '下次 ' + new Intl.DateTimeFormat('zh-CN', {month:'numeric', day:'numeric'}).format(schedule.due)
          : schedule.intervalDays + ' 天后复习';
    }
    if (!hasAnswer) return;
    byId('answer').src = question.answer;
    const answerCard = `${question.deck.id}:a:${question.number}`;
    if (byId('answer-document').dataset.card !== answerCard) byId('answer-document').dataset.card = answerCard;
    byId('answer').alt = question.deck.name + '，' + title + '参考答案';
  }
}

function move(offset, scroll = true) {
  if (index + offset < 0 || index + offset >= queue.length) return;
  index += offset;
  revealed = false;
  render();
  if (scroll) byId('card').scrollIntoView({block:'start'});
}

function showAnswer(show) {
  if (!queue.length) return;
  revealed = show;
  render();
  const target = byId(show ? queue[index].answer ? 'hide' : 'rating-first' : 'reveal');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'nearest'});
}

function grade(level) {
  const question = queue[index];
  if (!revealed || !question) return;
  refreshRecords();
  const now = Date.now();
  const day = dayKey(new Date(now));
  const prior = records[question.id];
  if ((mode === 'today' && prior?.reviewDay === day) || (inExtra() && extraBatch.kind === 'new' && hasPracticed(prior))) {
    if (inExtra()) {
      extraBatch.pending = extraBatch.pending.filter(q => q.id !== question.id);
      saveExtra();
      if (!extraBatch.pending.length) openMode('today');
      else filter();
    } else filter();
    toast('这道题已在另一个页面练习，已跳过');
    return;
  }
  const wasBelowGoal = mode === 'today' && dailyCounts(now).completed < target;
  const schedule = reviewSchedule(records[question.id], level, now);
  const attempts = attemptsFor(prior).concat({day, at:now, grade:level});
  records[question.id] = {...prior, ...schedule, grade:level, reviewDay:day, lastReviewedAt:now, attempts};
  if (save()) toast(level === 'hard' ? '已加入重点重练，10 分钟后到期' : '已安排下次复习');
  if (inExam()) {
    examRun.done.add(question.id);
    savePaperProgress();
    filter();
    if (!queue.length) {
      byId('exam-finished-builder').focus();
      return;
    }
  } else if (inExtra()) {
    extraBatch.pending = queue.filter(q => q.id !== question.id);
    saveExtra();
    if (!extraBatch.pending.length) {
      const finished = extraBatch.total;
      openMode('today');
      toast(`已完成 ${finished} 道加练`);
      byId('extra-kind').focus({preventScroll:true});
      byId('daily-section').scrollIntoView({block:'start'});
      return;
    }
    queue = extraBatch.pending;
    index = Math.min(index, queue.length - 1);
    revealed = false;
    render();
  } else if (mode === 'today') {
    filter();
    if (wasBelowGoal && !byId('extra-form').hidden) {
      byId('extra-kind').focus({preventScroll:true});
      byId('daily-section').scrollIntoView({block:'start'});
      return;
    }
  } else if (!matchesMode(question)) filter({keepPosition:true});
  else if (index < queue.length - 1) move(1, false);
  else showAnswer(false);
  if (queue.length) {
    byId('reveal').focus({preventScroll:true});
    byId('card').scrollIntoView({block:'start'});
  }
}

byId('goal-form').onsubmit = event => {
  event.preventDefault();
  const value = Number(byId('goal').value);
  if (!Number.isInteger(value) || value < 1 || value > all.length) return;
  target = value;
  try {
    localStorage.setItem(goalKey, String(target));
    toast('已保存每日目标');
  } catch {
    toast('目标已更新，浏览器无法保存');
  }
  if (mode === 'today' && !revealed) filter();
  else showDailyProgress();
};
for (const button of modeButtons) {
  button.onclick = () => openMode(button.dataset.mode);
}
for (const button of ratingButtons) button.onclick = () => grade(button.dataset.grade);
byId('add-current').onclick = () => {
  const question = queue[index];
  if (!question || selected.includes(question.id)) return;
  selected.push(question.id);
  saveExam();
  render();
  toast('已加入试卷');
};
byId('deck').onchange = () => filter();
byId('search').oninput = () => filter();
byId('reveal').onclick = () => showAnswer(true);
byId('hide').onclick = () => showAnswer(false);
byId('prev').onclick = () => move(-1);
byId('next').onclick = () => move(1);
byId('star').onclick = () => {
  const question = queue[index];
  records[question.id] = {...records[question.id], star:!records[question.id]?.star};
  save();
  if (mode === 'star') filter({keepPosition:true});
  else render();
};
byId('shuffle').onclick = () => {
  practiceOrder = shuffled(practiceOrder);
  filter();
};
byId('reset').onclick = () => {
  if (!confirm('清空当前浏览器中记录的掌握程度和收藏？')) return;
  records = {};
  save();
  filter();
};
byId('export').onclick = () => {
  const data = JSON.stringify({app:'拾光 · 大学物理 A2', dailyGoal:target, records}, null, 2);
  const url = URL.createObjectURL(new Blob([data],{type:'application/json'}));
  const link = document.createElement('a');
  link.href = url;
  link.download = '拾光A2-学习记录.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
const reader = byId('reader');
const readerScroll = byId('reader-scroll');
const readerImage = byId('reader-image');
const readerDocument = byId('reader-document');
const zoomLevels = [100, 125, 150, 175, 200, 250];
let zoomIndex = 1;

function updateReaderZoom(index) {
  const oldWidth = readerDocument.clientWidth;
  const oldHeight = readerDocument.clientHeight;
  const left = readerScroll.scrollLeft;
  const top = readerScroll.scrollTop;
  zoomIndex = Math.max(0, Math.min(zoomLevels.length - 1, index));
  const zoom = zoomLevels[zoomIndex] + '%';
  readerScroll.style.setProperty('--reader-zoom', zoom);
  byId('zoom-value').textContent = zoom;
  byId('zoom-out').disabled = zoomIndex === 0;
  byId('zoom-in').disabled = zoomIndex === zoomLevels.length - 1;
  if (oldWidth) readerScroll.scrollLeft = left * readerDocument.clientWidth / oldWidth;
  if (oldHeight) readerScroll.scrollTop = top * readerDocument.clientHeight / oldHeight;
}

function openReader(sourceId, label) {
  const source = byId(sourceId);
  if (source.hasAttribute('src')) readerImage.src = source.src;
  else readerImage.removeAttribute('src');
  readerImage.alt = source.alt;
  readerDocument.dataset.card = source.closest('pdf-card').dataset.card;
  showReader(label);
}

function previewQuestion(question) {
  if (question.image) readerImage.src = question.image;
  else readerImage.removeAttribute('src');
  readerImage.alt = question.deck.name + ' · 第 ' + question.number + ' 题';
  readerDocument.dataset.card = `${question.deck.id}:q:${question.number}`;
  showReader(readerImage.alt);
}

function showReader(label) {
  byId('reader-title').textContent = label;
  reader.showModal();
  updateReaderZoom(window.matchMedia('(max-width: 720px)').matches ? 2 : 1);
  readerScroll.scrollTo(0, 0);
}

byId('read-prompt').onclick = () => openReader('prompt', '题目 · 放大阅读');
byId('read-answer').onclick = () => openReader('answer', '参考答案 · 放大阅读');
byId('zoom-out').onclick = () => updateReaderZoom(zoomIndex - 1);
byId('zoom-in').onclick = () => updateReaderZoom(zoomIndex + 1);

document.addEventListener('keydown', event => {
  if (event.repeat || reader.open || mode === 'builder' || mode === 'history') return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, select, textarea')) return;
  if (event.code === 'Space' && !event.target.closest('button, a') && queue.length) {
    event.preventDefault();
    showAnswer(!revealed);
  }
  if (event.key === 'ArrowLeft') move(-1);
  if (event.key === 'ArrowRight') move(1);
  if (revealed && ['1','2','3'].includes(event.key)) grade(['hard','good','easy'][Number(event.key)-1]);
});
const gradeLabels = {hard:'还需练习',good:'基本掌握',easy:'熟练掌握'};
const historyTime = new Intl.DateTimeFormat('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});

function attemptsFor(record) {
  if (!record) return [];
  if (Array.isArray(record.attempts) && record.attempts.length) return record.attempts;
  return record.reviewDay ? [{day:record.reviewDay,grade:record.grade,at:record.lastReviewedAt || null}] : [];
}

function normalizeDay(day) {
  if (typeof day !== 'string') return '';
  const parts = day.split('-');
  if (parts.length !== 3) return '';
  return parts.map(part => part.padStart(2,'0')).join('-');
}

function renderHistory() {
  const date = byId('history-date').value;
  const items = all.filter(q => belongs(q)).flatMap(question =>
    attemptsFor(records[question.id]).map(attempt => ({question, ...attempt, date:normalizeDay(attempt.day)})))
    .filter(item => item.date && (!date || item.date === date))
    .sort((a,b) => b.date.localeCompare(a.date) || (b.at || 0) - (a.at || 0));
  const sections = new Map();
  for (const item of items) {
    if (!sections.has(item.date)) sections.set(item.date,[]);
    sections.get(item.date).push(item);
  }
  const unique = new Set(items.map(item => item.question.id)).size;
  byId('history-summary').textContent = items.length ? `${unique} 道题 · ${items.length} 次练习` : '没有符合条件的练习记录';
  const blocks = Array.from(sections, ([day,group]) => {
    const block = document.createElement('section');
    block.className = 'history-group';
    const title = document.createElement('h2');
    title.textContent = day;
    const list = document.createElement('ul');
    for (const item of group) {
      const row = document.createElement('li');
      const preview = document.createElement('button');
      preview.className = 'exam-preview';
      preview.textContent = `${item.question.deck.name} · 第 ${item.question.number} 题`;
      preview.onclick = () => previewQuestion(item.question);
      const result = document.createElement('span');
      result.textContent = `${item.at ? historyTime.format(item.at) : '旧版记录'} · ${gradeLabels[item.grade] || '已练习'}`;
      row.append(preview,result);
      list.append(row);
    }
    block.append(title,list);
    return block;
  });
  byId('history-list').replaceChildren(...blocks);
}

window.addEventListener('hashchange', () => openMode(modeFromUrl()));
byId('history-date').onchange = renderHistory;
byId('history-clear-date').onclick = () => {
  byId('history-date').value = '';
  renderHistory();
};
window.addEventListener('storage', event => {
  if (event.key !== storageKey) return;
  try { records = readRecords(); } catch { return; }
  if (mode === 'history') renderHistory();
  if (mode === 'today' && !revealed) filter();
});
examScope.value = course;
openMode(modeFromUrl());
let displayedDay = dayKey();
setInterval(() => {
  const today = dayKey();
  if (!revealed && mode === 'today' && (today !== displayedDay || !queue.length)) filter();
  else if (mode === 'today') showDailyProgress();
  if (!revealed) displayedDay = today;
}, 30000);
