/* ============================================
   AI搭子 — Application Logic
   Vanilla JS, localStorage-backed
   ============================================ */

// ─── App State ───────────────────────────
const STATE_KEY = 'ai_dazi_state';

const defaultState = {
  editor: {
    title: '',
    content: '',
    platform: 'wechat',
    currentDraftId: null
  },
  topics: [],
  drafts: [],
  usage: {
    date: new Date().toDateString(),
    count: 0,
    maxFree: 3
  }
};

let appState = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (saved) {
      const state = JSON.parse(saved);
      // Reset usage count if new day
      if (state.usage && state.usage.date !== new Date().toDateString()) {
        state.usage = { date: new Date().toDateString(), count: 0, maxFree: 3 };
      }
      return state;
    }
  } catch (e) {
    console.warn('Failed to load state:', e);
  }
  return JSON.parse(JSON.stringify(defaultState));
}

function saveState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(appState));
  } catch (e) {
    showToast('存储空间不足，请清理草稿', 'warning');
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// ─── DOM References ──────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Toast ───────────────────────────────
function showToast(msg, type = 'success') {
  const toast = $('#toast-global');
  toast.textContent = msg;
  toast.style.background = type === 'warning' 
    ? 'var(--accent-warning)' 
    : type === 'error' 
      ? 'var(--accent-danger)' 
      : 'var(--accent-success)';
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── Tab Navigation ──────────────────────
function initTabs() {
  const navItems = $$('.nav-item');
  const tabContents = $$('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      tabContents.forEach(t => t.classList.remove('active'));
      $(`#tab-${tab}`).classList.add('active');

      if (tab === 'export') renderExportPreviews();
      if (tab === 'analysis') { /* analysis textarea independent */ }
    });
  });
}

// ─── Usage Tracking ──────────────────────
function canUseAI() {
  return appState.usage.count < appState.usage.maxFree;
}

function useAI() {
  appState.usage.count++;
  saveState();
  updateUsageUI();
}

function updateUsageUI() {
  const fill = $('#usage-fill');
  const count = $('#usage-count');
  const pct = Math.min(100, (appState.usage.count / appState.usage.maxFree) * 100);
  fill.style.width = pct + '%';
  count.textContent = `${appState.usage.count}/${appState.usage.maxFree}`;
  
  if (appState.usage.count >= appState.usage.maxFree) {
    fill.style.background = 'var(--accent-danger)';
  } else if (appState.usage.count >= appState.usage.maxFree - 1) {
    fill.style.background = 'var(--accent-warning)';
  } else {
    fill.style.background = 'var(--gradient-primary)';
  }
}

// ─── Editor Module ───────────────────────
function initEditor() {
  const titleInput = $('#title-input');
  const editorTextarea = $('#editor-textarea');
  const platformSelect = $('#platform-select');
  const wordCountEl = $('#word-count');

  // Load saved state
  titleInput.value = appState.editor.title || '';
  editorTextarea.value = appState.editor.content || '';
  platformSelect.value = appState.editor.platform || 'wechat';
  updateWordCount();
  updatePreview();

  // Title input
  titleInput.addEventListener('input', () => {
    appState.editor.title = titleInput.value;
    saveState();
    updatePreview();
    updateExportOnEdit();
  });

  // Editor input
  editorTextarea.addEventListener('input', () => {
    appState.editor.content = editorTextarea.value;
    saveState();
    updateWordCount();
    updatePreview();
    updateExportOnEdit();
  });

  // Platform select
  platformSelect.addEventListener('change', () => {
    appState.editor.platform = platformSelect.value;
    saveState();
    updatePreview();
    activatePreviewTab(platformSelect.value);
  });

  // New document
  $('#btn-new-doc').addEventListener('click', () => {
    if (appState.editor.content && !confirm('当前内容未保存，确定新建吗？')) return;
    appState.editor.title = '';
    appState.editor.content = '';
    appState.editor.currentDraftId = null;
    titleInput.value = '';
    editorTextarea.value = '';
    saveState();
    updateWordCount();
    updatePreview();
    updateExportOnEdit();
    showToast('已新建空白文档');
  });

  // Save draft
  $('#btn-save-draft').addEventListener('click', saveDraft);
}

function updateWordCount() {
  const content = $('#editor-textarea').value;
  const count = content.replace(/\s/g, '').length;
  $('#word-count').textContent = `字数：${count}`;
}

function getEditorContent() {
  return {
    title: $('#title-input').value.trim(),
    content: $('#editor-textarea').value.trim(),
    platform: $('#platform-select').value
  };
}

