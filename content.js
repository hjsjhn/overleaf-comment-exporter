// Overleaf Comment Exporter - Content Script (isolated world)
// Injects a MAIN-world script to access React fiber tree, then fetches thread data via API

(() => {
  let cachedData = null;
  let requestId = 0;

  // Inject the MAIN-world script once
  let injected = false;
  function injectMainScript() {
    if (injected) return;
    injected = true;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("injected.js");
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function getMetaContent(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el?.getAttribute("content") || null;
  }

  function getProjectId() {
    return getMetaContent("ol-project_id");
  }

  function getProjectName() {
    return getMetaContent("ol-projectName");
  }

  function getCsrfToken() {
    return getMetaContent("ol-csrfToken");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Save and restore review panel state to avoid disrupting the user
  let savedPanelState = null;

  function savePanelState() {
    const railTabs = document.querySelectorAll(".ide-rail-tab-link");
    let activeRailTabKey = null;
    railTabs.forEach(t => {
      if (t.classList.contains("active") || t.getAttribute("aria-selected") === "true") {
        activeRailTabKey = t.getAttribute("data-rr-ui-event-key");
      }
    });
    const activeReviewTab = document.querySelector(".review-panel-tab-active");
    savedPanelState = {
      activeRailTabKey,
      activeReviewTabId: activeReviewTab?.id || null,
    };
  }

  async function restorePanelState() {
    if (!savedPanelState) return;
    const { activeRailTabKey, activeReviewTabId } = savedPanelState;

    // Restore the original review panel tab (if not overview)
    if (activeReviewTabId && activeReviewTabId !== "review-panel-tab-button-overview") {
      const tab = document.getElementById(activeReviewTabId);
      if (tab) {
        tab.click();
        await sleep(50);
      }
    }

    // Switch back to the original rail tab
    if (activeRailTabKey && activeRailTabKey !== "review-panel") {
      const tab = document.querySelector(`[data-rr-ui-event-key="${activeRailTabKey}"]`);
      if (tab) tab.click();
    }

    savedPanelState = null;
  }

  // Switch to Review panel > Overview tab temporarily to populate React fiber tree
  async function ensureReviewPanelOverview() {
    savePanelState();

    // Open Review panel rail tab
    const reviewBtn = document.querySelector('[data-rr-ui-event-key="review-panel"]');
    if (reviewBtn && !reviewBtn.classList.contains("active") && reviewBtn.getAttribute("aria-selected") !== "true") {
      reviewBtn.click();
      await sleep(200);
    }

    // Switch to Overview tab
    const overviewTab = document.getElementById("review-panel-tab-button-overview");
    if (overviewTab && !overviewTab.classList.contains("review-panel-tab-active")) {
      overviewTab.click();
      await sleep(200);
    }
  }

  // Request comment data from the MAIN-world script, retry if empty
  function requestReactData() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;

      function tryRequest() {
        attempts++;
        const id = ++requestId;
        const timeout = setTimeout(() => {
          window.removeEventListener("message", handler);
          // If no data yet, retry after a short delay
          if (attempts < maxAttempts) {
            setTimeout(tryRequest, 100);
          } else {
            resolve(null);
          }
        }, 300);

        function handler(event) {
          if (
            event.source === window &&
            event.data?.type === "OL_COMMENT_EXPORT_RESPONSE" &&
            event.data.requestId === id
          ) {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            const data = event.data.data;
            // Check if we got actual comment data
            if (data && !data.error && data.fileGroups?.length > 0) {
              resolve(data);
            } else if (attempts < maxAttempts) {
              setTimeout(tryRequest, 100);
            } else {
              resolve(data);
            }
          }
        }

        window.addEventListener("message", handler);
        window.postMessage({ type: "OL_COMMENT_EXPORT_REQUEST", requestId: id }, "*");
      }

      tryRequest();
    });
  }

  // Fetch threads from Overleaf API (can be done in isolated world)
  async function fetchThreads() {
    const csrfToken = getCsrfToken();
    const projectId = getProjectId();
    if (!csrfToken || !projectId) {
      throw new Error("Cannot find project info. Make sure you're on an Overleaf project page.");
    }

    const resp = await fetch(`/project/${projectId}/threads`, {
      headers: {
        "x-csrf-token": csrfToken,
        accept: "application/json",
      },
      credentials: "same-origin",
    });

    if (!resp.ok) {
      throw new Error(`API error: ${resp.status} ${resp.statusText}`);
    }

    return resp.json();
  }

  // Main: collect all data
  async function collectComments() {
    if (cachedData) return cachedData;

    injectMainScript();

    // Start API fetch and tab switch in parallel
    const [threadsResult, ,] = await Promise.all([
      fetchThreads(),
      ensureReviewPanelOverview(),
    ]);

    // Get React data from MAIN world
    const reactData = await requestReactData();
    if (!reactData || reactData.error) {
      // Restore panel state even on failure
      await restorePanelState();
      throw new Error(reactData?.error || "Failed to extract comment data from page");
    }

    const fileGroups = reactData.fileGroups || [];

    // Merge React data (highlightedText) with API data (author, content, replies)
    const threads = threadsResult;
    for (const group of fileGroups) {
      for (const comment of group.comments) {
        const thread = threads[comment.threadId];
        if (thread?.messages?.length > 0) {
          const firstMsg = thread.messages[0];
          comment.author = firstMsg.user
            ? `${firstMsg.user.first_name} ${firstMsg.user.last_name}`.trim()
            : "Unknown";
          comment.content = firstMsg.content || "";
          comment.replies = thread.messages.slice(1).map((m) => ({
            author: m.user
              ? `${m.user.first_name} ${m.user.last_name}`.trim()
              : "Unknown",
            content: m.content,
            timestamp: m.timestamp,
          }));
        } else {
          comment.author = "Unknown";
          comment.content = "";
          comment.replies = [];
        }
      }
    }

    const totalComments = fileGroups.reduce((sum, g) => sum + g.comments.length, 0);

    const result = {
      projectId: getProjectId(),
      projectName: getProjectName(),
      fileGroups,
      totalComments,
    };

    cachedData = result;

    // Restore the user's original review panel state
    await restorePanelState();

    return result;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getComments" || request.action === "refreshComments") {
      cachedData = null;
      collectComments()
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true; // async
    }
  });
})();
