#!/usr/bin/env node
const blessed = require("blessed");

// Generate 50 items with varying content lengths
const items = Array.from({ length: 50 }, (_, i) => {
  const n = i + 1;
  if (n % 7 === 0) {
    return {
      title: `### ${n}. Multi-line database migration step`,
      body: [
        `  Create the \`table_${n}\` with columns: id (UUID), user_id (FK),`,
        `  provider_id (VARCHAR), access_token (ENCRYPTED), refresh_token`,
        `  (ENCRYPTED), token_expires_at (TIMESTAMP), created_at (TIMESTAMP).`,
      ].join("\n"),
    };
  }
  if (n % 5 === 0) {
    return {
      title: `### ${n}. Configure OAuth provider integration`,
      body: [
        `  Set up client credentials, redirect URIs, and PKCE challenge flow`,
        `  for the authentication provider. Validate scopes and token exchange.`,
      ].join("\n"),
    };
  }
  if (n % 3 === 0) {
    return {
      title: `### ${n}. Write unit tests for auth middleware`,
      body: `  Cover token validation, refresh flow, and session revocation edge cases.`,
    };
  }
  return {
    title: `### ${n}. Implement step ${n}`,
    body: `  Standard implementation task for this phase of the migration.`,
  };
});

const screen = blessed.screen({
  smartCSR: true,
  title: "redline spike — blessed",
  fullUnicode: true,
});

// Fixed header
const header = blessed.box({
  parent: screen,
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  content: " {red-fg}{bold}\u258c redline{/bold}{/red-fg}{gray-fg} \u2014 plan review{/gray-fg}\n {gray-fg}Spike: blessed scrolling test{/gray-fg}",
  style: { bg: "black" },
});

// Separator under header
const headerSep = blessed.line({
  parent: screen,
  top: 3,
  left: 0,
  width: "100%",
  orientation: "horizontal",
  style: { fg: "gray" },
});

// Fixed footer
const footer = blessed.box({
  parent: screen,
  bottom: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  content:
    " {gray-fg}\u2500{/gray-fg}\n" +
    " {bold}\u2191\u2193{/bold} navigate  {bold}q{/bold} quit  " +
    "{yellow-fg}{bold}c{/bold} comment{/yellow-fg}  " +
    "{cyan-fg}{bold}?{/bold} question{/cyan-fg}  " +
    "{red-fg}{bold}d{/bold} delete{/red-fg}  " +
    "{green-fg}{bold}r{/bold} replace{/green-fg}",
  style: { bg: "black" },
});

// Scrollable content area between header and footer
let activeIndex = 0;

const listBox = blessed.box({
  parent: screen,
  top: 4,
  left: 0,
  width: "100%",
  bottom: 3,
  scrollable: true,
  alwaysScroll: true,
  scrollbar: {
    style: { bg: "gray" },
  },
  tags: true,
  mouse: true,
  keys: false,
  style: { bg: "black" },
});

function renderList() {
  const lines = [];
  const width = screen.width - 4; // padding

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isActive = i === activeIndex;
    const gutter = String(i + 1).padStart(3, " ");
    const pointer = isActive ? "\u25b8" : " ";
    const gutterColor = isActive ? "yellow" : "gray";
    const titleColor = isActive ? "white" : "cyan";
    const titleBold = isActive ? "{bold}" : "";
    const titleBoldEnd = isActive ? "{/bold}" : "";

    lines.push(
      ` {${gutterColor}-fg}${gutter}{/${gutterColor}-fg} {red-fg}${pointer}{/red-fg} ${titleBold}{${titleColor}-fg}${item.title}{/${titleColor}-fg}${titleBoldEnd}`
    );

    // Body lines
    const bodyLines = item.body.split("\n");
    for (const bl of bodyLines) {
      lines.push(`       {gray-fg}${bl}{/gray-fg}`);
    }
  }

  listBox.setContent(lines.join("\n"));

  // Scroll to keep active item visible
  // Calculate the line number where the active item starts
  let targetLine = 0;
  for (let i = 0; i < activeIndex; i++) {
    targetLine += 1 + items[i].body.split("\n").length; // title + body lines
  }

  const visibleHeight = listBox.height;
  const currentScroll = listBox.getScroll();

  // Scroll so active item is roughly centered
  const idealScroll = Math.max(0, targetLine - Math.floor(visibleHeight / 2));
  listBox.setScroll(idealScroll);

  screen.render();
}

// Key bindings
screen.key(["up", "k"], () => {
  if (activeIndex > 0) {
    activeIndex--;
    renderList();
  }
});

screen.key(["down", "j"], () => {
  if (activeIndex < items.length - 1) {
    activeIndex++;
    renderList();
  }
});

screen.key(["q", "C-c", "escape"], () => {
  process.exit(0);
});

// Initial render
renderList();
screen.render();
