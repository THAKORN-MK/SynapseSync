import {
  DEFAULT_TAG_COLOR,
  TAG_COLOR_PALETTE,
  normalizeTagColor,
} from './tag-colors.js';

let paletteInstance = 0;

function createElement(tagName, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function tagOptions(catalog) {
  return Array.isArray(catalog?.tags) ? catalog.tags : [];
}

function createTagButton(tag, selected, onToggle) {
  const button = createElement('button', 'tag-chip tag-picker-tag');
  const tagId = Number(tag.id);
  button.type = 'button';
  button.dataset.tagId = String(tagId);
  button.dataset.color = normalizeTagColor(tag.color);
  button.setAttribute('aria-pressed', String(selected.has(tagId)));
  button.textContent = tag.name;
  button.addEventListener('click', () => {
    const nextSelected = !selected.has(tagId);
    if (nextSelected) selected.add(tagId);
    else selected.delete(tagId);
    button.setAttribute('aria-pressed', String(nextSelected));
    onToggle(tagId, nextSelected);
  });
  return button;
}

export function renderTagChips(tags = []) {
  const container = createElement('div', 'tag-chip-list');
  container.setAttribute('aria-label', 'Quiz tags');
  for (const tag of tags) {
    const chip = createElement('span', 'tag-chip');
    chip.dataset.tagId = String(tag.id);
    chip.dataset.color = normalizeTagColor(tag.color);
    chip.textContent = tag.name;
    container.append(chip);
  }
  return container;
}

export function renderTagFilter(catalog, selectedTagId, onChange = () => {}) {
  const select = createElement('select', 'tag-filter themed-select');
  select.setAttribute('aria-label', 'Filter quizzes by tag');
  const allOption = createElement('option');
  allOption.value = '';
  allOption.textContent = 'All subjects and tags';
  select.append(allOption);

  for (const tag of tagOptions(catalog)) {
    const option = createElement('option');
    option.value = String(tag.id);
    option.textContent = tag.name;
    select.append(option);
  }

  select.value = selectedTagId === null || selectedTagId === undefined ? '' : String(selectedTagId);
  select.addEventListener('change', () => {
    onChange(select.value === '' ? null : Number(select.value));
  });
  return select;
}

export function renderTagColorPalette({ selectedColor = DEFAULT_TAG_COLOR, onChange = () => {} } = {}) {
  const fieldset = createElement('fieldset', 'tag-color-palette');
  const legend = createElement('legend');
  const radioGroupName = `tag-color-${++paletteInstance}`;
  legend.textContent = 'Tag color';
  fieldset.append(legend);

  for (const { key, label: colorLabel } of TAG_COLOR_PALETTE) {
    const label = createElement('label', 'tag-color-option');
    const input = createElement('input');
    input.type = 'radio';
    input.name = radioGroupName;
    input.value = key;
    input.checked = normalizeTagColor(selectedColor) === key;
    input.setAttribute('aria-label', colorLabel);

    const swatch = createElement('span', 'tag-color-swatch');
    swatch.dataset.color = key;
    swatch.setAttribute('aria-hidden', 'true');

    const text = createElement('span', 'tag-color-option-label');
    text.textContent = colorLabel;
    label.append(input, swatch, text);
    input.addEventListener('change', () => {
      if (input.checked) onChange(key);
    });
    fieldset.append(label);
  }

  return fieldset;
}

export function renderTagPicker({
  catalog,
  selectedTagIds = [],
  onToggle = () => {},
  onCreate = () => {},
} = {}) {
  catalog = catalog && Array.isArray(catalog.tags) ? catalog : { tags: [] };
  const picker = createElement('div', 'tag-picker');
  const selected = new Set(selectedTagIds.map(Number));
  const search = createElement('input', 'tag-picker-search');
  search.type = 'search';
  search.autocomplete = 'off';
  search.setAttribute('aria-label', 'Search tags');
  search.placeholder = 'Search subjects or tags';

  const groups = createElement('div', 'tag-picker-groups');
  const renderGroups = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const focusedTagId = groups.contains(document.activeElement)
      ? document.activeElement.closest('button[data-tag-id]')?.dataset.tagId
      : null;
    groups.replaceChildren();

    for (const tag of tagOptions(catalog)) {
      if (query && !tag.name.toLocaleLowerCase().includes(query)) continue;
      groups.append(createTagButton(tag, selected, onToggle));
    }

    if (focusedTagId) {
      groups.querySelector(`button[data-tag-id="${focusedTagId}"]`)?.focus();
    }
  };
  search.addEventListener('input', renderGroups);
  renderGroups();
  picker.setSelectedTagIds = (tagIds) => {
    selected.clear();
    for (const id of tagIds ?? []) {
      const numericId = Number(id);
      if (Number.isInteger(numericId) && numericId > 0) selected.add(numericId);
    }
    for (const button of groups.querySelectorAll('button[data-tag-id]')) {
      button.setAttribute('aria-pressed', String(selected.has(Number(button.dataset.tagId))));
    }
  };

  const createFieldset = createElement('fieldset', 'tag-picker-create');
  const createLegend = createElement('legend');
  createLegend.textContent = 'Create tag';
  createFieldset.append(createLegend);
  picker.setCatalog = (nextCatalog) => {
    catalog = nextCatalog && Array.isArray(nextCatalog.tags) ? nextCatalog : { tags: [] };
    renderGroups();
  };

  const nameInput = createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = 40;
  nameInput.setAttribute('aria-label', 'New topic tag name');
  nameInput.autocomplete = 'off';

  let selectedColor = DEFAULT_TAG_COLOR;
  const palette = renderTagColorPalette({
    selectedColor,
    onChange: (color) => {
      selectedColor = color;
    },
  });

  const createButton = createElement('button', 'button button-primary');
  createButton.type = 'button';
  createButton.dataset.action = 'create-tag';
  createButton.textContent = 'Add tag';
  const createStatus = createElement('p', 'tag-picker-create-status');
  createStatus.setAttribute('aria-live', 'polite');

  createButton.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name || createButton.disabled) return;

    createButton.disabled = true;
    createStatus.textContent = '';
    try {
      await onCreate({ name, color: selectedColor });
      nameInput.value = '';
    } catch (error) {
      createStatus.textContent = error instanceof Error ? error.message : 'Unable to create tag.';
    } finally {
      createButton.disabled = false;
    }
  });

  createFieldset.append(
    nameInput,
    palette,
    createButton,
    createStatus,
  );
  picker.append(search, groups, createFieldset);
  return picker;
}
