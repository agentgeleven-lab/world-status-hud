export const THEMES = [
  { id: 'nexus', name: '星港青蓝', note: '深色科技 HUD · 青蓝与暖金' },
  { id: 'sakura', name: '樱花物语', note: '柔和视觉小说 · 浅粉与莓红' },
  { id: 'parchment', name: '旅人手记', note: '奇幻冒险 · 纸色与古铜' },
  { id: 'amethyst', name: '深海紫晶', note: '夜色幻想 · 靛紫与星光' },
  { id: 'mono', name: '极简墨白', note: '清爽阅读 · 白底与石墨' },
];
export const normalizeTheme = id => THEMES.some(t => t.id === id) ? id : 'nexus';
export function applyTheme(document, id) {
  const theme = normalizeTheme(id);
  document.documentElement.setAttribute('data-wsh-theme', theme);
  // Change only styling in the existing frame: preserve unsaved editor drafts.
  for (const frame of document.querySelectorAll('.wsh-dialog iframe')) {
    try { frame.contentDocument?.documentElement?.setAttribute('data-wsh-theme', theme); } catch { /* Frame not ready yet. */ }
  }
  return theme;
}
export function createThemePicker({ node, context, settingsKey, document }) {
  const section = node('section', undefined, 'wsh-theme-section');
  section.append(node('h3', '界面主题'), node('p', '点击预览并自动保存；悬浮窗口、编辑器和楼层记录一起切换。', 'wsh-note'));
  const choices = node('div', undefined, 'wsh-theme-grid');
  const buttons = [];
  function select(id) {
    for (const [button, theme] of buttons) button.setAttribute('aria-pressed', String(theme === id));
  }
  for (const theme of THEMES) {
    const button = node('button', undefined, 'wsh-theme-choice'); button.type = 'button';
    button.setAttribute('data-wsh-palette', theme.id);
    button.append(node('span', theme.name, 'wsh-theme-name'), node('span', theme.note, 'wsh-theme-note'));
    const sample = node('span', undefined, 'wsh-theme-sample'); sample.append(node('span', '生命 76 / 100'), node('span', '● 同行中'));
    button.append(sample);
    button.onclick = () => {
      const ctx = context(); ctx.extensionSettings[settingsKey] = { ...ctx.extensionSettings[settingsKey], theme: theme.id };
      applyTheme(document, theme.id); select(theme.id); ctx.saveSettingsDebounced();
    };
    buttons.push([button, theme.id]); choices.append(button);
  }
  select(normalizeTheme(context().extensionSettings[settingsKey]?.theme)); section.append(choices); return section;
}
