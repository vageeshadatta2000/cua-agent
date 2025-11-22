import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import {
  ScreenshotResult,
  Element,
  Tab,
  Coordinate,
  ScrollParameters,
  CUAConfig
} from '../core/types';
import { Logger } from '../utils/logger';

export class BrowserController {
  private browser: Browser | null = null;
  private pages: Map<number, Page> = new Map();
  private nextTabId: number = 1;
  private config: CUAConfig['browser'];
  private logger: Logger;
  private lastCursorPosition: Map<number, [number, number]> = new Map();
  private isAnimating: boolean = false;

  constructor(config: CUAConfig['browser'], logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing browser...');

    // Use a separate user data directory for Puppeteer
    // This avoids conflicts with the main Chrome profile
    const userDataDir = process.env.CHROME_USER_DATA_DIR ||
      '/tmp/puppeteer-chrome-profile';

    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      defaultViewport: this.config.viewport,
      channel: 'chrome',
      userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled'
      ],
      ignoreDefaultArgs: ['--enable-automation']
    });

    // Create initial tab
    const pages = await this.browser.pages();
    if (pages.length > 0) {
      this.pages.set(this.nextTabId++, pages[0]);
    }

    this.logger.info('Browser initialized successfully');
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
    }
  }

  private getPage(tabId: number): Page {
    const page = this.pages.get(tabId);
    if (!page) {
      // Fix: Better error message with available tabs
      const availableTabs = Array.from(this.pages.keys()).join(', ');
      throw new Error(`Tab ${tabId} not found. Available tabs: [${availableTabs}]`);
    }
    return page;
  }

  // Initialize visual cursor on page
  private async initializeCursor(page: Page): Promise<void> {
    await page.evaluate(() => {
      if (document.getElementById('agent-cursor')) return;

      const cursor = document.createElement('div');
      cursor.id = 'agent-cursor';
      cursor.style.cssText = `
        position: fixed;
        width: 20px;
        height: 20px;
        background: radial-gradient(circle, #0066FF 30%, transparent 70%);
        border: 2px solid white;
        border-radius: 50%;
        pointer-events: none;
        z-index: 999999;
        transition: all 0.1s ease;
        box-shadow: 0 0 15px rgba(0, 102, 255, 0.6);
        display: none;
      `;
      document.body.appendChild(cursor);

      const style = document.createElement('style');
      style.id = 'agent-cursor-style';
      style.textContent = `
        @keyframes agent-cursor-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        #agent-cursor.clicking {
          animation: agent-cursor-pulse 0.3s ease-out;
        }
      `;
      document.head.appendChild(style);
    });
  }

  // Animate cursor movement
  private async animateCursorMove(
    page: Page,
    tabId: number,
    toX: number,
    toY: number
  ): Promise<void> {
    await this.initializeCursor(page);

    const viewport = page.viewport();
    const lastPos = this.lastCursorPosition.get(tabId) || [
      viewport?.width ? viewport.width / 2 : 640,
      viewport?.height ? viewport.height / 2 : 360
    ];

    // Fix: Skip animation if already animating to prevent race conditions
    if (this.isAnimating) {
      await page.evaluate(({ x, y }) => {
        const cursor = document.getElementById('agent-cursor');
        if (cursor) {
          cursor.style.display = 'block';
          cursor.style.left = `${x - 10}px`;
          cursor.style.top = `${y - 10}px`;
        }
      }, { x: toX, y: toY });
      this.lastCursorPosition.set(tabId, [toX, toY]);
      return;
    }

    this.isAnimating = true;

    try {
      const [fromX, fromY] = lastPos;
      const steps = 15;
      const delay = 8;

      for (let i = 0; i <= steps; i++) {
        const progress = i / steps;
        // Ease-out curve for smooth deceleration
        const eased = 1 - Math.pow(1 - progress, 3);
        const x = fromX + (toX - fromX) * eased;
        const y = fromY + (toY - fromY) * eased;

        await page.evaluate(({ x, y }) => {
          const cursor = document.getElementById('agent-cursor');
          if (cursor) {
            cursor.style.display = 'block';
            cursor.style.left = `${x - 10}px`;
            cursor.style.top = `${y - 10}px`;
          }
        }, { x, y });

        await new Promise(resolve => setTimeout(resolve, delay));
      }

      this.lastCursorPosition.set(tabId, [toX, toY]);
    } finally {
      this.isAnimating = false;
    }
  }

  // Show click animation
  private async showClickAnimation(page: Page): Promise<void> {
    await page.evaluate(() => {
      const cursor = document.getElementById('agent-cursor');
      if (cursor) {
        cursor.classList.add('clicking');
        setTimeout(() => cursor.classList.remove('clicking'), 300);
      }
    });
  }

  // Hide cursor
  private async hideCursor(page: Page): Promise<void> {
    await page.evaluate(() => {
      const cursor = document.getElementById('agent-cursor');
      if (cursor) cursor.style.display = 'none';
    });
  }

  // Screenshot
  async screenshot(tabId: number): Promise<ScreenshotResult> {
    const page = this.getPage(tabId);
    const buffer = await page.screenshot({
      type: 'png',
      fullPage: false
    });

    const viewport = page.viewport();
    return {
      image: buffer as Buffer,
      width: viewport?.width || this.config.viewport.width,
      height: viewport?.height || this.config.viewport.height,
      timestamp: Date.now()
    };
  }

  // Click actions
  async click(
    tabId: number,
    coordinate: [number, number],
    button: 'left' | 'right' = 'left',
    clickCount: number = 1
  ): Promise<void> {
    const page = this.getPage(tabId);

    // Animate cursor to target position
    await this.animateCursorMove(page, tabId, coordinate[0], coordinate[1]);

    // Show click animation
    await this.showClickAnimation(page);

    // Perform actual click
    await page.mouse.click(coordinate[0], coordinate[1], {
      button,
      clickCount
    });

    // Hide cursor after a short delay
    await new Promise(resolve => setTimeout(resolve, 300));
    await this.hideCursor(page);
  }

  async clickByRef(tabId: number, refId: string, button: 'left' | 'right' = 'left'): Promise<void> {
    const page = this.getPage(tabId);
    const element = await page.$(`[data-ref="${refId}"]`);
    if (!element) {
      throw new Error(`Element with ref ${refId} not found`);
    }

    const box = await element.boundingBox();
    if (!box) {
      throw new Error(`Could not get bounding box for element ${refId}`);
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.click(centerX, centerY, { button });
  }

  // Type text
  async type(tabId: number, text: string): Promise<void> {
    const page = this.getPage(tabId);
    await page.keyboard.type(text);
  }

  // Press key
  async pressKey(tabId: number, key: string): Promise<void> {
    const page = this.getPage(tabId);

    // Handle modifier keys
    if (key.includes('+')) {
      const parts = key.split('+');
      const modifiers: string[] = [];
      let mainKey = parts[parts.length - 1];

      for (let i = 0; i < parts.length - 1; i++) {
        const mod = parts[i].toLowerCase();
        if (mod === 'cmd' || mod === 'meta') modifiers.push('Meta');
        else if (mod === 'ctrl' || mod === 'control') modifiers.push('Control');
        else if (mod === 'alt') modifiers.push('Alt');
        else if (mod === 'shift') modifiers.push('Shift');
      }

      for (const mod of modifiers) {
        await page.keyboard.down(mod as any);
      }
      await page.keyboard.press(this.normalizeKey(mainKey) as any);
      for (const mod of modifiers.reverse()) {
        await page.keyboard.up(mod as any);
      }
    } else {
      await page.keyboard.press(this.normalizeKey(key) as any);
    }
  }

  private normalizeKey(key: string): string {
    const keyMap: Record<string, string> = {
      'return': 'Enter',
      'enter': 'Enter',
      'backspace': 'Backspace',
      'delete': 'Delete',
      'tab': 'Tab',
      'escape': 'Escape',
      'esc': 'Escape',
      'space': 'Space',
      'up': 'ArrowUp',
      'down': 'ArrowDown',
      'left': 'ArrowLeft',
      'right': 'ArrowRight'
    };
    return keyMap[key.toLowerCase()] || key;
  }

  // Wait
  async wait(duration: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, duration * 1000));
  }

  // Scroll
  async scroll(
    tabId: number,
    coordinate: [number, number],
    params: ScrollParameters
  ): Promise<void> {
    const page = this.getPage(tabId);

    await page.mouse.move(coordinate[0], coordinate[1]);

    let deltaX = 0;
    let deltaY = 0;
    const amount = params.scroll_amount === 'max' ? 10000 : params.scroll_amount * 100;

    switch (params.scroll_direction) {
      case 'down':
        deltaY = amount;
        break;
      case 'up':
        deltaY = -amount;
        break;
      case 'right':
        deltaX = amount;
        break;
      case 'left':
        deltaX = -amount;
        break;
    }

    await page.mouse.wheel({ deltaX, deltaY });
  }

  // Drag
  async drag(
    tabId: number,
    start: [number, number],
    end: [number, number]
  ): Promise<void> {
    const page = this.getPage(tabId);
    await page.mouse.move(start[0], start[1]);
    await page.mouse.down();
    await page.mouse.move(end[0], end[1], { steps: 10 });
    await page.mouse.up();
  }

  // Navigate
  async navigate(tabId: number, url: string): Promise<void> {
    const page = this.getPage(tabId);

    if (url === 'back') {
      await page.goBack({ waitUntil: 'domcontentloaded' });
    } else if (url === 'forward') {
      await page.goForward({ waitUntil: 'domcontentloaded' });
    } else {
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        url = 'https://' + url;
      }
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.config.timeout
      });
    }
  }

  // Create tab
  async createTab(url?: string): Promise<Tab> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page = await this.browser.newPage();
    await page.setViewport(this.config.viewport);

    const tabId = this.nextTabId++;
    this.pages.set(tabId, page);

    if (url) {
      await this.navigate(tabId, url);
    }

    return {
      id: tabId,
      url: page.url(),
      title: await page.title(),
      active: true
    };
  }

  // Get tabs context
  async getTabsContext(): Promise<Tab[]> {
    const tabs: Tab[] = [];

    for (const [id, page] of this.pages) {
      tabs.push({
        id,
        url: page.url(),
        title: await page.title(),
        active: false // Would need to track active tab
      });
    }

    return tabs;
  }

  // Read page accessibility tree
  async readPage(
    tabId: number,
    depth: number = 15,
    filter?: 'interactive' | 'all',
    refId?: string
  ): Promise<string> {
    const page = this.getPage(tabId);

    const tree = await page.evaluate((options) => {
      const { maxDepth, filterType, startRefId } = options;
      let refCounter = 0;

      function getAccessibleName(el: HTMLElement): string {
        return el.getAttribute('aria-label') ||
               el.getAttribute('alt') ||
               el.getAttribute('title') ||
               el.textContent?.trim().slice(0, 50) ||
               '';
      }

      function getRole(el: HTMLElement): string {
        const role = el.getAttribute('role');
        if (role) return role;

        const tagRoles: Record<string, string> = {
          'A': 'link',
          'BUTTON': 'button',
          'INPUT': 'textbox',
          'SELECT': 'combobox',
          'TEXTAREA': 'textbox',
          'IMG': 'image',
          'H1': 'heading',
          'H2': 'heading',
          'H3': 'heading',
          'NAV': 'navigation',
          'MAIN': 'main',
          'FORM': 'form'
        };

        return tagRoles[el.tagName] || 'generic';
      }

      function isInteractive(el: HTMLElement): boolean {
        const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
        const hasClickHandler = el.onclick !== null;
        const isClickable = el.getAttribute('role') === 'button' ||
                          el.getAttribute('tabindex') !== null;
        return interactiveTags.includes(el.tagName) || hasClickHandler || isClickable;
      }

      function buildTree(el: HTMLElement, currentDepth: number): string {
        if (currentDepth > maxDepth) return '';
        if (el.nodeType !== Node.ELEMENT_NODE) return '';

        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') return '';

        if (filterType === 'interactive' && !isInteractive(el)) {
          // Still process children
          let childContent = '';
          for (const child of el.children) {
            childContent += buildTree(child as HTMLElement, currentDepth);
          }
          return childContent;
        }

        // Fix: Only add ref if it doesn't exist to prevent flickering
        let refId = el.getAttribute('data-ref');
        if (!refId) {
          refId = `ref_${refCounter++}`;
          el.setAttribute('data-ref', refId);
        }

        const role = getRole(el);
        const name = getAccessibleName(el);
        const indent = '  '.repeat(currentDepth);

        let line = `${indent}[${refId}] ${role}`;
        if (name) line += `: "${name}"`;
        line += '\n';

        for (const child of el.children) {
          line += buildTree(child as HTMLElement, currentDepth + 1);
        }

        return line;
      }

      let root: HTMLElement = document.body;
      if (startRefId) {
        const found = document.querySelector(`[data-ref="${startRefId}"]`);
        if (found) root = found as HTMLElement;
      }

      return buildTree(root, 0);
    }, { maxDepth: depth, filterType: filter, startRefId: refId });

    return tree;
  }

  // Find elements by semantic query
  async findElements(tabId: number, query: string): Promise<Element[]> {
    const page = this.getPage(tabId);

    const elements = await page.evaluate((searchQuery) => {
      const results: any[] = [];
      const query = searchQuery.toLowerCase();

      function matchesQuery(el: HTMLElement): boolean {
        const text = el.textContent?.toLowerCase() || '';
        const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
        const placeholder = el.getAttribute('placeholder')?.toLowerCase() || '';
        const title = el.getAttribute('title')?.toLowerCase() || '';
        const id = el.id?.toLowerCase() || '';
        // Fix: Handle SVG elements where className is SVGAnimatedString
        const className = el.className && typeof el.className === 'string'
          ? el.className.toLowerCase()
          : el.className && typeof el.className === 'object' && (el.className as any).baseVal
            ? (el.className as any).baseVal.toLowerCase()
            : '';

        return text.includes(query) ||
               ariaLabel.includes(query) ||
               placeholder.includes(query) ||
               title.includes(query) ||
               id.includes(query) ||
               className.includes(query);
      }

      function traverse(el: HTMLElement) {
        if (matchesQuery(el)) {
          const rect = el.getBoundingClientRect();
          const refId = el.getAttribute('data-ref') || `found_${results.length}`;
          el.setAttribute('data-ref', refId);

          results.push({
            ref_id: refId,
            tag: el.tagName.toLowerCase(),
            text: el.textContent?.trim().slice(0, 100),
            role: el.getAttribute('role') || undefined,
            coordinates: {
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              width: rect.width,
              height: rect.height
            }
          });
        }

        for (const child of el.children) {
          if (results.length >= 20) break;
          traverse(child as HTMLElement);
        }
      }

      traverse(document.body);
      return results.slice(0, 20);
    }, query);

    return elements;
  }

  // Get page text content
  async getPageText(tabId: number): Promise<string> {
    const page = this.getPage(tabId);

    const text = await page.evaluate(() => {
      // Try to find main content
      const article = document.querySelector('article');
      const main = document.querySelector('main');
      const content = article || main || document.body;

      // Get text content, preserving some structure
      function extractText(el: HTMLElement): string {
        let text = '';

        for (const node of el.childNodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            text += node.textContent?.trim() + ' ';
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as HTMLElement;
            const style = window.getComputedStyle(element);

            if (style.display === 'none' || style.visibility === 'hidden') {
              continue;
            }

            const blockElements = ['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TR'];
            if (blockElements.includes(element.tagName)) {
              text += '\n' + extractText(element) + '\n';
            } else {
              text += extractText(element);
            }
          }
        }

        return text;
      }

      return extractText(content as HTMLElement)
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    });

    return text;
  }

  // Form input
  async formInput(tabId: number, refId: string, value: string | boolean | number): Promise<void> {
    const page = this.getPage(tabId);

    await page.evaluate((options) => {
      const { ref, val } = options;
      const el = document.querySelector(`[data-ref="${ref}"]`) as HTMLInputElement;

      if (!el) throw new Error(`Element with ref ${ref} not found`);

      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = Boolean(val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (el.tagName === 'SELECT') {
        (el as unknown as HTMLSelectElement).value = String(val);
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }, { ref: refId, val: value });
  }
}
