import {
  createTag as createTagRequest,
  deleteDocument as deleteDocumentRequest,
  getDocumentContent as getDocumentContentRequest,
  getDocumentText as getDocumentTextRequest,
  listDocuments as listDocumentsRequest,
  listTags as listTagsRequest,
  renameDocument as renameDocumentRequest,
  replaceDocumentTags as replaceDocumentTagsRequest,
  uploadDocument as uploadDocumentRequest,
} from '../api/client.js';
import { mountPdfPreview } from '../documents/pdf-viewer.js';
import { renderTagChips, renderTagPicker } from '../tags/tag-components.js';
import { createTagAssignmentQueue } from '../tags/tag-assignment-queue.js';
import { nextDocumentTagSelection } from '../tags/document-tag-selection.js';

function getDocumentPageSize(width) {
  if (width <= 480) return 6;
  if (width <= 1079) return 12;
  return 24;
}
const FILE_TYPES = { pdf: 'PDF', docx: 'DOCX', md: 'Markdown', txt: 'Text' };
const FILE_BADGES = { pdf: 'PDF', docx: 'DOCX', md: 'MD', txt: 'TXT' };

function element(tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'ไม่ระบุวันที่'
    : new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(date);
}

function formatFileSize(sizeBytes) {
  if (!Number.isFinite(Number(sizeBytes)) || Number(sizeBytes) < 0) return '—';
  const size = Number(sizeBytes);
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function routeLink(label, path, navigate, className = 'button button-secondary') {
  const link = element('a', className, label);
  link.href = path;
  link.dataset.route = path;
  link.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate?.(path);
  });
  return link;
}

function flattenTags(catalog) {
  return Array.isArray(catalog?.tags) ? catalog.tags : [];
}

function renderFilterChips(catalog, selectedTagId, onSelect) {
  const group = element('div', 'document-tag-filters');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'กรองเอกสารตามวิชาหรือแท็ก');

  const options = [{ id: null, name: 'ทั้งหมด', color: 'violet' }, ...flattenTags(catalog)];
  for (const tag of options) {
    const button = element('button', 'tag-chip document-tag-filter', tag.name);
    button.type = 'button';
    button.dataset.color = tag.color || 'violet';
    button.dataset.filterTagId = tag.id === null ? '' : String(tag.id);
    button.setAttribute('aria-pressed', String(tag.id === selectedTagId || (tag.id === null && selectedTagId === null)));
    button.addEventListener('click', () => onSelect(tag.id));
    group.append(button);
  }
  return group;
}

function renderTextDocumentPreview(preview, documentItem, text) {
  const paper = element('div', 'document-library-card__preview-paper');
  const title = element('p', 'document-library-card__preview-title', documentItem.title || 'เอกสารไม่มีชื่อ');
  const excerpt = String(text ?? '').trim().slice(0, 520) || 'ไม่พบข้อความตัวอย่างในเอกสารนี้';
  const body = element('pre', 'document-library-card__preview-text', excerpt);
  body.dataset.role = 'document-text-preview';
  paper.append(title, body);
  const fileType = element('span', 'document-library-card__preview-type', FILE_BADGES[documentItem.file_type] || 'FILE');
  fileType.dataset.role = 'document-preview-type';
  preview.replaceChildren(paper, fileType);
  preview.dataset.previewState = 'ready';
}

function renderUnavailablePreview(preview, documentItem) {
  const paper = element('div', 'document-library-card__preview-paper');
  paper.append(
    element('p', 'document-library-card__preview-title', documentItem.title || 'เอกสารไม่มีชื่อ'),
    element('p', 'document-library-card__preview-unavailable', 'ไม่สามารถสร้างตัวอย่างเอกสารได้'),
  );
  const fileType = element('span', 'document-library-card__preview-type', FILE_BADGES[documentItem.file_type] || 'FILE');
  fileType.dataset.role = 'document-preview-type';
  preview.replaceChildren(paper, fileType);
  preview.dataset.previewState = 'unavailable';
}

