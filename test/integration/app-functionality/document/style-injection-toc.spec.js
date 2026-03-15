/**
 * @fileoverview Regression test: enabling style injection with CSS that
 * contains global selectors must NOT wreck the ToC sidebar.
 *
 * Uses the exact CSS from the are-we-flying docs/index.md file.
 */

import { expect, test } from '@playwright/test';
import {
  closeApp,
  defocusEditor,
  launchApp,
  loadContent,
  setWritingView,
} from '../../test-utils.js';

const REAL_WORLD_CSS = `
  html body, html body {
    @media only screen and (min-width: 1000px) {
      #nav-menu {
        position: fixed;
        top: 0;
        bottom: 0;
        left: 0;
        width: 25%;
        padding: 1em 0;
        overflow: scroll;
        background: white;
        & + div {
          position: fixed;
          top: 0;
          bottom: 0;
          left: 25%;
          right: 0;
          padding: 3em;
          overflow: auto;
        }
        #nav-toc-title {
          display: none;
        }
        ul, ol {
          padding-left: 1.25em;
        }
      }
    }
  }
  html body div.markdown-body h1:has(a) {
    display:none;
  }
  html body div.markdown-body h1:not(:has(a)) {
    font-size:2.5em;
  }
  img {
    max-width: 100%;
    margin: 0;
    border: 1px solid black;
  }
  figure {
    & img {
      margin-bottom: -1.5em;
    }
    & figcaption {
      margin: 0;
      padding: 0;
      size: 80%;
      font-style: italic;
      text-align: right;
    }
  }
  div.highlight pre.highlight span {
    &.c, &.c1, &.cd, &.cm {
      color: #137100!important;
    }
    &.err {
      color: inherit;
      background: inherit;
    }
  }
`;

const FIXTURE = [
  `# First Heading`,
  ``,
  `Some text.`,
  ``,
  `## Second Heading`,
  ``,
  `More text.`,
  ``,
  `## Third Heading`,
  ``,
  `Even more text.`,
  ``,
  `<style>`,
  REAL_WORLD_CSS,
  `</style>`,
].join(`\n`);

/** @type {import('@playwright/test').ElectronApplication} */
let electronApp;

/** @type {import('@playwright/test').Page} */
let page;

test.beforeAll(async () => {
  ({ electronApp, page } = await launchApp());
});

test.afterAll(async () => {
  await closeApp(electronApp);
});

test.describe(`style injection must not break the ToC`, () => {
  test.beforeEach(async () => {
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, false);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: false },
        }),
      );
    });
    await loadContent(page, FIXTURE);
    await setWritingView(page);
    await defocusEditor(page);
    await page.waitForTimeout(200);
  });

  test(`enabling style injection does not wreck the ToC sidebar`, async () => {
    // Baseline: ToC is visible with correct links while injection is off
    const before = await page.evaluate(() => {
      const nav = document.querySelector(`.toc-nav`);
      const links = nav ? nav.querySelectorAll(`a`) : [];
      const sb = document.querySelector(`#toc-sidebar`);
      return {
        linkCount: links.length,
        sidebarWidth: sb ? sb.getBoundingClientRect().width : 0,
        sidebarHeight: sb ? sb.getBoundingClientRect().height : 0,
      };
    });
    expect(before.linkCount).toBeGreaterThanOrEqual(3);
    expect(before.sidebarWidth).toBeGreaterThan(0);
    expect(before.sidebarHeight).toBeGreaterThan(0);

    // Enable style injection
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, true);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: true },
        }),
      );
    });
    await page.waitForTimeout(500);

    // ToC must still be fully intact
    const after = await page.evaluate(() => {
      const nav = document.querySelector(`.toc-nav`);
      const links = nav ? nav.querySelectorAll(`a`) : [];
      const sb = document.querySelector(`#toc-sidebar`);
      return {
        linkCount: links.length,
        sidebarDisplay: sb ? getComputedStyle(sb).display : `N/A`,
        sidebarWidth: sb ? sb.getBoundingClientRect().width : 0,
        sidebarHeight: sb ? sb.getBoundingClientRect().height : 0,
      };
    });
    expect(after.sidebarDisplay).not.toBe(`none`);
    expect(after.sidebarWidth).toBe(before.sidebarWidth);
    expect(after.sidebarHeight).toBe(before.sidebarHeight);
    expect(after.linkCount).toBe(before.linkCount);
  });
});
