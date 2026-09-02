"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderer = void 0;
const jsx_runtime_1 = require("hono/jsx/jsx-runtime");
const jsx_renderer_1 = require("hono/jsx-renderer");
exports.renderer = (0, jsx_renderer_1.jsxRenderer)(({ children }) => {
    return ((0, jsx_runtime_1.jsxs)("html", { children: [(0, jsx_runtime_1.jsx)("head", { children: (0, jsx_runtime_1.jsx)("link", { href: "/static/style.css", rel: "stylesheet" }) }), (0, jsx_runtime_1.jsx)("body", { children: children })] }));
});
//# sourceMappingURL=renderer.js.map