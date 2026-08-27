// content.js - 在 Reddit 评论页中提取评论数据

(function () {
  'use strict';

  const COMMENT_TAG = 'shreddit-comment';
  const TEXT_SLOT = '[slot="comment"]';
  const META_SLOT = '[slot="commentMeta"]';

  function extractCommentText(el) {
    const slot = el.querySelector(TEXT_SLOT);
    return slot ? slot.innerText.trim() : '';
  }

  function extractCommentMeta(el) {
    const slot = el.querySelector(META_SLOT);
    return slot ? slot.innerText.trim() : '';
  }

  function parseComment(el, parentId = null) {
    const id = el.getAttribute('thingid') || '';
    const depth = parseInt(el.getAttribute('depth') || '0', 10);
    const author = el.getAttribute('author') || '';
    const score = el.getAttribute('score') || '';
    const created = el.getAttribute('created') || '';
    const permalink = el.getAttribute('permalink') || '';
    const text = extractCommentText(el);
    const meta = extractCommentMeta(el);

    // 子评论是当前元素内部嵌套的 shreddit-comment，且 depth 为当前 depth+1
    const children = [];
    const nested = el.querySelectorAll(`:scope > details ${COMMENT_TAG}`);
    nested.forEach((child) => {
      const childDepth = parseInt(child.getAttribute('depth') || '0', 10);
      if (childDepth === depth + 1) {
        children.push(parseComment(child, id));
      }
    });

    return {
      id,
      parentId,
      depth,
      author,
      score,
      created,
      permalink,
      text,
      meta,
      children
    };
  }

  function extractComments() {
    const rootComments = document.querySelectorAll(`${COMMENT_TAG}[depth="0"]`);
    const tree = [];
    const flat = [];

    rootComments.forEach((root) => {
      const parsed = parseComment(root, null);
      tree.push(parsed);
      flatten(parsed, flat);
    });

    return {
      success: true,
      url: location.href,
      title: document.title,
      totalVisible: flat.length,
      tree,
      flat
    };
  }

  function flatten(node, acc) {
    acc.push({
      id: node.id,
      parentId: node.parentId,
      depth: node.depth,
      author: node.author,
      score: node.score,
      created: node.created,
      permalink: node.permalink,
      text: node.text,
      meta: node.meta
    });
    node.children.forEach((child) => flatten(child, acc));
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_COMMENTS') {
      try {
        const result = extractComments();
        sendResponse(result);
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true;
    }
  });
})();