// ─── Draft Management ────────────────────
function saveDraft() {
  const { title, content } = getEditorContent();
  if (!content) {
    showToast('请输入内容后再保存', 'warning');
    return;
  }

  const draftTitle = title || '无标题';
  const existingId = appState.editor.currentDraftId;
  
  if (existingId) {
    const idx = appState.drafts.findIndex(d => d.id === existingId);
    if (idx !== -1) {
      appState.drafts[idx].title = draftTitle;
      appState.drafts[idx].content = content;
      appState.drafts[idx].updatedAt = Date.now();
    }
  } else {
    const draft = {
      id: generateId(),
      title: draftTitle,
      content: content,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    appState.drafts.unshift(draft);
    appState.editor.currentDraftId = draft.id;
  }

  saveState();
  renderDraftList();
  updateDraftCount();
  showToast('草稿已保存 ✅');
}

function loadDraft(id) {
  const draft = appState.drafts.find(d => d.id === id);
  if (!draft) return;

  if (appState.editor.content && !confirm('加载草稿将覆盖当前内容，确定吗？')) return;

  appState.editor.title = draft.title;
  appState.editor.content = draft.content;
  appState.editor.currentDraftId = draft.id;
  $('#title-input').value = draft.title;
  $('#editor-textarea').value = draft.content;
  saveState();
  updateWordCount();
  updatePreview();
  updateExportOnEdit();

  // Switch to editor tab
  $$('.nav-item').forEach(i => i.classList.remove('active'));
  $('[data-tab="editor"]').classList.add('active');
  $$('.tab-content').forEach(t => t.classList.remove('active'));
  $('#tab-editor').classList.add('active');

  showToast('草稿已加载');
}

function deleteDraft(id) {
  if (!confirm('确定删除这个草稿？')) return;
  appState.drafts = appState.drafts.filter(d => d.id !== id);
  if (appState.editor.currentDraftId === id) {
    appState.editor.currentDraftId = null;
  }
  saveState();
  renderDraftList();
  updateDraftCount();
  showToast('草稿已删除');
}

function updateDraftCount() {
  $('#draft-count').textContent = appState.drafts.length;
  if (appState.drafts.length === 0) {
    $('#draft-count').textContent = '0';
  }
}

function renderDraftList() {
  const container = $('#draft-list');
  if (appState.drafts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📭</span>
        <p>草稿箱为空</p>
        <p class="empty-hint">在编辑器中保存草稿后，将在这里显示</p>
      </div>`;
    return;
  }

  container.innerHTML = appState.drafts.map(d => `
    <div class="draft-item" data-id="${d.id}">
      <div class="draft-item-content" data-action="load">
        <div class="draft-item-title">${escapeHtml(d.title)}</div>
        <div class="draft-item-preview">${escapeHtml(d.content.substring(0, 80))}${d.content.length > 80 ? '...' : ''}</div>
        <div class="draft-item-time">${formatTime(d.updatedAt)}</div>
      </div>
      <div class="topic-item-actions">
        <button class="topic-delete-btn" data-action="delete" data-id="${d.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="load"]').forEach(el => {
    el.addEventListener('click', (e) => {
      const id = e.currentTarget.closest('.draft-item').dataset.id;
      loadDraft(id);
    });
  });

  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDraft(btn.dataset.id);
    });
  });
}

// ─── AI Assistant Module ─────────────────
const aiActions = {
  continue: generateContinue,
  rewrite: generateRewrite,
  expand: generateExpand,
  shorten: generateShorten,
  title: generateTitles,
  polish: generatePolish
};

function initAI() {
  $$('.ai-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const { content, title } = getEditorContent();

      if (!content && action !== 'title') {
        showToast('请先输入一些内容', 'warning');
        return;
      }

      if (!canUseAI()) {
        showToast('今日AI使用次数已用完（免费版3次/天）。升级Pro无限使用！', 'warning');
        return;
      }

      // Loading state
      btn.classList.add('loading');
      const originalText = btn.querySelector('.ai-btn-title').textContent;
      btn.querySelector('.ai-btn-title').textContent = '生成中...';

      // Simulate AI delay
      await sleep(600 + Math.random() * 800);

      useAI();

      const result = aiActions[action](content, title);
      showAIResult(action, result);

      // Reset button
      btn.classList.remove('loading');
      btn.querySelector('.ai-btn-title').textContent = originalText;
    });
  });

  // Apply button
  $('#btn-apply').addEventListener('click', () => {
    const resultContent = $('#ai-result-content');
    const resultText = resultContent.textContent;
    const textarea = $('#editor-textarea');
    
    if (resultContent.dataset.action === 'title') {
      // For title generation, apply the selected title
      const selectedTitle = resultContent.querySelector('.title-option.selected');
      if (selectedTitle) {
        $('#title-input').value = selectedTitle.textContent.trim();
        appState.editor.title = selectedTitle.textContent.trim();
        saveState();
      }
    } else {
      textarea.value = resultText;
      appState.editor.content = resultText;
      saveState();
      updateWordCount();
      updatePreview();
    }

    hideAIResult();
    showToast('已应用 ✅');
  });

  // Dismiss button
  $('#btn-dismiss').addEventListener('click', hideAIResult);
}

