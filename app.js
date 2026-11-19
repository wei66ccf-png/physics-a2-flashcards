const byId = id => document.getElementById(id);
const all = DECKS.flatMap(deck => deck.questions.map(question => ({...question, deck})));
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const ratingButtons = [...document.querySelectorAll('[data-grade]')];
const retryMinutes = 10;
const maxIntervalDays = 60;
const goalKey = 'shiguang-a2-daily-goal';
const storageKey = 'shiguang-a2-questions';
let records = {};
try { records = JSON.parse(localStorage.getItem(storageKey) || '{}') || {}; } catch {}
let target = 10;
try {
  const savedTarget = Number(localStorage.getItem(goalKey));
  if (Number.isInteger(savedTarget) && savedTarget >= 1 && savedTarget <= all.length) target = savedTarget;
} catch {}
byId('goal').value = target;
byId('goal').max = all.length;
let mode = 'today';
let queue = [];
let index = 0;
let revealed = false;
let toastTimer;

for (const deck of DECKS) {
  byId('deck').append(new Option(deck.name, deck.id));
}

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
  const completed = all.filter(q => records[q.id]?.reviewDay === today).length;
  const due = all.filter(q => records[q.id]?.grade && records[q.id].due <= now);
  const fresh = all.filter(q => !records[q.id]?.grade);
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
  due.sort((a, b) => records[a.id].due - records[b.id].due);
  const uncountedDue = due.filter(q => records[q.id].reviewDay !== dayKey()).length;
  const newSlots = Math.max(0, target - completed - uncountedDue);
  return due.filter(matchesFilter).concat(fresh.filter(matchesFilter).slice(0, newSlots));
}

function showDailyProgress() {
  const {completed, due, fresh} = dailyCounts();
  byId('daily-progress').textContent = `${completed} / ${target} 道${completed >= target ? ' · 已达标' : ''}`;
  byId('goal-progress').max = target;
  byId('goal-progress').value = Math.min(target, completed);
  byId('daily-plan').textContent = `已到期 ${due.length} 道 · 未练 ${fresh.length} 道 · 同一题每天只计一次`;
  byId('start-today').hidden = mode === 'today';
}

function matchesMode(question) {
  const record = records[question.id];
  if (mode === 'star') return Boolean(record?.star);
  if (mode === 'hard') return record?.grade === 'hard';
  if (mode === 'due') return Boolean(record?.grade && record.due <= Date.now());
  return true;
}

function filter({keepPosition = false} = {}) {
  const deck = Number(byId('deck').value);
  const term = byId('search').value.trim().toLowerCase().replace(/\s+/g, '');
  function matchesFilter(question) {
    const searchable = (question.text + question.deck.name + question.type).toLowerCase().replace(/\s+/g, '');
    return (!deck || question.deck.id === deck) && searchable.includes(term) && matchesMode(question);
  }
  queue = mode === 'today' ? todayQueue(matchesFilter) : (keepPosition ? queue : all).filter(matchesFilter);
  index = keepPosition && queue.length ? index % queue.length : 0;
  revealed = false;
  render();
}

let useOriginalLayout = false;

function drawRecognizedSide(question, side) {
  const isPrompt = side === 'q';
  const image = byId(isPrompt ? 'prompt' : 'answer');
  const layout = byId(isPrompt ? 'prompt-layout' : 'answer-layout');
  const simplified = REFLOW[question.deck.id]?.[question.number + side];
  const useRecognized = Boolean(simplified) && !useOriginalLayout;
  image.hidden = useRecognized;
  layout.hidden = !useRecognized;
  if (!useRecognized || layout.dataset.source === image.src) return;

  const [width, height, blocks] = simplified;
  const fragments = document.createDocumentFragment();
  for (const block of blocks) {
    if (typeof block === 'string') {
      const paragraph = document.createElement('p');
      paragraph.textContent = block;
      fragments.append(paragraph);
    } else {
      const [top, bottom] = block;
      const viewport = document.createElement('div');
      viewport.className = 'source-fragment';
      viewport.style.aspectRatio = width + ' / ' + (bottom - top);
      const fragmentImage = document.createElement('img');
      fragmentImage.src = image.src;
      fragmentImage.alt = '原题区域，可能包含公式、图示或文字';
      fragmentImage.style.top = -(top / (bottom - top) * 100) + '%';
      fragmentImage.style.height = height / (bottom - top) * 100 + '%';
      viewport.append(fragmentImage);
      fragments.append(viewport);
    }
  }
  layout.replaceChildren(fragments);
  layout.dataset.source = image.src;
}

byId('layout-toggle').onclick = () => {
  useOriginalLayout = !useOriginalLayout;
  render();
};

