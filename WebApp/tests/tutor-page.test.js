// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderTutorPage } from '../src/pages/TutorPage.js';

const tagCatalog = {
  tags: [
    { id: 1, name: 'คณิตศาสตร์', color: 'blue', is_builtin: true, parent_id: null },
    { id: 11, name: 'เซต', parent_id: 1, color: 'violet', is_builtin: false },
    { id: 2, name: 'ฟิสิกส์', color: 'cyan', is_builtin: true, parent_id: null },
  ],
};

const aiCatalog = {
  providers: [
    { id: 'gemini', name: 'Gemini', models: [{ id: 'gemini-3.8-flash', name: 'gemini-3.8-flash', supports_images: false }] },
    { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', supports_images: false }] },
  ],
  default_selection: { provider_id: 'gemini', model_id: 'gemini-3.8-flash' },
};

const imageAiCatalog = {
  providers: [
    { id: 'gemini', name: 'Gemini', models: [{ id: 'gemini-3.8-flash', name: 'gemini-3.8-flash', supports_images: true }] },
    { id: 'openai', name: 'OpenAI', models: [{ id: 'gpt-5.4-mini', name: 'gpt-5.4-mini', supports_images: true }] },
  ],
  default_selection: { provider_id: 'openai', model_id: 'gpt-5.4-mini' },
};

function message(id, role, kind, content, sequence = id) {
  return { id, sequence, role, kind, content, created_at: '2026-10-12T09:00:00Z' };
}

function conversation(overrides = {}) {
  return {
    id: 7,
    title: 'อธิบายเซตว่าง',
    status: 'answered',
    provider_id: 'openai',
    model_id: 'gpt-5.6-luna-pro',
    created_at: '2026-10-12T09:00:00Z',
    updated_at: '2026-10-12T09:02:00Z',
    tags: [{ id: 1, name: 'คณิตศาสตร์', color: 'blue', parent_id: null, is_builtin: true }],
    messages: [
      message(1, 'user', 'question', 'อธิบายเซตว่าง'),
      message(2, 'assistant', 'answer', 'เซตว่างเป็นสับเซตของทุกเซต'),
    ],
    ...overrides,
  };
}

function flushPromises() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function submit(form) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

function chooseImages(page, files) {
  const input = page.querySelector('[data-role="tutor-image-input"]');
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function mount(overrides = {}) {
  const dependencies = {
    loadConversations: vi.fn().mockResolvedValue([]),
    loadConversation: vi.fn().mockResolvedValue(conversation()),
    createConversation: vi.fn().mockResolvedValue(conversation()),
    createConversationWithImages: vi.fn().mockResolvedValue(conversation()),
    sendMessage: vi.fn().mockResolvedValue(conversation()),
    sendMessageWithImages: vi.fn().mockResolvedValue(conversation()),
    retryMessage: vi.fn().mockResolvedValue(conversation()),
    loadTags: vi.fn().mockResolvedValue(tagCatalog),
    loadProviders: vi.fn().mockResolvedValue(aiCatalog),
    createTag: vi.fn(),
    navigate: vi.fn(),
    ...overrides,
  };
  const page = renderTutorPage(dependencies);
  document.body.replaceChildren(page);
  return { page, dependencies };
}

afterEach(() => document.body.replaceChildren());

describe('AI tutor page', () => {
  it('test_tutor_provider_model_and_language_selects_keep_labels', async () => {
    const { page } = mount();
    await flushPromises();

    const selects = ['[data-role="tutor-provider"]', '[data-role="tutor-model"]', '[data-role="tutor-response-language"]', '[data-role="tutor-tag-filter"]']
      .map((selector) => page.querySelector(selector));
    for (const select of selects) {
      expect(select.tagName).toBe('SELECT');
      expect(select.classList.contains('themed-select')).toBe(true);
      expect(select.getAttribute('aria-label') || select.labels[0]?.textContent.trim()).toBeTruthy();
    }
    expect(selects.slice(0, 3).map(({ value }) => value)).toEqual(['gemini', 'gemini-3.8-flash', 'th']);
  });

  it('does not submit a blank question and asks the learner to enter one', async () => {
    const { page, dependencies } = mount();
    await flushPromises();

    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(dependencies.createConversation).not.toHaveBeenCalled();
    expect(dependencies.sendMessage).not.toHaveBeenCalled();
    expect(page.querySelector('[data-role="tutor-page-message"]')?.textContent).toContain('กรุณาพิมพ์คำถาม');
  });

  it('shows a processing state, then renders the assistant clarification', async () => {
    let resolveRequest;
    const pending = new Promise((resolve) => { resolveRequest = resolve; });
    const createConversation = vi.fn().mockReturnValue(pending);
    const { page } = mount({ createConversation });
    await flushPromises();

    page.querySelector('[data-role="tutor-input"]').value = 'เซตว่างเป็นสับเซตของทุกเซตได้อย่างไร';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(page.querySelector('[data-role="tutor-status"]')?.textContent).toContain('กำลังประมวลผล');
    expect(createConversation).toHaveBeenCalledWith(expect.objectContaining({
      message: 'เซตว่างเป็นสับเซตของทุกเซตได้อย่างไร',
      tag_ids: [],
      request_id: expect.any(String),
    }));

    resolveRequest(conversation({
      status: 'awaiting_clarification',
      messages: [
        message(1, 'user', 'question', 'เซตว่างเป็นสับเซตของทุกเซตได้อย่างไร'),
        message(2, 'assistant', 'clarification', 'กำลังถามถึงนิยามสับเซตใช่ไหม'),
      ],
    }));
    await flushPromises();

    expect(page.querySelector('[data-role="tutor-status"]')?.textContent).toContain('รอคำตอบเพิ่มเติม');
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('กำลังถามถึงนิยามสับเซตใช่ไหม');
  });

  it('reopens a pending clarification and sends the learner reply into the same conversation', async () => {
    const pendingConversation = conversation({
      id: 18,
      status: 'awaiting_clarification',
      messages: [
        message(1, 'user', 'question', 'ช่วยอธิบายเรื่องเซต'),
        message(2, 'assistant', 'clarification', 'ติดตรงการเป็นสับเซตหรือการรวมเซต'),
      ],
    });
    const { page, dependencies } = mount({
      loadConversations: vi.fn().mockResolvedValue([pendingConversation]),
      loadConversation: vi.fn().mockResolvedValue(pendingConversation),
      sendMessage: vi.fn().mockResolvedValue(conversation({
        id: 18,
        messages: [...pendingConversation.messages, message(3, 'user', 'clarification_reply', 'การเป็นสับเซต', 3), message(4, 'assistant', 'answer', 'เข้าใจแล้ว', 4)],
      })),
    });
    await flushPromises();

    page.querySelector('[data-conversation-id="18"] [data-action="open-conversation"]').click();
    await flushPromises();
    expect(page.querySelector('[data-role="tutor-status"]')?.textContent).toContain('รอคำตอบเพิ่มเติม');

    page.querySelector('[data-role="tutor-input"]').value = 'การเป็นสับเซต';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(dependencies.sendMessage).toHaveBeenCalledWith(18, {
      message: 'การเป็นสับเซต',
      request_id: expect.any(String),
      provider_id: 'openai',
      model_id: 'gpt-5.4-mini',
      response_language: 'th',
    });
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('เข้าใจแล้ว');
  });

  it('retries an uncertain start without duplicating the question or changing its request ID', async () => {
    const savedConversation = conversation({ status: 'answered' });
    const createConversation = vi.fn()
      .mockRejectedValueOnce(new Error('การเชื่อมต่อขาดหาย'))
      .mockResolvedValueOnce(savedConversation);
    const { page } = mount({ createConversation });
    await flushPromises();

    page.querySelector('[data-role="tutor-input"]').value = '  อธิบายเซตว่าง  ';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();
    const firstPayload = createConversation.mock.calls[0][0];
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('อธิบายเซตว่าง');
    expect(page.querySelector('[data-action="retry-tutor"]')).not.toBeNull();
    expect(page.querySelector('[data-role="tutor-page-message"]')?.textContent).toContain('การเชื่อมต่อขาดหาย');

    page.querySelector('[data-action="retry-tutor"]').click();
    await flushPromises();

    expect(createConversation).toHaveBeenCalledTimes(2);
    expect(createConversation.mock.calls[1][0]).toEqual(firstPayload);
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('เซตว่างเป็นสับเซตของทุกเซต');
  });

  it('retries a server-saved failure by conversation ID instead of creating a duplicate', async () => {
    const saved = conversation({ id: 29, status: 'retryable_error' });
    const providerError = new Error('บริการ AI ยังไม่พร้อม');
    providerError.detail = { code: 'tutor_provider_unavailable', conversation_id: 29, retryable: true };
    const createConversation = vi.fn().mockRejectedValue(providerError);
    const retryMessage = vi.fn().mockResolvedValue(conversation({ id: 29 }));
    const { page } = mount({
      createConversation,
      loadConversation: vi.fn().mockResolvedValue(saved),
      retryMessage,
    });
    await flushPromises();

    page.querySelector('[data-role="tutor-input"]').value = 'อธิบายเซตว่าง';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();
    const retry = page.querySelector('[data-action="retry-tutor"]');
    expect(retry.dataset.conversationId).toBe('29');
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('อธิบายเซตว่าง');

    retry.click();
    await flushPromises();

    expect(createConversation).toHaveBeenCalledOnce();
    expect(retryMessage).toHaveBeenCalledWith(29, {
      provider_id: 'gemini',
      model_id: 'gemini-3.8-flash',
      response_language: 'th',
    });
    expect(page.querySelector('[data-role="tutor-status"]')?.textContent).toContain('ตอบแล้ว');
  });

  it('replays an uncertain follow-up with its request ID instead of retrying the previous AI turn', async () => {
    const saved = conversation({ id: 31 });
    const completed = conversation({
      id: 31,
      messages: [
        ...saved.messages,
        message(3, 'user', 'clarification_reply', 'ช่วยยกตัวอย่างเพิ่ม', 3),
        message(4, 'assistant', 'answer', 'ตัวอย่างเพิ่มเติม', 4),
      ],
    });
    const sendMessage = vi.fn()
      .mockRejectedValueOnce(new Error('การเชื่อมต่อขาดหาย'))
      .mockResolvedValueOnce(completed);
    const retryMessage = vi.fn();
    const { page } = mount({
      loadConversations: vi.fn().mockResolvedValue([saved]),
      loadConversation: vi.fn().mockResolvedValue(saved),
      sendMessage,
      retryMessage,
    });
    await flushPromises();

    page.querySelector('[data-conversation-id="31"] [data-action="open-conversation"]').click();
    await flushPromises();
    page.querySelector('[data-role="tutor-input"]').value = 'ช่วยยกตัวอย่างเพิ่ม';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();
    const firstPayload = sendMessage.mock.calls[0][1];

    expect(page.querySelector('[data-role="tutor-status"]')?.textContent).toContain('ตอบแล้ว');
    page.querySelector('[data-action="retry-tutor"]').click();
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sendMessage.mock.calls[1]).toEqual([31, firstPayload]);
    expect(retryMessage).not.toHaveBeenCalled();
    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('ตัวอย่างเพิ่มเติม');
  });

  it('filters conversation history by search and a shared subject tag', async () => {
    const physics = conversation({ id: 21, title: 'แรงและการเคลื่อนที่', tags: [tagCatalog.tags[2]] });
    const mathematics = conversation({ id: 22, title: 'ทฤษฎีเซต', tags: [tagCatalog.tags[0]] });
    const loadConversations = vi.fn()
      .mockResolvedValueOnce([physics, mathematics])
      .mockResolvedValueOnce([physics]);
    const { page } = mount({ loadConversations });
    await flushPromises();

    const filter = page.querySelector('[data-role="tutor-tag-filter"]');
    expect(filter.querySelector('option[value="2"]')?.textContent).toBe('ฟิสิกส์');
    page.querySelector('[data-role="tutor-search"]').value = 'แรง';
    filter.value = '2';
    filter.dispatchEvent(new Event('change', { bubbles: true }));
    submit(page.querySelector('[data-role="tutor-search-form"]'));
    await flushPromises();

    expect(loadConversations).toHaveBeenLastCalledWith({ q: 'แรง', tagId: 2 });
    expect([...page.querySelectorAll('.tutor-history-card')].map((item) => item.dataset.conversationId)).toEqual(['21']);
  });

  it('sends the selected provider and model with a new tutor message', async () => {
    const createConversation = vi.fn().mockResolvedValue(conversation());
    const { page } = mount({ createConversation });
    await flushPromises();

    const provider = page.querySelector('[data-role="tutor-provider"]');
    const model = page.querySelector('[data-role="tutor-model"]');
    expect(provider.value).toBe('gemini');
    expect(model.value).toBe('gemini-3.8-flash');
    provider.value = 'openai';
    provider.dispatchEvent(new Event('change', { bubbles: true }));
    expect([...model.options].map((option) => option.value)).toEqual(['gpt-5.4-mini']);
    model.value = 'gpt-5.4-mini';

    page.querySelector('[data-role="tutor-input"]').value = 'ช่วยอธิบายเรื่องเซต';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(createConversation).toHaveBeenCalledWith(expect.objectContaining({
      message: 'ช่วยอธิบายเรื่องเซต',
      provider_id: 'openai',
      model_id: 'gpt-5.4-mini',
    }));
  });

  it('defaults to Thai answers and sends the selected English language with a new message', async () => {
    const createConversation = vi.fn().mockResolvedValue(conversation());
    const { page } = mount({ createConversation });
    await flushPromises();

    const language = page.querySelector('[data-role="tutor-response-language"]');
    expect(language?.value).toBe('th');
    expect([...language.options].map((option) => option.value)).toEqual(['th', 'en']);
    language.value = 'en';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    page.querySelector('[data-role="tutor-input"]').value = 'Explain sets';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(createConversation).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Explain sets',
      response_language: 'en',
    }));
  });

  it('restores the last response language when reopening a Tutor conversation', async () => {
    const saved = conversation({ messages: [
      { ...message(1, 'user', 'question', 'Explain the empty set'), response_language: 'en' },
      { ...message(2, 'assistant', 'answer', 'The empty set is a subset of every set'), response_language: 'en' },
    ] });
    const sendMessage = vi.fn().mockResolvedValue(saved);
    const { page } = mount({
      loadConversations: vi.fn().mockResolvedValue([saved]),
      loadConversation: vi.fn().mockResolvedValue(saved),
      sendMessage,
    });
    await flushPromises();

    page.querySelector('[data-conversation-id="7"] [data-action="open-conversation"]').click();
    await flushPromises();
    expect(page.querySelector('[data-role="tutor-response-language"]')?.value).toBe('en');

    page.querySelector('[data-role="tutor-input"]').value = 'Give another example';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({
      message: 'Give another example',
      response_language: 'en',
    }));
  });

  it('restores a conversation model and labels only replies with a recorded selection', async () => {
    const saved = conversation({
      provider_id: 'openai',
      model_id: 'gpt-5.4-mini',
      messages: [
        message(1, 'user', 'question', 'อธิบายเซตว่าง'),
        { ...message(2, 'assistant', 'answer', 'คำตอบจากโมเดลที่บันทึกไว้'), provider_id: 'openai', model_id: 'gpt-5.4-mini' },
        message(3, 'assistant', 'answer', 'คำตอบเก่าที่ไม่มีข้อมูลโมเดล'),
      ],
    });
    const { page } = mount({
      loadConversations: vi.fn().mockResolvedValue([saved]),
      loadConversation: vi.fn().mockResolvedValue(saved),
    });
    await flushPromises();

    page.querySelector('[data-conversation-id="7"] [data-action="open-conversation"]').click();
    await flushPromises();

    expect(page.querySelector('[data-role="tutor-provider"]').value).toBe('openai');
    expect(page.querySelector('[data-role="tutor-model"]').value).toBe('gpt-5.4-mini');
    const labels = [...page.querySelectorAll('.tutor-message__model')];
    expect(labels).toHaveLength(1);
    expect(labels[0].textContent).toContain('OpenAI');
    expect(labels[0].textContent).toContain('gpt-5.4-mini');
  });

  it('keeps an image selected and blocks sending while the model has no confirmed image support', async () => {
    const { page, dependencies } = mount();
    await flushPromises();
    chooseImages(page, [new File(['png'], 'diagram.png', { type: 'image/png' })]);

    expect(page.querySelector('[data-role="tutor-image-previews"]')?.textContent).toContain('diagram.png');
    expect(page.querySelector('[data-role="tutor-image-capability"]')?.textContent).toContain('ยังไม่มีโมเดลที่ยืนยัน');
    expect(page.querySelector('[data-action="send-tutor-message"]').disabled).toBe(true);
    page.querySelector('[data-role="tutor-input"]').value = 'ช่วยอ่านภาพนี้';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(dependencies.createConversationWithImages).not.toHaveBeenCalled();
    expect(page.querySelector('[data-role="tutor-input"]').value).toBe('ช่วยอ่านภาพนี้');
    expect(page.querySelector('[data-role="tutor-image-previews"]')?.textContent).toContain('diagram.png');
  });

  it('sends a valid image and selected model as multipart data', async () => {
    const saved = conversation({
      messages: [
        { ...message(1, 'user', 'question', 'ช่วยอ่านภาพนี้'), attachments: [{ id: 55, filename: 'diagram.png', mime_type: 'image/png', byte_size: 3 }] },
        { ...message(2, 'assistant', 'answer', 'นี่คือแผนภาพ'), provider_id: 'openai', model_id: 'gpt-5.4-mini' },
      ],
    });
    const createConversationWithImages = vi.fn().mockResolvedValue(saved);
    const { page } = mount({
      loadProviders: vi.fn().mockResolvedValue(imageAiCatalog),
      createConversationWithImages,
    });
    await flushPromises();
    const language = page.querySelector('[data-role="tutor-response-language"]');
    language.value = 'en';
    language.dispatchEvent(new Event('change', { bubbles: true }));
    chooseImages(page, [new File(['png'], 'diagram.png', { type: 'image/png' })]);
    page.querySelector('[data-role="tutor-input"]').value = 'ช่วยอ่านภาพนี้';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(createConversationWithImages).toHaveBeenCalledOnce();
    const formData = createConversationWithImages.mock.calls[0][0];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.get('response_language')).toBe('en');
    expect(formData.get('provider_id')).toBe('openai');
    expect(formData.get('model_id')).toBe('gpt-5.4-mini');
    expect(formData.get('message')).toBe('ช่วยอ่านภาพนี้');
    expect(formData.get('images').name).toBe('diagram.png');
    expect(page.querySelector('[data-role="tutor-image-previews"]')?.children).toHaveLength(0);
  });

  it.each([
    ['more than three images', [1, 2, 3, 4].map((index) => new File(['x'], `image-${index}.png`, { type: 'image/png' }))],
    ['an unsupported image type', [new File(['x'], 'photo.gif', { type: 'image/gif' })]],
    ['a file larger than five MiB', [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })]],
  ])('rejects %s without dropping previously selected images', async (_label, files) => {
    const { page } = mount({ loadProviders: vi.fn().mockResolvedValue(imageAiCatalog) });
    await flushPromises();
    chooseImages(page, [new File(['x'], 'kept.png', { type: 'image/png' })]);
    chooseImages(page, files);

    expect(page.querySelector('[data-role="tutor-image-previews"]')?.textContent).toContain('kept.png');
    expect(page.querySelector('[data-role="tutor-page-message"]')?.textContent).toContain('ไม่รับไฟล์ภาพ');
  });

  it('reuses a saved image by attachment ID from the conversation history', async () => {
    const saved = conversation({ messages: [{
      ...message(1, 'user', 'question', 'ภาพต้นฉบับ'),
      attachments: [{ id: 77, filename: 'diagram.png', mime_type: 'image/png', byte_size: 3 }],
    }] });
    const sendMessage = vi.fn().mockResolvedValue(conversation({
      messages: [...saved.messages, message(2, 'user', 'clarification_reply', 'ช่วยขยายความ', 2)],
    }));
    const { page } = mount({
      loadConversations: vi.fn().mockResolvedValue([saved]),
      loadConversation: vi.fn().mockResolvedValue(saved),
      loadProviders: vi.fn().mockResolvedValue(imageAiCatalog),
      sendMessage,
    });
    await flushPromises();
    page.querySelector('[data-conversation-id="7"] [data-action="open-conversation"]').click();
    await flushPromises();

    const image = page.querySelector('.tutor-message__image');
    expect(image?.alt).toBe('diagram.png');
    expect(image?.getAttribute('src')).toBe('/api/tutor/conversations/7/attachments/77');
    page.querySelector('[data-action="reuse-tutor-attachment"]').click();
    page.querySelector('[data-role="tutor-input"]').value = 'ช่วยขยายความ';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(sendMessage).toHaveBeenCalledWith(7, expect.objectContaining({
      message: 'ช่วยขยายความ', provider_id: 'openai', model_id: 'gpt-5.4-mini', attachment_ids: [77],
    }));
  });

  it('retains the question and image for retry after provider failure', async () => {
    const failure = new Error('Provider quota reached');
    failure.detail = { conversation_id: 41, retryable: true, code: 'tutor_provider_quota' };
    const saved = conversation({
      id: 41,
      status: 'retryable_error',
      messages: [{ ...message(1, 'user', 'question', 'อ่านแผนภาพนี้'), attachments: [
        { id: 88, filename: 'diagram.png', mime_type: 'image/png', byte_size: 3 },
      ] }],
    });
    const createConversationWithImages = vi.fn().mockRejectedValue(failure);
    const retryMessage = vi.fn().mockResolvedValue(conversation({ id: 41 }));
    const { page } = mount({
      loadProviders: vi.fn().mockResolvedValue(imageAiCatalog),
      createConversationWithImages,
      loadConversation: vi.fn().mockResolvedValue(saved),
      retryMessage,
    });
    await flushPromises();
    chooseImages(page, [new File(['x'], 'diagram.png', { type: 'image/png' })]);
    page.querySelector('[data-role="tutor-input"]').value = 'อ่านแผนภาพนี้';
    submit(page.querySelector('[data-role="tutor-message-form"]'));
    await flushPromises();

    expect(page.querySelector('[data-role="tutor-messages"]')?.textContent).toContain('อ่านแผนภาพนี้');
    expect(page.querySelector('[data-role="tutor-image-previews"]')?.textContent).toContain('diagram.png');
    page.querySelector('[data-action="retry-tutor"]').click();
    await flushPromises();

    expect(retryMessage).toHaveBeenCalledWith(41, {
      provider_id: 'openai', model_id: 'gpt-5.4-mini', response_language: 'th',
    });
  });

  it.each([['at the bottom', true], ['reading older messages', false]])(
    'scrolls new messages only when the reader is %s', async (_label, atBottom) => {
      const saved = conversation({ messages: [
        message(1, 'user', 'question', 'คำถามก่อนหน้า'),
        message(2, 'assistant', 'answer', 'คำตอบก่อนหน้า'),
      ] });
      const completed = conversation({ messages: [
        ...saved.messages,
        message(3, 'user', 'clarification_reply', 'ถามต่อ', 3),
        message(4, 'assistant', 'answer', 'คำตอบใหม่', 4),
      ] });
      const { page } = mount({
        loadConversations: vi.fn().mockResolvedValue([saved]),
        loadConversation: vi.fn().mockResolvedValue(saved),
        sendMessage: vi.fn().mockResolvedValue(completed),
      });
      await flushPromises();
      page.querySelector('[data-conversation-id="7"] [data-action="open-conversation"]').click();
      await flushPromises();
      const list = page.querySelector('[data-role="tutor-messages"]');
      let top = atBottom ? 100 : 0;
      Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
      Object.defineProperty(list, 'scrollHeight', { configurable: true, get: () => list.children.length * 100 });
      Object.defineProperty(list, 'scrollTop', { configurable: true, get: () => top, set: (value) => { top = value; } });
      page.querySelector('[data-role="tutor-input"]').value = 'ถามต่อ';
      submit(page.querySelector('[data-role="tutor-message-form"]'));
      await flushPromises();

      expect(list.scrollTop).toBe(atBottom ? list.scrollHeight - list.clientHeight : 0);
    },
  );
});
