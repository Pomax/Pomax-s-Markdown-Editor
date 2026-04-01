/**
 * @fileoverview Integration tests for the "enable <style> elements" preference.
 *
 * Loads a document containing a <style> block and verifies:
 *   1. By default, <style> blocks are NOT injected into the DOM as real CSS.
 *   2. After enabling the preference, the CSS is injected and applies to the page.
 *   3. After disabling the preference, injected <style> elements are removed.
 *   4. Source view always shows the <style> block as editable text regardless
 *      of the preference, and the syntax tree is never altered.
 */

import { expect, test } from '@playwright/test';
import {
  closeApp,
  defocusEditor,
  launchApp,
  loadContent,
  setWritingView,
} from '../../test-utils.js';

const STYLE_FIXTURE = [
  `# Styled Document`,
  ``,
  `<style>`,
  `.md-heading1 { color: rgb(255, 0, 0) !important; }`,
  `</style>`,
  ``,
  `Some body text.`,
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

test.describe(`style element injection`, () => {
  test.beforeEach(async () => {
    // Reset the preference to disabled before each test, both in the
    // database and in the runtime editor state (via the same event the
    // preferences modal dispatches).
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, false);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: false },
        }),
      );
    });
    await loadContent(page, STYLE_FIXTURE);
    await setWritingView(page);
    await defocusEditor(page);
    await page.waitForTimeout(200);
  });

  test(`style blocks are NOT injected by default`, async () => {
    // No real <style> element with data-injected-style should exist.
    const injectedCount = await page.evaluate(
      () => document.querySelectorAll(`[data-injected-style="true"]`).length,
    );
    expect(injectedCount).toBe(0);

    // The heading should NOT have the red color applied.
    const headingColor = await page.evaluate(() => {
      const h = document.querySelector(`#editor .md-heading1`);
      return h ? getComputedStyle(h).color : null;
    });
    expect(headingColor).not.toBe(`rgb(255, 0, 0)`);
  });

  test(`enabling the preference injects the style element`, async () => {
    // Enable the setting and dispatch the event the same way the
    // preferences modal does when the user clicks Save.
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, true);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: true },
        }),
      );
    });
    await page.waitForTimeout(300);

    // A real <style> element should now be present in the DOM.
    const injectedCount = await page.evaluate(
      () => document.querySelectorAll(`[data-injected-style="true"]`).length,
    );
    expect(injectedCount).toBe(1);

    // The heading should now have the red color applied.
    const headingColor = await page.evaluate(() => {
      const h = document.querySelector(`#editor .md-heading1`);
      return h ? getComputedStyle(h).color : null;
    });
    expect(headingColor).toBe(`rgb(255, 0, 0)`);
  });

  test(`disabling the preference removes injected style elements`, async () => {
    // First enable…
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, true);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: true },
        }),
      );
    });
    await page.waitForTimeout(300);

    // Verify injection happened.
    let injectedCount = await page.evaluate(
      () => document.querySelectorAll(`[data-injected-style="true"]`).length,
    );
    expect(injectedCount).toBe(1);

    // …then disable.
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, false);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: false },
        }),
      );
    });
    await page.waitForTimeout(300);

    // The injected <style> element should be gone.
    injectedCount = await page.evaluate(
      () => document.querySelectorAll(`[data-injected-style="true"]`).length,
    );
    expect(injectedCount).toBe(0);

    // The heading color should revert.
    const headingColor = await page.evaluate(() => {
      const h = document.querySelector(`#editor .md-heading1`);
      return h ? getComputedStyle(h).color : null;
    });
    expect(headingColor).not.toBe(`rgb(255, 0, 0)`);
  });

  test(`syntax tree is not affected by the style injection preference`, async () => {
    // Get the markdown with preference off.
    const markdownBefore = await page.evaluate(() => window.editorAPI?.getContent());

    // Enable the preference.
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, true);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: true },
        }),
      );
    });
    await page.waitForTimeout(300);

    // Get the markdown with preference on.
    const markdownAfter = await page.evaluate(() => window.editorAPI?.getContent());

    // The markdown content should be identical — the preference only
    // affects DOM rendering, not the underlying syntax tree.
    expect(markdownAfter).toBe(markdownBefore);
  });
});

/**
 * Regression test: enabling style injection with real-world CSS that contains
 * unscoped rules (e.g. `img { … }`, `figure { … }`) must not destroy the
 * Table of Contents sidebar.  Extracted from are-we-flying/docs/index.md.
 */
