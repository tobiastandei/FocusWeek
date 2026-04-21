(function () {
  const SUPABASE_URL = 'https://fssejxjrmhnubqvbkqjf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ozaqDcjX8pTGZWWzs5fHtQ_TcC2f20VBYaT';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const DAY_LETTERS = ['L','M','X','J','V'];
  const HITO_EMOJIS = ['🎯','📊','📱','🌐','⚡','🔥','💡','✅'];

  let currentUser = null;
  let state = getDefaultState();
  let editId = null, editGroup = null, editNoteId = null, editNoteGroup = null;
  let dragState = null, dropTarget = null;
  let undoQueue = [], undoTimer = null;
  let currentWeekDay = getTodayIndex();
  let activeTab = 'today';

  function getTodayIndex() {
    const d = new Date().getDay();
    return d === 0 ? 4 : d === 6 ? 4 : d - 1;
  }

  function getWeekKey() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now);
    monday.setDate(diff);
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

  function getDefaultState() {
    return {
      weekKey: getWeekKey(),
      hitos: [],
      days: { 0:{foco:[],ops:[]}, 1:{foco:[],ops:[]}, 2:{foco:[],ops:[]}, 3:{foco:[],ops:[]}, 4:{foco:[],ops:[]} },
      notes: []
    };
  }

  function uid() { return Math.random().toString(36).slice(2, 10); }
  function snap() { return JSON.parse(JSON.stringify(state)); }

  function getDayData() {
    const idx = activeTab === 'today' ? getTodayIndex() : currentWeekDay;
    if (!state.days[idx]) state.days[idx] = { foco: [], ops: [] };
    return state.days[idx];
  }

  async function loadFromSupabase() {
    if (!currentUser) return;
    const weekKey = getWeekKey();
    const [{ data: hitos }, { data: tasks }, { data: notes }] = await Promise.all([
      sb.from('hitos').select('*').eq('user_id', currentUser.id).eq('week_key', weekKey).order('position'),
      sb.from('tasks').select('*').eq('user_id', currentUser.id).eq('week_key', weekKey).order('position'),
      sb.from('notes').select('*').eq('user_id', currentUser.id).order('created_at', { ascending: false })
    ]);
    state.hitos = (hitos || []).map(h => ({ id: h.id, emoji: h.emoji, text: h.text }));
    state.days = { 0:{foco:[],ops:[]}, 1:{foco:[],ops:[]}, 2:{foco:[],ops:[]}, 3:{foco:[],ops:[]}, 4:{foco:[],ops:[]} };
    (tasks || []).forEach(t => {
      if (!state.days[t.day_index]) state.days[t.day_index] = { foco: [], ops: [] };
      state.days[t.day_index][t.group_name].push({ id: t.id, text: t.text, note: t.note || '', done: t.done });
    });
    state.notes = (notes || []).map(n => ({ id: n.id, title: n.title, body: n.body, createdAt: n.created_at }));
    render();
  }

  async function saveTask(task, group, dayIndex) {
    if (!currentUser) return;
    const { data } = await sb.from('tasks').upsert({
      id: task.id && task.id.length > 10 ? task.id : undefined,
      user_id: currentUser.id, week_key: getWeekKey(),
      day_index: dayIndex, group_name: group,
      text: task.text, note: task.note || '', done: task.done, position: 0
    }, { onConflict: 'id' }).select().single();
    if (data && task.id !== data.id) task.id = data.id;
  }

  async function deleteTask(taskId) {
    if (!currentUser) return;
    await sb.from('tasks').delete().eq('id', taskId);
  }

  async function saveHito(hito) {
    if (!currentUser) return;
    const { data } = await sb.from('hitos').upsert({
      id: hito.id && hito.id.length > 10 ? hito.id : undefined,
      user_id: currentUser.id, week_key: getWeekKey(),
      emoji: hito.emoji, text: hito.text, position: 0
    }, { onConflict: 'id' }).select().single();
    if (data && hito.id !== data.id) hito.id = data.id;
  }

  async function deleteHito(hitoId) {
    if (!currentUser) return;
    await sb.from('hitos').delete().eq('id', hitoId);
  }

  function showLoginScreen() {
    document.querySelector('.tabs').style.display = 'none';
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    let el = document.getElementById('login-screen');
    if (!el) {
      el = document.createElement('div');
      el.id = 'login-screen';
      el.style.cssText = 'text-align:center;padding:80px 20px;';
      el.innerHTML = `
  <div style="font-size:40px;margin-bottom:12px;">🎯</div>
  <div style="font-size:24px;font-weight:500;margin-bottom:8px;">FocusWeek</div>
  <div style="font-size:14px;color:var(--text-secondary);margin-bottom:32px;">Tu semana, organizada.</div>
  <input id="login-email" type="email" placeholder="tu@email.com" style="width:100%;max-width:280px;padding:12px;font-size:14px;font-family:var(--font);border:0.5px solid var(--border-strong);border-radius:10px;background:var(--surface);color:var(--text);outline:none;margin-bottom:10px;display:block;margin-left:auto;margin-right:auto;">
  <button id="login-btn" style="padding:12px 28px;border:none;border-radius:10px;background:#534AB7;color:white;font-size:14px;font-family:var(--font);cursor:pointer;font-weight:500;">Entrar con email</button>
  <div id="login-msg" style="margin-top:16px;font-size:13px;color:var(--text-tertiary);display:none;"></div>`;
      document.querySelector('.app').appendChild(el);
    }
    el.style.display = 'block';
    document.getElementById('login-btn').onclick = async () => {
      const email = document.getElementById('login-email').value.trim();
      const msg = document.getElementById('login-msg');
      if (!email) return;
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: 'https://focus-week-nine.vercel.app' } });
      if (error) { msg.textContent = 'Error: ' + error.message; msg.style.display = 'block'; }
      else { msg.textContent = '✅ Revisá tu email — te mandamos un link para entrar.'; msg.style.display = 'block'; document.getElementById('login-btn').disabled = true; }
    };
    }
    el.style.display = 'block';
    document.getElementById('login-google').onclick = async () => {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: 'https://focus-week-nine.vercel.app',
          queryParams: { access_type: 'offline', prompt: 'consent' }
        }
      });
      if (error) console.error('Login error:', error);
    };
  }

  function showApp() {
    const el = document.getElementById('login-screen');
    if (el) el.style.display = 'none';
    document.querySelector('.tabs').style.display = '';
    document.getElementById('view-' + activeTab).style.display = 'block';
    document.getElementById('avatar').textContent = (currentUser.email || 'T')[0].toUpperCase();
    document.getElementById('avatar').onclick = async () => {
      if (confirm('¿Cerrar sesión?')) { await sb.auth.signOut(); }
    };
    loadFromSupabase();
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
      li.innerHTML = `<span class="hito-emoji">${h.emoji||'🎯'}</span><span>${h.text}</span>`;
      list.appendChild(li);
    });
    if (!state.hitos.length) {
      list.innerHTML = '<li class="hito" style="color:var(--text-tertiary);font-style:italic;">Sin hitos. Clickeá Editar para agregar.</li>';
    }
  }

  function renderTaskList(group, tasks, listId, barId, pctId, color) {
    const el = document.getElementById(listId);
    if (!el) return;
    el.innerHTML = '';
    const total = tasks.length, done = tasks.filter(t=>t.done).length;
    const pct = total ? Math.round((done/total)*100) : 0;
    const bar = document.getElementById(barId), pctEl = document.getElementById(pctId);
    if (bar) { bar.style.width = pct+'%'; bar.style.background = pct===100&&total>0 ? '#1D9E75' : color; }
    if (pctEl) pctEl.textContent = pct+'%';
    tasks.forEach((t,idx) => {
      const ind = document.createElement('div');
      ind.className='drop-indicator'; ind.dataset.group=group; ind.dataset.pos=String(idx);
      el.appendChild(ind);
      el.appendChild(makeTaskEl(t,idx,group));
    });
    const lastInd = document.createElement('div');
    lastInd.className='drop-indicator'; lastInd.dataset.group=group; lastInd.dataset.pos=String(tasks.length);
    el.appendChild(lastInd);
    el.addEventListener('dragover', e=>e.preventDefault());
    el.addEventListener('drop', handleDrop);
  }

  function makeTaskEl(t, idx, group) {
    const isEdit=editId===t.id, isNoteEdit=editNoteId===t.id;
    const div = document.createElement('div');
    div.className = 'task'+(t.done?' done':'')+(isEdit||isNoteEdit?' editing':'');
    const grip = document.createElement('div'); grip.className='grip';
    grip.innerHTML='<div class="grip-row"><div class="grip-dot"></div><div class="grip-dot"></div></div>'.repeat(3);
    grip.draggable=true;
    grip.addEventListener('dragstart',e=>{dragState={group,idx};div.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(div,0,0);});
    grip.addEventListener('dragend',()=>{div.classList.remove('dragging');clearIndicators();dragState=null;});
    div.appendChild(grip);
    div.addEventListener('dragover',e=>{e.preventDefault();if(!dragState)return;clearIndicators();const r=div.getBoundingClientRect();const pos=e.clientY<r.top+r.height/2?idx:idx+1;const ind=div.parentElement.querySelector(`.drop-indicator[data-pos="${pos}"]`);if(ind)ind.classList.add('visible');dropTarget={group,pos};});
    div.addEventListener('drop',handleDrop);
    const cb=document.createElement('div'); cb.className='cb';
    if(t.done) cb.innerHTML='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    cb.addEventListener('click',async e=>{e.stopPropagation();t.done=!t.done;const dayIdx=activeTab==='today'?getTodayIndex():currentWeekDay;await saveTask(t,group,dayIdx);render();});
    div.appendChild(cb);
    const content=document.createElement('div'); content.className='task-content';
    if(isEdit){
      const inp=document.createElement('input'); inp.className='edit-input'; inp.id='ei-'+t.id; inp.value=t.text;
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')cancelEdit();});
      inp.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(inp); setTimeout(()=>{inp.focus();inp.selectionStart=inp.value.length;},10);
    } else {
      const txt=document.createElement('div'); txt.className='task-text'; txt.textContent=t.text;
      content.appendChild(txt);
      content.addEventListener('click',e=>{if(e.target.closest('[data-addnote]'))return;e.stopPropagation();startEdit(t.id,group);});
    }
    if(isNoteEdit){
      const ni=document.createElement('input'); ni.className='note-input'; ni.id='ni-'+t.id; ni.value=t.note||''; ni.placeholder='Agregar nota...';
      ni.addEventListener('keydown',e=>{if(e.key==='Enter')commitNoteEdit();if(e.key==='Escape')cancelNoteEdit();});
      ni.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(ni); setTimeout(()=>ni.focus(),10);
    } else if(t.note&&!t.done){
      const noteEl=document.createElement('div'); noteEl.className='task-note'; noteEl.dataset.addnote='1'; noteEl.textContent=t.note;
      noteEl.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group);});
      content.appendChild(noteEl);
    } else if(!t.done&&!isEdit){
      const btn=document.createElement('button'); btn.className='add-note-btn'; btn.dataset.addnote='1'; btn.textContent='+ nota';
      btn.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group);});
      content.appendChild(btn);
    }
    div.appendChild(content);
    const actions=document.createElement('div'); actions.className='task-actions';
    if(isEdit||isNoteEdit) actions.style.opacity='1';
    const editBtn=document.createElement('button'); editBtn.className='ib'; editBtn.textContent='✏️';
    editBtn.addEventListener('click',e=>{e.stopPropagation();isEdit?commitEdit():startEdit(t.id,group);});
    const delBtn=document.createElement('button'); delBtn.className='ib'; delBtn.textContent='🗑️';
    delBtn.addEventListener('click',async e=>{
      e.stopPropagation();const saved=snap();const label=t.text;
      const day=getDayData();day[group].splice(idx,1);
      await deleteTask(t.id);render();showUndo(label,saved);
    });
    actions.appendChild(editBtn);actions.appendChild(delBtn);div.appendChild(actions);
    return div;
  }

  async function handleDrop(e) {
    e.preventDefault();if(!dragState||!dropTarget)return;
    const dayIdx=activeTab==='today'?getTodayIndex():currentWeekDay;
    const day=getDayData();
    const item=day[dragState.group].splice(dragState.idx,1)[0];
    let toPos=dropTarget.pos;
    if(dragState.group===dropTarget.group&&dragState.idx<toPos)toPos--;
    day[dropTarget.group].splice(toPos,0,item);
    dragState=null;dropTarget=null;clearIndicators();
    await saveTask(item,dropTarget?dropTarget.group:dragState?.group,dayIdx);render();
  }

  function clearIndicators(){document.querySelectorAll('.drop-indicator').forEach(el=>el.classList.remove('visible'));}
  function startEdit(id,group){if(editId||editNoteId)commitEdit();editId=id;editGroup=group;render();}

  async function commitEdit(){
    if(!editId)return;
    const inp=document.getElementById('ei-'+editId);
    if(inp&&inp.value.trim()){
      const day=getDayData();const task=day[editGroup].find(t=>t.id===editId);
      if(task){task.text=inp.value.trim();const dayIdx=activeTab==='today'?getTodayIndex():currentWeekDay;await saveTask(task,editGroup,dayIdx);}
    }
    editId=null;editGroup=null;render();
  }

  function cancelEdit(){editId=null;editGroup=null;render();}
  function startNoteEdit(id,group){if(editId)commitEdit();if(editNoteId)commitNoteEdit();editNoteId=id;editNoteGroup=group;render();}

  async function commitNoteEdit(){
    if(!editNoteId)return;
    const inp=document.getElementById('ni-'+editNoteId);
    if(inp){
      const day=getDayData();const task=day[editNoteGroup].find(t=>t.id===editNoteId);
      if(task){task.note=inp.value.trim();const dayIdx=activeTab==='today'?getTodayIndex():currentWeekDay;await saveTask(task,editNoteGroup,dayIdx);}
    }
    editNoteId=null;editNoteGroup=null;render();
  }

  function cancelNoteEdit(){editNoteId=null;editNoteGroup=null;render();}

  function showUndo(label,savedSnap){
    clearTimeout(undoTimer);undoQueue.push({label,state:savedSnap});
    const bar=document.getElementById('undo-bar'),txt=document.getElementById('undo-text');
    if(bar&&txt){txt.textContent='"'+(label.length>28?label.slice(0,28)+'…':label)+'" eliminada';bar.style.display='flex';undoTimer=setTimeout(()=>{bar.style.display='none';},5000);}
  }

  function renderWeek(){
    const weekEl=document.getElementById('week-header');
    if(weekEl){const now=new Date();weekEl.textContent=`semana · ${now.toLocaleDateString('es',{month:'long'})} ${now.getFullYear()}`;}
    const strip=document.getElementById('week-strip');
    if(strip){
      strip.innerHTML='';const todayIdx=getTodayIndex();
      DAYS.forEach((name,i)=>{
        const pill=document.createElement('div');
        const dayData=state.days[i]||{foco:[],ops:[]};
        const hasTasks=dayData.foco.length>0||dayData.ops.length>0;
        pill.className='day-pill'+(i===todayIdx?' today':'')+(i===currentWeekDay?' selected':'')+(hasTasks?' has-tasks':'');
        pill.innerHTML=`<span class="day-label">${DAY_LETTERS[i]}</span><div class="day-num">${getDateLabel(i)}</div><div class="day-dot"></div>`;
        pill.addEventListener('click',()=>{currentWeekDay=i;renderWeek();});
        strip.appendChild(pill);
      });
    }
    const prog=document.getElementById('week-progress');
    if(prog){
      prog.innerHTML='<div style="font-size:11px;font-weight:500;color:var(--text-tertiary);letter-spacing:0.04em;margin-bottom:8px;font-family:var(--mono)">progreso semanal</div>';
      DAYS.forEach((name,i)=>{
        const dayData=state.days[i]||{foco:[],ops:[]};
        const all=[...dayData.foco,...dayData.ops];
        const total=all.length,done=all.filter(t=>t.done).length;
        const pct=total?Math.round((done/total)*100):0;
        const row=document.createElement('div');row.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:5px;';
        row.innerHTML=`<div style="font-size:11px;color:var(--text-secondary);width:14px;">${DAY_LETTERS[i]}</div><div style="flex:1;height:5px;background:var(--surface);border-radius:3px;overflow:hidden"><div style="width:${pct}%;height:100%;background:${i===getTodayIndex()?'#534AB7':'#A32D2D'};border-radius:3px;transition:width 0.4s"></div></div><div style="font-size:10px;font-family:var(--mono);color:var(--text-tertiary);min-width:26px;text-align:right">${total?pct+'%':'—'}</div>`;
        prog.appendChild(row);
      });
    }
    const dayLabel=document.getElementById('week-day-label');
    if(dayLabel)dayLabel.textContent=DAYS[currentWeekDay]+' '+getDateLabel(currentWeekDay);
    const listEl=document.getElementById('week-task-list');
    if(listEl){
      listEl.innerHTML='';
      const dayData=state.days[currentWeekDay]||{foco:[],ops:[]};
      const all=[...dayData.foco.map(t=>({...t,_group:'foco'})),...dayData.ops.map(t=>({...t,_group:'ops'}))];
      if(!all.length){listEl.innerHTML='<div style="font-size:13px;color:var(--text-tertiary);padding:12px 0;">Sin tareas para este día.</div>';return;}
      all.forEach(t=>{
        const row=document.createElement('div');row.className='task'+(t.done?' done':'');
        const cb=document.createElement('div');cb.className='cb';
        if(t.done)cb.innerHTML='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        cb.addEventListener('click',async()=>{const task=state.days[currentWeekDay][t._group].find(x=>x.id===t.id);if(task){task.done=!task.done;await saveTask(task,t._group,currentWeekDay);renderWeek();}});
        row.appendChild(cb);
        const txt=document.createElement('div');txt.className='task-content';
        txt.innerHTML=`<div class="task-text">${t.text}</div>`+(t.note?`<div class="task-note">${t.note}</div>`:'');
        row.appendChild(txt);listEl.appendChild(row);
      });
    }
  }

  function renderNotes(){
    const list=document.getElementById('notes-list');if(!list)return;list.innerHTML='';
    if(!state.notes.length){list.innerHTML='<div style="font-size:13px;color:var(--text-tertiary);padding:12px 0;">Sin notas todavía.</div>';return;}
    state.notes.forEach(n=>{
      const card=document.createElement('div');card.className='note-card';
      const date=new Date(n.createdAt);
      const dateStr=date.toLocaleDateString('es',{weekday:'short',day:'numeric',month:'short'})+' · '+date.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      card.innerHTML=`<div class="note-title">${n.title||'Sin título'}</div><div class="note-preview">${(n.body||'').slice(0,120)}${(n.body||'').length>120?'…':''}</div><div class="note-date">${dateStr}</div>`;
      card.addEventListener('click',()=>openNoteModal(n));
      list.appendChild(card);
    });
  }

  function openNoteModal(note){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');
    if(!modal)return;
    title.textContent=note?'Editar nota':'Nueva nota';
    body.innerHTML=`<input type="text" id="note-title-input" placeholder="Título..." value="${note?note.title||'':''}" style="margin-bottom:8px;"><textarea id="note-body-input" placeholder="Escribí tu nota acá...">${note?note.body||'':''}</textarea>`;
    modal.style.display='flex';
    document.getElementById('modal-save').onclick=async()=>{
      const titleVal=document.getElementById('note-title-input').value.trim();
      const bodyVal=document.getElementById('note-body-input').value.trim();
      if(note){
        const n=state.notes.find(x=>x.id===note.id);
        if(n){n.title=titleVal;n.body=bodyVal;}
        await sb.from('notes').update({title:titleVal,body:bodyVal,updated_at:new Date().toISOString()}).eq('id',note.id);
      } else {
        const{data}=await sb.from('notes').insert({user_id:currentUser.id,title:titleVal,body:bodyVal}).select().single();
        if(data)state.notes.unshift({id:data.id,title:data.title,body:data.body,createdAt:data.created_at});
      }
      modal.style.display='none';renderNotes();
    };
    const doClose=()=>{modal.style.display='none';};
    document.getElementById('modal-cancel').onclick=doClose;
    document.getElementById('modal-close').onclick=doClose;
  }

  function openHitosModal(){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');
    if(!modal)return;
    title.textContent='Editar hitos de la semana';
    body.innerHTML='<div id="hito-edit-list"></div><button class="btn-ghost" id="add-hito-btn" style="margin-top:8px;">+ Agregar hito</button>';
    renderHitoEditList();modal.style.display='flex';
    document.getElementById('add-hito-btn').onclick=async()=>{
      const newHito={id:uid(),emoji:'🎯',text:'Nuevo hito'};
      state.hitos.push(newHito);await saveHito(newHito);renderHitoEditList();
    };
    document.getElementById('modal-save').onclick=async()=>{
      await Promise.all(state.hitos.map(h=>saveHito(h)));
      modal.style.display='none';render();
    };
    const doClose=()=>{modal.style.display='none';render();};
    document.getElementById('modal-cancel').onclick=doClose;
    document.getElementById('modal-close').onclick=doClose;
  }

  function renderHitoEditList(){
    const list=document.getElementById('hito-edit-list');if(!list)return;list.innerHTML='';
    state.hitos.forEach((h,idx)=>{
      const row=document.createElement('div');row.className='hito-edit-row';
      const sel=document.createElement('select');
      sel.style.cssText='font-size:16px;border:0.5px solid var(--border);border-radius:6px;padding:4px;background:var(--bg);cursor:pointer;';
      HITO_EMOJIS.forEach(em=>{const opt=document.createElement('option');opt.value=em;opt.textContent=em;if(em===h.emoji)opt.selected=true;sel.appendChild(opt);});
      sel.addEventListener('change',()=>{h.emoji=sel.value;});
      const inp=document.createElement('input');inp.type='text';inp.value=h.text;
      inp.style.cssText='flex:1;padding:6px 10px;font-size:13px;font-family:var(--font);border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);outline:none;';
      inp.addEventListener('input',()=>{h.text=inp.value;});
      const del=document.createElement('button');del.textContent='🗑️';del.className='ib';
      del.addEventListener('click',async()=>{await deleteHito(h.id);state.hitos.splice(idx,1);renderHitoEditList();});
      row.appendChild(sel);row.appendChild(inp);row.appendChild(del);list.appendChild(row);
    });
  }

  async function addTask(group){
    const inp=document.getElementById('add-'+group);if(!inp||!inp.value.trim())return;
    const dayIdx=activeTab==='today'?getTodayIndex():currentWeekDay;
    const task={id:uid(),text:inp.value.trim(),done:false,note:''};
    const day=getDayData();day[group].push(task);
    inp.value='';
    await saveTask(task,group,dayIdx);render();
  }

  function initEvents(){
    document.querySelectorAll('.tab').forEach(btn=>{
      btn.addEventListener('click',()=>{
        if(editId)commitEdit();if(editNoteId)commitNoteEdit();
        document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
        document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
        btn.classList.add('active');activeTab=btn.dataset.tab;
        document.getElementById('view-'+activeTab).classList.add('active');render();
      });
    });
    document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.add)));
    ['foco','ops'].forEach(g=>{const inp=document.getElementById('add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g);});});
    document.getElementById('edit-hitos')?.addEventListener('click',openHitosModal);
    document.getElementById('new-note')?.addEventListener('click',()=>openNoteModal(null));
    document.getElementById('undo-btn')?.addEventListener('click',async()=>{
      if(!undoQueue.length)return;const entry=undoQueue.pop();
      Object.assign(state,entry.state);await loadFromSupabase();
      clearTimeout(undoTimer);document.getElementById('undo-bar').style.display='none';
    });
    document.addEventListener('mousedown',e=>{
      if(editId){const inp=document.getElementById('ei-'+editId);if(inp&&inp.contains(e.target))return;if(e.target.closest('[data-edit]'))return;commitEdit();}
      if(editNoteId){const inp=document.getElementById('ni-'+editNoteId);if(inp&&inp.contains(e.target))return;if(e.target.closest('[data-addnote]'))return;commitNoteEdit();}
    });
    document.getElementById('modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('modal'))document.getElementById('modal').style.display='none';});
  }

  async function init(){
    initEvents();
    const { data: { session } } = await sb.auth.getSession();
    if(session?.user){ currentUser=session.user; showApp(); }
    else { showLoginScreen(); }
    sb.auth.onAuthStateChange((_event, session) => {
      if(session?.user){ currentUser=session.user; showApp(); }
      else { currentUser=null; state=getDefaultState(); showLoginScreen(); }
    });
  }

  init();
})();
