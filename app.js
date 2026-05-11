(function () {
  const SUPABASE_URL = 'https://fssejxjrmhnubqvbkqjf.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzc2VqeGpybWhudWJxdmJrcWpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NDg2NzUsImV4cCI6MjA5MjIyNDY3NX0.Bb7SK1lBEzA__-ceXK9Z4-bcd_rBHXIsIWNv_iHn1rY';
  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'focusweek_auth' }
  });

  const DAYS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  const DAYS_SHORT = ['D','L','M','X','J','V','S'];
  const MONTHS = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const HITO_EMOJIS = ['🎯','📊','📱','🌐','⚡','🔥','💡','✅'];
  const DAYS_BACK = 15, DAYS_FORWARD = 30;
  const TAGS = ['Alta','Media','Baja','Personal'];
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
  let td = null, tdClone = null;

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function dateFromOffset(o) { const d = new Date(); d.setDate(d.getDate() + o); return d.toISOString().slice(0, 10); }
  function getWeekKey() { const n=new Date(),day=n.getDay(),diff=n.getDate()-day+(day===0?-6:1),m=new Date(n);m.setDate(diff);return m.toISOString().slice(0,10); }
  function getDefaultState() { return { hitos:[], dayTasks:{}, quickCapture:{trabajo:[],vida:[],carwash:[]}, notes:[] }; }
  function getDayTasks(d) { if(!state.dayTasks[d])state.dayTasks[d]={foco:[],ops:[]};return state.dayTasks[d]; }
  function getTasksArray(group, dayKey) { if(dayKey==='quick-capture')return state.quickCapture[group]||[];return getDayTasks(dayKey)[group]||[]; }
  function uid() { return Math.random().toString(36).slice(2,10); }

  function getListEl(group, dayKey) {
    if(dayKey==='quick-capture')return document.getElementById('qc-list-'+group);
    if(activeTab==='today')return document.getElementById('list-'+group);
    return document.getElementById('scroll-list-'+group);
  }

  // === SESSION COOKIE — iOS PWA fix ===
  function saveSessionCookie(session) {
    if(!session)return;
    const val = JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token});
    const sec = location.protocol==='https:' ? '; Secure' : '';
    document.cookie = 'fw_s='+encodeURIComponent(val)+'; max-age='+(7*24*3600)+'; path=/; SameSite=Lax'+sec;
  }
  function clearSessionCookie() { document.cookie = 'fw_s=; max-age=0; path=/; SameSite=Lax'; }
  function getSessionCookie() {
    const m = document.cookie.match(/(?:^|;\s*)fw_s=([^;]+)/);
    if(!m)return null;
    try{return JSON.parse(decodeURIComponent(m[1]));}catch{return null;}
  }

  // === AUTO WEEK CLOSE ===
  function checkAutoWeekClose() {
    const today = new Date();
    if(today.getDay()!==1)return;
    const mondayStr = getWeekKey();
    if(localStorage.getItem('fw_wc')===mondayStr)return;
    const prevM=new Date(today);prevM.setDate(today.getDate()-7);
    const prevS=new Date(today);prevS.setDate(today.getDate()-1);
    const days=[];
    for(let d=new Date(prevM);d<=prevS;d.setDate(d.getDate()+1))days.push(d.toISOString().slice(0,10));
    const dn=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
    let done=0,all=0,rows='';
    days.forEach((ds,i)=>{
      const dd=state.dayTasks[ds]||{foco:[],ops:[]};
      const a=[...(dd.foco||[]),...(dd.ops||[])];
      const d=a.filter(t=>t.done).length;
      done+=d;all+=a.length;
      if(a.length){const p=Math.round((d/a.length)*100);const c=p===100?'#1DB954':p>=50?'#6C63FF':'#C0392B';
        rows+='<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:12px;color:var(--text-tertiary);width:28px;font-family:var(--mono)">'+dn[i]+'</span><div style="flex:1;height:6px;background:var(--surface2);border-radius:3px;overflow:hidden"><div style="width:'+p+'%;height:100%;background:'+c+';border-radius:3px"></div></div><span style="font-size:11px;font-family:var(--mono);color:var(--text-tertiary);min-width:36px;text-align:right">'+d+'/'+a.length+'</span></div>';}
    });
    const pct=all?Math.round((done/all)*100):0;
    if(!all){localStorage.setItem('fw_wc',mondayStr);return;}
    const modal=document.getElementById('modal');
    document.getElementById('modal-title').textContent='📊 Resumen semana anterior';
    document.getElementById('modal-body').innerHTML='<div style="text-align:center;margin-bottom:20px;"><div style="font-size:48px;font-weight:700;letter-spacing:-0.04em;color:var(--accent)">'+pct+'%</div><div style="font-size:13px;color:var(--text-tertiary);margin-top:4px">'+done+' de '+all+' tareas completadas</div></div>'+(rows||'')+'<div style="margin-top:16px;padding:12px;background:var(--surface2);border-radius:10px;font-size:12px;color:var(--text-tertiary);text-align:center;">¡Nueva semana! 💪</div>';
    document.getElementById('modal-save').style.display='none';
    document.getElementById('modal-cancel').textContent='¡A arrancar!';
    const close=()=>{modal.style.display='none';document.getElementById('modal-save').style.display='';document.getElementById('modal-cancel').textContent='Cancelar';localStorage.setItem('fw_wc',mondayStr);};
    document.getElementById('modal-cancel').onclick=close;document.getElementById('modal-close').onclick=close;
    modal.style.display='flex';
  }

  // === SUPABASE ===
  async function loadFromSupabase() {
    if(!currentUser)return;
    const s=dateFromOffset(-DAYS_BACK),e=dateFromOffset(DAYS_FORWARD),wk=getWeekKey();
    const[{data:h},{data:rt},{data:qc},{data:n}]=await Promise.all([
      sb.from('hitos').select('*').eq('user_id',currentUser.id).eq('week_key',wk).order('position'),
      sb.from('tasks').select('*').eq('user_id',currentUser.id).neq('week_key','quick-capture').gte('week_key',s).lte('week_key',e).order('position'),
      sb.from('tasks').select('*').eq('user_id',currentUser.id).eq('week_key','quick-capture').order('position'),
      sb.from('notes').select('*').eq('user_id',currentUser.id).order('created_at',{ascending:false})
    ]);
    state.hitos=(h||[]).map(x=>({id:x.id,emoji:x.emoji,text:x.text}));
    state.dayTasks={};
    (rt||[]).forEach(t=>{if(!state.dayTasks[t.week_key])state.dayTasks[t.week_key]={foco:[],ops:[]};if(!state.dayTasks[t.week_key][t.group_name])state.dayTasks[t.week_key][t.group_name]=[];state.dayTasks[t.week_key][t.group_name].push({id:t.id,text:t.text,note:t.note||'',done:t.done,tag:t.tag||''});});
    state.quickCapture={trabajo:[],vida:[],carwash:[]};
    (qc||[]).forEach(t=>{if(QC_GROUPS.includes(t.group_name))state.quickCapture[t.group_name].push({id:t.id,text:t.text,note:t.note||'',done:t.done,tag:t.tag||''});});
    state.notes=(n||[]).map(x=>({id:x.id,title:x.title,body:x.body,createdAt:x.created_at}));
    render();
    setTimeout(checkAutoWeekClose,500);
  }

  async function saveTask(task, group, dayKey) {
    if(!currentUser)return;
    const{data}=await sb.from('tasks').upsert({id:task.id&&task.id.length>10?task.id:undefined,user_id:currentUser.id,week_key:dayKey,day_index:0,group_name:group,text:task.text,note:task.note||'',done:task.done,tag:task.tag||'',position:0},{onConflict:'id'}).select().single();
    if(data&&task.id!==data.id)task.id=data.id;
  }
  async function deleteTask(id){if(!currentUser)return;await sb.from('tasks').delete().eq('id',id);}
  async function saveHito(h){if(!currentUser)return;const{data}=await sb.from('hitos').upsert({id:h.id&&h.id.length>10?h.id:undefined,user_id:currentUser.id,week_key:getWeekKey(),emoji:h.emoji,text:h.text,position:0},{onConflict:'id'}).select().single();if(data&&h.id!==data.id)h.id=data.id;}
  async function deleteHito(id){if(!currentUser)return;await sb.from('hitos').delete().eq('id',id);}

  // === LOGIN ===
  function showLoginScreen(){
    document.querySelectorAll('.tabs,.view').forEach(el=>el.style.display='none');
    let el=document.getElementById('login-screen');
    if(!el){el=document.createElement('div');el.id='login-screen';document.querySelector('.app').appendChild(el);}
    el.style.display='block';
    let loginEmail='';

    const showEmailStep=()=>{
      el.innerHTML='<div style="font-size:48px;margin-bottom:16px;">🎯</div><div style="font-size:28px;font-weight:700;margin-bottom:6px;letter-spacing:-0.04em;">FocusWeek</div><div style="font-size:14px;color:var(--text-tertiary);margin-bottom:40px;">Tu semana, organizada.</div><input id="login-email" type="email" placeholder="tu@email.com"><button id="login-btn">Entrar con email</button><div id="login-msg"></div>';
      document.getElementById('login-btn').onclick=async()=>{
        const email=document.getElementById('login-email').value.trim();const msg=document.getElementById('login-msg');
        if(!email){msg.textContent='Ingresá tu email';msg.style.display='block';return;}
        const btn=document.getElementById('login-btn');btn.disabled=true;btn.textContent='Enviando...';
        const{error}=await sb.auth.signInWithOtp({email,options:{shouldCreateUser:true}});
        if(error){msg.innerHTML='Error: '+error.message;msg.style.display='block';btn.disabled=false;btn.textContent='Entrar con email';}
        else{loginEmail=email;showCodeStep(email);}
      };
      document.getElementById('login-email').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('login-btn').click();});
      if(loginEmail)document.getElementById('login-email').value=loginEmail;
    };

    const showCodeStep=(email)=>{
      el.innerHTML='<div style="font-size:40px;margin-bottom:12px;">📬</div><div style="font-size:22px;font-weight:700;margin-bottom:6px;letter-spacing:-0.02em;">Revisá tu email</div><div style="font-size:14px;color:var(--text-tertiary);margin-bottom:6px;">Código de 6 dígitos enviado a</div><div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:28px;">'+email+'</div><input id="otp-input" type="number" inputmode="numeric" placeholder="123456" style="width:100%;max-width:200px;padding:16px;font-size:28px;font-family:var(--mono);text-align:center;background:var(--surface);border:0.5px solid var(--border-strong);border-radius:12px;color:var(--text);outline:none;display:block;margin:0 auto 12px;letter-spacing:0.2em;"><button id="verify-btn" style="padding:13px 32px;border:none;border-radius:12px;background:var(--accent);color:white;font-size:15px;font-family:var(--font);cursor:pointer;font-weight:600;display:block;margin:0 auto 10px;">Verificar código</button><button id="back-btn" style="background:none;border:none;color:var(--text-tertiary);font-size:13px;font-family:var(--font);cursor:pointer;display:block;margin:0 auto;">← Cambiar email</button><div id="otp-msg" style="margin-top:16px;font-size:13px;color:var(--text-secondary);display:none;text-align:center;max-width:280px;margin-left:auto;margin-right:auto;line-height:1.5;"></div>';
      setTimeout(()=>document.getElementById('otp-input')?.focus(),100);
      document.getElementById('verify-btn').onclick=async()=>{
        const code=(document.getElementById('otp-input').value||'').trim();const msg=document.getElementById('otp-msg');
        if(!code||code.length<6){msg.textContent='Ingresá el código de 6 dígitos';msg.style.display='block';return;}
        const btn=document.getElementById('verify-btn');btn.disabled=true;btn.textContent='Verificando...';
        const{data,error}=await sb.auth.verifyOtp({email,token:code,type:'email'});
        if(error){msg.innerHTML='❌ Código incorrecto o expirado.<br>Pedí un nuevo código.';msg.style.display='block';btn.disabled=false;btn.textContent='Verificar código';}
        else if(data?.session?.user){currentUser=data.session.user;saveSessionCookie(data.session);showApp();}
      };
      document.getElementById('otp-input').addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('verify-btn').click();});
      document.getElementById('otp-input').addEventListener('input',e=>{if(e.target.value.length>=6)document.getElementById('verify-btn').click();});
      document.getElementById('back-btn').onclick=()=>showEmailStep();
    };

    showEmailStep();
  }
  
  function showApp(){
    const el=document.getElementById('login-screen');if(el)el.style.display='none';
    document.querySelector('.tabs').style.display='';
    switchTab(activeTab,false);
    document.getElementById('avatar').textContent=(currentUser.email||'T')[0].toUpperCase();
    document.getElementById('avatar').onclick=async()=>{if(confirm('¿Cerrar sesión?')){clearSessionCookie();await sb.auth.signOut();}};
    loadFromSupabase();
  }

  function switchTab(tab,doRender){
    activeTab=tab;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
    document.querySelectorAll('.view').forEach(v=>{v.classList.remove('active');v.style.display='none';});
    const av=document.getElementById('view-'+tab);if(av){av.classList.add('active');av.style.display='block';}
    if(doRender!==false)render();
  }

  function render(){
    if(activeTab==='today')renderToday();
    else if(activeTab==='week')renderScrollableWeek();
    else if(activeTab==='pending')renderPending();
    else if(activeTab==='capture')renderQuickCapture();
    else if(activeTab==='notes')renderNotes();
  }

  function renderToday(){
    const today=todayStr();const d=new Date();
    const hEl=document.getElementById('today-date');if(hEl)hEl.textContent=DAYS_ES[d.getDay()]+' '+d.getDate()+' de '+MONTHS[d.getMonth()];
    const dt=getDayTasks(today);
    let all=[...dt.foco,...dt.ops];if(activeTagFilter)all=all.filter(t=>t.tag===activeTagFilter);
    const done=all.filter(t=>t.done).length;
    const sub=document.getElementById('today-subtitle');if(sub)sub.textContent=all.length?done+' de '+all.length+' tareas completadas':'Agregá tus tareas del día';
    renderHitos();
    const ff=activeTagFilter?dt.foco.filter(t=>t.tag===activeTagFilter):dt.foco;
    const fo=activeTagFilter?dt.ops.filter(t=>t.tag===activeTagFilter):dt.ops;
    renderTaskList('foco',ff,'list-foco','bar-foco','pct-foco','#C0392B',today);
    renderTaskList('ops',fo,'list-ops','bar-ops','pct-ops','#6C63FF',today);
  }

  function renderHitos(){
    const list=document.getElementById('hitos-list');if(!list)return;list.innerHTML='';
    (state.hitos||[]).forEach(h=>{const li=document.createElement('li');li.className='hito';li.innerHTML='<span class="hito-emoji">'+(h.emoji||'🎯')+'</span><span style="color:var(--text-secondary)">'+h.text+'</span>';list.appendChild(li);});
    if(!state.hitos.length)list.innerHTML='<li class="hito" style="color:var(--text-tertiary);font-style:italic;">Sin hitos. Clickeá Editar.</li>';
  }

  // FIX 4: renderPending con swipe-to-delete
  function renderPending(){
    const list=document.getElementById('pending-list'),empty=document.getElementById('pending-empty');if(!list)return;
    list.innerHTML='';
    const today=todayStr();const groups=[];
    for(let i=1;i<=7;i++){
      const ds=dateFromOffset(-i);if(ds>=today)continue;
      const dd=state.dayTasks[ds]||{foco:[],ops:[]};
      const pending=[...(dd.foco||[]),...(dd.ops||[])].filter(t=>!t.done);
      if(pending.length>0)groups.push({dateStr:ds,tasks:pending});
    }
    if(!groups.length){if(empty)empty.style.display='block';return;}
    if(empty)empty.style.display='none';
    groups.forEach(({dateStr,tasks})=>{
      const d=new Date(dateStr+'T12:00:00');
      const label=document.createElement('div');label.className='pending-date-label';
      label.textContent=DAYS_ES[d.getDay()]+' '+d.getDate()+' de '+MONTHS[d.getMonth()];list.appendChild(label);
      tasks.forEach(t=>{
        // Swipe wrapper
        const rowWrap=document.createElement('div');
        rowWrap.style.cssText='position:relative;overflow:hidden;border-radius:10px;margin-bottom:8px;background:var(--bg);';
        const rowDelBg=document.createElement('div');
        rowDelBg.style.cssText='position:absolute;right:0;top:0;bottom:0;width:80px;background:#e74c3c;display:flex;align-items:center;justify-content:center;font-size:20px;border-radius:0 10px 10px 0;';
        rowDelBg.textContent='🗑️';
        rowWrap.appendChild(rowDelBg);

        const row=document.createElement('div');
        row.className='pending-task';
        row.style.cssText='position:relative;z-index:1;background:var(--surface);border-radius:10px;margin-bottom:0;transition:transform 0.2s;';
        const cb=document.createElement('div');cb.className='cb';
        const complete=async()=>{
          cb.innerHTML='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
          cb.style.background='var(--green)';cb.style.borderColor='var(--green)';
          row.style.opacity='0.5';
          const grp=(state.dayTasks[dateStr]?.foco||[]).find(x=>x.id===t.id)?'foco':'ops';
          t.done=true;await saveTask(t,grp,dateStr);
          setTimeout(()=>{row.style.opacity='0';setTimeout(()=>renderPending(),350);},450);
        };
        cb.addEventListener('click',e=>{e.stopPropagation();complete();});
        cb.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();complete();});
        row.appendChild(cb);
        const c=document.createElement('div');c.className='task-content';
        c.innerHTML='<div class="task-text">'+t.text+'</div>'+(t.tag?'<span class="tag-badge '+t.tag.toLowerCase()+'">'+t.tag+'</span>':'');
        row.appendChild(c);

        // Swipe to delete
        let pSwX=0,pSwDx=0;
        row.addEventListener('touchstart',e=>{pSwX=e.touches[0].clientX;},{passive:true});
        row.addEventListener('touchmove',e=>{
          pSwDx=e.touches[0].clientX-pSwX;
          if(pSwDx<0){row.style.transition='none';row.style.transform='translateX('+Math.max(-88,pSwDx)+'px)';}
        },{passive:true});
        row.addEventListener('touchend',async()=>{
          row.style.transition='transform 0.2s';
          if(pSwDx<-70){
            row.style.transform='translateX(-110%)';
            setTimeout(async()=>{
              const grp2=(state.dayTasks[dateStr]?.foco||[]).find(x=>x.id===t.id)?'foco':'ops';
              const arr=getTasksArray(grp2,dateStr);const idx2=arr.findIndex(x=>x.id===t.id);
              if(idx2>=0){arr.splice(idx2,1);await deleteTask(t.id);showUndo(t.text,{...t},grp2,dateStr);}
              renderPending();
            },200);return;
          }
          row.style.transform='';pSwDx=0;
        },{passive:true});

        rowWrap.appendChild(row);list.appendChild(rowWrap);
      });
    });
  }

  function renderScrollableWeek(){
    const strip=document.getElementById('day-scroll-strip');if(!strip)return;
    const today=todayStr();strip.innerHTML='';
    for(let o=-DAYS_BACK;o<=DAYS_FORWARD;o++){
      const ds=dateFromOffset(o);const d=new Date(ds+'T12:00:00');const dow=d.getDay();
      const dd=state.dayTasks[ds]||{foco:[],ops:[]};const ht=(dd.foco||[]).length>0||(dd.ops||[]).length>0;
      const pill=document.createElement('div');
      pill.className='scroll-day-pill'+(ds===today?' today':'')+(ds===selectedDate?' selected':'')+(ht?' has-tasks':'')+(dow===0||dow===6?' weekend':'');
      pill.innerHTML='<span class="scroll-day-letter">'+DAYS_SHORT[dow]+'</span><div class="scroll-day-num">'+d.getDate()+'</div><div class="day-dot"></div>';
      pill.addEventListener('click',()=>{selectedDate=ds;renderScrollableWeek();});
      strip.appendChild(pill);
    }
    const sp=strip.querySelector('.selected');if(sp)setTimeout(()=>sp.scrollIntoView({inline:'center',behavior:'smooth',block:'nearest'}),50);
    const d=new Date(selectedDate+'T12:00:00');
    const dl=document.getElementById('scroll-day-label');if(dl)dl.textContent=DAYS_ES[d.getDay()]+' '+d.getDate()+' de '+MONTHS[d.getMonth()];
    const dd=getDayTasks(selectedDate);const all=[...dd.foco,...dd.ops];const done=all.filter(t=>t.done).length;
    const st=document.getElementById('scroll-day-stats');if(st)st.textContent=all.length?done+'/'+all.length+' completadas':'sin tareas';
    renderTaskList('foco',dd.foco,'scroll-list-foco','scroll-bar-foco','scroll-pct-foco','#C0392B',selectedDate);
    renderTaskList('ops',dd.ops,'scroll-list-ops','scroll-bar-ops','scroll-pct-ops','#6C63FF',selectedDate);
  }

  function renderQuickCapture(){
    renderTaskList('trabajo',state.quickCapture.trabajo,'qc-list-trabajo','qc-bar-trabajo','qc-pct-trabajo','#C0392B','quick-capture');
    renderTaskList('vida',state.quickCapture.vida,'qc-list-vida','qc-bar-vida','qc-pct-vida','#6C63FF','quick-capture');
    renderTaskList('carwash',state.quickCapture.carwash,'qc-list-carwash','qc-bar-carwash','qc-pct-carwash','#1DB954','quick-capture');
  }

  function renderTaskList(group, tasks, listId, barId, pctId, color, dayKey){
    const el=document.getElementById(listId);if(!el)return;el.innerHTML='';
    const total=tasks.length,done=tasks.filter(t=>t.done).length;
    const pct=total?Math.round((done/total)*100):0;
    const bar=document.getElementById(barId),pe=document.getElementById(pctId);
    if(bar){bar.style.width=pct+'%';bar.style.background=pct===100&&total>0?'#1DB954':color;}
    if(pe)pe.textContent=pct+'%';
    tasks.forEach((t,idx)=>{
      const ind=document.createElement('div');ind.className='drop-indicator';ind.dataset.group=group;ind.dataset.pos=String(idx);
      el.appendChild(ind);el.appendChild(makeTaskEl(t,idx,group,dayKey));
    });
    const li=document.createElement('div');li.className='drop-indicator';li.dataset.group=group;li.dataset.pos=String(tasks.length);
    el.appendChild(li);
    el.addEventListener('dragover',e=>e.preventDefault());
    el.addEventListener('drop',e=>handleDrop(e,group,dayKey));
  }

  function makeTaskEl(t, idx, group, dayKey){
    const isEdit=editId===t.id,isNoteEdit=editNoteId===t.id;

    // FIX 1: Removed doneBg entirely. Outer wrapper only has delBg.
    const wrap=document.createElement('div');
    wrap.className='task-wrap';
    wrap.style.background='var(--bg)'; // Prevents see-through effect

    // Delete background (reveals on left swipe)
    const delBg=document.createElement('div');
    delBg.style.cssText='position:absolute;right:0;top:0;bottom:0;width:100%;display:flex;align-items:center;justify-content:flex-end;padding-right:20px;font-size:22px;border-radius:10px;pointer-events:none;opacity:0;';
    delBg.textContent='🗑️';
    wrap.appendChild(delBg);

    // INNER TASK
    const div=document.createElement('div');
    div.className='task'+(t.done?' done':'')+(isEdit||isNoteEdit?' editing':'');

    div.addEventListener('dragover',e=>{e.preventDefault();if(!dragState)return;clearIndicators();const r=wrap.getBoundingClientRect();const pos=e.clientY<r.top+r.height/2?idx:idx+1;const ind=wrap.parentElement?.querySelector('.drop-indicator[data-pos="'+pos+'"]');if(ind)ind.classList.add('visible');dropTarget={group,pos,dayKey};});
    div.addEventListener('drop',e=>handleDrop(e,group,dayKey));

    // GRIP
    const grip=document.createElement('div');grip.className='grip';
    grip.innerHTML='<div class="grip-row"><div class="grip-dot"></div><div class="grip-dot"></div></div>'.repeat(3);
    grip.draggable=true;
    grip.addEventListener('dragstart',e=>{dragState={group,idx,dayKey};div.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setDragImage(div,0,0);});
    grip.addEventListener('dragend',()=>{div.classList.remove('dragging');clearIndicators();dragState=null;});

    let lpTimer=null;
    grip.addEventListener('touchstart',e=>{
      e.stopPropagation();
      const touch=e.touches[0];
      lpTimer=setTimeout(()=>{
        if(navigator.vibrate)navigator.vibrate(50);
        const rect=wrap.getBoundingClientRect();
        tdClone=wrap.cloneNode(true);
        tdClone.style.cssText='position:fixed;left:'+rect.left+'px;top:'+rect.top+'px;width:'+rect.width+'px;z-index:9999;opacity:0.9;box-shadow:0 16px 48px rgba(0,0,0,0.6);transform:scale(1.03) rotate(1deg);pointer-events:none;border-radius:10px;';
        document.body.appendChild(tdClone);
        wrap.style.opacity='0.15';
        td={wrap,idx,group,dayKey,listEl:getListEl(group,dayKey),startY:touch.clientY,origTop:rect.top,origH:rect.height};
      },300);
    },{passive:true});
    grip.addEventListener('touchend',()=>clearTimeout(lpTimer));
    grip.addEventListener('touchmove',()=>clearTimeout(lpTimer));
    div.appendChild(grip);

    // CHECKBOX
    const cb=document.createElement('div');cb.className='cb';
    if(t.done)cb.innerHTML='<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const toggleDone=async()=>{t.done=!t.done;await saveTask(t,group,dayKey);render();};
    cb.addEventListener('click',async e=>{e.stopPropagation();await toggleDone();});
    cb.addEventListener('touchend',e=>{e.preventDefault();e.stopPropagation();toggleDone();});
    div.appendChild(cb);

    // CONTENT
    const content=document.createElement('div');content.className='task-content';
    if(isEdit){
      const inp=document.createElement('input');inp.className='edit-input';inp.id='ei-'+t.id;inp.value=t.text;
      inp.addEventListener('keydown',e=>{if(e.key==='Enter')commitEdit();if(e.key==='Escape')cancelEdit();});
      inp.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(inp);
      const tp=document.createElement('div');tp.className='tag-picker';
      const tagOpts=[{label:'🔴 Alta',val:'Alta',cls:'alta'},{label:'🟡 Media',val:'Media',cls:'media'},{label:'🟢 Baja',val:'Baja',cls:'baja'},{label:'🔵 Personal',val:'Personal',cls:'personal'}];
      tagOpts.forEach(({label,val,cls})=>{
        const btn=document.createElement('button');btn.className='tag-option'+((t.tag===val)?' selected '+cls:'');btn.textContent=label;
        btn.addEventListener('click',e=>{e.stopPropagation();t.tag=val;tp.querySelectorAll('.tag-option').forEach(b=>b.className='tag-option');btn.className='tag-option selected '+cls;});
        tp.appendChild(btn);
      });
      content.appendChild(tp);
      setTimeout(()=>{inp.focus();inp.selectionStart=inp.value.length;},10);
    } else {
      const txt=document.createElement('div');txt.className='task-text';txt.textContent=t.text;
      content.appendChild(txt);
      if(t.tag){const badge=document.createElement('span');badge.className='tag-badge '+t.tag.toLowerCase();badge.textContent=t.tag;content.appendChild(badge);}
      content.addEventListener('click',e=>{if(e.target.closest('[data-addnote]'))return;e.stopPropagation();startEdit(t.id,group,dayKey);});
    }
    if(isNoteEdit){
      const ni=document.createElement('input');ni.className='note-input';ni.id='ni-'+t.id;ni.value=t.note||'';ni.placeholder='Agregar nota...';
      ni.addEventListener('keydown',e=>{if(e.key==='Enter')commitNoteEdit();if(e.key==='Escape')cancelNoteEdit();});
      ni.addEventListener('click',e=>e.stopPropagation());
      content.appendChild(ni);setTimeout(()=>ni.focus(),10);
    } else if(t.note&&!t.done){
      const ne=document.createElement('div');ne.className='task-note';ne.dataset.addnote='1';ne.textContent=t.note;
      ne.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group,dayKey);});content.appendChild(ne);
    } else if(!t.done&&!isEdit){
      const btn=document.createElement('button');btn.className='add-note-btn';btn.dataset.addnote='1';btn.textContent='+ nota';
      btn.addEventListener('click',e=>{e.stopPropagation();startNoteEdit(t.id,group,dayKey);});content.appendChild(btn);
    }
    div.appendChild(content);

    // ACTIONS
    const actions=document.createElement('div');actions.className='task-actions';
    if(isEdit||isNoteEdit)actions.style.opacity='1';
    const editBtn=document.createElement('button');editBtn.className='ib';editBtn.textContent='✏️';
    editBtn.addEventListener('click',e=>{e.stopPropagation();isEdit?commitEdit():startEdit(t.id,group,dayKey);});
    const delBtn=document.createElement('button');delBtn.className='ib';delBtn.textContent='🗑️';
    delBtn.addEventListener('click',async e=>{
      e.stopPropagation();const copy={...t};const arr=getTasksArray(group,dayKey);arr.splice(idx,1);
      await deleteTask(t.id);render();showUndo(t.text,copy,group,dayKey);
    });
    actions.appendChild(editBtn);actions.appendChild(delBtn);div.appendChild(actions);

    // FIX 1: SWIPE — removed doneBg references, swipe right just toggles done
    let swX=0,swDx=0;
    div.addEventListener('touchstart',e=>{if(td)return;swX=e.touches[0].clientX;swDx=0;},{passive:true});
    div.addEventListener('touchmove',e=>{
      if(td)return;
      swDx=e.touches[0].clientX-swX;
      if(Math.abs(swDx)>8){
        div.style.transition='none';
        div.style.transform='translateX('+Math.max(-88,Math.min(55,swDx))+'px)';
        const p=Math.min(1,Math.abs(swDx)/80);
        if(swDx<-8){
          wrap.style.background='rgba(231,76,60,'+p*0.95+')';
          delBg.style.opacity=String(p);
        } else {
          wrap.style.background='rgba(29,185,84,'+p*0.8+')';
          delBg.style.opacity='0';
        }
      }
    },{passive:true});
    div.addEventListener('touchend',async()=>{
      if(td)return;
      div.style.transition='transform 0.2s';
      if(swDx>55){
        div.style.transform='';wrap.style.background='';delBg.style.opacity='0';
        t.done=!t.done;await saveTask(t,group,dayKey);render();
      } else if(swDx<-75){
        div.style.transform='translateX(-110%)';
        setTimeout(async()=>{const copy={...t};const arr=getTasksArray(group,dayKey);arr.splice(idx,1);await deleteTask(t.id);showUndo(t.text,copy,group,dayKey);render();},200);
        return;
      } else {
        div.style.transform='';wrap.style.background='';delBg.style.opacity='0';
      }
      swDx=0;
    },{passive:true});

    wrap.appendChild(div);
    return wrap;
  }

  async function handleDrop(e, group, dayKey){
    e.preventDefault();if(!dragState||!dropTarget)return;
    const sa=getTasksArray(dragState.group,dragState.dayKey),da=getTasksArray(dropTarget.group,dropTarget.dayKey||dayKey);
    const item=sa.splice(dragState.idx,1)[0];
    let tp=dropTarget.pos;if(dragState.group===dropTarget.group&&dragState.dayKey===dropTarget.dayKey&&dragState.idx<tp)tp--;
    da.splice(tp,0,item);const fg=dropTarget.group,fdk=dropTarget.dayKey||dayKey;
    dragState=null;dropTarget=null;clearIndicators();
    await saveTask(item,fg,fdk);render();
  }

  function clearIndicators(){document.querySelectorAll('.drop-indicator').forEach(el=>el.classList.remove('visible'));}
  function startEdit(id,g,dk){if(editId)commitEdit();editId=id;editGroup=g;editDayKey=dk;render();}
  async function commitEdit(){
    if(!editId)return;
    const inp=document.getElementById('ei-'+editId);
    if(inp&&inp.value.trim()){const arr=getTasksArray(editGroup,editDayKey);const task=arr.find(t=>t.id===editId);if(task){task.text=inp.value.trim();await saveTask(task,editGroup,editDayKey);}}
    editId=null;editGroup=null;editDayKey=null;render();
  }
  function cancelEdit(){editId=null;editGroup=null;editDayKey=null;render();}
  function startNoteEdit(id,g,dk){if(editId)commitEdit();if(editNoteId)commitNoteEdit();editNoteId=id;editNoteGroup=g;editNoteDayKey=dk;render();}
  async function commitNoteEdit(){
    if(!editNoteId)return;
    const inp=document.getElementById('ni-'+editNoteId);
    if(inp){const arr=getTasksArray(editNoteGroup,editNoteDayKey);const task=arr.find(t=>t.id===editNoteId);if(task){task.note=inp.value.trim();await saveTask(task,editNoteGroup,editNoteDayKey);}}
    editNoteId=null;editNoteGroup=null;editNoteDayKey=null;render();
  }
  function cancelNoteEdit(){editNoteId=null;editNoteGroup=null;editNoteDayKey=null;render();}

  function showUndo(label,copy,group,dayKey){
    clearTimeout(undoTimer);undoQueue.push({label,taskCopy:copy,group,dayKey});
    const bar=document.getElementById('undo-bar'),txt=document.getElementById('undo-text');
    if(bar&&txt){txt.textContent='"'+(label.length>28?label.slice(0,28)+'…':label)+'" eliminada';bar.style.display='flex';undoTimer=setTimeout(()=>{bar.style.display='none';undoQueue=[];},5000);}
  }

  // FIX 3: Note undo after swipe delete
  function renderNotes(){
    const list=document.getElementById('notes-list');if(!list)return;list.innerHTML='';
    if(!state.notes.length){list.innerHTML='<div style="font-size:13px;color:var(--text-tertiary);padding:20px 0;text-align:center;">Sin notas todavía.</div>';return;}
    state.notes.forEach(n=>{
      const wrap=document.createElement('div');wrap.className='note-card-wrap';
      const delBg=document.createElement('div');delBg.className='note-delete-bg';delBg.textContent='🗑️';
      const card=document.createElement('div');card.className='note-card';
      const date=new Date(n.createdAt);
      const ds=date.toLocaleDateString('es',{weekday:'short',day:'numeric',month:'short'})+' · '+date.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      card.innerHTML='<div class="note-title">'+(n.title||'Sin título')+'</div><div class="note-preview">'+(n.body||'').slice(0,120)+((n.body||'').length>120?'…':'')+'</div><div class="note-date">'+ds+'</div>';
      let swX=0,swDx=0;
      card.addEventListener('touchstart',e=>{swX=e.touches[0].clientX;},{passive:true});
      card.addEventListener('touchmove',e=>{swDx=e.touches[0].clientX-swX;if(swDx<0){card.style.transition='none';card.style.transform='translateX('+Math.max(-90,swDx)+'px)';}},{passive:true});
      card.addEventListener('touchend',async()=>{
        card.style.transition='transform 0.2s';
        if(swDx<-70){
          card.style.transform='translateX(-110%)';
          setTimeout(async()=>{
            await sb.from('notes').delete().eq('id',n.id);
            const deletedNote={...n};
            state.notes=state.notes.filter(x=>x.id!==n.id);
            // Show undo for note
            clearTimeout(undoTimer);
            const bar=document.getElementById('undo-bar'),txt=document.getElementById('undo-text');
            if(bar&&txt){
              txt.textContent='"'+(deletedNote.title||'Sin título').slice(0,28)+'" eliminada';
              bar.style.display='flex';
              undoTimer=setTimeout(()=>{bar.style.display='none';},5000);
              document.getElementById('undo-btn').onclick=async()=>{
                const{data}=await sb.from('notes').insert({user_id:currentUser.id,title:deletedNote.title||'',body:deletedNote.body||''}).select().single();
                if(data)state.notes.unshift({id:data.id,title:data.title,body:data.body,createdAt:data.created_at});
                clearTimeout(undoTimer);bar.style.display='none';
                // Restore task undo behavior
                document.getElementById('undo-btn').onclick=taskUndoHandler;
                renderNotes();
              };
            }
            renderNotes();
          },200);return;
        }
        card.style.transform='';swDx=0;
      },{passive:true});
      card.addEventListener('click',()=>{if(Math.abs(swDx)<5)openNoteModal(n);});
      wrap.appendChild(delBg);wrap.appendChild(card);list.appendChild(wrap);
    });
  }

  function openNoteModal(note){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');if(!modal)return;
    title.textContent=note?'Editar nota':'Nueva nota';
    body.innerHTML='<input type="text" id="note-title-input" placeholder="Título..." value="'+(note?note.title||'':'')+'"><textarea id="note-body-input" placeholder="Escribí tu nota acá...">'+(note?note.body||'':'')+'</textarea>';
    modal.style.display='flex';
    document.getElementById('modal-save').onclick=async()=>{
      const tv=document.getElementById('note-title-input').value.trim(),bv=document.getElementById('note-body-input').value.trim();
      if(note){const nb=state.notes.find(x=>x.id===note.id);if(nb){nb.title=tv;nb.body=bv;}await sb.from('notes').update({title:tv,body:bv,updated_at:new Date().toISOString()}).eq('id',note.id);}
      else{const{data}=await sb.from('notes').insert({user_id:currentUser.id,title:tv,body:bv}).select().single();if(data)state.notes.unshift({id:data.id,title:data.title,body:data.body,createdAt:data.created_at});}
      modal.style.display='none';renderNotes();
    };
    const dc=()=>{modal.style.display='none';};document.getElementById('modal-cancel').onclick=dc;document.getElementById('modal-close').onclick=dc;
  }

  function openHitosModal(){
    const modal=document.getElementById('modal'),title=document.getElementById('modal-title'),body=document.getElementById('modal-body');if(!modal)return;
    title.textContent='Hitos de la semana';
    body.innerHTML='<div id="hito-edit-list"></div><button class="btn-ghost" id="add-hito-btn" style="margin-top:8px;">+ Agregar hito</button>';
    renderHitoEditList();modal.style.display='flex';
    document.getElementById('add-hito-btn').onclick=async()=>{const h={id:uid(),emoji:'🎯',text:'Nuevo hito'};state.hitos.push(h);await saveHito(h);renderHitoEditList();};
    document.getElementById('modal-save').onclick=async()=>{await Promise.all(state.hitos.map(h=>saveHito(h)));modal.style.display='none';render();};
    const dc=()=>{modal.style.display='none';render();};document.getElementById('modal-cancel').onclick=dc;document.getElementById('modal-close').onclick=dc;
  }

  function renderHitoEditList(){
    const list=document.getElementById('hito-edit-list');if(!list)return;list.innerHTML='';
    state.hitos.forEach((h,i)=>{
      const row=document.createElement('div');row.className='hito-edit-row';
      const sel=document.createElement('select');sel.style.cssText='font-size:16px;border:0.5px solid var(--border);border-radius:6px;padding:4px;background:var(--bg);cursor:pointer;color:var(--text);';
      HITO_EMOJIS.forEach(em=>{const opt=document.createElement('option');opt.value=em;opt.textContent=em;if(em===h.emoji)opt.selected=true;sel.appendChild(opt);});
      sel.addEventListener('change',()=>{h.emoji=sel.value;});
      const inp=document.createElement('input');inp.type='text';inp.value=h.text;inp.style.cssText='flex:1;padding:8px 12px;font-size:14px;font-family:var(--font);border:0.5px solid var(--border);border-radius:8px;background:var(--surface2);color:var(--text);outline:none;';
      inp.addEventListener('input',()=>{h.text=inp.value;});
      const del=document.createElement('button');del.textContent='🗑️';del.className='ib';del.addEventListener('click',async()=>{await deleteHito(h.id);state.hitos.splice(i,1);renderHitoEditList();});
      row.appendChild(sel);row.appendChild(inp);row.appendChild(del);list.appendChild(row);
    });
  }

  async function addTask(group, dayKey){
    const isQC=dayKey==='quick-capture';
    let inputId;
    if(isQC)inputId='qc-add-'+group;
    else if(dayKey===todayStr()&&activeTab==='today')inputId='add-'+group;
    else inputId='scroll-add-'+group;
    const inp=document.getElementById(inputId);if(!inp||!inp.value.trim())return;
    const task={id:uid(),text:inp.value.trim(),done:false,note:'',tag:''};
    if(isQC)state.quickCapture[group].push(task);else getDayTasks(dayKey)[group].push(task);
    inp.value='';await saveTask(task,group,dayKey);render();
  }

  // FIX 3: Task undo handler reference
  function taskUndoHandler(){
    // handled via onclick in initEvents
  }

  function initEvents(){
    // FIX 5: Logo click → Hoy + refresh
    const logoEl=document.querySelector('.logo');
    if(logoEl){logoEl.style.cursor='pointer';logoEl.addEventListener('click',()=>{switchTab('today');loadFromSupabase();});}

    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{if(editId)commitEdit();if(editNoteId)commitNoteEdit();switchTab(btn.dataset.tab);}));
    document.querySelectorAll('.tag-filter').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.tag-filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');activeTagFilter=btn.dataset.tag;renderToday();});});
    document.querySelectorAll('[data-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.add,todayStr())));
    ['foco','ops'].forEach(g=>{const inp=document.getElementById('add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g,todayStr());});});
    document.querySelectorAll('[data-scroll-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.scrollAdd,selectedDate)));
    ['foco','ops'].forEach(g=>{const inp=document.getElementById('scroll-add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g,selectedDate);});});
    document.querySelectorAll('[data-qc-add]').forEach(btn=>btn.addEventListener('click',()=>addTask(btn.dataset.qcAdd,'quick-capture')));
    QC_GROUPS.forEach(g=>{const inp=document.getElementById('qc-add-'+g);if(inp)inp.addEventListener('keydown',e=>{if(e.key==='Enter')addTask(g,'quick-capture');});});
    document.getElementById('edit-hitos')?.addEventListener('click',openHitosModal);
    document.getElementById('new-note')?.addEventListener('click',()=>openNoteModal(null));

    // FIX 3: Task undo button (default behavior, can be overridden by note undo)
    const undoBtnHandler=async()=>{
      if(!undoQueue.length)return;const entry=undoQueue.pop();
      if(entry.taskCopy){const{data}=await sb.from('tasks').insert({user_id:currentUser.id,week_key:entry.dayKey,day_index:0,group_name:entry.group,text:entry.taskCopy.text,note:entry.taskCopy.note||'',done:entry.taskCopy.done,tag:entry.taskCopy.tag||'',position:0}).select().single();
        if(data){const nt={id:data.id,text:data.text,note:data.note||'',done:data.done,tag:data.tag||''};if(entry.dayKey==='quick-capture'){if(!state.quickCapture[entry.group])state.quickCapture[entry.group]=[];state.quickCapture[entry.group].push(nt);}else getDayTasks(entry.dayKey)[entry.group].push(nt);}
      }
      clearTimeout(undoTimer);document.getElementById('undo-bar').style.display='none';undoQueue=[];render();
    };
    document.getElementById('undo-btn').onclick=undoBtnHandler;

    document.addEventListener('mousedown',e=>{
      if(editId){const inp=document.getElementById('ei-'+editId);if(inp&&inp.contains(e.target))return;if(e.target.closest('.tag-picker'))return;commitEdit();}
      if(editNoteId){const inp=document.getElementById('ni-'+editNoteId);if(inp&&inp.contains(e.target))return;commitNoteEdit();}
    });
    document.getElementById('modal')?.addEventListener('click',e=>{if(e.target===document.getElementById('modal'))document.getElementById('modal').style.display='none';});

    // TOUCH DRAG
    document.addEventListener('touchmove',e=>{
      if(!td||!tdClone)return;
      e.preventDefault();
      const touch=e.touches[0];
      const dy=touch.clientY-td.startY;
      tdClone.style.top=(td.origTop+dy)+'px';
      const listEl=td.listEl;if(!listEl)return;
      const wraps=Array.from(listEl.querySelectorAll('.task-wrap')).filter(el=>el!==td.wrap);
      const cc=td.origTop+dy+td.origH/2;
      let bestPos=wraps.length;
      wraps.forEach((el,i)=>{const r=el.getBoundingClientRect();if(cc<r.top+r.height/2&&i<bestPos)bestPos=i;});
      clearIndicators();
      const ind=listEl.querySelector('.drop-indicator[data-pos="'+bestPos+'"]');if(ind)ind.classList.add('visible');
      dropTarget={group:td.group,pos:bestPos,dayKey:td.dayKey};
    },{passive:false});

    document.addEventListener('touchend',async()=>{
      if(!td)return;
      if(tdClone){tdClone.remove();tdClone=null;}
      td.wrap.style.opacity='';
      if(dropTarget&&dropTarget.pos!==td.idx){
        const arr=getTasksArray(td.group,td.dayKey);
        const item=arr.splice(td.idx,1)[0];
        let tp=dropTarget.pos;if(td.idx<tp)tp--;
        arr.splice(tp,0,item);
        await saveTask(item,td.group,td.dayKey);render();
      }
      clearIndicators();td=null;dropTarget=null;
    });
  }

  async function init(){
    initEvents();
    let session=null;
    const{data:{session:sbs}}=await sb.auth.getSession();session=sbs;
    if(!session){
      const cd=getSessionCookie();
      if(cd){try{const{data:{session:rs}}=await sb.auth.setSession(cd);session=rs;}catch{clearSessionCookie();}}
    }
    if(session?.user){currentUser=session.user;saveSessionCookie(session);showApp();}
    else{showLoginScreen();}
    sb.auth.onAuthStateChange((_,s)=>{
      if(s?.user){currentUser=s.user;saveSessionCookie(s);showApp();}
      else{currentUser=null;clearSessionCookie();state=getDefaultState();showLoginScreen();}
    });
  }

  init();
})();
