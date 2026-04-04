/**
 * @typedef {import('../../../parsers/old/syntax-tree.js').SyntaxTree} SyntaxTree
 * @typedef {import('./handlers/clipboard-handler.js').ClipboardHandler} ClipboardHandler
 * @typedef {import('./handlers/input-handler.js').InputHandler} InputHandler
 * @typedef {import('./handlers/event-handler.js').EventHandler} EventHandler
 * @typedef {import('./managers/cursor-manager.js').CursorManager} CursorManager
 * @typedef {import('./managers/selection-manager.js').SelectionManager} SelectionManager
 * @typedef {import('./managers/undo-manager.js').UndoManager} UndoManager
 * @typedef {import('./edit-operations/index.js').EditOperations} EditOperations
 * @typedef {import('./range-operations.js').RangeOperations} RangeOperations
 * @typedef {import('./content-types/table/table-manager.js').TableManager} TableManager
 * @typedef {import('./content-types/image/image-helper.js').ImageHelper} ImageHelper
 * @typedef {import('./content-types/link/link-helper.js').LinkHelper} LinkHelper
 * @typedef {import('./renderers/source/index.js').SourceRendererV2} SourceRendererV2
 * @typedef {import('./renderers/writing/index.js').WritingRenderer} WritingRenderer
 * @typedef {import('./formatters/tree-formatter.js').TreeFormatter} TreeFormatter
 * @typedef {import('./formatters/source2-formatter.js').Source2Formatter} Source2Formatter
 * @typedef {import('./content-types/code-block/code-language/code-language-modal.js').CodeLanguageModal} CodeLanguageModal
 * @typedef {import('./content-types/link/link-modal.js').LinkModal} LinkModal
 * @typedef {import('./content-types/image/image-modal.js').ImageModal} ImageModal
 * @typedef {import('./content-types/table/table-modal.js').TableModal} TableModal
 * @typedef {import('../utility/toolbar/toolbar-button.js').ToolbarButton} ToolbarButton
 * @typedef {import('../utility/toolbar/toolbar.js').Toolbar} Toolbar
 * @typedef {import('../utility/search/search-bar.js').SearchBar} SearchBar
 * @typedef {import('../utility/toc/toc.js').TableOfContents} TableOfContents
 * @typedef {import('../utility/tab-bar/tab-bar.js').TabBar} TabBar
 * @typedef {import('./handlers/menu-handler.js').MenuHandler} MenuHandler
 * @typedef {import('./handlers/keyboard-handler.js').KeyboardHandler} KeyboardHandler
 */

/**
 * Object type annotation, so we can run type linting without
 * needing to pollute a constructor with a million fucking
 * type comments.
 */
export class EditorData {
  /** @type {HTMLElement} */
  container;
  /** @type {SyntaxTree|null} */
  syntaxTree = null;
  /** @type {WritingRenderer} */
  writingRenderer;
  /** @type {SourceRendererV2} */
  sourceRendererV2;
  /** @type {WritingRenderer|SourceRendererV2} */
  renderer;
  /** @type {TreeFormatter} */
  treeFormatter;
  /** @type {Source2Formatter} */
  source2Formatter;
  /** @type {UndoManager} */
  undoManager;
  /** @type {SelectionManager} */
  selectionManager;
  /** @type {CursorManager} */
  cursorManager;
  /** @type {TableManager} */
  tableManager;
  /** @type {InputHandler} */
  inputHandler;
  /** @type {EditOperations} */
  editOperations;
  /** @type {RangeOperations} */
  rangeOperations;
  /** @type {ClipboardHandler} */
  clipboardHandler;
  /** @type {EventHandler} */
  eventHandler;
  /** @type {ImageHelper} */
  imageHelper;
  /** @type {LinkHelper} */
  linkHelper;
  /** @type {ViewMode} */
  viewMode = `writing`;
  /** @type {boolean} */
  hasUnsavedChanges = false;
  /** @type {string|null} */
  currentFilePath = null;
  /** @type {boolean} */
  ensureLocalPaths = true;
  /** @type {boolean} */
  detailsClosed = false;
  /** @type {boolean} */
  enableStyleElements = false;
  /** @type {boolean} */
  isRendering = false;
  /** @type {boolean} */
  editorInteractionPending = false;
  /** @type {TreeRange|null} */
  treeRange = null;
  /** @type {string|null} */
  lastRenderedNodeId = null;
  /** @type {Record<string, EventListener>} */
  boundHandlers = {};
}

export class SourceRendererV2Data {
  /** @type {Editor} */
  editor;
  /** @type {HTMLTextAreaElement|null} */
  textarea = null;
  /** @type {HTMLPreElement|null} */
  pre = null;
  /** @type {boolean} */
  mirrorDirty = false;
  /** @type {string} */
  originalMarkdown = ``;
}

export class EventHandlerData {
  /** @type {Editor} */
  editor;
  /** @type {HTMLElement|null} */
  mouseDownAnchor = null;
  /** @type {HTMLElement|null} */
  mouseDownLanguageTag = null;
  /** @type {CodeLanguageModal|null} */
  codeLanguageModal = null;
  /** @type {boolean} */
  blurredByModal = false;
}

export class KeyboardHandlerData {
  /** @type {Editor} */
  editor;
  /** @type {ShortcutConfig[]} */
  shortcuts;
  /** @type {((event: KeyboardEvent) => void)|null} */
  keydownHandler = null;
}

export class MenuHandlerData {
  /** @type {Editor} */
  editor;
  /** @type {Toolbar} */
  toolbar;
  /** @type {function|null} */
  cleanupMenuListener = null;
}

export class InputHandlerData {
  /** @type {Editor} */
  editor;
}