function makeDocumentCard(documentItem, {
  getTagCatalog,
  getTagAssignment,
  refreshTagCatalog,
  createTag,
  updateTitle,
  updateTags,
  removeDocument,
  confirmDelete,
  navigate,
  setMessage,
}) {
  const card = element('article', 'document-library-card');
  card.dataset.documentId = String(documentItem.id);

  const preview = element('div', 'document-library-card__preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.dataset.role = 'document-preview';
  preview.dataset.previewState = 'loading';
  const fileIcon = element('span', 'document-library-card__file-icon');
  const fileType = element('span', 'document-library-card__file-type', FILE_BADGES[documentItem.file_type] || 'FILE');
  fileIcon.append(fileType);
  const previewType = element('span', 'document-library-card__preview-type', FILE_BADGES[documentItem.file_type] || 'FILE');
  previewType.dataset.role = 'document-preview-type';
  preview.append(fileIcon, previewType);

  const headingRow = element('div', 'document-library-card__heading');
  const heading = element('h2', '', documentItem.title || 'เอกสารไม่มีชื่อ');
  const titleForm = element('form', 'document-title-edit');
  titleForm.dataset.role = 'title-form';
  titleForm.hidden = true;
  const titleLabel = element('label', '', 'ชื่อเอกสาร');
  const titleInput = element('input', 'document-title-edit__input');
  titleInput.type = 'text';
  titleInput.maxLength = 160;
  titleInput.required = true;
  titleInput.value = documentItem.title || '';
  titleInput.dataset.role = 'title-input';
  titleLabel.htmlFor = `document-title-${documentItem.id}`;
  titleInput.id = titleLabel.htmlFor;
  const titleActions = element('div', 'document-title-edit__actions');
  const saveTitle = element('button', 'button button-primary', 'บันทึกชื่อ');
  saveTitle.type = 'submit';
  const cancelTitle = element('button', 'button button-quiet', 'ยกเลิก');
  cancelTitle.type = 'button';
  cancelTitle.dataset.action = 'cancel-title';
  titleActions.append(saveTitle, cancelTitle);
  titleForm.append(titleLabel, titleInput, titleActions);

  const editTitleButton = element('button', 'button button-quiet', 'แก้ชื่อ');
  editTitleButton.type = 'button';
  editTitleButton.dataset.action = 'edit-title';
  editTitleButton.setAttribute('aria-label', `แก้ชื่อ ${documentItem.title || 'เอกสาร'}`);
  editTitleButton.addEventListener('click', () => {
    titleInput.value = documentItem.title || '';
    titleForm.hidden = false;
    heading.hidden = true;
    editTitleButton.hidden = true;
    titleInput.focus();
  });
  cancelTitle.addEventListener('click', () => {
    titleInput.value = documentItem.title || '';
    titleForm.hidden = true;
    heading.hidden = false;
    editTitleButton.hidden = false;
    setMessage('');
  });
  titleForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    if (!title) {
      setMessage('กรุณากรอกชื่อเอกสาร', true);
      titleInput.focus();
      return;
    }
    saveTitle.disabled = true;
    try {
      const updated = await updateTitle(documentItem.id, { title });
      documentItem.title = updated?.title || title;
      heading.textContent = documentItem.title;
      editTitleButton.setAttribute('aria-label', `แก้ชื่อ ${documentItem.title}`);
      titleForm.hidden = true;
      heading.hidden = false;
      editTitleButton.hidden = false;
      setMessage('ชื่อเอกสารอัปเดตแล้ว');
    } catch (error) {
      setMessage(error?.message || 'เปลี่ยนชื่อเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง', true);
    } finally {
      saveTitle.disabled = false;
    }
  });

  const source = element('p', 'document-library-card__source');
  source.append(
    element('span', '', documentItem.original_filename || 'ไม่ระบุชื่อไฟล์'),
    element('span', 'document-library-card__separator', '·'),
    element('span', '', FILE_TYPES[documentItem.file_type] || 'เอกสาร'),
    element('span', 'document-library-card__separator', '·'),
    element('span', '', formatFileSize(documentItem.size_bytes)),
  );

  const metadata = element('div', 'document-library-card__metadata');
  metadata.append(element('span', '', `เพิ่มเมื่อ ${formatDate(documentItem.created_at)}`));
  if (documentItem.last_page) metadata.append(element('span', '', `อ่านถึงหน้า ${documentItem.last_page}`));
  else if (Number.isFinite(documentItem.scroll_ratio)) {
    metadata.append(element('span', '', `อ่านแล้ว ${Math.round(documentItem.scroll_ratio * 100)}%`));
  } else metadata.append(element('span', '', 'ยังไม่ได้เริ่มอ่าน'));

  const tagSection = element('section', 'document-library-card__tag-section');
  tagSection.setAttribute('aria-label', `แท็กของ ${documentItem.title || 'เอกสาร'}`);
  const tagHeading = element('h3', 'document-library-card__tag-heading', 'วิชาและหัวข้อ');
  const tagSummary = element('div', 'document-library-card__tag-summary');
  tagSummary.dataset.role = 'tag-summary';
  const manageTags = element('button', 'button button-quiet', 'จัดการแท็ก');
  manageTags.type = 'button';
  manageTags.dataset.action = 'manage-tags';
  manageTags.setAttribute('aria-expanded', 'false');
  const pickerContainer = element('div', 'document-library-card__picker-container');
  pickerContainer.hidden = true;

  const assignment = getTagAssignment(documentItem, tagSummary, pickerContainer);
  assignment.syncTagSelection(assignment.queue.getTagIds());
  manageTags.addEventListener('click', () => {
    const isOpening = pickerContainer.hidden;
    pickerContainer.hidden = !isOpening;
    manageTags.setAttribute('aria-expanded', String(isOpening));
    if (isOpening && !assignment.picker) {
      const picker = renderTagPicker({
        catalog: getTagCatalog(),
        selectedTagIds: assignment.queue.getTagIds(),
        onToggle: (tagId) => {
          assignment.queue.replace(nextDocumentTagSelection(assignment.queue.getTagIds(), tagId, getTagCatalog()));
        },
        onCreate: async (payload) => {
          setMessage('กำลังสร้างแท็ก…');
          let created;
          try {
            created = await createTag(payload);
          } catch (error) {
            setMessage(error?.message || 'สร้างแท็กไม่สำเร็จ กรุณาลองอีกครั้ง', true);
            throw error;
          }
          const createdId = Number(created?.id);
          if (!Number.isInteger(createdId) || createdId <= 0) {
            const error = new Error('สร้างแท็กแล้ว แต่ไม่ได้รับรหัสแท็กที่ใช้งานได้');
            setMessage(error.message, true);
            throw error;
          }
          try {
            await refreshTagCatalog();
          } catch {
            const tags = getTagCatalog()?.tags ?? [];
            if (!tags.some((item) => Number(item.id) === createdId)) {
              tagCatalog = { tags: [...tags, created] };
              assignment.picker?.setCatalog?.(getTagCatalog());
            }
          }
          assignment.queue.include(createdId);
          setMessage('แท็กใหม่ถูกเพิ่มลงในเอกสารแล้ว');
        },
      });
      picker.dataset.role = 'tag-picker';
      assignment.picker = picker;
      pickerContainer.replaceChildren(picker);
    }
    if (isOpening && assignment.picker && !pickerContainer.contains(assignment.picker)) {
      pickerContainer.replaceChildren(assignment.picker);
    }
  });

  const tagInfo = element('div', 'document-library-card__tag-info');
  tagInfo.append(tagHeading, tagSummary);
  tagSection.append(tagInfo, manageTags, pickerContainer);

  const truncationNotice = element('p', 'document-library-card__search-notice');
  truncationNotice.textContent = 'ค้นหาได้บางส่วน เนื่องจากเอกสารมีเนื้อหายาว';
  truncationNotice.hidden = !documentItem.search_text_truncated;

  const actions = element('div', 'document-library-card__actions');
  actions.append(
    routeLink('เปิดอ่าน', `/documents/${documentItem.id}`, navigate, 'button button-primary'),
    editTitleButton,
  );
  const deleteButton = element('button', 'button button-quiet document-library-card__delete', 'ลบ');
  deleteButton.type = 'button';
  deleteButton.dataset.action = 'delete-document';
  deleteButton.setAttribute('aria-label', `ลบ ${documentItem.title || 'เอกสาร'}`);
  deleteButton.addEventListener('click', async () => {
    if (!confirmDelete(documentItem)) return;
    deleteButton.disabled = true;
    try {
      await removeDocument(documentItem.id);
      card.remove();
      setMessage('ลบเอกสารแล้ว');
      documentItem.onDeleted?.();
    } catch (error) {
      deleteButton.disabled = false;
      setMessage(error?.message || 'ลบเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง', true);
    }
  });
  actions.append(deleteButton);
  headingRow.append(heading, editTitleButton);
  card.append(preview, headingRow, titleForm, source, metadata, tagSection, truncationNotice, actions);
  return card;
}

