// Overleaf Comment Exporter - Popup Script

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const app = {
  data: null,
  selectedComments: new Set(), // "fileIdx:commentIdx"
};

// --- Tab communication ---

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendMessage(action) {
  const tab = await getActiveTab();
  if (!tab || !tab.url?.includes("overleaf.com/project")) {
    showError("Please open an Overleaf project page first.");
    return null;
  }
  return chrome.tabs.sendMessage(tab.id, { action });
}

// --- Data loading ---

async function loadComments() {
  showLoading();
  const resp = await sendMessage("getComments");
  if (!resp) return;

  if (!resp.success) {
    showError(resp.error);
    return;
  }

  app.data = resp.data;
  render();
}

// --- Rendering ---

function render() {
  const { fileGroups, projectName, totalComments } = app.data;

  $("#project-name").textContent = projectName || "";
  $("#toolbar").classList.remove("hidden");
  $("#actions").classList.remove("hidden");

  if (totalComments === 0) {
    $("#content").innerHTML = '<div class="message">No comments found in this project.</div>';
    updateCount();
    return;
  }

  let html = "";
  fileGroups.forEach((group, fi) => {
    if (group.comments.length === 0) return;

    html += `<div class="file-group">
      <div class="file-header">
        <input type="checkbox" data-file="${fi}" ${group.comments.every((_, ci) => app.selectedComments.has(`${fi}:${ci}`)) ? "checked" : ""}>
        <span class="file-name">${esc(group.file)}</span>
        <span class="file-count">${group.comments.length} comment${group.comments.length > 1 ? "s" : ""}</span>
      </div>`;

    group.comments.forEach((c, ci) => {
      const key = `${fi}:${ci}`;
      const selected = app.selectedComments.has(key);
      const highlighted = c.highlightedText
        ? `<div class="comment-highlight">&gt; ${esc(c.highlightedText)}</div>`
        : "";
      html += `<div class="comment ${selected ? "selected" : ""}" data-key="${key}">
        <input type="checkbox" data-file="${fi}" data-comment="${ci}" ${selected ? "checked" : ""}>
        <div class="comment-body">
          <div class="comment-meta">
            <span class="comment-author">${esc(c.author)}</span>
            <span class="comment-time">${esc(c.timestamp ? new Date(c.timestamp).toLocaleString() : "")}</span>
          </div>
          ${highlighted}
          <div class="comment-content">${esc(c.content)}</div>
        </div>
      </div>`;
    });

    html += "</div>";
  });

  $("#content").innerHTML = html;
  updateCount();
  updateSelectAll();
  updateButtons();
  bindStaticEvents();
  bindDynamicEvents();
  initTimeFilter();
}

// --- Event binding ---

// Bind static element listeners once
let staticListenersBound = false;
function bindStaticEvents() {
  if (staticListenersBound) return;
  staticListenersBound = true;

  // Select all
  $("#select-all").addEventListener("change", () => {
    const allSelected = app.data.fileGroups.every((g, fi) =>
      g.comments.every((_, ci) => app.selectedComments.has(`${fi}:${ci}`))
    );
    if (allSelected) {
      app.selectedComments.clear();
    } else {
      app.data.fileGroups.forEach((g, fi) => {
        g.comments.forEach((_, ci) => app.selectedComments.add(`${fi}:${ci}`));
      });
    }
    render();
  });

  // Refresh
  $("#refresh-btn").addEventListener("click", () => {
    app.selectedComments.clear();
    loadComments();
  });

  // Export buttons
  $("#export-md").addEventListener("click", () => exportAs("md"));
  $("#export-json").addEventListener("click", () => exportAs("json"));
  $("#export-csv").addEventListener("click", () => exportAs("csv"));

  // Invert selection
  $("#invert-btn").addEventListener("click", () => {
    const allKeys = new Set();
    app.data.fileGroups.forEach((g, fi) => {
      g.comments.forEach((_, ci) => allKeys.add(`${fi}:${ci}`));
    });
    const newSelected = new Set();
    allKeys.forEach((key) => {
      if (!app.selectedComments.has(key)) newSelected.add(key);
    });
    app.selectedComments = newSelected;
    render();
  });

  // Time filter
  $("#time-apply").addEventListener("click", selectByTime);
}

// Bind dynamic element listeners (re-created on each render)
function bindDynamicEvents() {
  // Individual comment checkbox
  $$(".comment input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const fi = e.target.dataset.file;
      const ci = e.target.dataset.comment;
      const key = `${fi}:${ci}`;
      if (e.target.checked) {
        app.selectedComments.add(key);
      } else {
        app.selectedComments.delete(key);
      }
      updateCommentRow(key);
      updateFileCheckbox(fi);
      updateCount();
      updateSelectAll();
      updateButtons();
    });
  });

  // File group checkbox
  $$(".file-header input[type=checkbox]").forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const fi = e.target.dataset.file;
      const group = app.data.fileGroups[fi];
      const allSelected = group.comments.every((_, ci) => app.selectedComments.has(`${fi}:${ci}`));
      group.comments.forEach((_, ci) => {
        const key = `${fi}:${ci}`;
        if (allSelected) {
          app.selectedComments.delete(key);
        } else {
          app.selectedComments.add(key);
        }
        updateCommentRow(key);
      });
      e.target.checked = !allSelected;
      updateCount();
      updateSelectAll();
      updateButtons();
    });
  });
}

function updateCommentRow(key) {
  const row = $(`.comment[data-key="${key}"]`);
  const cb = row?.querySelector("input[type=checkbox]");
  if (row) row.classList.toggle("selected", app.selectedComments.has(key));
  if (cb) cb.checked = app.selectedComments.has(key);
}

