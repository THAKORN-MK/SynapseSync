// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderDashboardCharts } from '../src/dashboard/dashboard-charts.js';
import { renderHomePage } from '../src/pages/HomePage.js';

const overview = {
  quiz_activity: [
    { label: '2026-10-06', count: 0 },
    { label: '2026-10-07', count: 0 },
    { label: '2026-10-08', count: 1 },
    { label: '2026-10-09', count: 0 },
    { label: '2026-10-10', count: 2 },
    { label: '2026-10-11', count: 0 },
    { label: '2026-10-12', count: 3 },
  ],
  task_status: { not_started: 2, in_progress: 1, completed: 1 },
  documents_by_tag: [
    { tag_id: 1, tag_name: 'คณิตศาสตร์', color: 'blue', count: 4 },
    { tag_id: 2, tag_name: 'ภาษาอังกฤษ', color: 'rose', count: 1 },
  ],
  topics_to_review: [
    { tag_id: 1, tag_name: 'คณิตศาสตร์', color: 'blue', average_percent: 0, attempt_count: 2 },
  ],
};

function dashboardLoaders(overrides = {}) {
  return {
    loadOverview: vi.fn().mockResolvedValue(overview),
    loadDeadlines: vi.fn().mockResolvedValue([
      { id: 1, title: 'ส่งชิ้นงาน', subject: 'คณิตศาสตร์', due_at: '2026-10-14T09:00:00Z', status: 'not_started' },
      { id: 2, title: 'อ่านบทที่ 2', subject: 'ภาษาอังกฤษ', due_at: '2026-10-13T09:00:00Z', status: 'in_progress' },
      { id: 3, title: 'ทำเสร็จแล้ว', subject: 'ชีววิทยา', due_at: '2026-10-12T09:00:00Z', status: 'completed' },
    ]),
    loadProgress: vi.fn().mockResolvedValue({
      topics_practiced: 1,
      latest_attempt: { quiz_title: 'เซตเบื้องต้น', score: 0, total_questions: 10, submitted_at: '2026-10-12T09:00:00Z' },
      recent_attempts: [
        { quiz_title: 'เซตเบื้องต้น', score: 0, total_questions: 10, submitted_at: '2026-10-12T09:00:00Z' },
        { quiz_title: 'ภาษาอังกฤษ', score: 3, total_questions: 5, submitted_at: '2026-10-11T09:00:00Z' },
      ],
      topics: [],
    }),
    loadQuizzes: vi.fn().mockResolvedValue([
      { id: 8, title: 'แบบทดสอบเรื่องเซต', question_count: 5, tags: [] },
    ]),
    loadDocuments: vi.fn().mockResolvedValue([
      { id: 9, title: 'สรุปเรื่องเซต', original_filename: 'sets.pdf', file_type: 'pdf', tags: [] },
    ]),
    ...overrides,
  };
}