export class ClipboardHandlerData {
  /** @type {Editor} */
  editor;
}

export class SelectionManagerData {
  /** @type {Editor} */
  editor;
  /** @type {SelectionState|null} */
  currentSelection = null;
  /** @type {SyntaxNode|null} */
  currentNode = null;
}

export class CursorManagerData {
  /** @type {Editor} */
  editor;
}

export class RangeOperationsData {
  /** @type {Editor} */
  editor;
  /** @type {number} */
  selectAllLevel = 0;
}

export class TableManagerData {
  /** @type {Editor} */
  editor;
}

export class LinkHelperData {
  /** @type {Editor} */
  editor;
  /** @type {LinkModal|null} */
  linkModal = null;
}

export class ImageHelperData {
  /** @type {Editor} */
  editor;
  /** @type {ImageModal|null} */
  imageModal = null;
}

export class TreeFormatterData {
  /** @type {Editor} */
  editor;
}

export class Source2FormatterData {
  /** @type {SourceRendererV2} */
  renderer;
  /** @type {number} */
  savedSelectionStart = 0;
  /** @type {number} */
  savedSelectionEnd = 0;
}

export class EditOperationsData {
  /** @type {Editor} */
  editor;
}

export class ToolbarData {
  /** @type {HTMLElement} */
  container;
  /** @type {Editor} */
  editor;
  /** @type {HTMLElement|null} */
  toolbarElement = null;
  /** @type {ToolbarButton[]} */
  buttons = [];
  /** @type {HTMLButtonElement|null} */
  viewModeToggle = null;
  /** @type {LinkModal|null} */
  linkModal = null;
  /** @type {TableModal|null} */
  tableModal = null;
  /** @type {ButtonConfig[]} */
  buttonConfigs;
}

export class ToolbarButtonData {
  /** @type {ButtonConfig} */
  config;
  /** @type {function(ButtonConfig): void} */
  onClick;
  /** @type {HTMLButtonElement} */
  element;
  /** @type {boolean} */
  isEnabled = true;
  /** @type {boolean} */
  isActive = false;
}

export class SearchBarData {
  /** @type {Editor} */
  editor;
  /** @type {HTMLElement|null} */
  container = null;
  /** @type {HTMLInputElement|null} */
  input = null;
  /** @type {HTMLElement|null} */
  matchCount = null;
  /** @type {boolean} */
  useRegex = false;
  /** @type {boolean} */
  caseSensitive = false;
  /** @type {boolean} */
  visible = false;
  /** @type {SearchMatch[]} */
  matches = [];
  /** @type {number} */
  currentIndex = -1;
  /** @type {OffsetMapEntry[]} */
  offsetMap = [];
  /** @type {string} */
  documentText = ``;
  /** @type {string|null} */
  searchViewMode = null;
  /** @type {number|undefined} */
  savedScrollTop = undefined;
  /** @type {(() => void)|null} */
  renderCompleteHandler = null;
}

export class TableOfContentsData {
  /** @type {HTMLElement} */
  container;
  /** @type {Editor} */
  editor;
  /** @type {boolean} */
  visible = true;
  /** @type {TocPosition} */
  position = `left`;
  /** @type {Map<string, string>} */
  nodeToHeadingId = new Map();
  /** @type {((e: Event) => void) | null} */
  scrollHandler = null;
  /** @type {string|null} */
  lockedHeadingId = null;
  /** @type {boolean} */
  programmaticScroll = false;
}

export class TabBarData {
  /** @type {HTMLElement} */
  container;
  /** @type {TabInfo[]} */
  tabs = [];
  /** @type {string|null} */
  activeTabId = null;
  /** @type {((tabId: string) => void)|null} */
  onTabSelect = null;
  /** @type {((tabId: string) => void)|null} */
  onTabClose = null;
}

export class BaseModalData {
  /** @type {HTMLDialogElement|null} */
  dialog = null;
  /** @type {boolean} */
  built = false;
  /** @type {function(*): void} */
  resolve = () => {};
  /** @type {HTMLElement|null} */
  previousFocus = null;
}

export class WordCountModalData {
  /** @type {HTMLDialogElement|null} */
  dialog = null;
  /** @type {boolean} */
  built = false;
}

export class PreferencesModalData {
  /** @type {HTMLDialogElement|null} */
  dialog = null;
  /** @type {boolean} */
  built = false;
  /** @type {boolean} */
  linkTopBottom = false;
  /** @type {boolean} */
  linkLeftRight = false;
  /** @type {boolean} */
  linkAll = false;
}

export class AppData {
  /** @type {Editor|null} */
  editor = null;
  /** @type {Toolbar|null} */
  toolbar = null;
  /** @type {MenuHandler|null} */
  menuHandler = null;
  /** @type {KeyboardHandler|null} */
  keyboardHandler = null;
  /** @type {SearchBar|null} */
  searchBar = null;
  /** @type {TableOfContents|null} */
  toc = null;
  /** @type {TabBar|null} */
  tabBar = null;
  /** @type {Map<string, DocumentState>} */
  documentStates = new Map();
  /** @type {Map<string, HTMLElement>} */
  tabContainers = new Map();
  /** @type {HTMLElement|null} */
  scrollContainer = null;
  /** @type {number} */
  tabCounter = 0;
  /** @type {ReturnType<typeof setTimeout>|null} */
  cursorDebounce = null;
}

export class WritingRendererData {
  /** @type {Editor} */
  editor;
}

export class UndoManagerData {
  /** @type {Change[]} */
  undoStack = [];
  /** @type {Change[]} */
  redoStack = [];
  /** @type {number} */
  batchTimeout = 300;
  /** @type {number} */
  lastChangeTime = 0;
}