test.describe(`style injection does not wreck the ToC sidebar`, () => {
  const REAL_WORLD_STYLE_DOC = [
    `# Chapter One`,
    ``,
    `## Section A`,
    ``,
    `Some text.`,
    ``,
    `## Section B`,
    ``,
    `More text.`,
    ``,
    `<style>`,
    `  html body, html body {`,
    `    @media only screen and (min-width: 1000px) {`,
    `      #nav-menu {`,
    `        position: fixed;`,
    `        top: 0;`,
    `        bottom: 0;`,
    `        left: 0;`,
    `        width: 25%;`,
    `        padding: 1em 0;`,
    `        overflow: scroll;`,
    `        background: white;`,
    `        & + div {`,
    `          position: fixed;`,
    `          top: 0;`,
    `          bottom: 0;`,
    `          left: 25%;`,
    `          right: 0;`,
    `          padding: 3em;`,
    `          overflow: auto;`,
    `        }`,
    `        #nav-toc-title {`,
    `          display: none;`,
    `        }`,
    `        ul, ol {`,
    `          padding-left: 1.25em;`,
    `        }`,
    `      }`,
    `    }`,
    `  }`,
    `  html body div.markdown-body h1:has(a) {`,
    `    display:none;`,
    `  }`,
    `  html body div.markdown-body h1:not(:has(a)) {`,
    `    font-size:2.5em;`,
    `  }`,
    `  img {`,
    `    max-width: 100%;`,
    `    margin: 0;`,
    `    border: 1px solid black;`,
    `  }`,
    `  figure {`,
    `    & img {`,
    `      margin-bottom: -1.5em;`,
    `    }`,
    `    & figcaption {`,
    `      margin: 0;`,
    `      padding: 0;`,
    `      size: 80%;`,
    `      font-style: italic;`,
    `      text-align: right;`,
    `    }`,
    `  }`,
    `  div.highlight pre.highlight span {`,
    `    &.c, &.c1, &.cd, &.cm {`,
    `      color: #137100!important;`,
    `    }`,
    `    &.err {`,
    `      color: inherit;`,
    `      background: inherit;`,
    `    }`,
    `  }`,
    `</style>`,
  ].join(`\n`);

  test.beforeEach(async () => {
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, false);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: false },
        }),
      );
    });
    await loadContent(page, REAL_WORLD_STYLE_DOC);
    await setWritingView(page);
    await defocusEditor(page);
    await page.waitForTimeout(200);
  });

  test(`ToC sidebar remains visible after enabling style injection`, async () => {
    // Capture ToC state BEFORE enabling style injection.
    const tocBefore = await page.evaluate(() => {
      const sidebar = document.querySelector(`#toc-sidebar`);
      const links = sidebar?.querySelectorAll(`.toc-link`);
      const nav = sidebar?.querySelector(`.toc-nav`);
      return {
        sidebarExists: !!sidebar,
        sidebarVisible: sidebar ? getComputedStyle(sidebar).display !== `none` : false,
        sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
        linkCount: links?.length ?? 0,
        navHTML: nav?.innerHTML.substring(0, 500) ?? ``,
      };
    });

    // Enable style injection.
    await page.evaluate(() => {
      window.electronAPI?.setSetting(`enableStyleElements`, true);
      document.dispatchEvent(
        new CustomEvent(`content:settingsChanged`, {
          detail: { detailsClosed: false, enableStyleElements: true },
        }),
      );
    });
    await page.waitForTimeout(500);

    // Capture ToC state AFTER enabling style injection.
    const tocAfter = await page.evaluate(() => {
      const sidebar = document.querySelector(`#toc-sidebar`);
      const links = sidebar?.querySelectorAll(`.toc-link`);
      const nav = sidebar?.querySelector(`.toc-nav`);
      const title = sidebar?.querySelector(`.toc-title`);
      return {
        sidebarExists: !!sidebar,
        sidebarVisible: sidebar ? getComputedStyle(sidebar).display !== `none` : false,
        sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
        sidebarHeight: sidebar?.getBoundingClientRect().height ?? 0,
        linkCount: links?.length ?? 0,
        navHTML: nav?.innerHTML.substring(0, 500) ?? ``,
        titleVisible: title ? getComputedStyle(title).display !== `none` : false,
        titleText: title?.textContent ?? ``,
      };
    });

    // The sidebar must still be visible.
    expect(tocAfter.sidebarExists).toBe(true);
    expect(tocAfter.sidebarVisible).toBe(true);
    expect(tocAfter.sidebarWidth).toBeGreaterThan(0);
    expect(tocAfter.sidebarHeight).toBeGreaterThan(0);

    // The ToC links must still be there (Chapter One, Section A, Section B).
    expect(tocAfter.linkCount).toBe(tocBefore.linkCount);
    expect(tocAfter.linkCount).toBeGreaterThanOrEqual(3);

    // The title must still be visible.
    expect(tocAfter.titleVisible).toBe(true);
  });
});
