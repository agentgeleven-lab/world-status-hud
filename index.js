import { generateStatus } from './generator.js';
import { setLocalVariable } from '/scripts/variables.js';

const KEY = 'world_status_hud_v1';
const context = () => SillyTavern.getContext();
let running = null;
let sessionKey = '';
const defaults = { baseUrl: '', model: '', includeGlobalBooks: true, extraBooks: '', instructions: '', maxTokens: 4096, maxSourceChars: 100000 };
const getSettings = () => ({ ...defaults, ...context().extensionSettings[KEY] });
function node(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function notify(message, error = false) { window.toastr?.[error ? 'error' : 'info'](message, '世界状态栏'); }
function identity() {
  const c = context();
  if (c.groupId || !c.characters?.[c.characterId] || c.getCurrentChatId() == null) throw Error('请打开单角色聊天。');
  return { metadata: c.chatMetadata, avatar: c.characters[c.characterId].avatar, id: c.getCurrentChatId() };
}
function checkIdentity(i) {
  const n = identity();
  if (n.metadata !== i.metadata || n.id !== i.id || n.avatar !== i.avatar) throw Error('聊天已切换，请关闭并重新打开面板。');
}
function parseState(raw) {
  if (raw == null || raw === '') return null;
  const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!d || Array.isArray(d) || typeof d.项目 !== 'object' || !d.项目 || Array.isArray(d.项目)) throw Error('状态栏结构不兼容。');
  return d;
}
async function showHud() {
  const id = identity();
  const response = await fetch(new URL('./hud.html', import.meta.url));
  if (!response.ok) throw Error('无法加载状态栏界面。');
  let html = await response.text();
  checkIdentity(id);
  const dialog = node('dialog', undefined, 'wsh-dialog');
  const close = node('button', '关闭', 'menu_button');
  const frame = node('iframe');
  frame.title = '世界状态栏编辑器';
  // Only the bundled frame may use this variable bridge; commands are allowlisted.
  const token = crypto.randomUUID();
  const bridge = `<script>
  const token=${JSON.stringify(token)};let seq=0;const pending=new Map();
  window.STscript=command=>new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('连接超时，请重新打开面板。'))},15000);pending.set(id,{resolve,reject,timer});parent.postMessage({wsh:token,id,command},'*')});
  addEventListener('message',e=>{if(e.source!==parent||e.data?.wsh!==token)return;const p=pending.get(e.data.id);if(!p)return;clearTimeout(p.timer);pending.delete(e.data.id);e.data.error?p.reject(Error(e.data.error)):p.resolve(e.data.value)});
  <\/script>`;
  html = html.replace('<head>', '<head>' + bridge);
  const listener = event => {
    if (event.source !== frame.contentWindow || event.data?.wsh !== token) return;
    const { command, id: requestId } = event.data;
    try {
      checkIdentity(id);
      let value;
      if (command === '/getvar 状态栏') value = parseState(id.metadata.variables?.状态栏);
      else if (typeof command === 'string' && command.startsWith('/setvar key=状态栏 ')) {
        if (running) throw Error('状态栏生成中，请完成后再编辑。');
        value = parseState(command.slice('/setvar key=状态栏 '.length));
        if (!value) throw Error('不能写入空状态。');
        setLocalVariable('状态栏', JSON.stringify(value));
      } else throw Error('不支持的状态栏命令。');
      event.source.postMessage({ wsh: token, id: requestId, value }, '*');
    } catch (e) { event.source.postMessage({ wsh: token, id: requestId, error: e.message }, '*'); }
  };
  addEventListener('message', listener);
  dialog.addEventListener('close', () => { removeEventListener('message', listener); frame.srcdoc = ''; dialog.remove(); }, { once: true });
  close.onclick = () => dialog.close();
  dialog.append(close, frame); document.body.append(dialog);
  frame.srcdoc = html; dialog.showModal();
}
async function restoreBackup() {
  if (running) throw Error('请先等待生成结束。');
  const id = identity();
  const backups = Object.keys(id.metadata.variables || {}).filter(k => k.startsWith('状态栏_生成前备份_')).sort().reverse();
  if (!backups.length) throw Error('当前聊天没有生成前备份。');
  const d = node('dialog', undefined, 'wsh-restore');
  const title = node('h3', '恢复状态栏备份');
  const select = node('select', undefined, 'text_pole');
  backups.forEach(k => { const o = node('option', k); o.value = k; select.append(o); });
  const restore = node('button', '恢复所选备份', 'menu_button');
  const cancel = node('button', '取消', 'menu_button');
  const result = node('p');
  restore.onclick = async () => {
    try {
      checkIdentity(id);
      if (running) throw Error('生成正在运行，请稍后恢复。');
      const restored = parseState(id.metadata.variables[select.value]);
      if (!restored) throw Error('备份为空。');
      const current = id.metadata.variables.状态栏;
      if (current !== undefined) setLocalVariable('状态栏_生成前备份_' + Date.now(), current);
      setLocalVariable('状态栏', JSON.stringify(restored));
      await context().saveMetadata(); d.close(); notify('已恢复，恢复前的状态也已备份。');
    } catch (e) { result.textContent = e.message; }
  };
  cancel.onclick = () => d.close(); d.onclose = () => d.remove();
  d.append(title, select, restore, cancel, result); document.body.append(d); d.showModal();
}
function mount() {
  if (document.getElementById('wsh-settings')) return;
  const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
  if (!host) { notify('未找到扩展设置容器，请刷新酒馆。', true); return; }
  const panel = node('details'); panel.id = 'wsh-settings';
  panel.append(node('summary', '世界状态栏 · V1'));
  panel.append(node('p', '读取角色卡与关联世界书，生成适合当前世界观的状态栏。'));
  const fields = {};
  function field(key, label, type = 'text') {
    const wrap = node('label', label);
    const input = node(type === 'textarea' ? 'textarea' : 'input', undefined, 'text_pole');
    if (type !== 'textarea') input.type = type;
    fields[key] = input; wrap.append(input); panel.append(wrap); return input;
  }
  const settings = getSettings();
  field('baseUrl', '独立 API 地址（留空使用酒馆当前连接）').placeholder = 'https://你的服务/v1';
  field('apiKey', '独立 API 密钥（仅当前页面会话保存）', 'password').autocomplete = 'off';
  field('model', '独立接口模型 ID');
  field('extraBooks', '额外世界书（每行一本）', 'textarea');
  field('instructions', '状态栏要求', 'textarea').placeholder = '例如：仅显示玩家、世界、队伍；不要数值化感情。';
  field('maxTokens', '最大输出 tokens', 'number').min = '256';
  field('maxSourceChars', '设定字符上限（超过会停止，不会截断）', 'number').min = '1000';
  field('includeGlobalBooks', '包含已启用的全局世界书', 'checkbox');
  Object.entries(settings).forEach(([k,v]) => { if (fields[k]) fields[k].type === 'checkbox' ? fields[k].checked = v : fields[k].value = v; });
  const report = node('p', '准备就绪。', 'wsh-report'); report.setAttribute('role', 'status');
  function save() {
    const s = {};
    for (const [k,input] of Object.entries(fields)) {
      if (k === 'apiKey') { sessionKey = input.value; continue; }
      s[k] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
    }
    if (!Number.isFinite(s.maxTokens) || s.maxTokens < 256 || !Number.isFinite(s.maxSourceChars) || s.maxSourceChars < 1000) throw Error('请检查输出长度和设定字符上限。');
    context().extensionSettings[KEY] = s; context().saveSettingsDebounced(); return s;
  }
  const actions = node('div', undefined, 'wsh-actions');
  function action(label, fn) {
    const b = node('button', label, 'menu_button'); b.type = 'button';
    b.onclick = async () => { try { await fn(); } catch (e) { report.textContent = e.message; notify(e.message, true); } }; actions.append(b); return b;
  }
  const saveButton = action('保存配置', () => { save(); report.textContent = '配置已保存；密钥刷新页面后需重填。'; });
  async function generate(mode) {
    if (running) throw Error('生成任务已经运行。');
    if (mode === 'replace' && !confirm('重新生成将替换当前状态栏全部项目，操作前会备份。继续？')) return;
    const s = save(); identity();
    running = new AbortController(); report.textContent = '正在读取设定并请求模型…';
    generateButton.disabled = replaceButton.disabled = saveButton.disabled = true;
    try {
      const result = await generateStatus({ api: { baseUrl: s.baseUrl, apiKey: sessionKey, model: s.model, timeoutMs: 120000, maxTokens: s.maxTokens }, mode,
        includeGlobalBooks: s.includeGlobalBooks, extraBooks: s.extraBooks.split(/\r?\n/).map(x=>x.trim()).filter(Boolean), maxSourceChars: s.maxSourceChars,
        instructions: s.instructions || '根据世界观设计简洁实用的状态栏。' }, running.signal);
      report.textContent = result.ok ? (result.changed ? '生成完成，可打开状态栏查看。' : '无需补充。') + ' 读取世界书：' + (result.books?.join('、') || '无') : result.message || '已有任务运行中。';
    } finally { running = null; generateButton.disabled = replaceButton.disabled = saveButton.disabled = false; }
  }
  const generateButton = action('生成／补充', () => generate('fill'));
  const replaceButton = action('重新生成整套', () => generate('replace'));
  action('取消生成', () => { running?.abort(); report.textContent = '已请求取消，等待底层调用返回；结果不会写入。'; });
  action('打开状态栏', showHud);
  action('恢复备份', restoreBackup);
  panel.append(actions, report, node('p', '独立接口使用 Chat Completions 格式，需要允许浏览器跨域。生成与编辑共用聊天变量“状态栏”。', 'wsh-note'));
  host.append(panel);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
