(function () {
  const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const DAY_LETTERS = ['L','M','X','J','V'];
  const HITO_EMOJIS = ['🎯','📊','📱','🌐','⚡','🔥','💡','✅'];

  let state = loadState();
  let editId = null;
  let editGroup = null;
  let editNoteId = null;
  let editNoteGroup = null;
  let dragState = null;
  let dropTarget = null;
  let undoQueue = [];
  let undoTimer = null;
  let currentWeekDay = getTodayIndex();
  let activeTab = 'today';

  function getTodayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 4 : d === 6 ? 4 : d - 1;
  }

  function getWeekKey() {
    const now = new Date();
    const monday = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  }

  function getDayKey(dayIndex) {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff + dayIndex);
    return monday.toISOString().slice(0, 10);
  }

  function getDateLabel(dayIndex) {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const d = new Date(now);
    d.setDate(diff + dayIndex);
    return d.getDate();
  }

  function loadState() {
    try {
      const raw = localStorage.getItem('focusweek_v1');
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return getDefaultState();
  }

  function getDefaultState() {
    const weekKey = getWeekKey();
    return {
      weekKey,
      hitos: [
        { id: 'h1', emoji: '🎯', text: 'Mi primer hito de la semana' },
        { id: 'h2', emoji: '📊', text: 'Segundo hito importante' },
      ],
      days: {
        0: { foco: [], ops: [] },
        1: { foco: [], ops: [] },
        2: { foco: [], ops: [] },
        3: { foco: [], ops: [] },
        4: { foco: [], ops: [] },
      },
      notes: [],
    };
  }

  function saveState() {
    try {
      localStorage.setItem('focusweek_v1', JSON.stringify(state));
    } catch (e) {}
  }

  function checkWeekRollover() {
    const currentWeek = getWeekKey();
    if (state.weekKey && state.weekKey !== currentWeek) {
      const oldHitos = state.hitos || [];
      state = getDefaultState();
      state.weekKey = currentWeek;
      saveState();
    }
    if (!state.weekKey) {
      state.weekKey = currentWeek;
      saveState();
    }
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10);
  }

  function snap() {
    return JSON.parse(JSON.stringify(state));
  }

  function getDayData() {
    const idx = activeTab === 'today' ? getTodayIndex() : currentWeekDay;
    if (!state.days[idx]) state.days[idx] = { foco: [], ops: [] };
    return state.days[idx];
  }

  function render() {
    if (activeTab === 'today') renderToday();
    if (activeTab === 'week') renderWeek();
    if (activeTab === 'notes') renderNotes();
  }

  function renderToday() {
    renderHitos();
    const day = getDayData();
    renderTaskList('foco', day.foco, 'list-foco', 'bar-foco', 'pct-foco', '#A32D2D');
    renderTaskList('ops', day.ops, 'list-ops', 'bar-ops', 'pct-ops', '#534AB7');
  }

  function renderHitos() {
    const list = document.getElementById('hitos-list');
    if (!list) return;
    list.innerHTML = '';
    (state.hitos || []).forEach(h => {
      const li = document.createElement('li');
      li.className = 'hito';
      li.innerHTML = `<span class="hito-emoji">${h.emoji || '🎯'}</span><span>${h.text}</span>`;
      list.appendChild(li);
    });
  }

  function renderTaskList(group, tasks, listId, barId, pctId, color) {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = '';
    const total = tasks.length;
    const done = tasks.filter(t => t.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const bar = document.getElementById(barId);
    const pctEl = document.getElementById(pctId);
    if (bar) { bar.style.width = pct + '%'; bar.style.background = pct === 100 && total > 0 ? '#1D9E75' : color; }
    if (pctEl) pctEl.textContent = pct + '%';

    tasks.forEach((t, idx) => {
      const ind = document.createElement('div');
      ind.className = 'drop-indicator';
      ind.dataset.group = group;
      ind.dataset.pos = String(idx);
      el.appendChild(ind);
      el.appendChild(makeTaskEl(t, idx, group));
    });

    const lastInd = document.createElement('div');
    lastInd.className = 'drop-indicator';
    lastInd.dataset.group = group;
    lastInd.dataset.pos = String(tasks.length);
    el.appendChild(lastInd);

    el.addEventListener('dragover', e => e.preventDefault());
    el.addEventListener('drop', handleDrop);
  }

  function makeTaskEl(t, idx, group) {
    const isEdit = editId === t.id;
    const isNoteEdit = editNoteId === t.id;
    const div = document.createElement('div');
    div.className = 'task' + (t.done ? ' done' : '') + (isEdit || isNoteEdit ? ' editing' : '');

    const grip = document.createElement('div');
    grip.className = 'grip';
    grip.innerHTML = '<div class="grip-row"><div class="grip-dot"></div><div class="grip-dot"></div></div>'.repeat(3);
    grip.draggable = true;
    grip.addEventListener('dragstart', e => {
      dragState = { group, idx };
      div.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setDragImage(div, 0, 0);
    });
    grip.addEventListener('dragend', () => { div.classList.remove('dragging'); clearIndicators(); dragState = null; });
    div.appendChild(grip);

    div.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragState) return;
      clearIndicators();
      const r = div.getBoundingClientRect();
      const pos = e.clientY < r.top + r.height / 2 ? idx : idx + 1;
      const parent = div.parentElement;
      const ind = parent.querySelector(`.drop-indicator[data-pos="${pos}"]`);
      if (ind) ind.classList.add('visible');
      dropTarget = { group, pos };
    });
    div.addEventListener('drop', handleDrop);

    const cb = document.createElement('div');
    cb.className = 'cb';
    if (t.done) cb.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    cb.addEventListener('click', e => { e.stopPropagation(); t.done = !t.done; saveState(); render(); });
    div.appendChild(cb);

    const content = document.createElement('div');
    content.className = 'task-content';

    if (isEdit) {
      const inp = document.createElement('input');
      inp.className = 'edit-input';
      inp.id = 'ei-' + t.id;
      inp.value = t.text;
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit(); });
      inp.addEventListener('click', e => e.stopPropagation());
      content.appendChild(inp);
      setTimeout(() => { inp.focus(); inp.selectionStart = inp.value.length; }, 10);
    } else {
      const txt = document.createElement('div');
      txt.className = 'task-text';
      txt.textContent = t.text;
      content.appendChild(txt);
      content.addEventListener('click', e => {
        if (e.target.closest('[data-addnote]')) return;
        e.stopPropagation();
        startEdit(t.id, group);
      });
    }

    if (isNoteEdit) {
      const ni = document.createElement('input');
      ni.className = 'note-input';
      ni.id = 'ni-' + t.id;
      ni.value = t.note || '';
      ni.placeholder = 'Agregar nota...';
      ni.addEventListener('keydown', e => { if (e.key === 'Enter') commitNoteEdit(); if (e.key === 'Escape') cancelNoteEdit(); });
      ni.addEventListener('click', e => e.stopPropagation());
      content.appendChild(ni);
      setTimeout(() => { ni.focus(); }, 10);
    } else if (t.note && !t.done) {
      const noteEl = document.createElement('div');
      noteEl.className = 'task-note';
      noteEl.dataset.addnote = '1';
      noteEl.textContent = t.note;
      noteEl.addEventListener('click', e => { e.stopPropagation(); startNoteEdit(t.id, group); });
      content.appendChild(noteEl);
    } else if (!t.done && !isEdit) {
      const addNoteBtn = document.createElement('button');
      addNoteBtn.className = 'add-note-btn';
      addNoteBtn.dataset.addnote = '1';
      addNoteBtn.textContent = '+ nota';
      addNoteBtn.addEventListener('click', e => { e.stopPropagation(); startNoteEdit(t.id, group); });
      content.appendChild(addNoteBtn);
    }

    div.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'task-actions';
    if (isEdit || isNoteEdit) actions.style.opacity = '1';

    const editBtn = document.createElement('button');
    editBtn.className = 'ib';
    editBtn.title = 'Editar';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', e => { e.stopPropagation(); isEdit ? commitEdit() : startEdit(t.id, group); });

    const delBtn = document.createElement('button');
    delBtn.className = 'ib';
    delBtn.title = 'Borrar';
    delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', e => {
      e.stopPropagation();
      const saved = snap();
      const day = getDayData();
      const label = t.text;
      day[group].splice(idx, 1);
      saveState();
      render();
      showUndo(label, saved);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);
    div.appendChild(actions);

    return div;
  }

  function handleDrop(e) {
    e.preventDefault();
    if (!dragState || !dropTarget) return;
    const day = getDayData();
    const fromList = day[dragState.group];
    const item = fromList.splice(dragState.idx, 1)[0];
    let toPos = dropTarget.pos;
    if (dragState.group === dropTarget.group && dragState.idx < toPos) toPos--;
    day[dropTarget.group].splice(toPos, 0, item);
    dragState = null; dropTarget = null;
    clearIndicators();
    saveState();
    render();
  }

  function clearIndicators() {
    document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('visible'));
  }

  function startEdit(id, group) {
    if (editId || editNoteId) commitEdit();
    editId = id; editGroup = group;
    render();
  }

  function commitEdit() {
    if (!editId) return;
    const inp = document.getElementById('ei-' + editId);
    if (inp && inp.value.trim()) {
      const day = getDayData();
      const task = day[editGroup].find(t => t.id === editId);
      if (task) task.text = inp.value.trim();
    }
    editId = null; editGroup = null;
    saveState(); render();
  }

  function cancelEdit() { editId = null; editGroup = null; render(); }

  function startNoteEdit(id, group) {
    if (editId) commitEdit();
    if (editNoteId) commitNoteEdit();
    editNoteId = id; editNoteGroup = group;
    render();
  }

  function commitNoteEdit() {
    if (!editNoteId) return;
    const inp = document.getElementById('ni-' + editNoteId);
    if (inp) {
      const day = getDayData();
      const task = day[editNoteGroup].find(t => t.id === editNoteId);
      if (task) task.note = inp.value.trim();
    }
    editNoteId = null; editNoteGroup = null;
    saveState(); render();
  }

  function cancelNoteEdit() { editNoteId = null; editNoteGroup = null; render(); }

  function showUndo(label, savedSnap) {
    clearTimeout(undoTimer);
    undoQueue.push({ label, state: savedSnap });
    const bar = document.getElementById('undo-bar');
    const txt = document.getElementById('undo-text');
    if (bar && txt) {
      txt.textContent = '"' + (label.length > 28 ? label.slice(0, 28) + '…' : label) + '" eliminada';
      bar.style.display = 'flex';
      undoTimer = setTimeout(() => { bar.style.display = 'none'; }, 5000);
    }
  }

  function renderWeek() {
    const weekEl = document.getElementById('week-header');
    if (weekEl) {
      const now = new Date();
      const month = now.toLocaleDateString('es', { month: 'long' });
      weekEl.textContent = `semana · ${month} ${now.getFullYear()}`;
    }

    const strip = document.getElementById('week-strip');
    if (strip) {
      strip.innerHTML = '';
      const todayIdx = getTodayIndex();
      DAYS.forEach((name, i) => {
        const pill = document.createElement('div');
        const dateNum = getDateLabel(i);
        const dayData = state.days[i] || { foco: [], ops: [] };
        const hasTasks = dayData.foco.length > 0 || dayData.ops.length > 0;
        pill.className = 'day-pill' + (i === todayIdx ? ' today' : '') + (i === currentWeekDay ? ' selected' : '') + (hasTasks ? ' has-tasks' : '');
        pill.innerHTML = `<span class="day-label">${DAY_LETTERS[i]}</span><div class="day-num">${dateNum}</div><div class="day-dot"></div>`;
        pill.addEventListener('click', () => { currentWeekDay = i; renderWeek(); });
        strip.appendChild(pill);
      });
    }

    const prog = document.getElementById('week-progress');
    if (prog) {
      prog.innerHTML = '<div style="font-size:11px;font-weight:500;color:var(--text-tertiary);letter-spacing:0.04em;margin-bottom:8px;font-family:var(--mono)">progreso semanal</div>';
      DAYS.forEach((name, i) => {
        const dayData = state.days[i] || { foco: [], ops: [] };
        const all = [...dayData.foco, ...dayData.ops];
        const total = all.length;
        const done = all.filter(t => t.done).length;
        const pct = total ? Math.round((done / total) * 100) : 0;
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:5px;';
        row.innerHTML = `
          <div style="font-size:11px;color:var(--text-secondary);width:14px;">${DAY_LETTERS[i]}</div>
          <div style="flex:1;height:5px;background:var(--surface);border-radius:3px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:${i === getTodayIndex() ? '#534AB7' : '#A32D2D'};border-radius:3px;transition:width 0.4s"></div>
          </div>
          <div style="font-size:10px;font-family:var(--mono);color:var(--text-tertiary);min-width:26px;text-align:right">${total ? pct + '%' : '—'}</div>`;
        prog.appendChild(row);
      });
    }

    const dayLabel = document.getElementById('week-day-label');
    if (dayLabel) dayLabel.textContent = DAYS[currentWeekDay] + ' ' + getDateLabel(currentWeekDay);

    const listEl = document.getElementById('week-task-list');
    if (listEl) {
      listEl.innerHTML = '';
      const dayData = state.days[currentWeekDay] || { foco: [], ops: [] };
      const all = [...dayData.foco.map(t => ({ ...t, _group: 'foco' })), ...dayData.ops.map(t => ({ ...t, _group: 'ops' }))];
      if (all.length === 0) {
        listEl.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);padding:12px 0;">Sin tareas para este día.</div>';
      } else {
        all.forEach(t => {
          const row = document.createElement('div');
          row.className = 'task' + (t.done ? ' done' : '');
          row.style.cursor = 'default';
          const cb = document.createElement('div');
          cb.className = 'cb';
          if (t.done) cb.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          cb.addEventListener('click', () => {
            const task = state.days[currentWeekDay][t._group].find(x => x.id === t.id);
            if (task) { task.done = !task.done; saveState(); renderWeek(); }
          });
          row.appendChild(cb);
          const txt = document.createElement('div');
          txt.className = 'task-content';
          txt.innerHTML = `<div class="task-text">${t.text}</div>` + (t.note ? `<div class="task-note">${t.note}</div>` : '');
          row.appendChild(txt);
          listEl.appendChild(row);
        });
      }
    }
  }

  function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    list.innerHTML = '';
    const notes = state.notes || [];
    if (notes.length === 0) {
      list.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);padding:12px 0;">Sin notas todavía. Creá tu primera nota.</div>';
      return;
    }
    notes.slice().reverse().forEach(n => {
      const card = document.createElement('div');
      card.className = 'note-card';
      const date = new Date(n.createdAt);
      const dateStr = date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = `<div class="note-title">${n.title || 'Sin título'}</div><div class="note-preview">${(n.body || '').slice(0, 120)}${(n.body || '').length > 120 ? '…' : ''}</div><div class="note-date">${dateStr}</div>`;
      card.addEventListener('click', () => openNoteModal(n));
      list.appendChild(card);
    });
  }

  function openNoteModal(note) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    if (!modal || !title || !body) return;
    title.textContent = note ? 'Editar nota' : 'Nueva nota';
    body.innerHTML = `
      <input type="text" id="note-title-input" placeholder="Título..." value="${note ? note.title || '' : ''}" style="margin-bottom:8px;">
      <textarea id="note-body-input" placeholder="Escribí tu nota acá...">${note ? note.body || '' : ''}</textarea>`;
    modal.style.display = 'flex';

    const saveBtn = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const closeBtn = document.getElementById('modal-close');

    const doSave = () => {
      const titleVal = document.getElementById('note-title-input').value.trim();
      const bodyVal = document.getElementById('note-body-input').value.trim();
      if (!state.notes) state.notes = [];
      if (note) {
        const n = state.notes.find(x => x.id === note.id);
        if (n) { n.title = titleVal; n.body = bodyVal; n.updatedAt = Date.now(); }
      } else {
        state.notes.push({ id: uid(), title: titleVal, body: bodyVal, createdAt: Date.now() });
      }
      saveState(); modal.style.display = 'none'; renderNotes();
    };

    const doClose = () => { modal.style.display = 'none'; };
    saveBtn.onclick = doSave;
    cancelBtn.onclick = doClose;
    closeBtn.onclick = doClose;
  }

  function openHitosModal() {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');
    if (!modal || !title || !body) return;
    title.textContent = 'Editar hitos de la semana';
    body.innerHTML = '<div id="hito-edit-list"></div><button class="btn-ghost" id="add-hito-btn" style="margin-top:8px;">+ Agregar hito</button>';
    renderHitoEditList();
    modal.style.display = 'flex';

    document.getElementById('add-hito-btn').onclick = () => {
      state.hitos.push({ id: uid(), emoji: '🎯', text: 'Nuevo hito' });
      renderHitoEditList();
    };

    const saveBtn = document.getElementById('modal-save');
    const cancelBtn = document.getElementById('modal-cancel');
    const closeBtn = document.getElementById('modal-close');
    const doClose = () => { modal.style.display = 'none'; render(); };
    saveBtn.onclick = () => { saveState(); doClose(); };
    cancelBtn.onclick = doClose;
    closeBtn.onclick = doClose;
  }

  function renderHitoEditList() {
    const list = document.getElementById('hito-edit-list');
    if (!list) return;
    list.innerHTML = '';
    state.hitos.forEach((h, idx) => {
      const row = document.createElement('div');
      row.className = 'hito-edit-row';
      const emojiSel = document.createElement('select');
      emojiSel.style.cssText = 'font-size:16px;border:0.5px solid var(--border);border-radius:6px;padding:4px;background:var(--bg);cursor:pointer;';
      HITO_EMOJIS.forEach(em => {
        const opt = document.createElement('option');
        opt.value = em; opt.textContent = em;
        if (em === h.emoji) opt.selected = true;
        emojiSel.appendChild(opt);
      });
      emojiSel.addEventListener('change', () => { h.emoji = emojiSel.value; });
      const inp = document.createElement('input');
      inp.type = 'text'; inp.value = h.text;
      inp.style.cssText = 'flex:1;padding:6px 10px;font-size:13px;font-family:var(--font);border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);outline:none;';
      inp.addEventListener('input', () => { h.text = inp.value; });
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️'; delBtn.className = 'ib';
      delBtn.addEventListener('click', () => { state.hitos.splice(idx, 1); renderHitoEditList(); });
      row.appendChild(emojiSel);
      row.appendChild(inp);
      row.appendChild(delBtn);
      list.appendChild(row);
    });
  }

  function addTask(group) {
    const inp = document.getElementById('add-' + group);
    if (!inp || !inp.value.trim()) return;
    const day = getDayData();
    day[group].push({ id: uid(), text: inp.value.trim(), done: false, note: '' });
    inp.value = '';
    saveState(); render();
  }

  function initEvents() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (editId) commitEdit();
        if (editNoteId) commitNoteEdit();
        document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        activeTab = btn.dataset.tab;
        document.getElementById('view-' + activeTab).classList.add('active');
        render();
      });
    });

    document.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => addTask(btn.dataset.add));
    });

    ['foco', 'ops'].forEach(g => {
      const inp = document.getElementById('add-' + g);
      if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') addTask(g); });
    });

    document.getElementById('edit-hitos')?.addEventListener('click', openHitosModal);
    document.getElementById('new-note')?.addEventListener('click', () => openNoteModal(null));
    document.getElementById('undo-btn')?.addEventListener('click', () => {
      if (!undoQueue.length) return;
      const entry = undoQueue.pop();
      Object.assign(state, entry.state);
      saveState(); render();
      clearTimeout(undoTimer);
      document.getElementById('undo-bar').style.display = 'none';
    });

    document.addEventListener('mousedown', e => {
      if (editId) {
        const inp = document.getElementById('ei-' + editId);
        if (inp && inp.contains(e.target)) return;
        if (e.target.closest('[data-edit]')) return;
        commitEdit();
      }
      if (editNoteId) {
        const inp = document.getElementById('ni-' + editNoteId);
        if (inp && inp.contains(e.target)) return;
        if (e.target.closest('[data-addnote]')) return;
        commitNoteEdit();
      }
    });

    document.getElementById('modal')?.addEventListener('click', e => {
      if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none';
    });
  }

  checkWeekRollover();
  initEvents();
  render();
})();