function showAIResult(action, result) {
  const resultEl = $('#ai-result');
  const labelEl = $('#ai-result-label');
  const contentEl = $('#ai-result-content');

  const labels = {
    continue: '续写建议',
    rewrite: '改写结果',
    expand: '扩写结果',
    shorten: '缩写结果',
    title: '标题方案',
    polish: '润色结果'
  };

  labelEl.textContent = labels[action] || 'AI建议';
  contentEl.dataset.action = action;

  if (action === 'title') {
    contentEl.innerHTML = result.map((t, i) => 
      `<div class="title-option${i === 0 ? ' selected' : ''}" data-index="${i}">${escapeHtml(t)}</div>`
    ).join('');
    // Make title options clickable
    contentEl.querySelectorAll('.title-option').forEach(opt => {
      opt.addEventListener('click', () => {
        contentEl.querySelectorAll('.title-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });
  } else {
    contentEl.textContent = result;
  }

  resultEl.style.display = 'block';
  resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideAIResult() {
  $('#ai-result').style.display = 'none';
}

// ─── AI Generation Functions (Demo Mode) ─
function generateContinue(text, title) {
  const lines = text.trim().split('\n');
  const lastLine = lines[lines.length - 1] || '';
  const topic = title || extractTopic(text);

  const continuations = [
    `\n\n除此之外，${topic}还有一个容易被忽视的角度。很多创作者只关注表面的技巧，却忽略了底层的逻辑。当你真正理解了用户的需求动机，你的内容就会自然而然地吸引人。\n\n举个简单的例子，同样是写"如何提升效率"，大多数人的思路是列清单、给方法。但如果你从"为什么我们总是拖延"这个心理层面切入，读者会感觉你真正懂他们。\n\n这就是内容的魅力所在——不是告诉别人该做什么，而是帮他们理解自己为什么需要这样做。`,
    
    `\n\n在实践过程中，我发现了一个有趣的规律：那些最受欢迎的内容，往往不是最专业的，而是最"真实"的。\n\n用户要的不是教科书，而是有温度的经验分享。比如当你分享一次失败的经历，或者一个意外发现的技巧，这种真实感会让读者产生强烈的共鸣。\n\n所以，不妨在接下来的内容中，加入你的个人经历和真实感受。这会让你的内容从"还不错"变成"忍不住转发"。」`,
    
    `\n\n最后，我想补充一个数据：根据最新的行业报告，${topic}领域的内容消费量在过去一年增长了47%。这个数字说明什么？说明用户对这个话题的需求正在快速增长。\n\n对于创作者来说，这是一个巨大的机会窗口。关键在于——你能不能在这个领域建立自己的独特声音？\n\n我的建议是：不要试图讨好所有人。找到你最擅长、最热爱的那个细分角度，深耕下去。100个铁杆粉丝比10000个路人更有价值。`,
  ];

  return continuations[Math.floor(Math.random() * continuations.length)];
}

function generateRewrite(text, title) {
  // Paraphrase with different style
  const styles = [
    '更口语化，像朋友聊天一样',
    '更专业正式，适合商业场景',
    '更故事化，增加叙事感'
  ];
  const style = styles[Math.floor(Math.random() * styles.length)];

  // Simple demo: add a note about the style change and slightly alter text
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) return text;

  const rewritten = sentences.map((s, i) => {
    const trimmed = s.trim();
    if (trimmed.length < 10) return trimmed;
    // Simple transformation: shuffle word emphasis
    return rewriteSentence(trimmed);
  }).join('。\n');

  return `【${style}版本】\n\n${rewritten}。`;
}

function rewriteSentence(s) {
  const connectors = ['也就是说，', '换句话说，', '简单来说，', '实际上，', '你可能会发现，'];
  const rand = Math.random();
  if (rand < 0.3 && s.length > 15) {
    return connectors[Math.floor(Math.random() * connectors.length)] + s;
  }
  return s;
}

function generateExpand(text, title) {
  const topic = title || extractTopic(text);
  const expansions = [
    `\n\n## 为什么${topic}如此重要？\n\n在当今内容爆炸的时代，${topic}已经成为创作者的核心竞争力之一。无论是新手还是资深创作者，都需要在这个领域持续学习和实践。\n\n### 三个关键洞察：\n\n1. **用户需求在变化**：现在的读者不再满足于泛泛而谈的内容，他们渴望深度、专业、有实操价值的分享。\n\n2. **竞争在加剧**：每天有数百万条新内容被发布。只有真正优质、独特的内容才能脱颖而出。\n\n3. **方法在迭代**：昨天有效的方法，今天可能已经过时。持续学习和实验是唯一的出路。\n\n### 实操建议\n\n如果你正在${topic}领域创作，以下是我总结的实战经验：\n\n- 先从你最熟悉的角度切入\n- 用数据支撑你的观点\n- 加入真实的案例和故事\n- 保持内容的结构化和易读性`,
  ];

  const existing = text.trim();
  return existing + expansions[0];
}

function generateShorten(text, title) {
  const sentences = text.split(/[。！？\n]/).filter(s => s.trim().length > 0);
  
  if (sentences.length <= 3) {
    return text; // Already short
  }

  // Keep first + last + most important middle sentences
  const keep = [];
  keep.push(sentences[0]);
  
  if (sentences.length > 4) {
    // Pick middle sentences with most substance (longest ones)
    const middle = sentences.slice(1, -1);
    middle.sort((a, b) => b.length - a.length);
    keep.push(...middle.slice(0, Math.ceil(middle.length / 3)));
  } else if (sentences.length > 2) {
    keep.push(sentences[Math.floor(sentences.length / 2)]);
  }
  
  keep.push(sentences[sentences.length - 1]);
  
  return keep.map(s => s.trim()).join('。\n') + '。';
}

function generateTitles(text, title) {
  const topic = title || extractTopic(text);
  const currentTitle = title || '内容创作';

  const titleTemplates = [
    `🔥 ${topic}终极指南：从入门到精通只需这一篇`,
    `我用了3个月总结的${topic}秘籍，今天全部公开`,
    `${topic}的5个真相，99%的人都搞错了`,
    `为什么你的${topic}总是不见效？答案在这里`,
    `别再做无用功了！${topic}的正确打开方式`,
    `${topic}深度解析：那些没人告诉你的底层逻辑`,
    `从0到1：我是如何在${topic}上实现突破的`,
    `${topic}避坑指南：新手最容易犯的5个错误`,
  ];

  return titleTemplates.sort(() => Math.random() - 0.5).slice(0, 5);
}

function generatePolish(text, title) {
  const improvements = [
    '优化了段落过渡，增加阅读流畅度',
    '调整了句式结构，避免重复表达',
    '增强了情感表达，让文字更有感染力',
    '增加了过渡词和连接词',
    '优化了节奏感，长短句交替'
  ];
  
  const desc = improvements[Math.floor(Math.random() * improvements.length)];
  
  // Lightly modify the text
  const polished = text
    .replace(/非常/g, '极其')
    .replace(/很多/g, '大量')
    .replace(/重要/g, '至关重要')
    .replace(/可以/g, '能够')
    .replace(/但是/g, '然而');

  return `【${desc}】\n\n${polished}`;
}

// ─── Platform Preview ────────────────────
function initPreview() {
  $$('.preview-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const platform = tab.dataset.platform;
      $$('.preview-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      updatePreview(platform);
    });
  });
}

function activatePreviewTab(platform) {
  $$('.preview-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.platform === platform);
  });
}

function updatePreview(platformOverride) {
  const { title, content } = getEditorContent();
  const activePreview = $('.preview-tab.active');
  const platform = platformOverride || (activePreview ? activePreview.dataset.platform : 'wechat');
  const frame = $('#preview-frame');

  if (!content) {
    frame.className = 'preview-frame';
    frame.innerHTML = `
      <div class="preview-placeholder">
        <span class="preview-placeholder-icon">👆</span>
        <p>开始写作，这里会实时显示<br>各平台的预览效果</p>
      </div>`;
    return;
  }

  let formatted;
  switch (platform) {
    case 'wechat': formatted = formatWechat(title, content); break;
    case 'xiaohongshu': formatted = formatXiaohongshu(title, content); break;
    case 'douyin': formatted = formatDouyin(title, content); break;
    default: formatted = content;
  }

  frame.className = `preview-frame ${platform}-preview`;
  frame.innerHTML = formatted;
}

function formatWechat(title, content) {
  const paragraphs = content.split('\n').filter(p => p.trim());
  let html = '';
  
  if (title) {
    html += `<h1 style="font-size:1.4em;font-weight:800;margin-bottom:16px;color:#1a1a2e;text-align:center;">${escapeHtml(title)}</h1>`;
  }

  paragraphs.forEach((p, i) => {
    const trimmed = p.trim();
    if (trimmed.startsWith('##') || trimmed.startsWith('###')) {
      const hLevel = trimmed.startsWith('###') ? 'h3' : 'h2';
      const hText = trimmed.replace(/^#+\s*/, '');
      html += `<${hLevel} style="font-size:${hLevel==='h2'?'1.15em':'1.05em'};font-weight:700;margin:16px 0 8px;color:#1a1a2e;">${escapeHtml(hText)}</${hLevel}>`;
    } else {
      html += `<p style="margin-bottom:12px;text-indent:2em;">${escapeHtml(trimmed)}</p>`;
    }
    if (i < paragraphs.length - 1) {
      html += '';
    }
  });

  return html;
}

function formatXiaohongshu(title, content) {
  const paragraphs = content.split('\n').filter(p => p.trim());
  let html = '';
  
  // Xiaohongshu style: emoji-heavy, casual, bullet points
  const emojis = ['✨', '💡', '🔥', '📌', '💪', '🌟', '💯', '🎯', '💝', '🌈'];
  
  if (title) {
    html += `<h1 style="font-size:1.2em;font-weight:700;margin-bottom:12px;color:#e74c3c;text-align:center;">${emojis[0]} ${escapeHtml(title)} ${emojis[1]}</h1>`;
  }

  paragraphs.forEach((p, i) => {
    const trimmed = p.trim();
    const emoji = emojis[(i + 2) % emojis.length];
    html += `<p style="margin-bottom:10px;line-height:1.8;">${emoji} ${escapeHtml(trimmed)}</p>`;
  });

  // Add hashtags
  const topic = title || extractTopic(content);
  html += `<div style="margin-top:16px;color:#e74c3c;font-size:0.9em;">#${topic.replace(/\s/g,'')} #内容创作 #干货分享 #创作者日常</div>`;

  return html;
}

function formatDouyin(title, content) {
  const paragraphs = content.split('\n').filter(p => p.trim());
  let html = '';
  
  // Short, punchy, script-like
  html += `<div style="font-family:monospace;padding:12px;background:rgba(255,255,255,0.05);border-radius:8px;margin-bottom:12px;font-size:0.75em;color:#94a3b8;">🎬 口播脚本</div>`;
  
  if (title) {
    html += `<p style="font-size:1.1em;font-weight:700;margin-bottom:12px;color:#ff6b6b;">${escapeHtml(title)}</p>`;
  }

  paragraphs.forEach((p, i) => {
    const trimmed = p.trim();
    html += `<p style="margin-bottom:8px;line-height:1.6;">${escapeHtml(trimmed)}</p>`;
  });

  html += `<div style="margin-top:16px;color:#94a3b8;font-size:0.8em;">#抖音创作 #内容干货</div>`;

  return html;
}

// ─── Calendar Module ────────────────────
function initCalendar() {
  $('#btn-add-topic').addEventListener('click', () => {
    $('#add-topic-form').style.display = 'block';
    $('#topic-date-input').value = new Date().toISOString().split('T')[0];
  });

  $('#btn-cancel-topic').addEventListener('click', () => {
    $('#add-topic-form').style.display = 'none';
    clearTopicForm();
  });

  $('#btn-save-topic').addEventListener('click', saveTopic);
  renderTopicList();
  renderTimeline();
  renderDraftList();
  updateDraftCount();
}

function clearTopicForm() {
  $('#topic-title-input').value = '';
  $('#topic-desc-input').value = '';
  $('#topic-date-input').value = '';
  $('#topic-platform').value = 'wechat';
  $('#topic-status').value = 'idea';
}

function saveTopic() {
  const title = $('#topic-title-input').value.trim();
  const desc = $('#topic-desc-input').value.trim();
  const date = $('#topic-date-input').value;
  const platform = $('#topic-platform').value;
  const status = $('#topic-status').value;

  if (!title) {
    showToast('请输入选题标题', 'warning');
    return;
  }

  const topic = {
    id: generateId(),
    title,
    desc,
    date,
    platform,
    status,
    createdAt: Date.now()
  };

  appState.topics.unshift(topic);
  saveState();
  renderTopicList();
  renderTimeline();
  clearTopicForm();
  $('#add-topic-form').style.display = 'none';
  showToast('选题已保存 ✅');
}

function deleteTopic(id) {
  if (!confirm('确定删除这个选题？')) return;
  appState.topics = appState.topics.filter(t => t.id !== id);
  saveState();
  renderTopicList();
  renderTimeline();
  showToast('选题已删除');
}

function renderTopicList() {
  const container = $('#topic-list');
  const topics = appState.topics;

  if (topics.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📝</span>
        <p>还没有选题</p>
        <p class="empty-hint">点击"+ 新选题"开始规划内容</p>
      </div>`;
    return;
  }

  const statusLabels = { idea: '灵感', planned: '计划中', writing: '写作中' };
  const platformLabels = { wechat: '公众号', xiaohongshu: '小红书', douyin: '抖音', all: '全平台' };

  container.innerHTML = topics.map(t => `
    <div class="topic-item" data-id="${t.id}">
      <div class="topic-status-dot status-${t.status}"></div>
      <div class="topic-item-content">
        <div class="topic-item-title">${escapeHtml(t.title)}</div>
        ${t.desc ? `<div class="topic-item-desc">${escapeHtml(t.desc)}</div>` : ''}
        <div class="topic-item-meta">
          <span>${platformLabels[t.platform] || t.platform}</span>
          <span>${statusLabels[t.status]}</span>
          ${t.date ? `<span>📅 ${t.date}</span>` : ''}
        </div>
      </div>
      <div class="topic-item-actions">
        <button class="topic-delete-btn" data-action="delete-topic" data-id="${t.id}">🗑️</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-action="delete-topic"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTopic(btn.dataset.id);
    });
  });

  container.querySelectorAll('.topic-item').forEach(item => {
    item.addEventListener('click', () => {
      const topic = appState.topics.find(t => t.id === item.dataset.id);
      if (topic && topic.desc) {
        loadTopicToEditor(topic);
      }
    });
  });
}

