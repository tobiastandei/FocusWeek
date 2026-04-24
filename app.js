(function () {
  const SUPABASE_URL = 'https://fssejxjrmhnubqvbkqjf.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzc2VqeGpybWhudWJxdmJrcWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDg2NzUsImV4cCI6MjA5MjIyNDY3NX0.Bb7SK1lBEzA__-ceXK9Z4-bcd_rBHXIsIWNv_iHn1rY';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'focusweek_auth' }
  });

  const DAYS = ['Lunes','Martes','Miércoles','Jueves','Viernes'];
  const DAY_LETTERS = ['L','M','X','J','V'];
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const HITO_EMOJIS = ['🎯','📊','📱','🌐','⚡','🔥','💡','✅'];

  let currentUser = null;
  let state = getDefaultState();
  let editId = null, editGroup = null, editNoteId = null, editNoteGroup = null;
  let dragState = null, dropTarget = null;
  let undoQueue = [], undoTimer = null;
  let currentWeekDay = getTodayIndex();
  let activeTab = 'today';

  function getTodayIndex() { const d = new Date().getDay(); return d===0?4:d===6?4:d-1; }
  function getWeekKey() { const now=new Date();const day=now.getDay();const diff=now.getDate()-day+(day===0?-6:1);const m=new Date(now);m.setDate(diff);return m.toISOString().slice(0,10); }
  function getDateLabel(i) { const now=new Date();const day=now.getDay();const diff=now.getDate()-day+(day===0?-6:1);const d=new Date(now);d.setDate(diff+i);return d.getDate(); }
  function getFullDate(i) { const now=new Date();const day=now.getDay();const diff=now.getDate()-day+(day===0?-6:1);const d=new Date(now);d.setDate(diff+i);return d; }
  function getDefaultState() { return { weekKey:getWeekKey(), hitos:[], days:{0:{foco:[],ops:[]},1:{foco:[],ops:[]},2:{foco:[],ops:[]},3:{foco:[],ops:[]},4:{foco:[],ops:[]}}, notes:[] }; }
  function uid() { return Math.random().toString(36).slice(2,10); }
  function snap() { return JSON.parse(JSON.stringify(state)); }
  function getDayData(idx) { const i=idx!==undefined?idx:(activeTab==='today'?getTodayIndex():currentWeekDay); if(!state.days[i])state.days[i]={foco:[],ops:[]};return state.days[i]; }

  async function loadFromSupabase() {
    if (!currentUser) return;
    const weekKey = getWeekKey();
    const [{data:hitos},{data:tasks},{data:notes}] = await Promise.all([
      sb.from('hitos').select('*').eq('user_id',currentUser.id).eq('week_key',weekKey).order('position'),
      sb.from('tasks').select('*').eq('user_id',currentUser.id).eq('week_key',weekKey).order('position'),
      sb.from('notes').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false})
    ]);
    state.hitos=(hitos||[]).map(h=>({id:h.id,emoji:h.emoji,text:h.text}));
    state.days={0:{foco:[],ops:[]},1:{foco:[],ops:[]},2:{foco:[],ops:[]},3:{foco:[],ops:[]},4:{foco:[],ops:[]}};
    (tasks||[]).forEach(t=>{if(!state.days[t.day_index])state.days[t.day_index]={foco:[],ops:[]};state.days[t.day_index][t.group_name].push({id:t.id,text:t.text,note:t.note||'',done:t.done});});
    state.notes=(notes||[]).map(n=>({id:n.id,title:n.title,body:n.body,createdAt:n.created_at}));
    render();
  }

  async function saveTask(task,group,dayIndex) {
    if (!currentUser) return;
    const {data}=await sb.from('tasks').upsert({
      id:task.id&&task.id.length>10?task.id:undefined,
      user_id:currentUser.id,week_key:getWeekKey(),
      day_index:dayIndex,group_name:group,
      text:task.text,note:task.note||'',done:task.done,position:0
    },{onConflict:'id'}).select().single();
    if(data&&task.id!==data.id)task.id=data.id;
  }

  async function deleteTask(taskId){if(!currentUser)return;await sb.from('tasks').delete().eq('id',taskId);}

  async function saveHito(hito){
    if(!currentUser)return;
    const{data}=await sb.from('hitos').upsert({
      id:hito.id&&hito.id.length>10?hito.id:undefined,
      user_id:currentUser.id,week_key:getWeekKey(),
      emoji:hito.emoji,text:hito.text,position:0
    },{onConflict:'id'}).select().single();
    if(data&&hito.id!==data.id)hito.id=data.id;
  }

  async function deleteHito(hitoId){if(!currentUser)return;await sb.from('hitos').delete().eq('id',hitoId);}

  function showLoginScreen(){
    document.querySelector('.tabs').style.display='none';
    document.querySelectorAll('.view').forEach(v=>v.style.display='none');
    let el=document.getElementById('login-screen');
    if(!el){
      el=document.createElement('div');el.id='login-screen';
      el.innerHTML='<div style="font-size:48px;margin-bottom:16px;">🎯</div><div style="font-size:28px;font-weight:700;margin-bottom:6px;letter-spacing:-0.04em;">FocusWeek</div><div style="font-size:14px;color:var(--text-tertiary);margin-bottom:40px;">Tu semana, organizada.</div><input id="login-email" type="email" placeholder="tu@email.com"><button id="login-btn">Entrar con email</button><div id="login-msg"></div>';
      document.querySelector('.app').appendChild(el);
    }
    el.style.display='block';
    document.getElementById('login-btn').onclick=async()=>{
      const email=document.getElementById('login-email').value.trim();
      const msg=document.getElementById('login-msg');
      if(!email){msg.textContent='Ingresá tu email';msg.style.display='block';return;}
      const btn=document.getElementById('login-btn');
      btn.disabled=true;btn.textContent='Enviando...';
      const{error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:'https://focus-week-nine.vercel.app'}});
      if(error){msg.innerHTML='Error: '+error.message;msg.style.display='block';btn.disabled=false;btn.textContent='Entrar con email';}
      else{msg.innerHTML='✅ Revisá tu email <b>'+email+'</b><br>Te mandamos un link para entrar.';msg.style.display='block';btn.textContent='Link enviado';}
    };
    document.getElementById('login-email').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('login-btn').click();});
  }

  function showApp(){
    const el=document.getElementById('login-screen');if(el)el.style.display='none';
    document.querySelector('.tabs').style.display='';
    document.getElementById('view-'+activeTab).style.display='block';
    document.getElementById('avatar').textContent=(currentUser.email||'T')[0].toUpperCase();
    document.getElementById('avatar').onclick=async()=>{if(confirm('¿Cerrar sesión?'))await sb.auth.signOut();};
    loadFromSupabase();
  }

  function render(){
    if(activeTab==='today')renderToday();
    if(activeTab==='week')renderWeek();
    if(activeTab==='notes')renderNotes();
  }

  function renderToday(){
    // Header con fecha
    const todayIdx=getTodayIndex();
    const d=getFullDate(todayIdx);
    const headerEl=document.getElementById('today-date');
    if(headerEl)headerEl.textContent=DAYS[todayIdx]+' '+d.getDate()+' de '+MONTHS[d.getMonth()];
    // Subtitle con progreso
    const day=getDayData(todayIdx);
    const all=[...day.foco,...day.ops];
    const done=all.filter(t=>t.done).length;
    const subEl=document.getElementById('today-subtitle');
    if(subEl)subEl.textContent=all.length?done+' de '+all.length+' tareas completadas':'Agregá tus tareas del día';
    renderHitos();
    renderTaskList('foco',day.foco,'list-foco','bar-foco','pct-foco','#C0392B',todayIdx);
    renderTaskList('ops',day.ops,'list-ops','bar-ops','pct-ops','#6C63FF',todayIdx);
  }

  function renderHitos(){
    const list=document.getElementById('hitos-list');if(!list)return;
    list.innerHTML='';
    (state.hitos||[]).forEach(h=>{const li=document.createElement('li');li.className='hito';li.innerHTML='<span class="hito-emoji">'+(h.emoji||'🎯')+'</span><span style="color:var(--text-secondary)">'+h.text+'</span>';list.appendChild(li);});
    if(!state.hitos.length)list.innerHTML='<li class="hito" style="color:var(--text-tertiary);font-style:italic;">Sin hitos. Clickeá Editar.</li>';
  }

  function renderTaskList(group,tasks,listId,barId,pctId,color,dayIdx){
    const el=document.getElementById(listId);if(!el)return;
    el.innerHTML='';
    const total=tasks.length,done=tasks.filter(t=>t.done).length;
    const pct=total?Math.round((done/total)*100):0;
    const bar=document.getElementById(barId),pctEl=document.getElementById(pctId);
    if(bar){bar.style.width=pct+'%';bar.style.background=pct===100&&total>0?'#1DB954':color;}
    if(pctEl)pctEl.textContent=pct+'%';
    tasks.forEach((t,idx)=>{
      const ind=document.createElement('div');ind.className='drop-indicator';ind.dataset.group=group;ind.dataset.pos=String(idx);ind.dataset.day=String(dayIdx);
      el.appendChild(ind);el.appendChild(makeTaskEl(t,idx,group,dayIdx));
    });
    const lastInd=document.createElement('div');lastInd.className='drop-indicator';lastInd.dataset.group=group;lastInd.dataset.pos=String(tasks.length);lastInd.dataset.day=String(dayIdx);
    el.appendChild(lastInd);
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>handleDrop(e,dayIdx));
  }

  function makeTaskEl(t,idx,group,dayIdx){
    const isEdit=editId===t.id,isNoteEdit=editNoteId===t.id;
    const div=document.createElement('div');div.className='task'+(t.done?' done':'')+(isEdit||isNoteEdit?' editing':'');
    const grip=document.createElement('div');grip.className='grip';
    grip.innerHTML='<div class="grip-row"><div class="grip-dot"></div><div class="grip-dot"></div></div>'.repeat(3);
    grip.draggable=true;
    grip.addEventListener('dragstart',e=>{dragState={group,idx,dayIdx};div.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(div,0,0);});
    grip.addEventListener('dragend',()=>{div.classList.remove('dragging');clearIndicators();dragState=null;});
    div.appendChild(grip);
    div.addEventListener('dragover',e=>{e.preventDefault();if(!dragState)return;clearIndicators();const r=div.getBoundingClientRect();const pos=e.clientY<r.top+r.height/2?idx:idx+1;const ind=div.parentElement.querySelector('.drop-indicator[data-pos="'+pos+'"]');if(ind)ind.classList.add('visible');dropTarget={group,pos,dayIdx};});
    div.addEventListener('drop',e=>handleDrop(e,dayIdx));
    const cb=document.createElement('div');cb.className='cb';
    if(t.done)cb.innerHTML='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    cb.addEventListener('click',async e=>{e.stopPropagation();t.done=!t.done;await saveTask(t,group,dayIdx);render();});
    div.appendChild(cb);
    const content=document.createElement('div');content.className='task-content';
    if(isEdit){
      const inp=document.createElement('input');inp.className='edit-input';inp.id='ei-'+t.id;inp.value=t.text;
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')cancelEdit();});
      inp.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(inp);setTimeout(()=>{inp.focus();inp.selectionStart=inp.value.length;},10);
    } else {
      const txt=document.createElement('div');txt.className='task-text';txt.textContent=t.text;
      content.appendChild(txt);
      content.addEventListener('click',e=>{if(e.target.closest('[data-addnote]'))return;e.stopPropagation();startEdit(t.id,group,dayIdx);});
    }
    if(isNoteEdit){
      const ni=document.createElement('input');ni.className='note-input';ni.id='ni-'+t.id;ni.value=t.note||'';ni.placeholder='Agregar nota...';
      ni.addEventListener('keydown',e=>{if(e.key==='Enter')commitNoteEdit();if(e.key==='Escape')cancelNoteEdit();});
      ni.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(ni);setTimeout(()=>ni.focus(),10);
    } else if(t.note&&!t.done){
      const noteEl=document.createElement('div');noteEl.className='task-note';noteEl.dataset.addnote='1';noteEl.textContent=t.note;
      noteEl.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group,dayIdx);});
      content.appendChild(noteEl);
    } else if(!t.done&&!isEdit){
      const btn=document.createElement('button');btn.className='add-note-btn';btn.dataset.addnote='1';btn.textContent='+ nota';
      btn.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group,dayIdx);});
      content.appendChild(btn);
    }
    div.appendChild(content);
    const actions=document.createElement('div');actions.className='task-actions';
    if(isEdit||isNoteEdit)actions.style.opacity='1';
    const editBtn=document.createElement('button');editBtn.className='ib';editBtn.textContent='✏️';
    editBtn.addEventListener('click',e=>{e.stopPropagation();isEdit?commitEdit():startEdit(t.id,group,dayIdx);});
    const delBtn=document.createElement('button');delBtn.className='ib';delBtn.textContent='🗑️';
    delBtn.addEventListener('click',async e=>{
      e.stopPropagation();
      const taskCopy={...t};
      getDayData(dayIdx)[group].splice(idx,1);
      await deleteTask(t.id);
      render();
      showUndo(t.text,taskCopy,group,dayIdx);
    });
    actions.appendChild(editBtn);actions.appendChild(delBtn);div.appendChild(actions);
    return div;
  }

  async function handleDrop(e,dayIdx){
    e.preventDefault();if(!dragState||!dropTarget)return;
    const srcDay=dragState.dayIdx,dstDay=dropTarget.dayIdx!==undefined?dropTarget.dayIdx:dayIdx;
    const srcData=getDayData(srcDay),dstData=getDayData(dstDay);
    const item=srcData[dragState.group].splice(dragState.idx,1)[0];
    let toPos=dropTarget.pos;
    if(dragState.group===dropTarget.group&&srcDay===dstDay&&dragState.idx<toPos)toPos--;
    dstData[dropTarget.group].splice(toPos,0,item);
    const finalGroup=dropTarget.group;
    dragState=null;dropTarget=null;clearIndicators();
    await saveTask(item,finalGroup,dstDay);render();
  }

  function clearIndicators(){document.querySelectorAll('.drop-indicator').forEach(el=>el.classList.remove('visible'));}

  function startEdit(id,group,dayIdx){if(editId||editNoteId)commitEdit();editId=id;editGroup=group;editDayIdx=dayIdx;render();}
  let editDayIdx=null;

  async function commitEdit(){
    if(!editId)return;
    const inp=document.getElementById('ei-'+editId);
    if(inp&&inp.value.trim()){
      const day=getDayData(editDayIdx);const task=day[editGroup].find(t=>t.id===editId);
      if(task){task.text=inp.value.trim();await saveTask(task,editGroup,editDayIdx);}
    }
    editId=null;editGroup=null;editDayIdx=null;render();
  }

  function cancelEdit(){editId=null;editGroup=null;editDayIdx=null;render();}

  function startNoteEdit(id,group,dayIdx){if(editId)commitEdit();if(editNoteId)commitNoteEdit();editNoteId=id;editNoteGroup=group;editNoteDay=dayIdx;render();}
  let editNoteDay=null;

  async function commitNoteEdit(){
    if(!editNoteId)return;
    const inp=document.getElementById('ni-'+editNoteId);
    if(inp){
      const day=getDayData(editNoteDay);const task=day[editNoteGroup].find(t=>t.id===editNoteId);
      if(task){task.note=inp.value.trim();await saveTask(task,editNoteGroup,editNoteDay);}
    }
    editNoteId=null;editNoteGroup=null;editNoteDay=null;render();
  }

  function cancelNoteEdit(){editNoteId=null;editNoteGroup=null;editNoteDay=null;render();}

  function showUndo(label,taskCopy,group,dayIdx){
    clearTimeout(undoTimer);
    undoQueue.push({label,taskCopy,group,dayIdx});
    const bar=document.getElementById('undo-bar'),txt=document.getElementById('undo-text');
    if(bar&&txt){
      txt.textContent='"'+(label.length>28?label.slice(0,28)+'…':label)+'" eliminada';
      bar.style.display='flex';
      undoTimer=setTimeout(()=>{bar.style.display='none';undoQueue=[];},5000);
    }
  }

  function renderWeek(){
    const now=new Date();
    const weekEl=document.getElementById('week-title');
    if(weekEl)weekEl.textContent='Semana del '+getDateLabel(0)+' al '+getDateLabel(4)+' de '+MONTHS[now.getMonth()];
    const strip=document.getElementById('week-strip');
    if(strip){
      strip.innerHTML='';const todayIdx=getTodayIndex();
      DAYS.forEach((name,i)=>{
        const pill=document.createElement('div');
        const dayData=state.days[i]||{foco:[],ops:[]};
        const all=[...dayData.foco,...dayData.ops];
        const hasTasks=all.length>0;
        pill.className='day-pill'+(i===todayIdx?' today':'')+(i===currentWeekDay?' selected':'')+(hasTasks?' has-tasks':'');
        pill.innerHTML='<span class="day-label">'+DAY_LETTERS[i]+'</span><div class="day-num">'+getDateLabel(i)+'</div><div class="day-dot"></div>';
        pill.addEventListener('click',()=>{currentWeekDay=i;renderWeek();});
        strip.appendChild(pill);
      });
    }
    // Progress section
    const prog=document.getElementById('week-progress');
    if(prog){
      prog.innerHTML='<div class="week-progress-title">progreso semanal</div>';
      DAYS.forEach((name,i)=>{
        const dayData=state.days[i]||{foco:[],ops:[]};
        const all=[...dayData.foco,...dayData.ops];
        const total=all.length,done=all.filter(t=>t.done).length;
        const pct=total?Math.round((done/total)*100):0;
        const row=document.createElement('div');row.style.cssText='display:flex;gap:8px;align-items:center;margin-bottom:7px;';
        const isToday=i===getTodayIndex();
        row.innerHTML='<div style="font-size:11px;color:'+(isToday?'var(--accent)':'var(--text-secondary)')+';width:16px;font-family:var(--mono);font-weight:'+(isToday?'700':'400')+'">'+DAY_LETTERS[i]+'</div><div style="flex:1;height:5px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="width:'+pct+'%;height:100%;background:'+(isToday?'var(--accent)':'var(--text-tertiary)')+';border-radius:3px;transition:width 0.4s"></div></div><div style="font-size:11px;font-family:var(--mono);color:var(--text-tertiary);min-width:30px;text-align:right">'+(total?pct+'%':'—')+'</div>';
        prog.appendChild(row);
      });
    }
    // Day tasks section
    const dayName=document.getElementById('week-day-name');
    const dayStats=document.getElementById('week-day-stats');
    const d=getFullDate(currentWeekDay);
    if(dayName)dayName.textContent=DAYS[currentWeekDay]+' '+d.getDate();
    const dayData=state.days[currentWeekDay]||{foco:[],ops:[]};
    const allTasks=[...dayData.foco,...dayData.ops];
    const doneTasks=allTasks.filter(t=>t.done).length;
    if(dayStats)dayStats.textContent=allTasks.length?doneTasks+'/'+allTasks.length+' completadas':'sin tareas';
    // Render task lists for selected day
    renderTaskList('foco',dayData.foco,'week-list-foco','week-bar-foco','week-pct-foco','#C0392B',currentWeekDay);
    renderTaskList('ops',dayData.ops,'week-list-ops','week-bar-ops','week-pct-ops','#6C63FF',currentWeekDay);
  }

  function renderNotes(){
    const list=document.getElementById('notes-list');if(!list)return;list.innerHTML='';
    if(!state.notes.length){list.innerHTML='<div style="font-size:13px;color:var(--text-tertiary);padding:20px 0;text-align:center;">Sin notas todavía.<br>Clickeá + Nueva para crear una.</div>';return;}
    state.notes.forEach(n=>{
      const card=document.createElement('div');card.className='note-card';
      const date=new Date(n.createdAt);
      const dateStr=date.toLocaleDateString('es',{weekday:'short',day:'numeric',month:'short'})+' · '+date.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      card.innerHTML='<div class="note-title">'+(n.title||'Sin título')+'</div><div class="note-preview">'+(n.body||'').slice(0,120)+((n.body||'').length>120?'…':'')+'</div><div class="note-date">'+dateStr+'</div>';
      card.addEventListener('click',()=>openNoteModal(n));
      list.appendChild(card);
    });
  }

  function openNoteModal(note){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');if(!modal)return;
    title.textContent=note?'Editar nota':'Nueva nota';
    body.innerHTML='<input type="text" id="note-title-input" placeholder="Título..." value="'+(note?note.title||'':'')+'"><textarea id="note-body-input" placeholder="Escribí tu nota acá...">'+(note?note.body||'':'')+'</textarea>';
    modal.style.display='flex';
    document.getElementById('modal-save').onclick=async()=>{
      const titleVal=document.getElementById('note-title-input').value.trim();
      const bodyVal=document.getElementById('note-body-input').value.trim();
      if(note){const n=state.notes.find(x=>x.id===note.id);if(n){n.title=titleVal;n.body=bodyVal;}await sb.from('notes').update({title:titleVal,body:bodyVal,updated_at:new Date().toISOString()}).eq('id',note.id);}
      else{const{data}=await sb.from('notes').insert({user_id:currentUser.id,title:titleVal,body:bodyVal}).select().single();if(data)state.notes.unshift({id:data.id,title:data.title,body:data.body,createdAt:data.created_at});}
      modal.style.display='none';renderNotes();
    };
    const doClose=()=>{modal.style.display='none';};
    document.getElementById('modal-cancel').onclick=doClose;
    document.getElementById('modal-close').onclick=doClose;
  }

  function openHitosModal(){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');if(!modal)return;
    title.textContent='Hitos de la semana';
    body.innerHTML='<div id="hito-edit-list"></div><button class="btn-ghost" id="add-hito-btn" style="margin-top:8px;">+ Agregar hito</button>';
    renderHitoEditList();modal.style.display='flex';
    document.getElementById('add-hito-btn').onclick=async()=>{const newHito={id:uid(),emoji:'🎯',text:'Nuevo hito'};state.hitos.push(newHito);await saveHito(newHito);renderHitoEditList();};
    document.getElementById('modal-save').onclick=async()=>{await Promise.all(state.hitos.map(h=>saveHito(h)));modal.style.display='none';render();};
    const doClose=()=>{modal.style.display='none';render();};
    document.getElementById('modal-cancel').onclick=doClose;document.getElementById('modal-close').onclick=doClose;
  }

  function renderHitoEditList(){
    const list=document.getElementById('hito-edit-list');if(!list)return;list.innerHTML='';
    state.hitos.forEach((h,idx)=>{
      const row=document.createElement('div');row.className='hito-edit-row';
      const sel=document.createElement('select');sel.style.cssText='font-size:16px;border:0.5px solid var(--border);border-radius:6px;padding:4px;background:var(--bg);cursor:pointer;color:var(--text);';
      HITO_EMOJIS.forEach(em=>{const opt=document.createElement('option');opt.value=em;opt.textContent=em;if(em===h.emoji)opt.selected=true;sel.appendChild(opt);});
      sel.addEventListener('change',()=>{h.emoji=sel.value;});
      const inp=document.createElement('input');inp.type='text';inp.value=h.text;
      inp.style.cssText='flex:1;padding:8px 12px;font-size:14px;font-family:var(--font);border:0.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);outline:none;';
      inp.addEventListener('input',()=>{h.text=inp.value;});
      const del=document.createElement('button');del.textContent='🗑️';del.className='ib';
      del.addEventListener('click',async()=>{await deleteHito(h.id);state.hitos.splice(idx,1);renderHitoEditList();});
      row.appendChild(sel);row.appendChild(inp);row.appendChild(del);list.appendChild(row);
    });
  }

  async function addTask(group,dayIdx){
    const inputId=dayIdx===getTodayIndex()&&activeTab==='today'?'add-'+group:'week-add-'+group;
    const inp=document.getElementById(inputId);if(!inp||!inp.value.trim())return;
    const task={id:uid(),text:inp.value.trim(),done:false,note:''};
    getDayData(dayIdx)[group].push(task);inp.value='';
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
    // Today add buttons
    document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.add,getTodayIndex())));
    ['foco','ops'].forEach(g=>{const inp=document.getElementById('add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g,getTodayIndex());});});
    // Week add buttons
    document.querySelectorAll('[data-week-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.weekAdd,currentWeekDay)));
    ['foco','ops'].forEach(g=>{const inp=document.getElementById('week-add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g,currentWeekDay);});});

    document.getElementById('edit-hitos')?.addEventListener('click',openHitosModal);
    document.getElementById('new-note')?.addEventListener('click',()=>openNoteModal(null));

    // UNDO FIX
    document.getElementById('undo-btn')?.addEventListener('click',async()=>{
      if(!undoQueue.length)return;
      const entry=undoQueue.pop();
      if(entry.taskCopy&&entry.group!==undefined&&entry.dayIdx!==undefined){
        const{data}=await sb.from('tasks').insert({
          user_id:currentUser.id,week_key:getWeekKey(),
          day_index:entry.dayIdx,group_name:entry.group,
          text:entry.taskCopy.text,note:entry.taskCopy.note||'',
          done:entry.taskCopy.done,position:0
        }).select().single();
        if(data){
          if(!state.days[entry.dayIdx])state.days[entry.dayIdx]={foco:[],ops:[]};
          state.days[entry.dayIdx][entry.group].push({id:data.id,text:data.text,note:data.note||'',done:data.done});
        }
      }
      clearTimeout(undoTimer);document.getElementById('undo-bar').style.display='none';undoQueue=[];render();
    });

    document.addEventListener('mousedown',e=>{
      if(editId){const inp=document.getElementById('ei-'+editId);if(inp&&inp.contains(e.target))return;if(e.target.closest('[data-edit]'))return;commitEdit();}
      if(editNoteId){const inp=document.getElementById('ni-'+editNoteId);if(inp&&inp.contains(e.target))return;if(e.target.closest('[data-addnote]'))return;commitNoteEdit();}
    });
    document.getElementById('modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('modal'))document.getElementById('modal').style.display='none';});
  }

  async function init(){
    initEvents();
    const{data:{session}}=await sb.auth.getSession();
    if(session?.user){currentUser=session.user;showApp();}
    else{showLoginScreen();}
    sb.auth.onAuthStateChange((_event,session)=>{
      if(session?.user){currentUser=session.user;showApp();}
      else{currentUser=null;state=getDefaultState();showLoginScreen();}
    });
  }

  init();
})();