export function renderDocumentsPage({
  loadDocuments = listDocumentsRequest,
  loadTags = listTagsRequest,
  loadDocumentContent = getDocumentContentRequest,
  loadDocumentText = getDocumentTextRequest,
  pdfjs,
  uploadDocument = uploadDocumentRequest,
  createTag = createTagRequest,
  renameDocument = renameDocumentRequest,
  replaceDocumentTags = replaceDocumentTagsRequest,
  deleteDocument = deleteDocumentRequest,
  confirmDelete = (item) => window.confirm(`ต้องการลบ “${item.title}” หรือไม่?`),
  navigate,
} = {}) {
  const page = element('section', 'page document-library-page');
  page.setAttribute('aria-labelledby', 'document-library-title');
  const header = element('header', 'document-page-heading');
  const title = element('h1', '', 'คลังเอกสาร');
  title.id = 'document-library-title';
  header.append(
    element('p', 'eyebrow', 'YOUR READING LIBRARY'),
    title,
    element('p', 'page-intro', 'รวมเอกสารสำหรับอ่าน ค้นหา และจัดหมวดหมู่ไว้ในที่เดียว'),
  );

  const message = element('p', 'document-page-message');
  message.setAttribute('role', 'status');
  message.setAttribute('aria-live', 'polite');
  const uploadPanel = element('section', 'document-upload-panel');
  uploadPanel.setAttribute('aria-label', 'เพิ่มเอกสารเข้าคลัง');
  const fileInput = element('input', 'document-upload__input');
  fileInput.type = 'file';
  fileInput.multiple = true;
  fileInput.accept = '.pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain';
  fileInput.dataset.role = 'file-input';
  fileInput.setAttribute('aria-label', 'เลือกเอกสารสำหรับอ่าน');
  const uploadCopy = element('div', 'document-upload-panel__copy');
  uploadCopy.append(
    element('h2', '', 'เพิ่มเอกสารสำหรับอ่าน'),
    element('p', '', 'เลือกหรือวางไฟล์ PDF, DOCX, Markdown และ TXT ได้หลายไฟล์ · ไฟล์ละไม่เกิน 20 MB'),
  );
  const chooseFiles = element('button', 'button button-primary', 'เลือกไฟล์');
  chooseFiles.type = 'button';
  chooseFiles.dataset.action = 'choose-files';
  chooseFiles.addEventListener('click', () => fileInput.click());
  const uploadResults = element('div', 'document-upload-results');
  uploadResults.dataset.role = 'upload-results';
  uploadPanel.append(uploadCopy, chooseFiles, fileInput, uploadResults);

  const searchForm = element('form', 'document-library-search');
  searchForm.dataset.role = 'document-search-form';
  const searchInput = element('input', 'document-library-search__input');
  searchInput.type = 'search';
  searchInput.placeholder = 'ค้นหาชื่อเอกสาร ชื่อไฟล์ หรือเนื้อหา';
  searchInput.setAttribute('aria-label', 'ค้นหาเอกสาร');
  searchInput.dataset.role = 'document-search-input';
  const searchButton = element('button', 'button button-primary', 'ค้นหา');
  searchButton.type = 'submit';
  searchForm.append(searchInput, searchButton);

  const tagFilters = element('div', 'document-tag-filter-wrap');
  tagFilters.setAttribute('aria-label', 'ตัวกรองแท็ก');
  const list = element('div', 'document-library-list');
  list.dataset.role = 'document-list';
  const pagination = element('nav', 'document-library-pagination');
  pagination.dataset.role = 'pagination';
  pagination.setAttribute('aria-label', 'การแบ่งหน้าคลังเอกสาร');
  pagination.hidden = true;
  const previousPageButton = element('button', 'button button-secondary', 'ก่อนหน้า');
  previousPageButton.type = 'button';
  previousPageButton.dataset.action = 'previous-page';
  const pageStatus = element('span', 'document-library-pagination__status', 'หน้า 1');
  pageStatus.dataset.role = 'page-status';
  const nextPageButton = element('button', 'button button-secondary', 'ถัดไป');
  nextPageButton.type = 'button';
  nextPageButton.dataset.action = 'next-page';
  pagination.append(previousPageButton, pageStatus, nextPageButton);
  const clearButton = element('button', 'button button-secondary document-library-clear-filters', 'ล้างตัวกรอง');
  clearButton.type = 'button';
  clearButton.dataset.action = 'clear-filters';
  clearButton.hidden = true;
  page.append(header, uploadPanel, searchForm, tagFilters, message, list, clearButton, pagination);

  let tagCatalog = { tags: [] };
  let selectedTagId = null;
  let activeTagId = null;
  let activeQuery = '';
  let hasSubmittedFilters = false;
  let pageSize = getDocumentPageSize(window.innerWidth);
  let pageIndex = 0;
  let hasNextPage = false;
  let isLoading = false;
  let reloadAfterResize = false;
  const assignments = new Map();
  const previewLoaders = new Map();
  let previewObserver = null;
  let previewGeneration = 0;
  let destroyed = false;

  function ensurePreviewObserver() {
    if (!previewObserver && typeof globalThis.IntersectionObserver === 'function') {
      previewObserver = new globalThis.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const load = previewLoaders.get(entry.target);
          if (!load) continue;
          previewLoaders.delete(entry.target);
          previewObserver.unobserve(entry.target);
          void load();
        }
      }, { rootMargin: '180px 0px' });
    }
    return previewObserver;
  }

  function scheduleDocumentPreview(documentItem, preview) {
    const generation = previewGeneration;
    const load = async () => {
      if (destroyed || generation !== previewGeneration || !preview.isConnected) return;
      try {
        if (documentItem.file_type === 'pdf') {
          const blob = await loadDocumentContent(documentItem.id);
          if (destroyed || generation !== previewGeneration || !preview.isConnected) return;
          await mountPdfPreview({ container: preview, blob, pdfjs });
          if (destroyed || generation !== previewGeneration || !preview.isConnected) return;
          const fileType = element('span', 'document-library-card__preview-type', FILE_BADGES.pdf);
          fileType.dataset.role = 'document-preview-type';
          preview.append(fileType);
          preview.dataset.previewState = 'ready';
        } else {
          const extracted = await loadDocumentText(documentItem.id);
          if (destroyed || generation !== previewGeneration || !preview.isConnected) return;
          renderTextDocumentPreview(preview, documentItem, extracted?.text ?? '');
        }
      } catch {
        if (!destroyed && generation === previewGeneration && preview.isConnected) {
          renderUnavailablePreview(preview, documentItem);
        }
      }
    };

    const observer = ensurePreviewObserver();
    if (observer) {
      previewLoaders.set(preview, load);
      observer.observe(preview);
    } else {
      void load();
    }
  }

  function clearPreviewSchedule() {
    previewGeneration += 1;
    previewObserver?.disconnect();
    previewObserver = null;
    previewLoaders.clear();
  }

  function setMessage(text, isError = false) {
    message.textContent = text;
    message.setAttribute('role', isError ? 'alert' : 'status');
    if (isError) message.dataset.state = 'error';
    else delete message.dataset.state;
  }

  function updatePagination() {
    pageStatus.textContent = `หน้า ${pageIndex + 1}`;
    previousPageButton.disabled = isLoading || pageIndex === 0;
    nextPageButton.disabled = isLoading || !hasNextPage;
    pagination.hidden = pageIndex === 0 && !hasNextPage;
  }

  function selectedTags(tagIds) {
    const selected = new Set(tagIds.map(Number));
    return flattenTags(tagCatalog).filter((tag) => selected.has(Number(tag.id)));
  }

  function getTagAssignment(item, tagSummary, pickerContainer) {
    const key = String(item.id);
    let assignment = assignments.get(key);
    if (assignment) {
      assignment.tagSummary = tagSummary;
      assignment.pickerContainer = pickerContainer;
      return assignment;
    }

    assignment = {
      picker: null,
      tagSummary,
      pickerContainer,
      syncTagSelection: null,
      queue: null,
    };
    assignment.syncTagSelection = (tagIds) => {
      item.tags = selectedTags(tagIds);
      const chips = renderTagChips(item.tags);
      chips.setAttribute('aria-label', `แท็กของ ${item.title || 'เอกสาร'}`);
      if (item.tags.length === 0) {
        chips.append(element('span', 'document-library-card__untagged', 'ยังไม่ได้เลือกวิชา'));
      }
      assignment.tagSummary.replaceChildren(chips);
      assignment.picker?.setSelectedTagIds?.(tagIds);
    };
    assignment.queue = createTagAssignmentQueue({
      initialTagIds: (item.tags ?? []).map((tag) => tag.id),
      save: async (tagIds) => {
        setMessage('กำลังบันทึกแท็ก…');
        const updated = await replaceDocumentTags(item.id, { tag_ids: tagIds });
        item.tags = updated?.tags ?? item.tags;
        if (JSON.stringify(assignment.queue.getTagIds()) === JSON.stringify(tagIds)) {
          setMessage('บันทึกแท็กแล้ว');
        }
        return updated;
      },
      onChange: (tagIds) => assignment.syncTagSelection(tagIds),
      onError: (error) => setMessage(error?.message || 'บันทึกแท็กไม่สำเร็จ กรุณาลองอีกครั้ง', true),
    });
    assignments.set(key, assignment);
    return assignment;
  }

  function renderFilters() {
    const replacement = renderFilterChips(tagCatalog, selectedTagId, (tagId) => {
      selectedTagId = tagId;
      activeTagId = tagId;
      hasSubmittedFilters = true;
      renderFilters();
      void loadDocumentsPage();
    });
    replacement.querySelectorAll('button').forEach((button) => {
      button.disabled = isLoading;
    });
    tagFilters.replaceChildren(replacement);
  }

  function setTagCatalog(catalog) {
    tagCatalog = catalog && Array.isArray(catalog.tags) ? catalog : { tags: [] };
    renderFilters();
    for (const assignment of assignments.values()) {
      assignment.syncTagSelection(assignment.queue.getTagIds());
      assignment.picker?.setCatalog?.(tagCatalog);
    }
  }

  async function reloadTagCatalog() {
    const catalog = await loadTags();
    setTagCatalog(catalog);
    return tagCatalog;
  }

  function showEmptyState(isNoMatch) {
    const empty = element('section', isNoMatch ? 'document-empty-state document-no-matches' : 'document-empty-state');
    empty.append(
      element('h2', '', isNoMatch ? 'ไม่พบเอกสารที่ตรงกับการค้นหา' : 'ยังไม่มีเอกสาร'),
      element(
        'p',
        '',
        isNoMatch
          ? 'ลองเปลี่ยนคำค้นหาหรือเลือกแท็กวิชาอื่น'
          : 'เพิ่มเอกสารประกอบการเรียน แล้วเปิดอ่านต่อได้จากคลังนี้',
      ),
    );
    if (isNoMatch) {
      clearButton.hidden = false;
    } else {
      const chooseLink = element('button', 'button button-primary', 'เพิ่มเอกสาร');
      chooseLink.type = 'button';
      chooseLink.addEventListener('click', () => fileInput.click());
      empty.append(chooseLink);
    }
    list.append(empty);
  }

  function createCard(item) {
    item.onDeleted = () => {
      assignments.delete(String(item.id));
      const visibleDocuments = list.querySelectorAll('[data-document-id]');
      if (visibleDocuments.length === 0 && pageIndex > 0) {
        void loadDocumentsPage({ targetPage: pageIndex - 1 });
      } else if (visibleDocuments.length === 0) {
        showEmptyState(Boolean(activeQuery || activeTagId));
      }
    };
    return makeDocumentCard(item, {
      getTagCatalog: () => tagCatalog,
      getTagAssignment,
      refreshTagCatalog: reloadTagCatalog,
      createTag,
      updateTitle: renameDocument,
      removeDocument: deleteDocument,
      confirmDelete,
      navigate,
      setMessage,
    });
  }

  async function loadDocumentsPage({ targetPage = 0 } = {}) {
    if (isLoading) return;
    isLoading = true;
    searchInput.disabled = true;
    searchButton.disabled = true;
    pageIndex = targetPage;
    hasNextPage = false;
    updatePagination();
    clearPreviewSchedule();
    list.replaceChildren();
    clearButton.hidden = true;
    renderFilters();
    setMessage('กำลังโหลดคลังเอกสาร…');
    try {
      const requestedPageIndex = pageIndex;
      const requestedPageSize = pageSize;
      const params = { limit: requestedPageSize + 1, offset: requestedPageIndex * requestedPageSize };
      if (hasSubmittedFilters) {
        params.q = activeQuery;
        if (activeTagId !== null) params.tagId = activeTagId;
      }
      const response = await loadDocuments(params);
      if (destroyed) return;
      if (requestedPageSize !== pageSize) {
        reloadAfterResize = true;
        return;
      }
      const items = Array.isArray(response) ? response : [];
      if (items.length === 0) {
        showEmptyState(Boolean(activeQuery || activeTagId));
        setMessage('');
        hasNextPage = false;
        return;
      }
      setMessage('');
      const visibleItems = items.slice(0, requestedPageSize);
      hasNextPage = items.length > requestedPageSize;
      const cards = visibleItems.map(createCard);
      list.replaceChildren(...cards);
      cards.forEach((card, index) => {
        scheduleDocumentPreview(visibleItems[index], card.querySelector('[data-role="document-preview"]'));
      });
    } catch (error) {
      setMessage(error?.message || 'โหลดคลังเอกสารไม่สำเร็จ กรุณาลองอีกครั้ง', true);
    } finally {
      isLoading = false;
      searchInput.disabled = false;
      searchButton.disabled = false;
      updatePagination();
      renderFilters();
      if (reloadAfterResize && !destroyed) {
        reloadAfterResize = false;
        void loadDocumentsPage();
      }
    }
  }

  async function processFiles(files) {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;
    uploadResults.replaceChildren();
    setMessage(`กำลังเพิ่มเอกสาร ${selectedFiles.length} ไฟล์…`);
    const outcomes = [];
    for (const file of selectedFiles) {
      const result = element('p', 'document-upload-result');
      result.dataset.uploadResult = 'pending';
      result.textContent = `${file.name} · กำลังอัปโหลด`;
      uploadResults.append(result);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const created = await uploadDocument(formData);
        result.dataset.uploadResult = 'success';
        result.textContent = `${file.name} · เพิ่มแล้ว · ยังไม่ได้เลือกวิชา`;
        outcomes.push({ success: true, created });
      } catch (error) {
        result.dataset.uploadResult = 'error';
        result.textContent = `${file.name} · ${error?.message || 'เพิ่มไม่สำเร็จ'}`;
        outcomes.push({ success: false, error });
      }
    }
    const successes = outcomes.filter((item) => item.success).length;
    setMessage(successes ? `เพิ่มเอกสารสำเร็จ ${successes} จาก ${outcomes.length} ไฟล์` : 'เพิ่มเอกสารไม่สำเร็จ', successes === 0);
    if (successes) await loadDocumentsPage();
    fileInput.value = '';
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    activeQuery = searchInput.value.trim();
    selectedTagId = activeTagId;
    hasSubmittedFilters = true;
    renderFilters();
    void loadDocumentsPage();
  });
  clearButton.addEventListener('click', () => {
    searchInput.value = '';
    activeQuery = '';
    activeTagId = null;
    selectedTagId = null;
    hasSubmittedFilters = true;
    renderFilters();
    void loadDocumentsPage();
  });
  previousPageButton.addEventListener('click', () => {
    if (pageIndex > 0) void loadDocumentsPage({ targetPage: pageIndex - 1 });
  });
  nextPageButton.addEventListener('click', () => {
    if (hasNextPage) void loadDocumentsPage({ targetPage: pageIndex + 1 });
  });
  const handleResize = () => {
    if (destroyed || !page.isConnected) return;
    const nextPageSize = getDocumentPageSize(window.innerWidth);
    if (nextPageSize === pageSize) return;
    pageSize = nextPageSize;
    pageIndex = 0;
    if (isLoading) {
      reloadAfterResize = true;
      return;
    }
    void loadDocumentsPage();
  };
  window.addEventListener('resize', handleResize);
  fileInput.addEventListener('change', () => { void processFiles(fileInput.files); });
  uploadPanel.addEventListener('dragover', (event) => {
    event.preventDefault();
    uploadPanel.dataset.dragging = 'true';
  });
  uploadPanel.addEventListener('dragleave', () => { delete uploadPanel.dataset.dragging; });
  uploadPanel.addEventListener('drop', (event) => {
    event.preventDefault();
    delete uploadPanel.dataset.dragging;
    void processFiles(event.dataTransfer?.files);
  });

  renderFilters();
  const catalogPromise = reloadTagCatalog().catch((error) => error);
  void loadDocumentsPage();
  void catalogPromise.then((error) => {
    if (error) setMessage(error?.message || 'โหลดรายการแท็กไม่สำเร็จ กรุณาลองอีกครั้ง', true);
  });
  page.destroy = () => {
    destroyed = true;
    window.removeEventListener('resize', handleResize);
    clearPreviewSchedule();
  };
  return page;
}