function updateFileCheckbox(fi) {
  const group = app.data.fileGroups[fi];
  const allSelected = group.comments.every((_, ci) => app.selectedComments.has(`${fi}:${ci}`));
  const cb = $(`.file-header input[data-file="${fi}"]`);
  if (cb) cb.checked = allSelected;
}

function updateSelectAll() {
  const allSelected = app.data.fileGroups.every((g, fi) =>
    g.comments.every((_, ci) => app.selectedComments.has(`${fi}:${ci}`))
  );
  $("#select-all").checked = allSelected;
}

function updateCount() {
  const total = app.data?.totalComments || 0;
  const selected = app.selectedComments.size;
  $("#count").textContent = `${selected}/${total} selected`;
}

function updateButtons() {
  const hasSelection = app.selectedComments.size > 0;
  $("#export-md").disabled = !hasSelection;
  $("#export-json").disabled = !hasSelection;
  $("#export-csv").disabled = !hasSelection;
}

// --- Time filter ---

let timeFilterInited = false;
function initTimeFilter() {
  if (timeFilterInited) return;
  timeFilterInited = true;

  // Set default to the earliest comment time
  const timestamps = [];
  app.data.fileGroups.forEach((g, fi) => {
    g.comments.forEach((c, ci) => {
      if (c.timestamp) timestamps.push(new Date(c.timestamp));
    });
  });

  if (timestamps.length === 0) return;

  timestamps.sort((a, b) => a - b);

  // Set min to the earliest comment, no max restriction
  const min = toLocalDatetimeString(timestamps[0]);
  const input = $("#time-cutoff");
  input.min = min;
  input.value = min;

  $("#time-filter").classList.remove("hidden");
}

function toLocalDatetimeString(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function selectByTime() {
  const input = $("#time-cutoff");
  if (!input.value) return;

  const cutoff = new Date(input.value).getTime();
  app.selectedComments.clear();

  app.data.fileGroups.forEach((g, fi) => {
    g.comments.forEach((c, ci) => {
      const ts = c.timestamp ? new Date(c.timestamp).getTime() : 0;
      if (ts >= cutoff) {
        app.selectedComments.add(`${fi}:${ci}`);
      }
    });
  });

  render();
}

// --- Export ---

function getSelectedComments() {
  const result = [];
  app.selectedComments.forEach((key) => {
    const [fi, ci] = key.split(":").map(Number);
    const group = app.data.fileGroups[fi];
    if (group && group.comments[ci]) {
      result.push({ file: group.file, ...group.comments[ci] });
    }
  });
  return result;
}

function exportAs(format) {
  const comments = getSelectedComments();
  if (comments.length === 0) return;

  const baseName = app.data.projectName || "overleaf";
  let content, filename, mime;

  if (format === "md") {
    content = toMarkdown(comments);
    filename = `${baseName}-comments.md`;
    mime = "text/markdown";
  } else if (format === "json") {
    content = JSON.stringify(comments.map(cleanForExport), null, 2);
    filename = `${baseName}-comments.json`;
    mime = "application/json";
  } else if (format === "csv") {
    content = toCSV(comments);
    filename = `${baseName}-comments.csv`;
    mime = "text/csv";
  }

  download(content, filename, mime);
  showToast(`Exported ${comments.length} comment${comments.length > 1 ? "s" : ""} as ${format.toUpperCase()}`);
}

function cleanForExport(c) {
  const clean = {
    file: c.file,
    author: c.author,
    time: c.timestamp ? new Date(c.timestamp).toLocaleString() : "",
    highlightedText: c.highlightedText || "",
    content: c.content,
  };
  if (c.replies?.length) {
    clean.replies = c.replies.map((r) => ({
      author: r.author,
      content: r.content,
    }));
  }
  return clean;
}

function toMarkdown(comments) {
  let md = `# Comments: ${app.data.projectName || "Overleaf Project"}\n\n`;

  const byFile = {};
  comments.forEach((c) => {
    if (!byFile[c.file]) byFile[c.file] = [];
    byFile[c.file].push(c);
  });

  for (const [file, items] of Object.entries(byFile)) {
    md += `## ${file}\n\n`;
    items.forEach((c) => {
      const ts = c.timestamp ? new Date(c.timestamp).toLocaleString() : "";
      md += `**${c.author}** — ${ts}\n\n`;
      if (c.highlightedText) {
        md += "```latex\n" + c.highlightedText + "\n```\n\n";
      }
      md += `${c.content}\n\n`;
      if (c.replies?.length) {
        c.replies.forEach((r) => {
          md += `  - **${r.author}** (reply): ${r.content}\n\n`;
        });
      }
    });
  }

  return md;
}

function toCSV(comments) {
  const header = "File,Author,Time,Highlighted Text,Content\n";
  const rows = comments.map((c) =>
    [
      c.file,
      c.author,
      c.timestamp ? new Date(c.timestamp).toLocaleString() : "",
      `"${(c.highlightedText || "").replace(/"/g, '""')}"`,
      `"${c.content.replace(/"/g, '""')}"`,
    ].join(",")
  );
  return header + rows.join("\n");
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// --- UI helpers ---

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function showLoading() {
  $("#content").innerHTML = '<div class="message"><div class="spinner"></div><br>Loading comments...</div>';
  $("#toolbar").classList.add("hidden");
  $("#actions").classList.add("hidden");
}

function showError(msg) {
  $("#content").innerHTML = `<div class="message error">${esc(msg)}</div>`;
  $("#toolbar").classList.add("hidden");
  $("#actions").classList.add("hidden");
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// --- Init ---
document.addEventListener("DOMContentLoaded", loadComments);
