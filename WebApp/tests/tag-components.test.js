// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  renderTagChips,
  renderTagColorPalette,
  renderTagFilter,
  renderTagPicker,
} from '../src/tags/tag-components.js';
import { TAG_COLOR_PALETTE } from '../src/tags/tag-colors.js';
import { nextDocumentTagSelection } from '../src/tags/document-tag-selection.js';

const catalog = {
  tags: [
    { id: 1, name: 'Mathematics', is_builtin: true, color: 'blue', parent_id: null },
    { id: 2, name: 'English', is_builtin: true, color: 'violet', parent_id: null },
    { id: 8, name: 'Sets', parent_id: 1, is_builtin: false, color: 'pink' },
    { id: 9, name: 'Algebra', parent_id: null, is_builtin: false, color: 'green' },
  ],
};

describe('reusable quiz tag controls', () => {
  it('renders selected tags as readable chips', () => {
    const chips = renderTagChips([
      { id: 1, name: 'Mathematics', parent_id: null, is_builtin: true, color: 'blue' },
      { id: 8, name: 'Sets', parent_id: 1, is_builtin: false, color: 'pink' },
    ]);

    expect(chips.textContent).toContain('Mathematics');
    expect(chips.textContent).toContain('Sets');
    expect(chips.querySelectorAll('[data-tag-id]')).toHaveLength(2);
  });

  it('test_tag_chips_render_persisted_palette_keys', () => {
    const chips = renderTagChips([
      { id: 1, name: 'Mathematics', color: 'blue' },
      { id: 8, name: 'Sets', color: 'not-a-color' },
    ]);

    expect(chips.querySelector('[data-tag-id="1"]').dataset.color).toBe('blue');
    expect(chips.querySelector('[data-tag-id="8"]').dataset.color).toBe('violet');
    expect(chips.querySelectorAll('button')).toHaveLength(0);
  });

  it('test_palette_has_ten_keyboard_accessible_choices', () => {
    const onChange = vi.fn();
    const palette = renderTagColorPalette({ selectedColor: 'blue', onChange });

    expect(TAG_COLOR_PALETTE).toHaveLength(10);
    expect(palette.querySelectorAll('input[type="radio"]')).toHaveLength(10);
    expect(palette.querySelector('input[value="blue"]')?.checked).toBe(true);
    expect(palette.querySelector('input[value="pink"]')?.labels?.[0].textContent).toContain('Pink');

    const pink = palette.querySelector('input[value="pink"]');
    pink.checked = true;
    pink.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith('pink');
  });

  it('test_tag_chip_toggles_immediately_and_keeps_focus', () => {
    const onToggle = vi.fn();
    const picker = renderTagPicker({ catalog, selectedTagIds: [1], onToggle, onCreate: vi.fn() });
    const subject = picker.querySelector('button[data-tag-id="1"]');
    const topic = picker.querySelector('button[data-tag-id="8"]');

    expect(subject.getAttribute('aria-pressed')).toBe('true');
    expect(topic.getAttribute('aria-pressed')).toBe('false');
    expect(picker.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(Array.from(picker.querySelectorAll('button')).some((button) => button.textContent === 'Save tags'))
      .toBe(false);

    topic.click();
    subject.click();
    expect(onToggle.mock.calls).toEqual([[8, true], [1, false]]);
    expect(topic.getAttribute('aria-pressed')).toBe('true');
    expect(subject.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps keyboard focus on the selected tag button after a toggle', () => {
    let picker;
    picker = renderTagPicker({
      catalog,
      selectedTagIds: [],
      onToggle: (tagId, selected) => picker.setSelectedTagIds(selected ? [tagId] : []),
      onCreate: vi.fn(),
    });
    document.body.append(picker);
    const topic = picker.querySelector('button[data-tag-id="8"]');

    topic.focus();
    topic.click();

    expect(document.activeElement).toBe(topic);
    expect(topic.getAttribute('aria-pressed')).toBe('true');
  });

  it('updates an open picker when its tag catalog changes without losing search state', () => {
    const picker = renderTagPicker({ catalog: { tags: [] }, onCreate: vi.fn() });
    document.body.append(picker);
    const search = picker.querySelector('[aria-label="Search tags"]');
    const nameInput = picker.querySelector('[aria-label="New topic tag name"]');
    search.value = 'sets';
    nameInput.value = 'Draft topic';

    picker.setCatalog(catalog);
    picker.setSelectedTagIds([8]);
    picker.setCatalog({ tags: [...catalog.tags, {
      id: 10, name: 'Sets extension', parent_id: null, is_builtin: false, color: 'rose',
    }] });

    expect(search.value).toBe('sets');
    expect(nameInput.value).toBe('Draft topic');
    expect(picker.querySelector('button[data-tag-id="8"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(picker.querySelector('button[data-tag-id="10"]')?.textContent).toBe('Sets extension');
    expect(picker.querySelector('button[data-tag-id="8"]')).toBeTruthy();
    expect(picker.querySelector('button[data-tag-id="1"]')).toBeNull();
  });

  it('test_tag_picker_searches_flat_catalog', () => {
    const picker = renderTagPicker({ catalog, selectedTagIds: [], onToggle: vi.fn(), onCreate: vi.fn() });
    const search = picker.querySelector('[aria-label="Search tags"]');

    search.value = 'sets';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(picker.querySelector('button[data-tag-id="8"]').hidden).toBe(false);
    expect(picker.querySelector('button[data-tag-id="1"]')).toBeNull();
    expect(picker.querySelector('button[data-tag-id="2"]')).toBeNull();
  });

  it('test_tag_picker_creates_without_parent_and_with_color', () => {
    const onCreate = vi.fn();
    const picker = renderTagPicker({ catalog, selectedTagIds: [], onToggle: vi.fn(), onCreate });
    const nameInput = picker.querySelector('[aria-label="New topic tag name"]');
    const pink = picker.querySelector('.tag-picker-create input[value="pink"]');

    nameInput.value = 'Algebra';
    pink.checked = true;
    pink.dispatchEvent(new Event('change', { bubbles: true }));
    picker.querySelector('[data-action="create-tag"]').click();

    expect(onCreate).toHaveBeenCalledWith({ name: 'Algebra', color: 'pink' });
  });

  it('styles the create-tag action with the shared primary button treatment', () => {
    const picker = renderTagPicker({ catalog, onToggle: vi.fn(), onCreate: vi.fn() });

    expect(picker.querySelector('[data-action="create-tag"]')?.classList.contains('button')).toBe(true);
    expect(picker.querySelector('[data-action="create-tag"]')?.classList.contains('button-primary')).toBe(true);
  });

  it('offers all flat tags in an accessible filter and reports selected IDs', () => {
    const onChange = vi.fn();
    const filter = renderTagFilter(catalog, null, onChange);

    expect(filter.getAttribute('aria-label')).toBe('Filter quizzes by tag');
    expect(Array.from(filter.options, (option) => option.value)).toEqual(['', '1', '2', '8', '9']);
    expect(Array.from(filter.options, (option) => option.textContent).join(' ')).toContain('Sets');

    filter.value = '8';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith(8);
  });

  it('test_tag_picker_appends_custom_tags_after_builtins', () => {
    const onCreate = vi.fn();
    const picker = renderTagPicker({
      catalog,
      selectedTagIds: [],
      onToggle: vi.fn(),
      onCreate,
    });

    const ids = Array.from(picker.querySelectorAll('button[data-tag-id]'), (button) => button.dataset.tagId);
    expect(ids).toEqual(['1', '2', '8', '9']);
    expect(picker.querySelector('[aria-label="Subject for new tag"]')).toBeNull();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('test_tag_selection_allows_unrelated_tags', () => {
    expect(nextDocumentTagSelection([1, 8], 9, catalog)).toEqual([1, 8, 9]);
    expect(nextDocumentTagSelection([1, 8, 9], 1, catalog)).toEqual([8, 9]);
  });

  it('uses high-contrast theme ink for unselected tags in the light theme', () => {
    const styles = readFileSync('src/styles.css', 'utf8');

    expect(styles).toMatch(/\[data-theme="light"\]\s+\.tag-chip:not\(\[aria-pressed="true"\]\)\s*\{[^}]*color:\s*var\(--ink\)/s);
  });
});
