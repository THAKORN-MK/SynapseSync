import {
  createTutorConversation as createTutorConversationRequest,
  createTutorConversationWithImages as createTutorConversationWithImagesRequest,
  getAiProviders as getAiProvidersRequest,
  getTutorAttachmentUrl as getTutorAttachmentUrlRequest,
  getTutorConversation as getTutorConversationRequest,
  listTags as listTagsRequest,
  listTutorConversations as listTutorConversationsRequest,
  retryTutorMessage as retryTutorMessageRequest,
  sendTutorMessage as sendTutorMessageRequest,
  sendTutorMessageWithImages as sendTutorMessageWithImagesRequest,
} from '../api/client.js';
import { renderTagChips, renderTagFilter, renderTagPicker } from '../tags/tag-components.js';

const STATUS_LABELS = {
  processing: 'กำลังประมวลผล',
  awaiting_clarification: 'รอคำตอบเพิ่มเติม',
  retryable_error: 'ส่งไม่สำเร็จ · ลองใหม่ได้',
  answered: 'ตอบแล้ว',
};

function element(tagName, className = '', text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'ไม่ระบุเวลา'
    : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusLabel(status) {
  return STATUS_LABELS[status] || 'ยังไม่มีสถานะ';
}

function requestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  return `tutor-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function routeLink(label, path, navigate) {
  const link = element('a', 'button button-secondary', label);
  link.href = path;
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate?.(path);
  });
  return link;
}

function renderConversationCard(item, onOpen) {
  const card = element('article', 'tutor-history-card');
  card.dataset.conversationId = String(item.id);
  const open = element('button', 'tutor-history-card__open');
  open.type = 'button';
  open.dataset.action = 'open-conversation';
  open.append(
    element('strong', 'tutor-history-card__title', item.title || 'คำถามใหม่'),
    element('span', 'tutor-history-card__status', statusLabel(item.status)),
    element('span', 'tutor-history-card__date', formatDate(item.updated_at || item.created_at)),
  );
  open.addEventListener('click', () => onOpen(item.id));
  const tags = renderTagChips(item.tags || []);
  tags.classList.add('tutor-history-card__tags');
  card.append(open, tags);
  return card;
}

function renderTutorMessage(item, catalog, conversationId, onReuseAttachment, getAttachmentUrl) {
  const row = element('article', `tutor-message tutor-message--${item.role === 'user' ? 'learner' : 'assistant'}`);
  row.dataset.messageId = String(item.id ?? `pending-${item.sequence ?? ''}`);
  row.dataset.role = 'tutor-message-row';
  row.append(element('span', 'tutor-message__author', item.role === 'user' ? 'คุณ' : 'AI ติวเตอร์'));
  if (item.role === 'assistant' && item.provider_id && item.model_id) {
    const provider = catalog.providers.find((candidate) => candidate.id === item.provider_id);
    row.append(element('span', 'tutor-message__model', `${provider?.name || item.provider_id} · ${item.model_id}`));
  }
  if (Array.isArray(item.attachments) && item.attachments.length > 0) {
    const attachments = element('div', 'tutor-message__attachments');
    for (const attachment of item.attachments) {
      const card = element('figure', 'tutor-message__attachment');
      const image = element('img', 'tutor-message__image');
      image.src = getAttachmentUrl(conversationId, attachment.id);
      image.alt = attachment.filename || 'ภาพที่แนบ';
      image.loading = 'lazy';
      card.append(image, element('figcaption', 'tutor-message__filename', attachment.filename || 'ภาพที่แนบ'));
      if (item.role === 'user' && conversationId) {
        const reuse = element('button', 'button button-secondary tutor-message__reuse', 'ใช้ภาพนี้อีกครั้ง');
        reuse.type = 'button';
        reuse.dataset.action = 'reuse-tutor-attachment';
        reuse.dataset.attachmentId = String(attachment.id);
        reuse.addEventListener('click', () => onReuseAttachment(attachment));
        card.append(reuse);
      }
      attachments.append(card);
    }
    row.append(attachments);
  }
  row.append(element('p', 'tutor-message__content', item.content || ''));
  return row;
}

function emptyState(title, description) {
  const state = element('section', 'tutor-empty-state');
  state.append(element('h3', '', title), element('p', '', description));
  return state;
}

export function renderTutorPage({
  loadConversations = listTutorConversationsRequest,
  loadConversation = getTutorConversationRequest,
  createConversation = createTutorConversationRequest,
  createConversationWithImages = createTutorConversationWithImagesRequest,
  sendMessage = sendTutorMessageRequest,
  sendMessageWithImages = sendTutorMessageWithImagesRequest,
  retryMessage = retryTutorMessageRequest,
  loadProviders = getAiProvidersRequest,
  loadTags = listTagsRequest,
  getAttachmentUrl = getTutorAttachmentUrlRequest,
  navigate,
} = {}) {
  const page = element('section', 'page tutor-page');
  page.setAttribute('aria-labelledby', 'tutor-title');

  const header = element('header', 'tutor-heading');
  header.append(
    element('p', 'eyebrow', 'YOUR AI STUDY PARTNER'),
    element('h1', '', 'ถามเรื่องที่ยังไม่เข้าใจ'),
    element('p', 'page-intro', 'คุยต่อเนื่องได้ บันทึกประวัติไว้ และกลับมาตอบคำถามเพิ่มเติมเมื่อพร้อม'),
  );
  header.querySelector('h1').id = 'tutor-title';
  const headerActions = element('div', 'tutor-heading__actions');
  const newConversationButton = element('button', 'button button-secondary', 'เริ่มคำถามใหม่');
  newConversationButton.type = 'button';
  newConversationButton.dataset.action = 'new-conversation';
  headerActions.append(newConversationButton, routeLink('คลังข้อสอบ', '/quizzes', navigate));
  header.append(headerActions);

  const pageMessage = element('p', 'tutor-page-message');
  pageMessage.dataset.role = 'tutor-page-message';
  pageMessage.setAttribute('role', 'status');
  pageMessage.setAttribute('aria-live', 'polite');

  const layout = element('div', 'tutor-layout');
  const historyPanel = element('aside', 'tutor-panel tutor-history');
  historyPanel.setAttribute('aria-labelledby', 'tutor-history-title');
  historyPanel.append(element('h2', '', 'ประวัติการถาม'));
  historyPanel.querySelector('h2').id = 'tutor-history-title';
  const searchForm = element('form', 'tutor-history-search');
  searchForm.dataset.role = 'tutor-search-form';
  const searchInput = element('input', 'tutor-history-search__input');
  searchInput.type = 'search';
  searchInput.placeholder = 'ค้นหาคำถามหรือคำตอบ';
  searchInput.setAttribute('aria-label', 'ค้นหาประวัติคำถาม');
  searchInput.dataset.role = 'tutor-search';
  const searchControls = element('div', 'tutor-history-search__controls');
  let tagCatalog = { tags: [] };
  let selectedFilterTagId = null;
  let activeQuery = '';
  let activeTagId = null;
  let tagFilter = renderTagFilter(tagCatalog, selectedFilterTagId, (id) => {
    selectedFilterTagId = id;
  });
  tagFilter.dataset.role = 'tutor-tag-filter';
  tagFilter.setAttribute('aria-label', 'กรองประวัติตามวิชาหรือแท็ก');
  const searchButton = element('button', 'button button-primary', 'ค้นหา');
  searchButton.type = 'submit';
  searchControls.append(tagFilter, searchButton);
  searchForm.append(searchInput, searchControls);
  const historyMessage = element('p', 'tutor-history__message');
  historyMessage.dataset.role = 'tutor-history-message';
  historyMessage.setAttribute('role', 'status');
  const historyList = element('div', 'tutor-history-list');
  historyList.dataset.role = 'tutor-history-list';
  historyPanel.append(searchForm, historyMessage, historyList);

  const conversationPanel = element('section', 'tutor-panel tutor-conversation');
  conversationPanel.setAttribute('aria-label', 'บทสนทนากับ AI ติวเตอร์');
  const conversationHeader = element('header', 'tutor-conversation__header');
  const conversationTitle = element('h2', '', 'เริ่มต้นด้วยคำถามของคุณ');
  conversationTitle.dataset.role = 'tutor-conversation-title';
  const conversationTags = element('div', 'tutor-conversation__tags');
  const status = element('p', 'tutor-status');
  status.dataset.role = 'tutor-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  conversationHeader.append(conversationTitle, conversationTags, status);
  const messages = element('div', 'tutor-messages');
  messages.dataset.role = 'tutor-messages';
  messages.setAttribute('aria-live', 'polite');

  const form = element('form', 'tutor-message-form');
  form.dataset.role = 'tutor-message-form';
  const inputLabel = element('label', 'tutor-message-form__label', 'คำถามหรือคำตอบเพิ่มเติม');
  const modelControls = element('div', 'tutor-model-controls');
  const providerField = element('label', 'tutor-model-field', 'Provider');
  const providerSelect = element('select', 'tutor-model-select themed-select');
  providerSelect.dataset.role = 'tutor-provider';
  providerSelect.setAttribute('aria-label', 'เลือก Provider สำหรับข้อความถัดไป');
  providerField.append(providerSelect);
  const modelField = element('label', 'tutor-model-field', 'Model');
  const modelSelect = element('select', 'tutor-model-select themed-select');
  modelSelect.dataset.role = 'tutor-model';
  modelSelect.setAttribute('aria-label', 'เลือก Model สำหรับข้อความถัดไป');
  modelField.append(modelSelect);
  const responseLanguageField = element('label', 'tutor-model-field', 'ภาษาคำตอบ');
  const responseLanguageSelect = element('select', 'tutor-model-select themed-select');
  responseLanguageSelect.dataset.role = 'tutor-response-language';
  responseLanguageSelect.setAttribute('aria-label', 'เลือกภาษาคำตอบ');
  for (const [value, label] of [['th', 'ไทย'], ['en', 'English']]) {
    const option = element('option', '', label);
    option.value = value;
    responseLanguageSelect.append(option);
  }
  responseLanguageField.append(responseLanguageSelect);
  modelControls.append(providerField, modelField, responseLanguageField);
  const input = element('textarea', 'tutor-message-form__input');
  input.id = 'tutor-message-input';
  input.rows = 4;
  input.maxLength = 4000;
  input.placeholder = 'พิมพ์สิ่งที่สงสัย หรือให้บริบทเพิ่มเติม…';
  input.setAttribute('aria-label', 'พิมพ์คำถามหรือคำตอบเพิ่มเติม');
  input.dataset.role = 'tutor-input';
  inputLabel.htmlFor = input.id;
  const tagDetails = element('details', 'tutor-tag-details');
  const tagSummary = element('summary', '', 'เพิ่มแท็กวิชาหรือหัวข้อ (ไม่บังคับ)');
  const selectedTagIds = new Set();
  let tagPicker;
  const tagPickerContainer = element('div', 'tutor-tag-details__content');
  tagPicker = renderTagPicker({
    catalog: tagCatalog,
    onToggle: (id, selected) => {
      if (selected) selectedTagIds.add(id);
      else selectedTagIds.delete(id);
    },
  });
  tagPickerContainer.append(tagPicker);
  tagDetails.append(tagSummary, tagPickerContainer);
  const attachmentControls = element('div', 'tutor-attachment-controls');
  const attachmentInput = element('input', 'tutor-attachment-input');
  attachmentInput.type = 'file';
  attachmentInput.accept = 'image/jpeg,image/png,image/webp';
  attachmentInput.multiple = true;
  attachmentInput.hidden = true;
  attachmentInput.dataset.role = 'tutor-image-input';
  attachmentInput.setAttribute('aria-label', 'เลือกภาพประกอบคำถาม');
  const attachmentButton = element('button', 'button button-secondary', 'แนบภาพ');
  attachmentButton.type = 'button';
  attachmentButton.dataset.action = 'choose-tutor-images';
  attachmentControls.append(attachmentButton, attachmentInput);
  const attachmentPreviews = element('div', 'tutor-image-previews');
  attachmentPreviews.dataset.role = 'tutor-image-previews';
  const imageCapability = element('p', 'tutor-image-capability');
  imageCapability.dataset.role = 'tutor-image-capability';
  imageCapability.setAttribute('role', 'status');
  imageCapability.setAttribute('aria-live', 'polite');
  const formActions = element('div', 'tutor-message-form__actions');
  const submitButton = element('button', 'button button-primary', 'ส่งคำถาม');
  submitButton.type = 'submit';
  submitButton.dataset.action = 'send-tutor-message';
  const retryButton = element('button', 'button button-secondary', 'ลองส่งใหม่');
  retryButton.type = 'button';
  retryButton.dataset.action = 'retry-tutor';
  retryButton.hidden = true;
  formActions.append(attachmentControls, submitButton, retryButton);
  form.append(modelControls, inputLabel, input, tagDetails, attachmentPreviews, imageCapability, formActions);
  conversationPanel.append(conversationHeader, messages, form);
  layout.append(historyPanel, conversationPanel);
  page.append(header, pageMessage, layout);

  let conversations = [];
  let activeConversation = null;
  let activeConversationId = null;
  let isLoadingHistory = false;
  let historyError = '';
  let isBusy = false;
  let pendingSubmission = null;
  let aiCatalog = { providers: [], default_selection: null };
  let selectedProviderId = '';
  let selectedModelId = '';
  let selectedResponseLanguage = 'th';
  const selectedImages = [];
  const selectedAttachmentRefs = new Map();

  function providerById(id) {
    return aiCatalog.providers.find((provider) => provider.id === id);
  }

  function renderModelControls() {
    const defaultSelection = aiCatalog.default_selection;
    const fallbackProvider = providerById(defaultSelection?.provider_id) || aiCatalog.providers[0];
    const currentProvider = providerById(selectedProviderId) || fallbackProvider;
    selectedProviderId = currentProvider?.id || '';
    providerSelect.replaceChildren();
    for (const provider of aiCatalog.providers) {
      const option = element('option', '', provider.name);
      option.value = provider.id;
      providerSelect.append(option);
    }
    providerSelect.disabled = isBusy || aiCatalog.providers.length === 0;
    providerSelect.value = selectedProviderId;

    const models = currentProvider?.models || [];
    const defaultModel = defaultSelection && defaultSelection.provider_id === currentProvider?.id
      ? defaultSelection.model_id
      : '';
    const selectedModel = models.some((model) => model.id === selectedModelId)
      ? selectedModelId
      : (models.some((model) => model.id === defaultModel) ? defaultModel : models[0]?.id || '');
    selectedModelId = selectedModel;
    modelSelect.replaceChildren();
    for (const model of models) {
      const option = element('option', '', model.name);
      option.value = model.id;
      option.dataset.supportsImages = String(Boolean(model.supports_images));
      option.disabled = hasSelectedAttachments() && !model.supports_images;
      modelSelect.append(option);
    }
    if (models.length === 0) {
      const option = element('option', '', 'ไม่มีโมเดลให้เลือก');
      option.value = '';
      modelSelect.append(option);
    }
    modelSelect.disabled = isBusy || models.length === 0;
    modelSelect.value = selectedModelId;
    responseLanguageSelect.disabled = isBusy;
    responseLanguageSelect.value = selectedResponseLanguage;
  }

  function currentSelectionPayload() {
    if (!selectedProviderId || !selectedModelId) return {};
    return { provider_id: selectedProviderId, model_id: selectedModelId };
  }

  function hasSelectedAttachments() {
    return selectedImages.length + selectedAttachmentRefs.size > 0;
  }

  function currentModel() {
    return providerById(selectedProviderId)?.models.find((model) => model.id === selectedModelId) || null;
  }

  function selectedModelSupportsImages() {
    return Boolean(currentModel()?.supports_images);
  }

  function renderAttachmentPreviews() {
    attachmentPreviews.replaceChildren();
    selectedImages.forEach((entry, index) => {
      const card = element('div', 'tutor-image-preview');
      if (entry.previewUrl) {
        const image = element('img', 'tutor-image-preview__image');
        image.src = entry.previewUrl;
        image.alt = `ตัวอย่าง ${entry.file.name}`;
        card.append(image);
      }
      card.append(element('span', 'tutor-image-preview__name', entry.file.name));
      const remove = element('button', 'button button-secondary tutor-image-preview__remove', 'นำออก');
      remove.type = 'button';
      remove.dataset.action = 'remove-tutor-image';
      remove.addEventListener('click', () => {
        const [removed] = selectedImages.splice(index, 1);
        if (removed?.previewUrl) globalThis.URL?.revokeObjectURL?.(removed.previewUrl);
        renderAttachmentPreviews();
        renderModelControls();
        renderAttachmentCapability();
      });
      card.append(remove);
      attachmentPreviews.append(card);
    });
    for (const attachment of selectedAttachmentRefs.values()) {
      const card = element('div', 'tutor-image-preview tutor-image-preview--saved');
      card.append(element('span', 'tutor-image-preview__name', `ภาพเดิม · ${attachment.filename || 'ภาพที่แนบ'}`));
      const remove = element('button', 'button button-secondary tutor-image-preview__remove', 'นำออก');
      remove.type = 'button';
      remove.dataset.action = 'remove-tutor-attachment';
      remove.addEventListener('click', () => {
        selectedAttachmentRefs.delete(attachment.id);
        renderAttachmentPreviews();
        renderModelControls();
        renderAttachmentCapability();
      });
      card.append(remove);
      attachmentPreviews.append(card);
    }
  }

  function renderAttachmentCapability() {
    const hasAttachments = hasSelectedAttachments();
    const modelSupportsImages = selectedModelSupportsImages();
    imageCapability.hidden = !hasAttachments || modelSupportsImages;
    if (hasAttachments && !modelSupportsImages) {
      const anyImageModel = aiCatalog.providers.some((provider) => provider.models.some((model) => model.supports_images));
      imageCapability.textContent = anyImageModel
        ? 'โมเดลที่เลือกยังไม่รองรับภาพ กรุณาเลือกโมเดลที่รองรับ หรือเอาภาพออกก่อนส่ง'
        : 'ยังไม่มีโมเดลที่ยืนยันการรองรับภาพ ภาพและข้อความจะยังคงอยู่จนกว่าจะเลือกโมเดลที่รองรับ';
    } else {
      imageCapability.textContent = '';
    }
    submitButton.disabled = isBusy
      || Boolean(pendingSubmission)
      || !selectedProviderId
      || !selectedModelId
      || (hasAttachments && !modelSupportsImages);
    attachmentButton.disabled = isBusy;
  }

  function addAttachmentReference(attachment) {
    if (selectedAttachmentRefs.has(attachment.id)) return;
    if (hasSelectedAttachments() && selectedImages.length + selectedAttachmentRefs.size >= 3) {
      setPageMessage('แนบภาพได้ไม่เกิน 3 ภาพต่อข้อความ', true);
      return;
    }
    selectedAttachmentRefs.set(attachment.id, attachment);
    renderAttachmentPreviews();
    renderModelControls();
    renderAttachmentCapability();
    setPageMessage('');
  }

  function clearSelectedAttachments() {
    for (const entry of selectedImages) {
      if (entry.previewUrl) globalThis.URL?.revokeObjectURL?.(entry.previewUrl);
    }
    selectedImages.splice(0);
    selectedAttachmentRefs.clear();
    renderAttachmentPreviews();
    renderModelControls();
    renderAttachmentCapability();
  }

  function addSelectedImageFiles(fileList) {
    const incoming = [...(fileList || [])];
    if (incoming.length === 0) return;
    const currentCount = selectedImages.length + selectedAttachmentRefs.size;
    const currentBytes = selectedImages.reduce((total, entry) => total + entry.file.size, 0)
      + [...selectedAttachmentRefs.values()].reduce((total, attachment) => total + attachment.byte_size, 0);
    const incomingBytes = incoming.reduce((total, file) => total + file.size, 0);
    const invalidType = incoming.some((file) => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    const invalidSize = incoming.some((file) => file.size <= 0 || file.size > 5 * 1024 * 1024);
    if (currentCount + incoming.length > 3) {
      setPageMessage('ไม่รับไฟล์ภาพ: แนบได้ไม่เกิน 3 ภาพต่อข้อความ', true);
      return;
    }
    if (invalidType) {
      setPageMessage('ไม่รับไฟล์ภาพ: รองรับเฉพาะ JPEG, PNG และ WebP', true);
      return;
    }
    if (invalidSize) {
      setPageMessage('ไม่รับไฟล์ภาพ: แต่ละภาพต้องมีขนาดมากกว่า 0 และไม่เกิน 5 MB', true);
      return;
    }
    if (currentBytes + incomingBytes > 15 * 1024 * 1024) {
      setPageMessage('ไม่รับไฟล์ภาพ: ขนาดรวมต่อข้อความต้องไม่เกิน 15 MB', true);
      return;
    }
    for (const file of incoming) {
      let previewUrl = '';
      try {
        if (typeof globalThis.URL?.createObjectURL === 'function') {
          previewUrl = globalThis.URL.createObjectURL(file);
        }
      } catch {
        previewUrl = '';
      }
      selectedImages.push({ file, previewUrl });
    }
    renderAttachmentPreviews();
    renderModelControls();
    renderAttachmentCapability();
    setPageMessage('');
  }

  function buildImageFormData(submission) {
    const formData = new FormData();
    formData.append('message', submission.message);
    formData.append('request_id', submission.requestId);
    formData.append('response_language', submission.response_language || 'th');
    if (submission.provider_id) formData.append('provider_id', submission.provider_id);
    if (submission.model_id) formData.append('model_id', submission.model_id);
    for (const tagId of submission.tagIds || []) formData.append('tag_ids', String(tagId));
    for (const attachmentId of selectedAttachmentRefs.keys()) formData.append('attachment_ids', String(attachmentId));
    for (const { file } of selectedImages) formData.append('images', file, file.name);
    return formData;
  }

  function setPageMessage(text, isError = false) {
    pageMessage.textContent = text;
    pageMessage.setAttribute('role', isError ? 'alert' : 'status');
    if (isError) pageMessage.dataset.state = 'error';
    else delete pageMessage.dataset.state;
  }

  function renderHistory() {
    historyList.replaceChildren();
    if (isLoadingHistory) {
      historyMessage.textContent = 'กำลังโหลดประวัติ…';
      return;
    }
    historyMessage.textContent = historyError;
    historyMessage.setAttribute('role', historyError ? 'alert' : 'status');
    if (historyError) {
      historyList.append(emptyState('โหลดประวัติไม่สำเร็จ', 'ตรวจสอบการเชื่อมต่อแล้วลองค้นหาอีกครั้ง'));
      return;
    }
    if (conversations.length === 0) {
      historyList.append(emptyState(
        activeQuery || activeTagId ? 'ไม่พบประวัติที่ตรงกัน' : 'ยังไม่มีประวัติการถาม',
        activeQuery || activeTagId ? 'ลองเปลี่ยนคำค้นหาหรือเลือกแท็กอื่น' : 'เมื่อเริ่มถาม ระบบจะเก็บบทสนทนาของคุณไว้ที่นี่',
      ));
      return;
    }
    historyList.append(...conversations.map((item) => renderConversationCard(item, openConversation)));
  }

  function renderConversation() {
    const wasAtBottom = messages.scrollHeight - messages.scrollTop - messages.clientHeight <= 48;
    const statusValue = activeConversation?.status || (pendingSubmission ? 'processing' : null);
    conversationTitle.textContent = activeConversation?.title || (activeConversationId ? 'บทสนทนา' : 'เริ่มต้นด้วยคำถามของคุณ');
    conversationTags.replaceChildren(renderTagChips(activeConversation?.tags || []));
    if (statusValue) status.textContent = statusLabel(statusValue);
    else status.textContent = 'เขียนคำถามได้เลย ระบบจะเก็บประวัติไว้ให้';
    messages.replaceChildren();
    const currentMessages = [...(activeConversation?.messages || [])];
    if (pendingSubmission && !currentMessages.some((item) => item.request_id === pendingSubmission.requestId)) {
      const lastMessage = currentMessages.at(-1);
      const duplicateOptimistic = lastMessage?.role === 'user' && lastMessage.content === pendingSubmission.message;
      if (!duplicateOptimistic) {
        currentMessages.push({
          id: `pending-${pendingSubmission.requestId}`,
          sequence: currentMessages.length + 1,
          role: 'user',
          kind: pendingSubmission.mode === 'reply' ? 'clarification_reply' : 'question',
          content: pendingSubmission.message,
        });
      }
    }
    if (currentMessages.length > 0) {
      messages.append(...currentMessages.map((item) => renderTutorMessage(
        item,
        aiCatalog,
        activeConversationId,
        addAttachmentReference,
        getAttachmentUrl,
      )));
    } else {
      messages.append(emptyState('ถามได้ทุกเมื่อ', 'พิมพ์คำถามไว้ด้านล่าง แล้ว AI จะช่วยอธิบายหรือถามกลับหากต้องการบริบทเพิ่ม'));
    }

    const awaitingClarification = statusValue === 'awaiting_clarification';
    inputLabel.textContent = awaitingClarification ? 'คำตอบเพิ่มเติม' : 'คำถามหรือข้อความเพิ่มเติม';
    input.placeholder = awaitingClarification
      ? 'ตอบคำถามเพิ่มเติมเพื่อให้ AI อธิบายได้ตรงจุด…'
      : 'พิมพ์สิ่งที่สงสัย หรือให้บริบทเพิ่มเติม…';
    input.disabled = isBusy;
    retryButton.hidden = !pendingSubmission || isBusy;
    retryButton.disabled = isBusy;
    providerSelect.disabled = isBusy || aiCatalog.providers.length === 0;
    modelSelect.disabled = isBusy || !selectedModelId;
    responseLanguageSelect.disabled = isBusy;
    responseLanguageSelect.value = selectedResponseLanguage;
    retryButton.textContent = statusValue === 'processing' ? 'ตรวจสอบสถานะ' : 'ลองส่งใหม่';
    tagDetails.hidden = Boolean(activeConversationId);
    submitButton.textContent = activeConversationId
      ? (awaitingClarification ? 'ส่งคำตอบ' : 'ส่งข้อความ')
      : 'ส่งคำถาม';
    newConversationButton.disabled = isBusy;
    retryButton.dataset.requestId = pendingSubmission?.requestId || '';
    retryButton.dataset.conversationId = String(pendingSubmission?.conversationId || activeConversationId || '');
    renderAttachmentCapability();
    if (wasAtBottom) messages.scrollTop = Math.max(0, messages.scrollHeight - messages.clientHeight);
  }

  async function refreshHistory() {
    isLoadingHistory = true;
    renderHistory();
    try {
      const result = await loadConversations({ q: activeQuery, tagId: activeTagId });
      conversations = Array.isArray(result) ? result : [];
      historyError = '';
    } catch (error) {
      conversations = [];
      historyError = error?.message || 'โหลดประวัติไม่สำเร็จ กรุณาลองอีกครั้ง';
    } finally {
      isLoadingHistory = false;
      renderHistory();
    }
  }

  async function reloadTagCatalog() {
    const catalog = await loadTags();
    tagCatalog = catalog && Array.isArray(catalog.tags) ? catalog : { tags: [] };
    tagPicker.setCatalog(tagCatalog);
    const replacement = renderTagFilter(tagCatalog, selectedFilterTagId, (id) => {
      selectedFilterTagId = id;
    });
    replacement.dataset.role = 'tutor-tag-filter';
    replacement.setAttribute('aria-label', 'กรองประวัติตามวิชาหรือแท็ก');
    tagFilter.replaceWith(replacement);
    tagFilter = replacement;
  }

  async function openConversation(id) {
    if (isBusy) return;
    setPageMessage('กำลังเปิดบทสนทนา…');
    try {
      const detail = await loadConversation(id);
      const numericId = Number(detail?.id);
      if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('ข้อมูลบทสนทนาไม่ถูกต้อง');
      activeConversationId = numericId;
      activeConversation = detail;
      const latestUserMessage = [...(detail.messages || [])].reverse().find((item) => item.role === 'user');
      selectedResponseLanguage = latestUserMessage?.response_language === 'en' ? 'en' : 'th';
      responseLanguageSelect.value = selectedResponseLanguage;
      if (detail.provider_id && detail.model_id) {
        selectedProviderId = detail.provider_id;
        selectedModelId = detail.model_id;
        renderModelControls();
      }
      pendingSubmission = detail.status === 'retryable_error'
        ? {
          message: [...(detail.messages || [])].reverse().find((item) => item.role === 'user')?.content || '',
          requestId: '',
          tagIds: [],
          response_language: latestUserMessage?.response_language === 'en' ? 'en' : 'th',
          mode: 'retry-saved',
          conversationId: numericId,
        }
        : null;
      setPageMessage('');
      renderConversation();
    } catch (error) {
      setPageMessage(error?.message || 'เปิดบทสนทนาไม่สำเร็จ กรุณาลองอีกครั้ง', true);
    }
  }

  function setOptimisticSubmission(submission) {
    pendingSubmission = submission;
    const existing = activeConversation?.messages || [];
    activeConversation = {
      id: activeConversationId,
      title: activeConversation?.title || submission.message.slice(0, 160),
      status: 'processing',
      tags: activeConversation?.tags || [],
      messages: existing,
    };
    renderConversation();
  }

  async function executeSubmission(submission, { retry = false } = {}) {
    if (isBusy) return;
    isBusy = true;
    setPageMessage(retry ? 'กำลังลองส่งคำถามเดิมอีกครั้ง…' : 'กำลังส่งคำถาม…');
    setOptimisticSubmission(submission);
    renderConversation();
    try {
      let result;
      const conversationId = submission.conversationId || activeConversationId;
      const selection = submission.provider_id && submission.model_id
        ? { provider_id: submission.provider_id, model_id: submission.model_id }
        : {};
      const responseLanguage = submission.response_language === 'en' ? 'en' : 'th';
      const attachmentIds = [...selectedAttachmentRefs.keys()];
      if (retry && conversationId && submission.mode === 'retry-saved') {
        result = await retryMessage(conversationId, { ...selection, response_language: responseLanguage });
      } else if (selectedImages.length > 0) {
        const formData = buildImageFormData(submission);
        result = conversationId && submission.mode !== 'start'
          ? await sendMessageWithImages(conversationId, formData)
          : await createConversationWithImages(formData);
      } else if (conversationId && submission.mode !== 'start') {
        result = await sendMessage(conversationId, {
          message: submission.message,
          request_id: submission.requestId,
          response_language: responseLanguage,
          ...selection,
          ...(attachmentIds.length > 0 ? { attachment_ids: attachmentIds } : {}),
        });
      } else {
        result = await createConversation({
          message: submission.message,
          tag_ids: submission.tagIds,
          request_id: submission.requestId,
          response_language: responseLanguage,
          ...selection,
        });
      }
      const resultId = Number(result?.id);
      if (!Number.isSafeInteger(resultId) || resultId <= 0) throw new Error('ระบบไม่ได้ส่งข้อมูลบทสนทนากลับมา');
      activeConversationId = resultId;
      activeConversation = result;
      pendingSubmission = result?.status === 'retryable_error' || result?.status === 'processing'
        ? {
          ...submission,
          conversationId: resultId,
          mode: result.status === 'retryable_error' ? 'retry-saved' : submission.mode,
        }
        : null;
      if (result.status !== 'retryable_error') {
        if (input.value.trim() === submission.message) input.value = '';
        clearSelectedAttachments();
      }
      setPageMessage(result?.status === 'processing' ? 'คำถามกำลังประมวลผลอยู่ คุณตรวจสอบสถานะได้อีกครั้ง' : '');
      renderConversation();
      await refreshHistory();
    } catch (error) {
      const failedConversationId = Number(error?.detail?.conversation_id);
      const usableConversationId = Number.isSafeInteger(failedConversationId) && failedConversationId > 0
        ? failedConversationId
        : submission.conversationId || activeConversationId;
      if (usableConversationId) {
        activeConversationId = usableConversationId;
        submission.conversationId = usableConversationId;
        try {
          const saved = await loadConversation(usableConversationId);
          activeConversation = saved;
          if (saved.status === 'retryable_error') submission.mode = 'retry-saved';
        } catch {
          activeConversation = { ...activeConversation, id: usableConversationId };
        }
      }
      pendingSubmission = submission;
      setPageMessage(error?.message || 'ส่งคำถามไม่สำเร็จ ข้อความยังอยู่ ลองส่งอีกครั้งได้', true);
      renderConversation();
      await refreshHistory();
    } finally {
      isBusy = false;
      renderConversation();
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    if (isBusy) return;
    if (pendingSubmission) {
      pendingSubmission.response_language = selectedResponseLanguage;
      await executeSubmission(pendingSubmission, { retry: true });
      return;
    }
    const text = input.value.trim();
    if (!text) {
      setPageMessage('กรุณาพิมพ์คำถามก่อนส่ง', true);
      input.focus();
      return;
    }
    if (!selectedProviderId || !selectedModelId) {
      setPageMessage('เลือกรายการ Provider และ Model ก่อนส่งคำถาม', true);
      providerSelect.focus();
      return;
    }
    if (hasSelectedAttachments() && !selectedModelSupportsImages()) {
      renderAttachmentCapability();
      setPageMessage(imageCapability.textContent, true);
      return;
    }
    const submission = {
      message: text,
      tagIds: activeConversationId ? [] : [...selectedTagIds],
      requestId: requestId(),
      response_language: selectedResponseLanguage,
      ...currentSelectionPayload(),
      attachmentIds: [...selectedAttachmentRefs.keys()],
      mode: activeConversationId ? 'reply' : 'start',
      conversationId: activeConversationId,
    };
    await executeSubmission(submission);
  }

  function startNewConversation() {
    if (isBusy) return;
    if (pendingSubmission && !activeConversationId) {
      setPageMessage('มีคำถามที่ยังส่งไม่สำเร็จ กรุณาลองส่งคำถามเดิมก่อน', true);
      return;
    }
    activeConversationId = null;
    activeConversation = null;
    pendingSubmission = null;
    clearSelectedAttachments();
    selectedResponseLanguage = 'th';
    responseLanguageSelect.value = selectedResponseLanguage;
    selectedTagIds.clear();
    tagPicker.setSelectedTagIds([]);
    tagDetails.hidden = false;
    input.value = '';
    setPageMessage('');
    renderConversation();
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    activeQuery = searchInput.value.trim();
    activeTagId = selectedFilterTagId;
    void refreshHistory();
  });
  form.addEventListener('submit', (event) => { void submitMessage(event); });
  attachmentButton.addEventListener('click', () => attachmentInput.click());
  attachmentInput.addEventListener('change', () => {
    addSelectedImageFiles(attachmentInput.files);
    attachmentInput.value = '';
  });
  retryButton.addEventListener('click', () => {
    if (pendingSubmission) {
      Object.assign(pendingSubmission, currentSelectionPayload(), {
        response_language: selectedResponseLanguage,
      });
      void executeSubmission(pendingSubmission, { retry: true });
    }
  });
  providerSelect.addEventListener('change', () => {
    selectedProviderId = providerSelect.value;
    selectedModelId = '';
    renderModelControls();
    renderAttachmentCapability();
  });
  modelSelect.addEventListener('change', () => {
    selectedModelId = modelSelect.value;
    renderModelControls();
    renderAttachmentCapability();
  });
  responseLanguageSelect.addEventListener('change', () => {
    selectedResponseLanguage = responseLanguageSelect.value === 'en' ? 'en' : 'th';
  });
  newConversationButton.addEventListener('click', startNewConversation);

  void refreshHistory();
  void reloadTagCatalog().catch((error) => {
    setPageMessage(error?.message || 'โหลดแท็กไม่สำเร็จ แต่ยังเริ่มถามได้', true);
  });
  void loadProviders().then((catalog) => {
    aiCatalog = catalog && Array.isArray(catalog.providers)
      ? catalog
      : { providers: [], default_selection: null };
    const activeSelection = activeConversation?.provider_id && activeConversation?.model_id
      ? { provider_id: activeConversation.provider_id, model_id: activeConversation.model_id }
      : aiCatalog.default_selection;
    selectedProviderId = activeSelection?.provider_id || '';
    selectedModelId = activeSelection?.model_id || '';
    renderModelControls();
    renderConversation();
  }).catch((error) => {
    aiCatalog = { providers: [], default_selection: null };
    renderModelControls();
    renderConversation();
    setPageMessage(error?.message || 'โหลดรายการ Provider/Model ไม่สำเร็จ กรุณาลองใหม่', true);
  });
  renderModelControls();
  renderConversation();
  return page;
}