function loadTopicToEditor(topic) {
  if (appState.editor.content && !confirm('加载选题描述将覆盖当前编辑器内容，确定吗？')) return;
  
  $('#title-input').value = topic.title;
  $('#editor-textarea').value = topic.desc || '';
  $('#platform-select').value = topic.platform === 'all' ? 'wechat' : topic.platform;
  appState.editor.title = topic.title;
  appState.editor.content = topic.desc || '';
  appState.editor.platform = topic.platform === 'all' ? 'wechat' : topic.platform;
  saveState();
  updateWordCount();
  updatePreview();
  updateExportOnEdit();

  // Switch to editor
  $$('.nav-item').forEach(i => i.classList.remove('active'));
  $('[data-tab="editor"]').classList.add('active');
  $$('.tab-content').forEach(t => t.classList.remove('active'));
  $('#tab-editor').classList.add('active');
}

function renderTimeline() {
  const container = $('#timeline');
  const topicsWithDates = appState.topics
    .filter(t => t.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (topicsWithDates.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">🗓️</span>
        <p>暂无排期内容</p>
        <p class="empty-hint">为选题设置日期后，将在这里显示时间线</p>
      </div>`;
    return;
  }

  const platformLabels = { wechat: '公众号', xiaohongshu: '小红书', douyin: '抖音', all: '全平台' };

  container.innerHTML = topicsWithDates.map((t, i) => `
    <div class="timeline-item">
      <div class="timeline-line">
        <div class="timeline-dot"></div>
        ${i < topicsWithDates.length - 1 ? '<div class="timeline-connector"></div>' : ''}
      </div>
      <div class="timeline-content">
        <div class="timeline-date">${t.date}</div>
        <div class="timeline-title">${escapeHtml(t.title)}</div>
        <div class="timeline-platform">${platformLabels[t.platform] || t.platform}</div>
      </div>
    </div>
  `).join('');
}

// ─── Analysis Module ─────────────────────
function initAnalysis() {
  $('#btn-analyze').addEventListener('click', runAnalysis);
}

function runAnalysis() {
  const text = $('#analysis-textarea').value.trim();
  if (!text) {
    showToast('请先输入需要分析的内容', 'warning');
    return;
  }

  const title = extractTitle(text);
  analyzeTitle(title || text.substring(0, 50));
  analyzeKeywords(text);
  analyzePublishTime();
  analyzeContentStats(text);
}

function extractTitle(text) {
  const lines = text.split('\n');
  if (lines[0] && lines[0].length < 100) return lines[0];
  return null;
}

function analyzeTitle(title) {
  // Demo title scoring
  const scores = {
    catchy: scoreCatchiness(title),
    clarity: scoreClarity(title),
    seo: scoreSEO(title),
    length: scoreTitleLength(title)
  };

  const overall = Math.round(
    scores.catchy * 0.35 + scores.clarity * 0.25 + scores.seo * 0.25 + scores.length * 0.15
  );

  // Update score circle
  const circle = $('#score-ring-fill');
  const circumference = 326.73;
  const offset = circumference - (overall / 100) * circumference;
  circle.style.strokeDashoffset = offset;

  const scoreColor = overall >= 80 ? 'var(--accent-success)' 
    : overall >= 60 ? 'var(--accent-warning)' 
    : 'var(--accent-danger)';
  circle.style.stroke = scoreColor;

  $('#score-value').textContent = overall;
  $('#score-value').style.color = scoreColor;

  $('#score-details').innerHTML = `
    <div class="score-detail-item">
      <span class="score-detail-label">🎯 吸引力</span>
      <span>${scores.catchy}/100</span>
    </div>
    <div class="score-detail-item">
      <span class="score-detail-label">📝 清晰度</span>
      <span>${scores.clarity}/100</span>
    </div>
    <div class="score-detail-item">
      <span class="score-detail-label">🔍 SEO友好</span>
      <span>${scores.seo}/100</span>
    </div>
    <div class="score-detail-item">
      <span class="score-detail-label">📏 长度适中</span>
      <span>${scores.length}/100</span>
    </div>
  `;
}

function scoreCatchiness(title) {
  let score = 50;
  const catchyWords = ['终极', '指南', '秘密', '揭秘', '真相', '必备', '免费', '史上', '最全', '惊人', '神奇', '独家', '必看', '收藏', '干货'];
  const emotionalWords = ['爱', '恨', '焦虑', '幸福', '恐惧', '渴望', '震惊', '感动', '崩溃'];
  const numberPattern = /\d+/;

  catchyWords.forEach(w => { if (title.includes(w)) score += 5; });
  emotionalWords.forEach(w => { if (title.includes(w)) score += 4; });
  if (numberPattern.test(title)) score += 8;
  if (title.includes('？') || title.includes('?')) score += 6;
  if (title.includes('！') || title.includes('!')) score -= 2;

  return Math.min(100, Math.max(0, score + Math.floor(Math.random() * 10)));
}

function scoreClarity(title) {
  let score = 70;
  if (title.length < 10) score -= 10;
  if (title.length > 50) score -= 15;
  if (title.length >= 15 && title.length <= 30) score += 15;
  return Math.min(100, Math.max(0, score + Math.floor(Math.random() * 10)));
}

function scoreSEO(title) {
  let score = 50;
  if (title.length >= 10 && title.length <= 60) score += 15;
  const keywords = ['如何', '怎么', '为什么', '是什么', '教程', '方法', '技巧', '攻略', '推荐', '排名'];
  keywords.forEach(k => { if (title.includes(k)) score += 5; });
  return Math.min(100, Math.max(0, score + Math.floor(Math.random() * 10)));
}

function scoreTitleLength(title) {
  const len = title.length;
  if (len >= 15 && len <= 35) return 90;
  if (len >= 10 && len <= 45) return 70;
  return 50;
}

function analyzeKeywords(text) {
  // Simple keyword extraction demo
  const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这'];
  
  const words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopWords.includes(w));

  const freq = {};
  words.forEach(w => {
    freq[w] = (freq[w] || 0) + 1;
  });

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const maxFreq = sorted.length > 0 ? sorted[0][1] : 1;

  const container = $('#keywords-cloud');
  if (sorted.length === 0) {
    container.innerHTML = '<span class="keyword-empty">未检测到关键词</span>';
    return;
  }

  container.innerHTML = sorted.map(([word, count]) => {
    const isHigh = count >= maxFreq * 0.6;
    return `<span class="keyword-tag${isHigh ? ' high' : ''}">${escapeHtml(word)}</span>`;
  }).join('');
}

function analyzePublishTime() {
  const container = $('#publish-time');
  const day = new Date().getDay();
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  // Demo: generate time slots based on content type
  container.innerHTML = `
    <div class="time-slot best">
      <span class="time-day">${days[(day + 2) % 7]}</span>
      <span class="time-range">20:00 - 22:00</span>
      <span class="time-reason">晚间黄金时段，用户活跃度最高</span>
      <span class="time-badge">最佳</span>
    </div>
    <div class="time-slot">
      <span class="time-day">${days[(day + 4) % 7]}</span>
      <span class="time-range">12:00 - 14:00</span>
      <span class="time-reason">午休阅读高峰</span>
    </div>
    <div class="time-slot">
      <span class="time-day">${days[(day + 5) % 7]}</span>
      <span class="time-range">07:00 - 09:00</span>
      <span class="time-reason">早间通勤阅读时段</span>
    </div>
  `;
}

function analyzeContentStats(text) {
  const charCount = text.replace(/\s/g, '').length;
  const paragraphs = text.split('\n').filter(p => p.trim()).length;
  const readTime = Math.max(1, Math.ceil(charCount / 400)); // ~400 chars/min
  const readability = charCount < 500 ? '易读' 
    : charCount < 1500 ? '适中' 
    : charCount < 3000 ? '较深' 
    : '深度';

  $('#content-stats').innerHTML = `
    <div class="stat-item">
      <span class="stat-label">字数</span>
      <span class="stat-value">${charCount}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">段落</span>
      <span class="stat-value">${paragraphs}</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">阅读时长</span>
      <span class="stat-value">约${readTime}分钟</span>
    </div>
    <div class="stat-item">
      <span class="stat-label">可读性</span>
      <span class="stat-value">${readability}</span>
    </div>
  `;
}

// ─── Export Module ───────────────────────
function renderExportPreviews() {
  const { title, content } = getEditorContent();

  if (!content) {
    ['wechat', 'xiaohongshu', 'douyin'].forEach(p => {
      $(`#export-${p}`).innerHTML = '<div class="export-placeholder">请在编辑器中创作内容</div>';
    });
    return;
  }

  // Wechat export
  $('#export-wechat').textContent = generateWechatExport(title, content);

  // Xiaohongshu export
  $('#export-xiaohongshu').textContent = generateXiaohongshuExport(title, content);

  // Douyin export
  $('#export-douyin').textContent = generateDouyinExport(title, content);
}