function render() {
  const question = queue[index];
  showDailyProgress();
  const mastered = all.filter(q => ['good','easy'].includes(records[q.id]?.grade)).length;
  byId('stats').textContent = `共 ${all.length} 道题 · 已掌握 ${mastered} 道`;
  byId('card').hidden = !question;
  byId('empty').hidden = Boolean(question);
  byId('shuffle').disabled = mode === 'today' || queue.length < 2;
  byId('empty').textContent = mode === 'today' && !byId('search').value && Number(byId('deck').value) === 0
    ? dailyCounts().completed >= target ? '今日目标已完成。可以在全部题目中继续练习。' : '当前没有安排的题目。可在重点重练中加练，或稍后回来复习。'
    : '没有符合条件的题目。可以切换章节或清除搜索词。';
  byId('position').textContent = question ? `第 ${index + 1} / ${queue.length} 题` : '0 道题';
  if (!question) return;
  const title = `第 ${question.number} 题 · ${question.type}`;
  const starred = Boolean(records[question.id]?.star);
  byId('chapter').textContent = question.deck.name;
  byId('title').textContent = title;
  byId('star').textContent = starred ? '★ 取消收藏' : '☆ 收藏本题';
  byId('star').setAttribute('aria-pressed', starred);
  byId('prompt').src = question.image;
  byId('prompt').alt = question.deck.name + '，' + title + '原题';
  drawRecognizedSide(question, 'q');
  const layouts = REFLOW[question.deck.id];
  const anyLayout = layouts?.[question.number + 'q'] || (revealed && layouts?.[question.number + 'a']);
  const toggle = byId('layout-toggle');
  toggle.hidden = !anyLayout;
  toggle.textContent = useOriginalLayout ? '切换文字排版' : '查看原图排版';
  toggle.setAttribute('aria-pressed', useOriginalLayout);
  const pdfPath = `assets/${question.deck.id}-q.pdf`;
  byId('original').href = (typeof offlinePDF === 'function' ? offlinePDF(pdfPath) : pdfPath) + '#page=' + question.page;
  byId('prev').disabled = index === 0;
  byId('next').disabled = index === queue.length - 1;
  byId('solution').hidden = !revealed;
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
    byId('answer').src = question.answer;
    byId('answer').alt = question.deck.name + '，' + title + '参考答案';
    drawRecognizedSide(question, 'a');
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
  const target = byId(show ? 'hide' : 'reveal');
  target.focus({preventScroll:true});
  target.scrollIntoView({block:'nearest'});
}

function grade(level) {
  const question = queue[index];
  if (!revealed || !question) return;
  const now = Date.now();
  const schedule = reviewSchedule(records[question.id], level, now);
  records[question.id] = {...records[question.id], ...schedule, grade:level, reviewDay:dayKey(new Date(now))};
  if (save()) toast(level === 'hard' ? '已加入重点重练，10 分钟后到期' : '已安排下次复习');
  if (mode === 'today') filter();
  else if (!matchesMode(question)) filter({keepPosition:true});
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
byId('start-today').onclick = () => {
  byId('search').value = '';
  byId('deck').value = '0';
  modeButtons.find(button => button.dataset.mode === 'today').click();
};

for (const button of modeButtons) {
  button.onclick = () => {
    mode = button.dataset.mode;
    for (const control of modeButtons) control.setAttribute('aria-pressed', control === button);
    filter();
  };
}
for (const button of ratingButtons) button.onclick = () => grade(button.dataset.grade);
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
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  index = 0;
  revealed = false;
  render();
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
const zoomLevels = [100, 125, 150, 175, 200, 250];
let zoomIndex = 1;

function updateReaderZoom(index) {
  const oldWidth = readerImage.clientWidth;
  const oldHeight = readerImage.clientHeight;
  const left = readerScroll.scrollLeft;
  const top = readerScroll.scrollTop;
  zoomIndex = Math.max(0, Math.min(zoomLevels.length - 1, index));
  const zoom = zoomLevels[zoomIndex] + '%';
  readerScroll.style.setProperty('--reader-zoom', zoom);
  byId('zoom-value').textContent = zoom;
  byId('zoom-out').disabled = zoomIndex === 0;
  byId('zoom-in').disabled = zoomIndex === zoomLevels.length - 1;
  if (oldWidth) readerScroll.scrollLeft = left * readerImage.clientWidth / oldWidth;
  if (oldHeight) readerScroll.scrollTop = top * readerImage.clientHeight / oldHeight;
}

function openReader(sourceId, label) {
  const source = byId(sourceId);
  readerImage.src = source.src;
  readerImage.alt = source.alt;
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
  if (reader.open) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest('input, select, textarea')) return;
  if (event.code === 'Space' && !event.target.closest('button, a') && queue.length) {
    event.preventDefault();
    showAnswer(!revealed);
  }
  if (event.key === 'ArrowLeft') move(-1);
  if (event.key === 'ArrowRight') move(1);
  if (revealed && ['1','2','3'].includes(event.key)) grade(['hard','good','easy'][Number(event.key)-1]);
});
filter();
let displayedDay = dayKey();
setInterval(() => {
  const today = dayKey();
  if (!revealed && mode === 'today' && (today !== displayedDay || !queue.length)) filter();
  else showDailyProgress();
  if (!revealed) displayedDay = today;
}, 30000);
