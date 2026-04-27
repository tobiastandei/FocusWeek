(function () {
  const SUPABASE_URL = 'https://fssejxjrmhnubqvbkqjf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ozaqDcjX8pTGZWWzs5fHtQ_TcC2f3Pu';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'focusweek_auth' }
  });

  const DAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const DAYS_SHORT = ['D','L','M','X','J','V','S'];
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const HITO_EMOJIS = ['🎯','📊','📱','🌐','⚡','🔥','💡','✅'];
  const DAYS_BACK = 15, DAYS_FORWARD = 30;
  const TAGS = ['Alta','Media','Baja'];
  const QC_GROUPS = ['trabajo','vida','carwash'];

  let currentUser = null;
  let state = getDefaultState();
  let selectedDate = todayStr();
  let activeTagFilter = '';
  let editId = null, editGroup = null, editDayKey = null;
  let editNoteId = null, editNoteGroup = null, editNoteDayKey = null;
  let dragState = null, dropTarget = null;
  let undoQueue = [], undoTimer = null;
  let activeTab = 'today';

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function dateFromOffset(offset) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); }
  function getWeekKey() { const now=new Date(); const day=now.getDay(); const diff=now.getDate()-day+(day===0?-6:1); const m=new Date(now); m.setDate(diff); return m.toISOString().slice(0,10); }
  function getMondayStr() { return getWeekKey(); }
  function getDefaultState() { return { hitos:[], dayTasks:{}, quickCapture:{trabajo:[],vida:[],carwash:[]}, notes:[] }; }
  function getDayTasks(dateStr) { if(!state.dayTasks[dateStr])state.dayTasks[dateStr]={foco:[],ops:[]}; return state.dayTasks[dateStr]; }
  function getTasksArray(group, dayKey) { if(dayKey==='quick-capture')return state.quickCapture[group]||[]; return getDayTasks(dayKey)[group]||[]; }
  function uid() { return Math.random().toString(36).slice(2,10); }

  // === SESSION COOKIE (iOS PWA fix) ===
  function saveSessionCookie(session) {
    if (!session) return;
    const val = JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token });
    document.cookie = 'fw_session=' + encodeURIComponent(val) + '; max-age=' + (7*24*3600) + '; path=/; SameSite=Lax';
  }

  function clearSessionCookie() {
    document.cookie = 'fw_session=; max-age=0; path=/';
  }

  function getSessionCookie() {
    const match = document.cookie.match(/fw_session=([^;]+)/);
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])); } catch { return null; }
  }

  // === AUTO WEEK CLOSE ON MONDAY ===
  function checkAutoWeekClose() {
    const today = new Date();
    if (today.getDay() !== 1) return; // Solo lunes
    const mondayStr = getMondayStr();
    const lastClosed = localStorage.getItem('fw_last_week_closed');
    if (lastClosed === mondayStr) return; // Ya se cerró esta semana
    // Calcular semana anterior (lun-dom)
    const prevMonday = new Date(today); prevMonday.setDate(today.getDate() - 7);
    const prevSunday = new Date(today); prevSunday.setDate(today.getDate() - 1);
    const weekDays = [];
    for (let d = new Date(prevMonday); d <= prevSunday; d.setDate(d.getDate() + 1)) {
      weekDays.push(d.toISOString().slice(0, 10));
    }
    const dayNames = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    let totalDone = 0, totalAll = 0, rows = '';
    weekDays.forEach((dateStr, i) => {
      const dayData = state.dayTasks[dateStr] || { foco: [], ops: [] };
      const all = [...(dayData.foco||[]), ...(dayData.ops||[])];
      const done = all.filter(t => t.done).length;
      totalDone += done; totalAll += all.length;
      if (all.length > 0) {
        const pct = Math.round((done / all.length) * 100);
        const color = pct === 100 ? '#1DB954' : pct >= 50 ? '#6C63FF' : '#C0392B';
        rows += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:12px;color:var(--text-tertiary);width:28px;font-family:var(--mono)">' + dayNames[i] + '</span><div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:3px"></div></div><span style="font-size:11px;font-family:var(--mono);color:var(--text-tertiary);min-width:36px;text-align:right">' + done + '/' + all.length + '</span></div>';
      }
    });
    const pctTotal = totalAll ? Math.round((totalDone / totalAll) * 100) : 0;
    if (totalAll === 0) { localStorage.setItem('fw_last_week_closed', mondayStr); return; }
    const modal = document.getElementById('modal');
    document.getElementById('modal-title').textContent = '📊 Resumen semana anterior';
    document.getElementById('modal-body').innerHTML =
      '<div style="text-align:center;margin-bottom:20px;"><div style="font-size:48px;font-weight:700;letter-spacing:-0.04em;color:var(--accent)">' + pctTotal + '%</div><div style="font-size:13px;color:var(--text-tertiary);margin-top:4px">' + totalDone + ' de ' + totalAll + ' tareas completadas</div></div>' +
      (rows || '<div style="text-align:center;color:var(--text-tertiary)">Sin tareas registradas.</div>') +
      '<div style="margin-top:16px;padding:12px;background:var(--surface2);border-radius:10px;font-size:12px;color:var(--text-tertiary);text-align:center;">¡Nueva semana, nueva oportunidad! 💪</div>';
    document.getElementById('modal-save').style.display = 'none';
    document.getElementById('modal-cancel').textContent = '¡A arrancar!';
    document.getElementById('modal-cancel').onclick = () => {
      modal.style.display = 'none';
      document.getElementById('modal-save').style.display = '';
      document.getElementById('modal-cancel').textContent = 'Cancelar';
      localStorage.setItem('fw_last_week_closed', mondayStr);
    };
    document.getElementById('modal-close').onclick = () => {
      modal.style.display = 'none';
      document.getElementById('modal-save').style.display = '';
      document.getElementById('modal-cancel').textContent = 'Cancelar';
      localStorage.setItem('fw_last_week_closed', mondayStr);
    };
    modal.style.display = 'flex';
  }

  // === SUPABASE LOAD ===
  async function loadFromSupabase() {
    if (!currentUser) return;
    const startDate = dateFromOffset(-DAYS_BACK);
    const endDate = dateFromOffset(DAYS_FORWARD);
    const weekKey = getWeekKey();
    const [{ data: hitos }, { data: regularTasks }, { data: qcTasks }, { data: notes }] = await Promise.all([
      sb.from('hitos').select('*').eq('user_id', currentUser.id).eq('week_key', weekKey).order('position'),
      sb.from('tasks').select('*').eq('user_id', currentUser.id).neq('week_key', 'quick-capture').gte('week_key', startDate).lte('week_key', endDate).order('position'),
      sb.from('tasks').select('*').eq('user_id', currentUser.id).eq('week_key', 'quick-capture').order('position'),
      sb.from('notes').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })
    ]);
    state.hitos = (hitos||[]).map(h => ({ id: h.id, emoji: h.emoji, text: h.text }));
    state.dayTasks = {};
    (regularTasks||[]).forEach(t => {
      if (!state.dayTasks[t.week_key]) state.dayTasks[t.week_key] = { foco: [], ops: [] };
      if (!state.dayTasks[t.week_key][t.group_name]) state.dayTasks[t.week_key][t.group_name] = [];
      state.dayTasks[t.week_key][t.group_name].push({ id: t.id, text: t.text, note: t.note||'', done: t.done, tag: t.tag||'' });
    });
    state.quickCapture = { trabajo: [], vida: [], carwash: [] };
    (qcTasks||[]).forEach(t => {
      if (QC_GROUPS.includes(t.group_name)) {
        state.quickCapture[t.group_name].push({ id: t.id, text: t.text, note: t.note||'', done: t.done, tag: t.tag||'' });
      }
    });
    state.notes = (notes||[]).map(n => ({ id: n.id, title: n.title, body: n.body, createdAt: n.created_at }));
    render();
    checkAutoWeekClose();
  }

  async function saveTask(task, group, dayKey) {
    if (!currentUser) return;
    const { data } = await sb.from('tasks').upsert({
      id: task.id && task.id.length > 10 ? task.id : undefined,
      user_id: currentUser.id, week_key: dayKey, day_index: 0,
      group_name: group, text: task.text, note: task.note||'', done: task.done, tag: task.tag||'', position: 0
    }, { onConflict: 'id' }).select().single();
    if (data && task.id !== data.id) task.id = data.id;
  }

  async function deleteTask(taskId) { if (!currentUser) return; await sb.from('tasks').delete().eq('id', taskId); }

  async function saveHito(hito) {
    if (!currentUser) return;
    const { data } = await sb.from('hitos').upsert({
      id: hito.id && hito.id.length > 10 ? hito.id : undefined,
      user_id: currentUser.id, week_key: getWeekKey(), emoji: hito.emoji, text: hito.text, position: 0
    }, { onConflict: 'id' }).select().single();
    if (data && hito.id !== data.id) hito.id = data.id;
  }

  async function deleteHito(hitoId) { if (!currentUser) return; await sb.from('hitos').delete().eq('id', hitoId); }

  // === LOGIN ===
  function showLoginScreen() {
    document.querySelectorAll('.tabs, .view').forEach(el => el.style.display = 'none');
    let el = document.getElementById('login-screen');
    if (!el) {
      el = document.createElement('div'); el.id = 'login-screen';
      el.innerHTML = '<div style="font-size:48px;margin-bottom:16px;">🎯</div><div style="font-size:28px;font-weight:700;margin-bottom:6px;letter-spacing:-0.04em;">FocusWeek</div><div style="font-size:14px;color:var(--text-tertiary);margin-bottom:40px;">Tu semana, organizada.</div><input id="login-email" type="email" placeholder="tu@email.com"><button id="login-btn">Entrar con email</button><div id="login-msg"></div>';
      document.querySelector('.app').appendChild(el);
    }
    el.style.display = 'block';
    document.getElementById('login-btn').onclick = async () => {
      const email = document.getElementById('login-email').value.trim();
      const msg = document.getElementById('login-msg');
      if (!email) { msg.textContent = 'Ingresá tu email'; msg.style.display = 'block'; return; }
      const btn = document.getElementById('login-btn');
      btn.disabled = true; btn.textContent = 'Enviando...';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://focus-week-nine.vercel.app' } });
      if (error) { msg.innerHTML = 'Error: ' + error.message; msg.style.display = 'block'; btn.disabled = false; btn.textContent = 'Entrar con email'; }
      else { msg.innerHTML = '✅ Revisá tu email <b>' + email + '</b><br>Te mandamos un link para entrar.<br><br><small style="color:var(--text-tertiary)">Tip: después de hacer click en el link, volvé a la app desde tu pantalla de inicio.</small>'; msg.style.display = 'block'; btn.textContent = 'Link enviado'; }
    };
    document.getElementById('login-email').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-btn').click(); });
  }

  function showApp() {
    const el = document.getElementById('login-screen'); if (el) el.style.display = 'none';
    document.querySelector('.tabs').style.display = '';
    switchTab(activeTab, false);
    document.getElementById('avatar').textContent = (currentUser.email||'T')[0].toUpperCase();
    document.getElementById('avatar').onclick = async () => { if (confirm('¿Cerrar sesión?')) { clearSessionCookie(); await sb.auth.signOut(); } };
    loadFromSupabase();
  }

  function switchTab(tab, doRender) {
    activeTab = tab;
    document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.view').forEach(v => { v.classList.remove('active'); v.style.display = 'none'; });
    const activeView = document.getElementById('view-' + tab);
    if (activeView) { activeView.classList.add('active'); activeView.style.display = 'block'; }
    if (doRender !== false) render();
  }

  function render() {
    if (activeTab === 'today') renderToday();
    else if (activeTab === 'week') renderScrollableWeek();
    else if (activeTab === 'pending') renderPending();
    else if (activeTab === 'capture') renderQuickCapture();
    else if (activeTab === 'notes') renderNotes();
  }

  // === HOY ===
  function renderToday() {
    const today = todayStr(); const d = new Date();
    const headerEl = document.getElementById('today-date');
    if (headerEl) headerEl.textContent = DAYS_ES[d.getDay()] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
    const dayTasks = getDayTasks(today);
    let allTasks = [...dayTasks.foco, ...dayTasks.ops];
    if (activeTagFilter) allTasks = allTasks.filter(t => t.tag === activeTagFilter);
    const done = allTasks.filter(t => t.done).length;
    const subEl = document.getElementById('today-subtitle');
    if (subEl) subEl.textContent = allTasks.length ? done + ' de ' + allTasks.length + ' tareas completadas' : 'Agregá tus tareas del día';
    renderHitos();
    const focoFiltered = activeTagFilter ? dayTasks.foco.filter(t => t.tag === activeTagFilter) : dayTasks.foco;
    const opsFiltered = activeTagFilter ? dayTasks.ops.filter(t => t.tag === activeTagFilter) : dayTasks.ops;
    renderTaskList('foco', focoFiltered, 'list-foco', 'bar-foco', 'pct-foco', '#C0392B', today);
    renderTaskList('ops', opsFiltered, 'list-ops', 'bar-ops', 'pct-ops', '#6C63FF', today);
  }

  function renderHitos() {
    const list = document.getElementById('hitos-list'); if (!list) return; list.innerHTML = '';
    (state.hitos||[]).forEach(h => { const li = document.createElement('li'); li.className = 'hito'; li.innerHTML = '<span class="hito-emoji">' + (h.emoji||'🎯') + '</span><span style="color:var(--text-secondary)">' + h.text + '</span>'; list.appendChild(li); });
    if (!state.hitos.length) list.innerHTML = '<li class="hito" style="color:var(--text-tertiary);font-style:italic;">Sin hitos. Clickeá Editar.</li>';
  }

  // === PENDIENTES ===
  function renderPending() {
    const list = document.getElementById('pending-list');
    const emptyEl = document.getElementById('pending-empty');
    if (!list) return;
    list.innerHTML = '';
    const today = todayStr();
    const groups = [];
    for (let i = 1; i <= 7; i++) {
      const dateStr = dateFromOffset(-i);
      if (dateStr >= today) continue;
      const dayData = state.dayTasks[dateStr] || { foco: [], ops: [] };
      const pending = [...(dayData.foco||[]), ...(dayData.ops||[])].filter(t => !t.done);
      if (pending.length > 0) groups.push({ dateStr, tasks: pending });
    }
    if (!groups.length) { emptyEl.style.display = 'block'; return; }
    emptyEl.style.display = 'none';
    groups.forEach(({ dateStr, tasks }) => {
      const d = new Date(dateStr + 'T12:00:00');
      const label = document.createElement('div'); label.className = 'pending-date-label';
      label.textContent = DAYS_ES[d.getDay()] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
      list.appendChild(label);
      tasks.forEach(t => {
        const row = document.createElement('div'); row.className = 'pending-task';
        const cb = document.createElement('div'); cb.className = 'cb';
        cb.addEventListener('click', async () => {
          const group = (state.dayTasks[dateStr]?.foco||[]).find(x => x.id === t.id) ? 'foco' : 'ops';
          t.done = true; await saveTask(t, group, dateStr); renderPending();
        });
        row.appendChild(cb);
        const content = document.createElement('div'); content.className = 'task-content';
        content.innerHTML = '<div class="task-text">' + t.text + '</div>' + (t.tag ? '<span class="tag-badge ' + t.tag.toLowerCase() + '">' + t.tag + '</span>' : '');
        row.appendChild(content); list.appendChild(row);
      });
    });
  }

  // === SEMANA ===
  function renderScrollableWeek() {
    const strip = document.getElementById('day-scroll-strip'); if (!strip) return;
    const today = todayStr();
    strip.innerHTML = '';
    for (let offset = -DAYS_BACK; offset <= DAYS_FORWARD; offset++) {
      const dateStr = dateFromOffset(offset);
      const d = new Date(dateStr + 'T12:00:00'); const dow = d.getDay();
      const dayData = state.dayTasks[dateStr] || { foco: [], ops: [] };
      const hasTasks = (dayData.foco||[]).length > 0 || (dayData.ops||[]).length > 0;
      const pill = document.createElement('div');
      pill.className = 'scroll-day-pill' + (dateStr===today?' today':'') + (dateStr===selectedDate?' selected':'') + (hasTasks?' has-tasks':'') + (dow===0||dow===6?' weekend':'');
      pill.innerHTML = '<span class="scroll-day-letter">' + DAYS_SHORT[dow] + '</span><div class="scroll-day-num">' + d.getDate() + '</div><div class="day-dot"></div>';
      pill.addEventListener('click', () => { selectedDate = dateStr; renderScrollableWeek(); });
      strip.appendChild(pill);
    }
    const selectedPill = strip.querySelector('.selected');
    if (selectedPill) setTimeout(() => selectedPill.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' }), 50);
    const d = new Date(selectedDate + 'T12:00:00');
    const dayLabel = document.getElementById('scroll-day-label');
    if (dayLabel) dayLabel.textContent = DAYS_ES[d.getDay()] + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
    const dayData = getDayTasks(selectedDate);
    const all = [...dayData.foco, ...dayData.ops];
    const done = all.filter(t => t.done).length;
    const statsEl = document.getElementById('scroll-day-stats');
    if (statsEl) statsEl.textContent = all.length ? done + '/' + all.length + ' completadas' : 'sin tareas';
    renderTaskList('foco', dayData.foco, 'scroll-list-foco', 'scroll-bar-foco', 'scroll-pct-foco', '#C0392B', selectedDate);
    renderTaskList('ops', dayData.ops, 'scroll-list-ops', 'scroll-bar-ops', 'scroll-pct-ops', '#6C63FF', selectedDate);
  }

  // === QUICK CAPTURE ===
  function renderQuickCapture() {
    renderTaskList('trabajo', state.quickCapture.trabajo, 'qc-list-trabajo', 'qc-bar-trabajo', 'qc-pct-trabajo', '#C0392B', 'quick-capture');
    renderTaskList('vida', state.quickCapture.vida, 'qc-list-vida', 'qc-bar-vida', 'qc-pct-vida', '#6C63FF', 'quick-capture');
    renderTaskList('carwash', state.quickCapture.carwash, 'qc-list-carwash', 'qc-bar-carwash', 'qc-pct-carwash', '#1DB954', 'quick-capture');
  }

  // === TASK LIST ===
  function renderTaskList(group, tasks, listId, barId, pctId, color, dayKey) {
    const el = document.getElementById(listId); if (!el) return; el.innerHTML = '';
    const total = tasks.length, done = tasks.filter(t => t.done).length;
    const pct = total ? Math.round((done/total)*100) : 0;
    const bar = document.getElementById(barId), pctEl = document.getElementById(pctId);
    if (bar) { bar.style.width = pct + '%'; bar.style.background = pct===100&&total>0 ? '#1DB954' : color; }
    if (pctEl) pctEl.textContent = pct + '%';
    tasks.forEach((t, idx) => {
      const ind = document.createElement('div'); ind.className = 'drop-indicator'; ind.dataset.group = group; ind.dataset.pos = String(idx);
      el.appendChild(ind); el.appendChild(makeTaskEl(t, idx, group, dayKey));
    });
    const lastInd = document.createElement('div'); lastInd.className = 'drop-indicator'; lastInd.dataset.group = group; lastInd.dataset.pos = String(tasks.length);
    el.appendChild(lastInd);
    el.addEventListener('dragover', e => e.preventDefault());
    el.addEventListener('drop', e => handleDrop(e, group, dayKey));
  }

  function makeTaskEl(t, idx, group, dayKey) {
    const isEdit = editId === t.id, isNoteEdit = editNoteId === t.id;
    const div = document.createElement('div'); div.className = 'task' + (t.done?' done':'') + (isEdit||isNoteEdit?' editing':'');

    // Swipe to complete (mobile)
    let swipeStartX = 0, swipeDelta = 0;
    div.addEventListener('touchstart', e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
    div.addEventListener('touchmove', e => {
      swipeDelta = e.touches[0].clientX - swipeStartX;
      if (Math.abs(swipeDelta) > 10) div.style.transform = 'translateX(' + Math.min(0, Math.max(-90, swipeDelta)) + 'px)';
    }, { passive: true });
    div.addEventListener('touchend', async () => {
      div.style.transform = '';
      if (swipeDelta < -70) { t.done = !t.done; await saveTask(t, group, dayKey); render(); }
      swipeDelta = 0;
    }, { passive: true });

    const grip = document.createElement('div'); grip.className = 'grip';
    grip.innerHTML = '<div class="grip-row"><div class="grip-dot"></div><div class="grip-dot"></div></div>'.repeat(3);
    grip.draggable = true;
    grip.addEventListener('dragstart', e => { dragState={group,idx,dayKey}; div.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setDragImage(div,0,0); });
    grip.addEventListener('dragend', () => { div.classList.remove('dragging'); clearIndicators(); dragState=null; });
    div.appendChild(grip);
    div.addEventListener('dragover', e => { e.preventDefault(); if(!dragState)return; clearIndicators(); const r=div.getBoundingClientRect(); const pos=e.clientY<r.top+r.height/2?idx:idx+1; const ind=div.parentElement.querySelector('.drop-indicator[data-pos="'+pos+'"]'); if(ind)ind.classList.add('visible'); dropTarget={group,pos,dayKey}; });
    div.addEventListener('drop', e => handleDrop(e, group, dayKey));

    const cb = document.createElement('div'); cb.className = 'cb';
    if (t.done) cb.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    cb.addEventListener('click', async e => { e.stopPropagation(); t.done = !t.done; await saveTask(t, group, dayKey); render(); });
    div.appendChild(cb);

    const content = document.createElement('div'); content.className = 'task-content';
    if (isEdit) {
      // Tag picker in edit mode
      const tagPickerHtml = '<div class="tag-picker" id="tp-'+t.id+'"><button class="tag-option'+(t.tag===''?' selected':'')+'">Sin tag</button><button class="tag-option alta'+(t.tag==='Alta'?' selected':'')+'">🔴 Alta</button><button class="tag-option media'+(t.tag==='Media'?' selected':'')+'">🟡 Media</button><button class="tag-option baja'+(t.tag==='Baja'?' selected':'')+'">🟢 Baja</button></div>';
      const inp = document.createElement('input'); inp.className = 'edit-input'; inp.id = 'ei-'+t.id; inp.value = t.text;
      inp.addEventListener('keydown', e => { if(e.key==='Enter')commitEdit(); if(e.key==='Escape')cancelEdit(); });
      inp.addEventListener('click', e => e.stopPropagation());
      content.appendChild(inp);
      const tagPicker = document.createElement('div'); tagPicker.innerHTML = tagPickerHtml;
      const tp = tagPicker.firstChild; content.appendChild(tp);
      tp.querySelectorAll('.tag-option').forEach((btn, i) => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const tagVal = i === 0 ? '' : TAGS[i-1];
          t.tag = tagVal;
          tp.querySelectorAll('.tag-option').forEach((b, j) => { b.classList.toggle('selected', j === i); });
        });
      });
      setTimeout(() => { inp.focus(); inp.selectionStart = inp.value.length; }, 10);
    } else {
      const txt = document.createElement('div'); txt.className = 'task-text'; txt.textContent = t.text;
      content.appendChild(txt);
      if (t.tag) { const badge = document.createElement('span'); badge.className = 'tag-badge ' + t.tag.toLowerCase(); badge.textContent = t.tag; content.appendChild(badge); }
      content.addEventListener('click', e => { if(e.target.closest('[data-addnote]'))return; e.stopPropagation(); startEdit(t.id, group, dayKey); });
    }

    if (isNoteEdit) {
      const ni = document.createElement('input'); ni.className = 'note-input'; ni.id = 'ni-'+t.id; ni.value = t.note||''; ni.placeholder = 'Agregar nota...';
      ni.addEventListener('keydown', e => { if(e.key==='Enter')commitNoteEdit(); if(e.key==='Escape')cancelNoteEdit(); });
      ni.addEventListener('click', e => e.stopPropagation());
      content.appendChild(ni); setTimeout(() => ni.focus(), 10);
    } else if (t.note && !t.done) {
      const noteEl = document.createElement('div'); noteEl.className = 'task-note'; noteEl.dataset.addnote = '1'; noteEl.textContent = t.note;
      noteEl.addEventListener('click', e => { e.stopPropagation(); startNoteEdit(t.id, group, dayKey); });
      content.appendChild(noteEl);
    } else if (!t.done && !isEdit) {
      const btn = document.createElement('button'); btn.className = 'add-note-btn'; btn.dataset.addnote = '1'; btn.textContent = '+ nota';
      btn.addEventListener('click', e => { e.stopPropagation(); startNoteEdit(t.id, group, dayKey); });
      content.appendChild(btn);
    }
    div.appendChild(content);

    const actions = document.createElement('div'); actions.className = 'task-actions';
    if (isEdit || isNoteEdit) actions.style.opacity = '1';
    const editBtn = document.createElement('button'); editBtn.className = 'ib'; editBtn.textContent = '✏️';
    editBtn.addEventListener('click', e => { e.stopPropagation(); isEdit ? commitEdit() : startEdit(t.id, group, dayKey); });
    const delBtn = document.createElement('button'); delBtn.className = 'ib'; delBtn.textContent = '🗑️';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation(); const taskCopy = {...t};
      const arr = getTasksArray(group, dayKey); arr.splice(idx, 1);
      await deleteTask(t.id); render(); showUndo(t.text, taskCopy, group, dayKey);
    });
    actions.appendChild(editBtn); actions.appendChild(delBtn); div.appendChild(actions);
    return div;
  }

  async function handleDrop(e, group, dayKey) {
    e.preventDefault(); if (!dragState || !dropTarget) return;
    const srcArr = getTasksArray(dragState.group, dragState.dayKey);
    const dstArr = getTasksArray(dropTarget.group, dropTarget.dayKey || dayKey);
    const item = srcArr.splice(dragState.idx, 1)[0];
    let toPos = dropTarget.pos;
    if (dragState.group === dropTarget.group && dragState.dayKey === dropTarget.dayKey && dragState.idx < toPos) toPos--;
    dstArr.splice(toPos, 0, item);
    const finalGroup = dropTarget.group, finalDayKey = dropTarget.dayKey || dayKey;
    dragState = null; dropTarget = null; clearIndicators();
    await saveTask(item, finalGroup, finalDayKey); render();
  }

  function clearIndicators() { document.querySelectorAll('.drop-indicator').forEach(el => el.classList.remove('visible')); }
  function startEdit(id, group, dayKey) { if (editId) commitEdit(); editId = id; editGroup = group; editDayKey = dayKey; render(); }

  async function commitEdit() {
    if (!editId) return;
    const inp = document.getElementById('ei-' + editId);
    if (inp && inp.value.trim()) {
      const arr = getTasksArray(editGroup, editDayKey);
      const task = arr.find(t => t.id === editId);
      if (task) { task.text = inp.value.trim(); await saveTask(task, editGroup, editDayKey); }
    }
    editId = null; editGroup = null; editDayKey = null; render();
  }

  function cancelEdit() { editId = null; editGroup = null; editDayKey = null; render(); }
  function startNoteEdit(id, group, dayKey) { if (editId) commitEdit(); if (editNoteId) commitNoteEdit(); editNoteId = id; editNoteGroup = group; editNoteDayKey = dayKey; render(); }

  async function commitNoteEdit() {
    if (!editNoteId) return;
    const inp = document.getElementById('ni-' + editNoteId);
    if (inp) { const arr = getTasksArray(editNoteGroup, editNoteDayKey); const task = arr.find(t => t.id === editNoteId); if (task) { task.note = inp.value.trim(); await saveTask(task, editNoteGroup, editNoteDayKey); } }
    editNoteId = null; editNoteGroup = null; editNoteDayKey = null; render();
  }

  function cancelNoteEdit() { editNoteId = null; editNoteGroup = null; editNoteDayKey = null; render(); }

  function showUndo(label, taskCopy, group, dayKey) {
    clearTimeout(undoTimer); undoQueue.push({ label, taskCopy, group, dayKey });
    const bar = document.getElementById('undo-bar'), txt = document.getElementById('undo-text');
    if (bar && txt) { txt.textContent = '"' + (label.length > 28 ? label.slice(0,28) + '…' : label) + '" eliminada'; bar.style.display = 'flex'; undoTimer = setTimeout(() => { bar.style.display = 'none'; undoQueue = []; }, 5000); }
  }

  // === NOTAS ===
  function renderNotes() {
    const list = document.getElementById('notes-list'); if (!list) return; list.innerHTML = '';
    if (!state.notes.length) { list.innerHTML = '<div style="font-size:13px;color:var(--text-tertiary);padding:20px 0;text-align:center;">Sin notas todavía.</div>'; return; }
    state.notes.forEach(n => {
      const wrap = document.createElement('div'); wrap.className = 'note-card-wrap';
      const delBg = document.createElement('div'); delBg.className = 'note-delete-bg'; delBg.textContent = '🗑️';
      const card = document.createElement('div'); card.className = 'note-card';
      const date = new Date(n.createdAt);
      const dateStr = date.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      card.innerHTML = '<div class="note-title">' + (n.title||'Sin título') + '</div><div class="note-preview">' + (n.body||'').slice(0,120) + ((n.body||'').length>120?'…':'') + '</div><div class="note-date">' + dateStr + '</div>';

      // Swipe to delete note
      let swipeStartX = 0, swipeDelta = 0;
      card.addEventListener('touchstart', e => { swipeStartX = e.touches[0].clientX; }, { passive: true });
      card.addEventListener('touchmove', e => {
        swipeDelta = e.touches[0].clientX - swipeStartX;
        if (swipeDelta < 0) card.style.transform = 'translateX(' + Math.max(-90, swipeDelta) + 'px)';
      }, { passive: true });
      card.addEventListener('touchend', async () => {
        if (swipeDelta < -70) {
          if (confirm('¿Eliminar nota "' + (n.title||'Sin título') + '"?')) {
            await sb.from('notes').delete().eq('id', n.id);
            state.notes = state.notes.filter(x => x.id !== n.id);
            renderNotes(); return;
          }
        }
        card.style.transform = ''; swipeDelta = 0;
      }, { passive: true });

      card.addEventListener('click', () => { if (Math.abs(swipeDelta) < 5) openNoteModal(n); });
      wrap.appendChild(delBg); wrap.appendChild(card); list.appendChild(wrap);
    });
  }

  function openNoteModal(note) {
    const modal = document.getElementById('modal'), title = document.getElementById('modal-title'), body = document.getElementById('modal-body'); if (!modal) return;
    title.textContent = note ? 'Editar nota' : 'Nueva nota';
    body.innerHTML = '<input type="text" id="note-title-input" placeholder="Título..." value="' + (note?note.title||'':'') + '"><textarea id="note-body-input" placeholder="Escribí tu nota acá...">' + (note?note.body||'':'') + '</textarea>';
    modal.style.display = 'flex';
    document.getElementById('modal-save').onclick = async () => {
      const titleVal = document.getElementById('note-title-input').value.trim();
      const bodyVal = document.getElementById('note-body-input').value.trim();
      if (note) { const n = state.notes.find(x => x.id === note.id); if (n) { n.title = titleVal; n.body = bodyVal; } await sb.from('notes').update({ title: titleVal, body: bodyVal, updated_at: new Date().toISOString() }).eq('id', note.id); }
      else { const { data } = await sb.from('notes').insert({ user_id: currentUser.id, title: titleVal, body: bodyVal }).select().single(); if (data) state.notes.unshift({ id: data.id, title: data.title, body: data.body, createdAt: data.created_at }); }
      modal.style.display = 'none'; renderNotes();
    };
    const doClose = () => { modal.style.display = 'none'; };
    document.getElementById('modal-cancel').onclick = doClose; document.getElementById('modal-close').onclick = doClose;
  }

  function openHitosModal() {
    const modal = document.getElementById('modal'), title = document.getElementById('modal-title'), body = document.getElementById('modal-body'); if (!modal) return;
    title.textContent = 'Hitos de la semana';
    body.innerHTML = '<div id="hito-edit-list"></div><button class="btn-ghost" id="add-hito-btn" style="margin-top:8px;">+ Agregar hito</button>';
    renderHitoEditList(); modal.style.display = 'flex';
    document.getElementById('add-hito-btn').onclick = async () => { const h = { id: uid(), emoji: '🎯', text: 'Nuevo hito' }; state.hitos.push(h); await saveHito(h); renderHitoEditList(); };
    document.getElementById('modal-save').onclick = async () => { await Promise.all(state.hitos.map(h => saveHito(h))); modal.style.display = 'none'; render(); };
    const doClose = () => { modal.style.display = 'none'; render(); };
    document.getElementById('modal-cancel').onclick = doClose; document.getElementById('modal-close').onclick = doClose;
  }

  function renderHitoEditList() {
    const list = document.getElementById('hito-edit-list'); if (!list) return; list.innerHTML = '';
    state.hitos.forEach((h, idx) => {
      const row = document.createElement('div'); row.className = 'hito-edit-row';
      const sel = document.createElement('select'); sel.style.cssText = 'font-size:16px;border:0.5px solid var(--border);border-radius:6px;padding:4px;background:var(--bg);cursor:pointer;color:var(--text);';
      HITO_EMOJIS.forEach(em => { const opt = document.createElement('option'); opt.value = em; opt.textContent = em; if (em === h.emoji) opt.selected = true; sel.appendChild(opt); });
      sel.addEventListener('change', () => { h.emoji = sel.value; });
      const inp = document.createElement('input'); inp.type = 'text'; inp.value = h.text;
      inp.style.cssText = 'flex:1;padding:8px 12px;font-size:14px;font-family:var(--font);border:0.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);outline:none;';
      inp.addEventListener('input', () => { h.text = inp.value; });
      const del = document.createElement('button'); del.textContent = '🗑️'; del.className = 'ib';
      del.addEventListener('click', async () => { await deleteHito(h.id); state.hitos.splice(idx, 1); renderHitoEditList(); });
      row.appendChild(sel); row.appendChild(inp); row.appendChild(del); list.appendChild(row);
    });
  }

  async function addTask(group, dayKey) {
    const isQC = dayKey === 'quick-capture';
    let inputId;
    if (isQC) inputId = 'qc-add-' + group;
    else if (dayKey === todayStr() && activeTab === 'today') inputId = 'add-' + group;
    else inputId = 'scroll-add-' + group;
    const inp = document.getElementById(inputId); if (!inp || !inp.value.trim()) return;
    const task = { id: uid(), text: inp.value.trim(), done: false, note: '', tag: '' };
    if (isQC) state.quickCapture[group].push(task);
    else getDayTasks(dayKey)[group].push(task);
    inp.value = '';
    await saveTask(task, group, dayKey); render();
  }

  function initEvents() {
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => { if (editId) commitEdit(); if (editNoteId) commitNoteEdit(); switchTab(btn.dataset.tab); });
    });

    // Tag filter
    document.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tag-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeTagFilter = btn.dataset.tag;
        renderToday();
      });
    });

    // Today add
    document.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addTask(btn.dataset.add, todayStr())));
    ['foco','ops'].forEach(g => { const inp = document.getElementById('add-'+g); if (inp) inp.addEventListener('keydown', e => { if (e.key==='Enter') addTask(g, todayStr()); }); });
    // Scroll add
    document.querySelectorAll('[data-scroll-add]').forEach(btn => btn.addEventListener('click', () => addTask(btn.dataset.scrollAdd, selectedDate)));
    ['foco','ops'].forEach(g => { const inp = document.getElementById('scroll-add-'+g); if (inp) inp.addEventListener('keydown', e => { if (e.key==='Enter') addTask(g, selectedDate); }); });
    // QC add
    document.querySelectorAll('[data-qc-add]').forEach(btn => btn.addEventListener('click', () => addTask(btn.dataset.qcAdd, 'quick-capture')));
    [...QC_GROUPS].forEach(g => { const inp = document.getElementById('qc-add-'+g); if (inp) inp.addEventListener('keydown', e => { if (e.key==='Enter') addTask(g, 'quick-capture'); }); });

    document.getElementById('edit-hitos')?.addEventListener('click', openHitosModal);
    document.getElementById('new-note')?.addEventListener('click', () => openNoteModal(null));

    document.getElementById('undo-btn')?.addEventListener('click', async () => {
      if (!undoQueue.length) return;
      const entry = undoQueue.pop();
      if (entry.taskCopy) {
        const { data } = await sb.from('tasks').insert({ user_id: currentUser.id, week_key: entry.dayKey, day_index: 0, group_name: entry.group, text: entry.taskCopy.text, note: entry.taskCopy.note||'', done: entry.taskCopy.done, tag: entry.taskCopy.tag||'', position: 0 }).select().single();
        if (data) {
          const newTask = { id: data.id, text: data.text, note: data.note||'', done: data.done, tag: data.tag||'' };
          if (entry.dayKey === 'quick-capture') { if (!state.quickCapture[entry.group]) state.quickCapture[entry.group] = []; state.quickCapture[entry.group].push(newTask); }
          else getDayTasks(entry.dayKey)[entry.group].push(newTask);
        }
      }
      clearTimeout(undoTimer); document.getElementById('undo-bar').style.display = 'none'; undoQueue = []; render();
    });

    document.addEventListener('mousedown', e => {
      if (editId) { const inp = document.getElementById('ei-'+editId); if (inp && inp.contains(e.target)) return; if (e.target.closest('.tag-picker')) return; commitEdit(); }
      if (editNoteId) { const inp = document.getElementById('ni-'+editNoteId); if (inp && inp.contains(e.target)) return; commitNoteEdit(); }
    });
    document.getElementById('modal')?.addEventListener('click', e => { if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none'; });
  }

  async function init() {
    initEvents();
    let session = null;

    // Intentar restaurar sesión desde Supabase
    const { data: { session: sbSession } } = await sb.auth.getSession();
    session = sbSession;

    // Si no hay sesión, intentar desde cookie (iOS PWA fix)
    if (!session) {
      const cookieData = getSessionCookie();
      if (cookieData) {
        try {
          const { data: { session: restored } } = await sb.auth.setSession(cookieData);
          session = restored;
        } catch (e) { clearSessionCookie(); }
      }
    }

    if (session?.user) { currentUser = session.user; saveSessionCookie(session); showApp(); }
    else { showLoginScreen(); }

    sb.auth.onAuthStateChange((_event, newSession) => {
      if (newSession?.user) { currentUser = newSession.user; saveSessionCookie(newSession); showApp(); }
      else { currentUser = null; clearSessionCookie(); state = getDefaultState(); showLoginScreen(); }
    });
  }

  init();
})();