function generateWechatExport(title, content) {
  let result = '';
  if (title) result += title + '\n\n';
  
  const paragraphs = content.split('\n').filter(p => p.trim());
  paragraphs.forEach(p => {
    result += '　　' + p.trim() + '\n\n';
  });

  return result.trim();
}

function generateXiaohongshuExport(title, content) {
  const emojis = ['✨', '💡', '🔥', '📌', '💪', '🌟', '💯', '🎯'];
  let result = '';
  if (title) result += emojis[0] + ' ' + title + ' ' + emojis[1] + '\n\n';

  const paragraphs = content.split('\n').filter(p => p.trim());
  paragraphs.forEach((p, i) => {
    result += emojis[(i + 2) % emojis.length] + ' ' + p.trim() + '\n\n';
  });

  const topic = title || extractTopic(content);
  result += '#' + (topic || '内容').replace(/\s/g, '') + ' #内容创作 #干货分享 #创作者日常';

  return result;
}

function generateDouyinExport(title, content) {
  let result = '【口播脚本】\n\n';
  if (title) result += '🎬 ' + title + '\n\n';

  const paragraphs = content.split('\n').filter(p => p.trim());
  // Keep it short for Douyin (max ~5 paragraphs)
  const shortContent = paragraphs.slice(0, 5);
  shortContent.forEach(p => {
    result += p.trim() + '\n\n';
  });

  result += '#抖音创作 #内容干货';
  return result;
}

