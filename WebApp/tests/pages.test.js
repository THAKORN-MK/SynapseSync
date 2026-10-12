// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderNavbar } from '../src/components/Navbar.js';
import { renderHomePage } from '../src/pages/HomePage.js';
import { renderLoginPage } from '../src/pages/LoginPage.js';
import { renderProfilePage } from '../src/pages/ProfilePage.js';
import { renderRegisterPage } from '../src/pages/RegisterPage.js';

function submit(form) {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

describe('Home, shared navigation, and account pages', () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it('shows a minimal Home message and navigates to sign-up or sign-in', () => {
    const onNavigate = vi.fn();
    const page = renderHomePage({ user: null, onNavigate });
    document.body.append(page);

    expect(page.querySelector('h1').textContent).toContain('SynapseSync');
    expect(page.textContent).toContain('พื้นที่สำหรับวางแผนและทบทวนการเรียนรู้');
    page.querySelector('[data-route="/register"]').click();
    page.querySelector('[data-route="/login"]').click();
    expect(onNavigate).toHaveBeenNthCalledWith(1, '/register');
    expect(onNavigate).toHaveBeenNthCalledWith(2, '/login');
  });

  it('keeps a quiz-creation link visible on Home for signed-in and signed-out visitors', () => {
    for (const user of [null, { id: 4, display_name: 'Learner' }]) {
      const onNavigate = vi.fn();
      const page = renderHomePage({ user, onNavigate });
      const quizLink = page.querySelector('[data-route="/quizzes/create"]');

      expect(quizLink?.textContent).toContain('สร้างข้อสอบ');
      expect(quizLink?.getAttribute('href')).toBe('/quizzes/create');
      quizLink.click();
      expect(onNavigate).toHaveBeenCalledWith('/quizzes/create');
    }
  });

  it('shows a glowing orbital atom and glass learning cards on Home', () => {
    const page = renderHomePage({ user: null, onNavigate: vi.fn() });

    expect(page.querySelectorAll('.atom-orbit')).toHaveLength(3);
    expect(page.querySelector('.atom-core')).not.toBeNull();
    expect(page.querySelectorAll('.home-glass-card')).toHaveLength(2);
  });

  it('test_guest_home_and_login_share_decorative_atom', () => {
    const home = renderHomePage({ user: null });
    const login = renderLoginPage();
    const homeAtom = home.querySelector('.home-hero__visual');
    const loginAtom = login.querySelector('.home-hero__visual');

    expect(homeAtom.getAttribute('aria-hidden')).toBe('true');
    expect(loginAtom?.getAttribute('aria-hidden')).toBe('true');
    expect(loginAtom?.outerHTML).toBe(homeAtom.outerHTML);
  });

  it('keeps guest theme selection accessible and reveals signed-in themes from the account menu', () => {
    const onThemeChange = vi.fn();
    const signedOut = renderNavbar(null, { navigate: vi.fn(), themeId: 'light', onThemeChange });
    const signedOutSelect = signedOut.querySelector('[data-action="theme-select"]');
    const signedOutLabel = signedOut.querySelector('label[for="theme-select"]');

    expect(signedOutLabel).not.toBeNull();
    expect(signedOutLabel.textContent).toContain('ธีม');
    expect(signedOutSelect?.value).toBe('light');
    expect([...signedOutSelect.options].map(({ value, textContent }) => [value, textContent]))
      .toEqual([['dark', 'มืด'], ['light', 'สว่าง'], ['purple', 'ม่วงเข้ม']]);

    signedOutSelect.value = 'purple';
    signedOutSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onThemeChange).toHaveBeenCalledWith('purple');

    const signedIn = renderNavbar({ display_name: 'Learner' }, {
      navigate: vi.fn(),
      themeId: 'purple',
      onThemeChange,
    });
    const accountPanel = signedIn.querySelector('[data-role="account-panel"]');
    const themeToggle = signedIn.querySelector('[data-action="theme-toggle"]');
    const themePanel = signedIn.querySelector('[data-role="theme-panel"]');
    expect(themePanel.hidden).toBe(true);
    themeToggle.click();
    expect(themeToggle.getAttribute('aria-expanded')).toBe('true');
    expect(themePanel.hidden).toBe(false);
    expect([...themePanel.querySelectorAll('[data-theme-id]')].map((option) => option.dataset.themeId))
      .toEqual(['dark', 'light', 'purple']);
    expect(themePanel.querySelector('[data-theme-id="purple"]')?.getAttribute('aria-pressed')).toBe('true');
    themePanel.querySelector('[data-theme-id="light"]').click();
    expect(onThemeChange).toHaveBeenLastCalledWith('light');
    expect(accountPanel.querySelector('[data-action="logout"]')).toBe(accountPanel.lastElementChild);
  });

  it('test_theme_select_keeps_native_keyboard_semantics', () => {
    const navbar = renderNavbar(null, { themeId: 'light' });
    const select = navbar.querySelector('[data-action="theme-select"]');

    expect(select.tagName).toBe('SELECT');
    expect(select.classList.contains('themed-select')).toBe(true);
    expect(select.labels[0]?.textContent.trim()).toContain('ธีม');
    expect(select.value).toBe('light');
    expect([...select.options].map(({ value }) => value)).toEqual(['dark', 'light', 'purple']);
  });

  it('renders signed-out and signed-in navigation states', () => {
    const navigate = vi.fn();
    const onLogout = vi.fn();
    const signedOut = renderNavbar(null, { navigate, onLogout });
    expect(signedOut.querySelector('[href="/login"]')).not.toBeNull();
    expect(signedOut.querySelector('[href="/register"]')).not.toBeNull();
    expect(signedOut.querySelector('[href="/quizzes"]')).toBeNull();

    const signedIn = renderNavbar({ display_name: 'Learner' }, { navigate, onLogout });
    expect(signedIn.textContent).toContain('Learner');
    expect(signedIn.querySelector('[href="/profile"]')).not.toBeNull();
    expect(signedIn.querySelector('[href="/quizzes"]')?.textContent).toBe('คลังข้อสอบ');
    signedIn.querySelector('[data-action="logout"]').click();
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('uses a five-item bottom dock and marks the current destination, including nested pages', () => {
    const navigate = vi.fn();
    const navbar = renderNavbar({ id: 4, display_name: 'Learner' }, {
      currentPath: '/documents/12',
      navigate,
    });
    const dock = navbar.querySelector('.nav-dock');
    const activeLink = dock?.querySelector('[data-nav-section="documents"]');

    expect(dock).not.toBeNull();
    expect([...dock.querySelectorAll('.nav-dock__link')].map((link) => link.dataset.navSection))
      .toEqual(['home', 'tutor', 'quizzes', 'documents', 'deadlines']);
    expect(activeLink?.getAttribute('aria-current')).toBe('page');
    expect(activeLink?.querySelector('.nav-dock__icon-wrap')).not.toBeNull();
    const deadlinesLink = dock.querySelector('[data-nav-section="deadlines"]');
    expect(deadlinesLink?.textContent).toBe('กำหนดส่งงาน');
    expect(deadlinesLink?.getAttribute('href')).toBe('/deadlines');
    expect(navbar.querySelector('.site-header .nav-dock')).toBeNull();
    expect(navbar.querySelector('[data-action="more-toggle"]')).toBeNull();
    expect(navbar.querySelector('.brand').textContent).toContain('SynapseSync');
    expect(navbar.querySelector('.nav-notifications')).not.toBeNull();
    expect(navbar.querySelector('.nav-account')).not.toBeNull();
    deadlinesLink.click();
    expect(navigate).toHaveBeenCalledWith('/deadlines');
  });

  it('morphs the active orb across all five tabs in either direction', () => {
    const navigationMotion = { activeTabId: null };
    const user = { id: 4, display_name: 'Learner' };
    const renderAt = (currentPath) => renderNavbar(user, { currentPath, navigationMotion });

    const home = renderAt('/');
    expect(home.querySelector('.nav-dock').dataset.orbDirection).toBe('enter');
    expect(home.querySelector('.nav-dock').style.getPropertyValue('--nav-orb-slide-offset')).toBe('0cqi');

    const deadlines = renderAt('/deadlines');
    expect(deadlines.querySelector('.nav-dock').dataset.orbDirection).toBe('right');
    expect(deadlines.querySelector('.nav-dock').style.getPropertyValue('--nav-orb-slide-offset')).toBe('-80cqi');
    expect(deadlines.querySelector('[data-nav-section="deadlines"]')?.getAttribute('aria-current')).toBe('page');

    const homeAgain = renderAt('/');
    expect(homeAgain.querySelector('.nav-dock').dataset.orbDirection).toBe('left');
    expect(homeAgain.querySelector('.nav-dock').style.getPropertyValue('--nav-orb-slide-offset')).toBe('80cqi');
    expect(homeAgain.querySelector('[data-nav-section="home"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('shows the real profile image and name, falls back to an initial, and groups account actions', () => {
    const onLogout = vi.fn();
    const navigate = vi.fn();
    const navbar = renderNavbar({ display_name: 'Learner', avatar_url: '/api/profile/avatar' }, { onLogout, navigate });
    const accountButton = navbar.querySelector('[data-action="account-toggle"]');
    const accountPanel = navbar.querySelector('[data-role="account-panel"]');
    const avatar = navbar.querySelector('.nav-account__avatar');
    const portrait = accountButton.querySelector('.nav-account__portrait');
    const name = accountButton.querySelector('.nav-account__name');
    const tools = navbar.querySelector('.nav-tools');

    expect(tools.firstElementChild).toBe(navbar.querySelector('.nav-notifications'));
    expect(tools.children[1]).toBe(accountButton.closest('.nav-account'));
    expect(portrait).not.toBeNull();
    expect(portrait?.querySelector('.nav-account__avatar')).toBe(avatar);
    expect(accountButton.lastElementChild).toBe(name);
    expect(avatar?.getAttribute('src')).toBe('/api/profile/avatar');
    expect(avatar?.hidden).toBe(false);
    expect(navbar.querySelector('.nav-account__name')?.textContent).toBe('Learner');
    expect(accountPanel.hidden).toBe(true);
    accountButton.click();
    expect(accountPanel.hidden).toBe(false);
    expect(accountPanel.querySelector('[href="/profile"]')).not.toBeNull();
    expect(accountPanel.querySelector('[href="/progress"]')).not.toBeNull();
    expect(accountPanel.querySelector('[data-action="theme-toggle"]')).not.toBeNull();
    accountPanel.querySelector('[href="/progress"]').click();
    expect(navigate).toHaveBeenCalledWith('/progress');
    accountPanel.querySelector('[data-action="logout"]').click();
    expect(onLogout).toHaveBeenCalledOnce();

    const fallbackNavbar = renderNavbar({ display_name: 'Learner' });
    expect(fallbackNavbar.querySelector('.nav-account__avatar')?.hidden).toBe(true);
    expect(fallbackNavbar.querySelector('.nav-account__initial')?.textContent).toBe('L');
    const imageNavbar = renderNavbar({ display_name: 'Learner', avatar_url: '/api/profile/avatar' });
    imageNavbar.querySelector('.nav-account__avatar').dispatchEvent(new Event('error'));
    expect(imageNavbar.querySelector('.nav-account__avatar').hidden).toBe(true);
    expect(imageNavbar.querySelector('.nav-account__initial').hidden).toBe(false);
  });

  it('lists only incomplete deadlines due in the next 24 hours and opens their destination', async () => {
    const loadDeadlines = vi.fn().mockResolvedValueOnce([
      { id: 11, title: 'ส่งรายงาน', subject: 'คณิตศาสตร์', due_at: '2026-10-12T13:00:00Z', is_completed: false },
      { id: 12, title: 'งานสัปดาห์หน้า', subject: 'ภาษาไทย', due_at: '2026-10-14T13:00:00Z', is_completed: false },
      { id: 13, title: 'ส่งแล้ว', subject: 'ฟิสิกส์', due_at: '2026-10-12T13:30:00Z', is_completed: true },
      { id: 14, title: 'เลยกำหนด', subject: 'เคมี', due_at: '2026-10-12T11:00:00Z', is_completed: false },
    ]).mockResolvedValueOnce([
      { id: 15, title: 'งานที่เพิ่งเพิ่ม', subject: 'ภาษาอังกฤษ', due_at: '2026-10-12T14:00:00Z', is_completed: false },
      { id: 16, title: 'งานที่เพิ่มอีกชิ้น', subject: 'ฟิสิกส์', due_at: '2026-10-12T14:30:00Z', is_completed: false },
    ]);
    const navigate = vi.fn();
    const navbar = renderNavbar({ id: 4, display_name: 'Learner' }, {
      loadDeadlines,
      navigate,
      now: () => new Date('2026-10-12T12:00:00Z'),
    });
    document.body.append(navbar);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const toggle = navbar.querySelector('[data-action="notifications-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('1');
    toggle.click();
    const panel = navbar.querySelector('[data-role="notifications-panel"]');
    expect(panel.hidden).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadDeadlines).toHaveBeenCalledTimes(2);
    expect(toggle.textContent).toContain('2');
    expect(panel.textContent).toContain('งานที่เพิ่งเพิ่ม');
    expect(panel.textContent).toContain('งานที่เพิ่มอีกชิ้น');
    expect(panel.textContent).not.toContain('ส่งรายงาน');
    expect(panel.textContent).not.toContain('งานสัปดาห์หน้า');
    expect(panel.textContent).not.toContain('ส่งแล้ว');
    expect(panel.textContent).not.toContain('เลยกำหนด');

    panel.querySelector('[data-notification-id="15"]').click();
    expect(navigate).toHaveBeenCalledWith('/deadlines');
  });

  it('submits labeled login fields without discarding the entered values', async () => {
    const onLogin = vi.fn().mockResolvedValue({ id: 2 });
    const onNavigate = vi.fn();
    const page = renderLoginPage({ onLogin, onNavigate });
    document.body.append(page);
    page.querySelector('#login-email').value = 'learner@example.com';
    page.querySelector('#login-password').value = 'studyPlan42';

    submit(page.querySelector('form'));
    await Promise.resolve();

    expect(page.querySelector('label[for="login-email"]').textContent).toContain('อีเมล');
    expect(page.querySelector('#login-password').type).toBe('password');
    expect(onLogin).toHaveBeenCalledWith({ email: 'learner@example.com', password: 'studyPlan42' });
    page.querySelector('[data-route="/register"]').click();
    expect(onNavigate).toHaveBeenCalledWith('/register');
  });

  it('prevents registration when passwords do not match and announces the reason', async () => {
    const onRegister = vi.fn();
    const page = renderRegisterPage({ onRegister });
    document.body.append(page);
    expect(page.querySelector('label[for="register-name"]').textContent).toContain('ชื่อที่ใช้แสดง');
    expect(page.querySelector('label[for="register-email"]').textContent).toContain('อีเมล');
    expect(page.querySelector('label[for="register-password-confirm"]').textContent).toContain('ยืนยันรหัสผ่าน');
    page.querySelector('#register-name').value = 'Learner';
    page.querySelector('#register-email').value = 'learner@example.com';
    page.querySelector('#register-password').value = 'StudyPlan42!';
    page.querySelector('#register-password-confirm').value = 'different42';

    submit(page.querySelector('form'));
    await Promise.resolve();

    expect(onRegister).not.toHaveBeenCalled();
    expect(page.querySelector('[aria-live="polite"]').textContent).toContain('รหัสผ่านไม่ตรงกัน');
  });

  it('prevents registration with a malformed email before calling the API', async () => {
    const onRegister = vi.fn();
    const page = renderRegisterPage({ onRegister });
    document.body.append(page);
    page.querySelector('#register-name').value = 'Learner';
    page.querySelector('#register-email').value = 'not-an-email';
    page.querySelector('#register-password').value = 'StudyPlan42!';
    page.querySelector('#register-password-confirm').value = 'StudyPlan42!';

    submit(page.querySelector('form'));
    await Promise.resolve();

    expect(onRegister).not.toHaveBeenCalled();
    expect(page.querySelector('[aria-live="polite"]').textContent).toContain('กรุณากรอกอีเมลให้ถูกต้อง');
  });

  it('shows neutral password requirements before typing and live red/green states after input', () => {
    const page = renderRegisterPage({ onRegister: vi.fn() });
    document.body.append(page);

    const requirementList = page.querySelector('[data-password-requirements]');
    expect(requirementList).not.toBeNull();
    expect([...requirementList.querySelectorAll('[data-requirement-id]')]
      .every((item) => item.dataset.state === 'pending')).toBe(true);

    const password = page.querySelector('#register-password');
    password.value = 'abcd';
    password.dispatchEvent(new Event('input', { bubbles: true }));

    expect(requirementList.querySelector('[data-requirement-id="minimum-length"]').dataset.state).toBe('invalid');
    expect(requirementList.querySelector('[data-requirement-id="letter"]').dataset.state).toBe('valid');
    expect(requirementList.querySelector('[data-requirement-id="number"]').dataset.state).toBe('invalid');

    password.value = 'abcdefg1';
    password.dispatchEvent(new Event('input', { bubbles: true }));
    expect([...requirementList.querySelectorAll('[data-requirement-id]')]
      .every((item) => item.dataset.state === 'valid')).toBe(true);
  });

  it('updates the accessible strength meter and toggles password visibility', () => {
    const page = renderRegisterPage({ onRegister: vi.fn() });
    document.body.append(page);

    const password = page.querySelector('#register-password');
    const meter = page.querySelector('[role="meter"]');
    const toggle = page.querySelector('[data-action="toggle-password"]');
    password.value = 'StudyPlan42!';
    password.dispatchEvent(new Event('input', { bubbles: true }));

    expect(meter.getAttribute('aria-valuenow')).toBe('6');
    expect(meter.getAttribute('aria-valuetext')).toContain('แข็งแรง');
    expect(toggle.getAttribute('aria-label')).toBe('แสดงรหัสผ่าน');
    toggle.click();
    expect(password.type).toBe('text');
    expect(toggle.getAttribute('aria-label')).toBe('ซ่อนรหัสผ่าน');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    toggle.click();
    expect(password.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
  });

  it('blocks a password missing a required rule and accepts the simple requested policy', async () => {
    const onRegister = vi.fn().mockResolvedValue({ id: 1 });
    const page = renderRegisterPage({ onRegister });
    document.body.append(page);
    page.querySelector('#register-name').value = 'Learner';
    page.querySelector('#register-email').value = 'learner@example.com';
    page.querySelector('#register-password').value = 'abcdefgh';
    page.querySelector('#register-password-confirm').value = 'abcdefgh';

    submit(page.querySelector('form'));
    await Promise.resolve();
    expect(onRegister).not.toHaveBeenCalled();
    expect(page.querySelector('[aria-live="polite"]').textContent).toContain('ตัวเลข');

    page.querySelector('#register-password').value = 'abcdefg1';
    page.querySelector('#register-password-confirm').value = 'abcdefg1';
    submit(page.querySelector('form'));
    await Promise.resolve();
    expect(onRegister).toHaveBeenCalledWith({
      display_name: 'Learner',
      email: 'learner@example.com',
      password: 'abcdefg1',
    });
  });

  it('uses prototype-inspired auth layout and SPA navigation while keeping Home minimal', () => {
    const onNavigate = vi.fn();
    const registerPage = renderRegisterPage({ onRegister: vi.fn(), onNavigate });
    const loginPage = renderLoginPage({ onLogin: vi.fn(), onNavigate });
    const homePage = renderHomePage({ user: null, onNavigate });

    expect(registerPage.classList.contains('auth-shell')).toBe(true);
    expect(registerPage.querySelector('.auth-intro h1')).not.toBeNull();
    expect(registerPage.querySelector('.auth-card')).not.toBeNull();
    expect(loginPage.classList.contains('auth-shell')).toBe(true);
    expect(loginPage.querySelector('.auth-card')).not.toBeNull();
    expect(homePage.classList.contains('home-hero')).toBe(true);
    expect(homePage.querySelectorAll('.feature-card')).toHaveLength(0);

    registerPage.querySelector('[data-route="/login"]').click();
    expect(onNavigate).toHaveBeenCalledWith('/login');
  });

  it('saves learning profile details and uploads a cropped avatar only after confirmation', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ id: 3 });
    const onAvatarUpload = vi.fn().mockResolvedValue({ avatar_url: '/api/profile/avatar' });
    const croppedFile = new File(['cropped-image'], 'avatar.webp', { type: 'image/webp' });
    const cropImage = vi.fn().mockResolvedValue(croppedFile);
    const createObjectURL = vi.fn(() => 'blob:avatar-preview');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    const page = renderProfilePage({
      user: {
        id: 3,
        email: 'learner@example.com',
        display_name: 'Learner',
        bio: '',
        learning_goal: 'Improve focus',
        learning_topics: ['Programming'],
      },
      onUpdate,
      onAvatarUpload,
      cropImage,
    });
    document.body.append(page);

    expect(page.querySelector('label[for="profile-name"]').textContent).toContain('ชื่อที่ใช้แสดง');
    expect(page.querySelector('label[for="profile-email"]').textContent).toContain('อีเมล');
    expect(page.querySelector('label[for="profile-bio"]').textContent).toContain('แนะนำตัว');
    expect(page.querySelector('label[for="profile-learning-goal"]').textContent).toContain('เป้าหมายการเรียน');
    expect(page.querySelector('label[for="profile-learning-topics"]').textContent).toContain('หัวข้อที่สนใจ');
    expect(page.querySelector('.avatar-controls small')).toBeNull();
    expect(page.querySelector('#avatar-hint').classList.contains('visually-hidden')).toBe(true);
    const avatarTrigger = page.querySelector('[data-action="choose-avatar"]');
    const avatarInput = page.querySelector('#profile-avatar');
    expect(avatarTrigger.closest('.avatar-area')).not.toBeNull();
    expect(avatarTrigger.textContent).toBe('+');
    expect(avatarTrigger.getAttribute('aria-label')).toBe('เปลี่ยนรูปโปรไฟล์');
    const openFilePicker = vi.spyOn(avatarInput, 'click');
    avatarTrigger.click();
    expect(openFilePicker).toHaveBeenCalledOnce();

    page.querySelector('#profile-name').value = 'New Learner';
    page.querySelector('#profile-bio').value = 'A short introduction';
    page.querySelector('#profile-learning-goal').value = 'Prepare for exams';
    page.querySelector('#profile-learning-topics').value = 'Math, Science';
    submit(page.querySelector('form'));
    await Promise.resolve();
    expect(onUpdate).toHaveBeenCalledWith({
      display_name: 'New Learner',
      bio: 'A short introduction',
      learning_goal: 'Prepare for exams',
      learning_topics: ['Math', 'Science'],
    });

    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    Object.defineProperty(avatarInput, 'files', { configurable: true, value: [file] });
    avatarInput.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    expect(page.querySelector('[role="dialog"]').textContent).toContain('จัดตำแหน่งรูปโปรไฟล์');
    expect(page.querySelector('[role="dialog"]').textContent).toContain('รองรับ JPEG, PNG หรือ WebP · ไม่เกิน 5 MB');
    expect(onAvatarUpload).not.toHaveBeenCalled();
    const zoom = page.querySelector('#avatar-zoom');
    zoom.value = '2';
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
    const cropArea = page.querySelector('[data-avatar-crop-area]');
    cropArea.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 40, clientY: 50 }));
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 54, clientY: 38 }));
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    page.querySelector('[data-action="apply-avatar-crop"]').click();
    await Promise.resolve();
    await Promise.resolve();
    expect(cropImage).toHaveBeenCalledWith(file, expect.objectContaining({ zoom: 2, offsetX: 14, offsetY: -12 }));
    expect(onAvatarUpload).toHaveBeenCalledWith(croppedFile);
    expect(page.querySelector('#avatar-preview').getAttribute('src')).toBe('blob:avatar-preview');
  });

  it('cancels avatar cropping without uploading the selected image', async () => {
    const onAvatarUpload = vi.fn();
    const page = renderProfilePage({
      user: { id: 3, email: 'learner@example.com', display_name: 'Learner' },
      onAvatarUpload,
      cropImage: vi.fn(),
    });
    const file = new File(['image'], 'avatar.png', { type: 'image/png' });
    const input = page.querySelector('#profile-avatar');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    page.querySelector('[data-action="cancel-avatar-crop"]').click();

    expect(page.querySelector('[role="dialog"]')).toBeNull();
    expect(onAvatarUpload).not.toHaveBeenCalled();
  });

  it('renders user-provided text as text rather than HTML', () => {
    const page = renderProfilePage({
      user: { id: 5, email: 'learner@example.com', display_name: '<img src=x onerror=alert(1)>', bio: '' },
      onUpdate: vi.fn(),
      onAvatarUpload: vi.fn(),
    });

    expect(page.querySelector('img[src="x"]')).toBeNull();
    expect(page.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('deadline planner navigation', () => {
  it('shows the deadline-planner link only to signed-in users', () => {
    const signedOut = renderNavbar(null);
    const signedIn = renderNavbar({ id: 4, display_name: 'Learner' });

    expect(signedOut.querySelector('a[href="/deadlines"]')).toBeNull();
    expect(signedIn.querySelector('[data-nav-section="deadlines"]')?.getAttribute('href')).toBe('/deadlines');
  });
});
