// Injected into the page's MAIN world to access React fiber tree
(function () {
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.type !== "OL_COMMENT_EXPORT_REQUEST") return;

    const result = extractCommentsFromReact();

    window.postMessage(
      { type: "OL_COMMENT_EXPORT_RESPONSE", data: result, requestId: event.data.requestId },
      "*"
    );
  });

  function extractCommentsFromReact() {
    const reviewPanel = document.querySelector(".review-panel-container");
    if (!reviewPanel) return { error: "Review panel not found" };

    const containerKey = Object.keys(reviewPanel).find(
      (k) => k.startsWith("__reactContainer") || k.startsWith("__reactFiber")
    );
    if (!containerKey) return { error: "React fiber not found" };

    const rootFiber = reviewPanel[containerKey];
    const filesWithComments = [];

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