function initExport() {
  $$('.export-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const platform = btn.dataset.platform;
      const contentEl = $(`#export-${platform}`);
      const text = contentEl.textContent;

      if (text.includes('请在编辑器中创作内容')) {
        showToast('请先在编辑器中创作内容', 'warning');
        return;
      }

      copyToClipboard(text, platform);
    });
  });
}

function updateExportOnEdit() {
  // Only update if export tab is visible
  if ($('#tab-export').classList.contains('active')) {
    renderExportPreviews();
  }
}

function copyToClipboard(text, platform) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => {
      showCopyToast(platform);
    }).catch(() => {
      fallbackCopy(text);
      showCopyToast(platform);
    });
  } else {
    fallbackCopy(text);
    showCopyToast(platform);
  }
}

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function showCopyToast(platform) {
  const toast = $(`#toast-${platform}`);
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove('show'), 2000);
}

// ─── Utility Functions ───────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function extractTopic(text) {
  const words = text.substring(0, 100).replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
  if (words.length > 4) return words.substring(0, 6);
  return '内容创作';
}

function formatTime(timestamp) {
  const d = new Date(timestamp);
  const now = new Date();
  const diff = now - d;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  
  return d.toLocaleDateString('zh-CN', { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Keyboard Shortcuts ──────────────────
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+S to save draft
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if ($('#tab-editor').classList.contains('active')) {
        saveDraft();
      }
    }
  });
}

// ─── Score Gradient SVG ──────────────────
function initScoreGradient() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.width = '0';
  svg.style.height = '0';
  svg.innerHTML = `
    <defs>
      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#7c3aed"/>
        <stop offset="100%" stop-color="#06b6d4"/>
      </linearGradient>
    </defs>
  `;
  document.body.appendChild(svg);
}

// ─── Init ────────────────────────────────
function init() {
  initScoreGradient();
  initTabs();
  initEditor();
  initAI();
  initPreview();
  initCalendar();
  initAnalysis();
  initExport();
  initKeyboard();
  updateUsageUI();
  updateDraftCount();

  console.log('🎯 AI搭子 — 内容创作者AI协作助手 已就绪');
  console.log('💡 提示：在编辑器中开始写作，使用右侧AI工具辅助创作');
  console.log('📅 免费版每天3次AI调用，所有数据保存在本地浏览器');
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
