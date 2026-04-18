// Injected into the page's MAIN world to access React fiber tree
// Uses a global namespace to avoid duplicate listeners on re-injection
(function () {
  const NS = "__ol_comment_exporter__";

  // Remove any existing listener from a previous injection
  if (window[NS]) {
    window.removeEventListener("message", window[NS].handler);
  }

  function handler(event) {
    if (event.source !== window || event.data?.type !== "OL_COMMENT_EXPORT_REQUEST") return;

    const result = extractCommentsFromReact();

    window.postMessage(
      { type: "OL_COMMENT_EXPORT_RESPONSE", data: result, requestId: event.data.requestId },
      "*"
    );
  }

  // Store reference so next injection can clean up
  window[NS] = { handler };
  window.addEventListener("message", handler);

  function extractCommentsFromReact() {
    const reviewPanel = document.querySelector(".review-panel-container");
    if (!reviewPanel) return { error: "Review panel not found" };

    const containerKey = Object.keys(reviewPanel).find(
      (k) => k.startsWith("__reactContainer") || k.startsWith("__reactFiber")
    );
    if (!containerKey) return { error: "React fiber not found" };

    const rootFiber = reviewPanel[containerKey];
    const filesWithComments = [];

    // First pass: collect resolved state by comment ID
    const resolvedMap = new Map();

    function collectResolved(fiber, depth) {
      if (!fiber || depth > 500) return;
      const props = fiber.memoizedProps;
      if (props && props.comment !== undefined && props.isResolved !== undefined) {
        resolvedMap.set(props.comment.id, props.isResolved);
      }
      collectResolved(fiber.child, depth + 1);
      collectResolved(fiber.sibling, depth + 1);
    }

    collectResolved(rootFiber, 0);

    // Second pass: collect file groups with comment data
    function walk(fiber, depth) {
      if (!fiber || depth > 300) return;
      const props = fiber.memoizedProps;
      if (props && props.ranges !== undefined && props.ranges.comments?.length > 0) {
        const doc = props.doc;
        const docInfo = doc?.doc;
        const file = docInfo?.name || doc?.path || "unknown";
        const path = doc?.path || file;

        const comments = props.ranges.comments.map((c) => ({
          id: c.id,
          highlightedText: (c.op?.c || "").trim(),
          pos: c.op?.p,
          threadId: c.op?.t,
          userId: c.metadata?.user_id,
          timestamp: c.metadata?.ts,
          resolved: !!resolvedMap.get(c.id),
        }));

        filesWithComments.push({ file, path, comments });
      }
      walk(fiber.child, depth + 1);
      walk(fiber.sibling, depth + 1);
    }

    walk(rootFiber, 0);
    return { fileGroups: filesWithComments };
  }
})();