describe('Home dashboard', () => {
  afterEach(() => document.body.replaceChildren());

  it('keeps the public Home atom and does not request private dashboard data', () => {
    const loaders = dashboardLoaders();
    const page = renderHomePage({ user: null, onNavigate: vi.fn(), ...loaders });
    document.body.append(page);

    expect(page.querySelector('.atom-stage')).not.toBeNull();
    expect(page.querySelector('[data-route="/quizzes/create"]')).not.toBeNull();
    expect(loaders.loadOverview).not.toHaveBeenCalled();
    expect(loaders.loadDeadlines).not.toHaveBeenCalled();
    expect(loaders.loadProgress).not.toHaveBeenCalled();
  });

  it('sorts open deadlines by nearest due date and excludes completed tasks', async () => {
    const page = renderHomePage({ user: { id: 3, display_name: 'Learner' }, ...dashboardLoaders() });
    await page.ready;

    const tasks = [...page.querySelectorAll('[data-role="home-upcoming-task"]')];
    expect(tasks.map((task) => task.dataset.deadlineId)).toEqual(['2', '1']);
    expect(tasks[0].textContent).toContain('อ่านบทที่ 2');
  });

  it('shows a latest zero score as a real result', async () => {
    const page = renderHomePage({ user: { id: 3, display_name: 'Learner' }, ...dashboardLoaders() });
    await page.ready;

    expect(page.querySelector('[data-role="home-latest-score"]').textContent).toBe('0 / 10');
    expect(page.textContent).not.toContain('ยังไม่มีคะแนน');
    expect(page.querySelector('[data-role="home-practice-summary"]')?.textContent).toContain('ฝึกแล้ว 1 หัวข้อ');
    expect(page.querySelector('[data-role="home-practice-summary"]')?.textContent).toContain('ทำข้อสอบ 2 ครั้ง');
  });

  it('links recent quizzes, documents and all core study features', async () => {
    const onNavigate = vi.fn();
    const page = renderHomePage({ user: { id: 3, display_name: 'Learner' }, onNavigate, ...dashboardLoaders() });
    await page.ready;

    expect(page.querySelector('[data-route="/quizzes/8"]')?.textContent).toContain('แบบทดสอบเรื่องเซต');
    expect(page.querySelector('[data-route="/documents/9"]')?.textContent).toContain('สรุปเรื่องเซต');
    for (const path of ['/tutor', '/quizzes', '/documents', '/deadlines', '/progress']) {
      expect(page.querySelector(`[data-route="${path}"]`)).not.toBeNull();
    }
  });

  it('renders four data charts with useful accessible names and visible values', () => {
    const charts = renderDashboardCharts(overview);

    expect(charts.querySelectorAll('.dashboard-chart')).toHaveLength(4);
    expect(charts.querySelectorAll('svg[role="img"]')).toHaveLength(4);
    expect(charts.textContent).toContain('จำนวนทำข้อสอบ');
    expect(charts.textContent).toContain('สถานะงาน');
    expect(charts.textContent).toContain('คลังเอกสารตามแท็ก');
    expect(charts.textContent).toContain('หัวข้อที่ควรทบทวน');
    expect(charts.textContent).toContain('คณิตศาสตร์');
    expect(charts.textContent).toContain('0%');
    expect(charts.textContent).toContain('2 ครั้ง');
    expect(charts.querySelectorAll('svg desc')).toHaveLength(4);
    const weakTopicsChart = charts.querySelector('[data-chart="weak-topics"]');
    expect(weakTopicsChart.querySelector('svg desc')?.textContent).toContain('รายการอ่านหน้าจอ');
    expect(weakTopicsChart.querySelector('.dashboard-chart__data-list li')?.textContent).toContain('0% · 2 ครั้ง');
    expect(weakTopicsChart.querySelector('svg desc')?.textContent).not.toContain('0%');
    expect(charts.querySelector('[data-chart="document-tags"] .dashboard-chart__data-list')?.classList.contains('visually-hidden')).toBe(true);
  });

  it('shows distinct empty states without inventing chart values', () => {
    const charts = renderDashboardCharts({
      quiz_activity: Array.from({ length: 7 }, (_, index) => ({ label: `day-${index}`, count: 0 })),
      task_status: { not_started: 0, in_progress: 0, completed: 0 },
      documents_by_tag: [],
      topics_to_review: [],
    });

    expect(charts.querySelectorAll('[data-role="chart-empty"]')).toHaveLength(4);
    expect(charts.querySelectorAll('[data-role="chart-data-value"]')).toHaveLength(0);
  });

  it('uses a shared themed period control and refreshes only the charts for the selected period', async () => {
    const loadOverview = vi.fn().mockResolvedValue(overview);
    const loaders = dashboardLoaders({ loadOverview });
    const page = renderHomePage({ user: { id: 3, display_name: 'Learner' }, ...loaders });
    await page.ready;
    const period = page.querySelector('[aria-label="ช่วงเวลาแสดงกราฟ"]');
    expect(period.classList.contains('themed-select')).toBe(true);
    expect(loadOverview).toHaveBeenCalledWith(expect.objectContaining({ period: 'day', timeZone: expect.any(String) }));

    period.value = 'week';
    period.dispatchEvent(new Event('change', { bubbles: true }));
    await page.ready;
    expect(loadOverview).toHaveBeenLastCalledWith(expect.objectContaining({ period: 'week' }));
    expect(loaders.loadDeadlines).toHaveBeenCalledTimes(1);
  });

  it('shows per-section API failure messages while preserving the rest of the dashboard', async () => {
    const page = renderHomePage({
      user: { id: 3, display_name: 'Learner' },
      ...dashboardLoaders({ loadProgress: vi.fn().mockRejectedValue(new Error('network')) }),
    });
    await page.ready;

    expect(page.querySelector('[data-role="home-progress-error"]')).not.toBeNull();
    expect(page.querySelector('[data-role="home-upcoming-task"]')).not.toBeNull();
  });
});
